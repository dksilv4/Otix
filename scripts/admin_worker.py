#!/usr/bin/env python3
"""
Otix Admin Distributed Compute Worker (Turbo Edition).

A high-performance pipelined runner that allows administrators to use their
workstations (e.g. 16-thread Ryzen 7 9800X3D) to offload heavy artwork processing,
resizing, WebP transcoding, and color analysis from the primary Otix server.

Usage:
    python scripts/admin_worker.py --server http://84.8.154.67:8000 --username worker --password worker --threads 16 --batch-size 50
"""

import argparse
import getpass
import io
import os
import queue
import signal
import sys
import threading
import time
from typing import Any, Dict, List, Optional, Set

import httpx
from PIL import Image


class Colors:
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    GRAY = "\033[90m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


def print_banner(server: str, workers: int, batch_size: int):
    print(f"\n{Colors.CYAN}{Colors.BOLD}=========================================================={Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD}       OTIX ADMIN DISTRIBUTED COMPUTE WORKER (TURBO)      {Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD}=========================================================={Colors.RESET}")
    print(f"  {Colors.BOLD}Server URL:{Colors.RESET}       {server}")
    print(f"  {Colors.BOLD}Worker Threads:{Colors.RESET}   {workers} (pipelined streaming)")
    print(f"  {Colors.BOLD}Batch Size:{Colors.RESET}       {batch_size} assets/claim")
    print(f"  {Colors.BOLD}Mode:{Colors.RESET}             Zero-Trust Admin Compute")
    print(f"{Colors.CYAN}----------------------------------------------------------{Colors.RESET}\n")


def extract_dominant_color(img: Image.Image) -> str:
    """Extract a dominant color hex string (#RRGGBB) from an image."""
    try:
        small = img.copy().convert("RGB")
        small.thumbnail((50, 50), Image.Resampling.BOX)
        quantized = small.quantize(colors=8, method=Image.Quantize.FASTOCTREE)
        palette = quantized.getpalette()
        color_counts = sorted(quantized.getcolors(50 * 50) or [], key=lambda x: x[0], reverse=True)
        if color_counts and palette:
            dominant_idx = color_counts[0][1]
            r = palette[dominant_idx * 3]
            g = palette[dominant_idx * 3 + 1]
            b = palette[dominant_idx * 3 + 2]
            return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        pass
    return "#333333"


class AdminComputeWorker:
    def __init__(
        self,
        server_url: str,
        token: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        concurrency: int = 16,
        batch_size: int = 50,
        webp_quality: int = 85,
    ):
        self.server_url = server_url.rstrip("/")
        self.token = token
        self.username = username
        self.password = password
        self.concurrency = concurrency
        self.batch_size = batch_size
        self.webp_quality = webp_quality
        self.running = True

        # Pipeline synchronization
        self.job_queue: queue.Queue = queue.Queue(maxsize=batch_size * 3)
        self.in_flight_lock = threading.Lock()
        self.in_flight_ids: Set[int] = set()
        self.skipped_ids: Set[int] = set()

        # Telemetry & Stats
        self.total_processed = 0
        self.total_bytes = 0
        self.stats_lock = threading.Lock()
        self.start_time = time.time()
        self.last_telemetry_time = time.time()
        self.last_telemetry_count = 0

        # High-throughput connection pooled HTTP client
        limits = httpx.Limits(max_keepalive_connections=64, max_connections=128, keepalive_expiry=30.0)
        self.http_client = httpx.Client(timeout=20.0, follow_redirects=True, limits=limits)

    def authenticate(self):
        """Authenticates with the server and ensures the user is an admin."""
        if not self.token:
            if not self.username:
                self.username = input("Enter admin username or email: ").strip()
            if not self.password:
                self.password = getpass.getpass("Enter admin password: ")

            login_url = f"{self.server_url}/api/v1/auth/login"
            print(f"{Colors.GRAY}Authenticating with {login_url}...{Colors.RESET}")
            resp = self.http_client.post(
                login_url,
                json={"identity": self.username, "password": self.password},
            )
            if resp.status_code != 200:
                print(f"{Colors.RED}Authentication failed (HTTP {resp.status_code}): {resp.text}{Colors.RESET}")
                sys.exit(1)

            data = resp.json()
            if data.get("two_factor_required"):
                code = input("Two-Factor Authentication required. Enter TOTP code: ").strip()
                tfa_resp = self.http_client.post(
                    f"{self.server_url}/api/v1/auth/2fa/login-verify",
                    json={"challenge_token": data["challenge_token"], "code": code},
                )
                if tfa_resp.status_code != 200:
                    print(f"{Colors.RED}2FA verification failed: {tfa_resp.text}{Colors.RESET}")
                    sys.exit(1)
                self.token = tfa_resp.json()["access_token"]
            else:
                self.token = data.get("access_token")

        self.http_client.headers["Authorization"] = f"Bearer {self.token}"

        # Verify admin privileges
        me_resp = self.http_client.get(f"{self.server_url}/api/v1/auth/me")
        if me_resp.status_code == 200:
            user_data = me_resp.json()
            is_staff = user_data.get("is_admin", False) or user_data.get("is_staff", False)
            username = user_data.get("username", "Admin")
            if not is_staff:
                print(f"{Colors.RED}Error: User '{username}' is not a staff/admin user.{Colors.RESET}")
                print(f"{Colors.YELLOW}Compute worker endpoints require is_staff=True.{Colors.RESET}")
                sys.exit(1)
            print(f"{Colors.GREEN}[OK] Authenticated as admin '{username}'{Colors.RESET}")
        else:
            print(f"{Colors.YELLOW}Warning: Could not verify /auth/me (HTTP {me_resp.status_code}). Proceeding with token.{Colors.RESET}")

    def claim_jobs(self) -> List[Dict[str, Any]]:
        """Claim a batch of unmirrored assets from the server."""
        claim_url = f"{self.server_url}/api/v1/media/admin/compute/claim"
        try:
            resp = self.http_client.post(claim_url, json={"batch_size": self.batch_size})
            if resp.status_code == 403:
                print(f"{Colors.RED}Claim rejected (403 Forbidden). Ensure your user is an admin.{Colors.RESET}")
                time.sleep(10)
                return []
            if resp.status_code != 200:
                print(f"{Colors.YELLOW}Claim error (HTTP {resp.status_code}): {resp.text}{Colors.RESET}")
                return []

            data = resp.json()
            return data.get("jobs", [])
        except Exception as exc:
            print(f"{Colors.YELLOW}Claim network error: {exc}{Colors.RESET}")
            return []

    def release_leases(self, asset_ids: List[int]):
        """Releases claim locks on uncompleted assets during shutdown."""
        if not asset_ids:
            return
        try:
            self.http_client.post(
                f"{self.server_url}/api/v1/media/admin/compute/release",
                json={"asset_ids": asset_ids},
            )
        except Exception:
            pass

    def process_and_submit_asset(self, job: Dict[str, Any]) -> bool:
        """Downloads, transcodes to WebP, extracts color, and submits to server."""
        asset_id = job["asset_id"]
        url = job["url"]
        title = job.get("title", "Asset")
        asset_type = job.get("asset_type", "poster")

        # Skip SVG vector images (server mirrors raster formats: webp/jpg/png)
        if url.lower().split("?", 1)[0].endswith(".svg"):
            self.skipped_ids.add(asset_id)
            return False

        # 1. Download image from provider CDN
        try:
            dl_resp = self.http_client.get(url, timeout=15.0)
            if dl_resp.status_code != 200 or not dl_resp.content:
                self.skipped_ids.add(asset_id)
                return False
            raw_bytes = dl_resp.content
        except Exception:
            self.skipped_ids.add(asset_id)
            return False

        # 2. Open with Pillow and optimize
        try:
            with Image.open(io.BytesIO(raw_bytes)) as img:
                color_guess = extract_dominant_color(img)
                buf = io.BytesIO()
                target_img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")
                target_img.save(buf, format="WEBP", quality=self.webp_quality, method=4)
                webp_bytes = buf.getvalue()
        except Exception:
            self.skipped_ids.add(asset_id)
            return False

        # 3. Submit processed result to server
        submit_url = f"{self.server_url}/api/v1/media/admin/compute/submit"
        files = {
            "file": ("asset.webp", webp_bytes, "image/webp"),
        }
        data = {
            "asset_id": str(asset_id),
            "color_guess": color_guess,
        }

        try:
            sub_resp = self.http_client.post(submit_url, data=data, files=files)
            if sub_resp.status_code == 200:
                with self.stats_lock:
                    self.total_processed += 1
                    self.total_bytes += len(webp_bytes)
                    count = self.total_processed

                saved_pct = (1.0 - len(webp_bytes) / max(1, len(raw_bytes))) * 100
                print(
                    f"  {Colors.GREEN}[Done]{Colors.RESET} {Colors.BOLD}{title}{Colors.RESET} ({asset_type}) "
                    f"-> {len(webp_bytes) / 1024:.1f} KB ({saved_pct:+.1f}% vs raw) [{color_guess}]"
                )

                # Periodic telemetry output every 25 completed items
                if count % 25 == 0:
                    self.print_telemetry()

                return True
            else:
                self.skipped_ids.add(asset_id)
                return False
        except Exception:
            self.skipped_ids.add(asset_id)
            return False

    def print_telemetry(self):
        """Prints live speed and telemetry."""
        now = time.time()
        elapsed = max(0.1, now - self.start_time)
        recent_elapsed = max(0.1, now - self.last_telemetry_time)
        with self.stats_lock:
            recent_items = self.total_processed - self.last_telemetry_count
            overall_speed = self.total_processed / elapsed
            recent_speed = recent_items / recent_elapsed
            total_mb = self.total_bytes / (1024 * 1024)
            qsize = self.job_queue.qsize()

        self.last_telemetry_time = now
        self.last_telemetry_count = self.total_processed

        print(
            f"{Colors.CYAN}==> [Turbo Telemetry] Processed: {Colors.BOLD}{self.total_processed}{Colors.RESET} | "
            f"Speed: {Colors.GREEN}{recent_speed:.1f}/s{Colors.RESET} (avg {overall_speed:.1f}/s) | "
            f"Queue: {qsize} | Uploaded: {total_mb:.1f} MB <=={Colors.RESET}"
        )

    def feeder_loop(self, idle_sleep: int):
        """Background thread that keeps the job queue populated."""
        while self.running:
            # If queue has room, claim more jobs
            if self.job_queue.qsize() < (self.concurrency * 2):
                jobs = self.claim_jobs()
                if not jobs:
                    time.sleep(idle_sleep)
                    continue

                new_count = 0
                for job in jobs:
                    aid = job["asset_id"]
                    if aid in self.skipped_ids:
                        continue
                    with self.in_flight_lock:
                        self.in_flight_ids.add(aid)
                    self.job_queue.put(job)
                    new_count += 1

                if new_count > 0:
                    print(f"{Colors.BOLD}[Feeder] Claimed {len(jobs)} assets ({new_count} enqueued, queue size: {self.job_queue.qsize()}){Colors.RESET}")
            else:
                time.sleep(0.5)

    def worker_consumer_loop(self):
        """Worker thread pulling from queue and processing assets."""
        while self.running:
            try:
                job = self.job_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            aid = job["asset_id"]
            try:
                self.process_and_submit_asset(job)
            finally:
                with self.in_flight_lock:
                    self.in_flight_ids.discard(aid)
                self.job_queue.task_done()

    def run(self, once: bool = False, idle_sleep: int = 5):
        """Starts the producer-consumer processing engine."""
        self.authenticate()

        def handle_sigint(signum, frame):
            print(f"\n{Colors.YELLOW}Shutting down compute worker gracefully...{Colors.RESET}")
            self.running = False

        signal.signal(signal.SIGINT, handle_sigint)

        print(f"{Colors.CYAN}Ready! Launching Turbo engine with {self.concurrency} worker threads...{Colors.RESET}\n")

        # Start feeder thread
        feeder_thread = threading.Thread(target=self.feeder_loop, args=(idle_sleep,), daemon=True)
        feeder_thread.start()

        # Start worker consumer threads
        workers = []
        for _ in range(self.concurrency):
            t = threading.Thread(target=self.worker_consumer_loop, daemon=True)
            t.start()
            workers.append(t)

        try:
            while self.running:
                time.sleep(1.0)
                if once and self.job_queue.empty() and self.total_processed > 0:
                    break
        except KeyboardInterrupt:
            self.running = False

        # Release any uncompleted leases that weren't intentionally skipped
        with self.in_flight_lock:
            remaining = list(self.in_flight_ids - self.skipped_ids)
        if remaining:
            print(f"Releasing {len(remaining)} in-flight leases back to server...")
            self.release_leases(remaining)

        elapsed = max(1.0, time.time() - self.start_time)
        print(f"\n{Colors.CYAN}=========================================================={Colors.RESET}")
        print(f"{Colors.CYAN}             TURBO WORKER SESSION SUMMARY                 {Colors.RESET}")
        print(f"{Colors.CYAN}=========================================================={Colors.RESET}")
        print(f"  Assets Processed:   {Colors.GREEN}{self.total_processed}{Colors.RESET}")
        print(f"  Total Data Written: {self.total_bytes / (1024 * 1024):.2f} MB")
        print(f"  Runtime:            {elapsed:.1f}s")
        print(f"  Average Speed:      {self.total_processed / elapsed:.2f} assets/second")
        print(f"{Colors.CYAN}=========================================================={Colors.RESET}\n")


def main():
    parser = argparse.ArgumentParser(description="Otix Admin Distributed Compute Worker (Turbo Edition)")
    parser.add_argument("--server", default="http://localhost:8000", help="Otix server base URL")
    parser.add_argument("--username", help="Admin username or email")
    parser.add_argument("--password", help="Admin password")
    parser.add_argument("--token", help="Direct JWT Bearer token")
    parser.add_argument("--threads", type=int, default=16, help="Concurrent worker threads (default: 16)")
    parser.add_argument("--batch-size", type=int, default=50, help="Assets per claim batch (default: 50)")
    parser.add_argument("--quality", type=int, default=85, help="WebP compression quality (default: 85)")
    parser.add_argument("--once", action="store_true", help="Run until initial queue drains then exit")
    parser.add_argument("--idle", type=int, default=5, help="Idle wait seconds when no jobs (default: 5)")

    args = parser.parse_args()

    print_banner(args.server, args.threads, args.batch_size)
    worker = AdminComputeWorker(
        server_url=args.server,
        token=args.token,
        username=args.username,
        password=args.password,
        concurrency=args.threads,
        batch_size=args.batch_size,
        webp_quality=args.quality,
    )
    worker.run(once=args.once, idle_sleep=args.idle)


if __name__ == "__main__":
    main()
