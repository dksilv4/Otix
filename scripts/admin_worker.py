#!/usr/bin/env python3
"""
Otix Admin Distributed Compute Worker.

A high-performance standalone runner that allows administrators to use their
workstations (e.g. 8-16 thread PCs) to offload heavy artwork processing,
resizing, WebP transcoding, and color analysis from the primary Otix server.

Usage:
    python scripts/admin_worker.py --server http://localhost:8000 --username admin
    python scripts/admin_worker.py --server https://otix.example.com --token <jwt_token>
"""

import argparse
import getpass
import io
import os
import signal
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

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
    print(f"{Colors.CYAN}{Colors.BOLD}          OTIX ADMIN DISTRIBUTED COMPUTE WORKER          {Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD}=========================================================={Colors.RESET}")
    print(f"  {Colors.BOLD}Server URL:{Colors.RESET}       {server}")
    print(f"  {Colors.BOLD}Worker Threads:{Colors.RESET}   {workers}")
    print(f"  {Colors.BOLD}Batch Size:{Colors.RESET}       {batch_size} assets/claim")
    print(f"  {Colors.BOLD}Mode:{Colors.RESET}             Zero-Trust Admin Compute")
    print(f"{Colors.CYAN}----------------------------------------------------------{Colors.RESET}\n")


def extract_dominant_color(img: Image.Image) -> str:
    """Extract a dominant color hex string (#RRGGBB) from an image."""
    try:
        small = img.copy().convert("RGB")
        small.thumbnail((50, 50), Image.Resampling.BOX)
        # Quantize to 8 colors and find most frequent
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
        concurrency: int = 4,
        batch_size: int = 10,
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
        self.in_flight_ids: List[int] = []

        # Stats
        self.total_processed = 0
        self.total_bytes = 0
        self.start_time = time.time()

        self.http_client = httpx.Client(timeout=30.0, follow_redirects=True)

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

    def process_and_submit_asset(self, job: Dict[str, Any]) -> bool:
        """Downloads, transcodes to WebP, extracts color, and submits to server."""
        asset_id = job["asset_id"]
        url = job["url"]
        title = job.get("title", "Asset")
        asset_type = job.get("asset_type", "poster")

        # Skip SVG vector images (server mirrors raster formats: webp/jpg/png)
        if url.lower().split("?", 1)[0].endswith(".svg"):
            print(f"  {Colors.GRAY}[Skip]{Colors.RESET} {title} ({asset_type}): SVG vector artwork skipped")
            self.release_leases([asset_id])
            return False

        # 1. Download image from provider CDN
        try:
            dl_resp = self.http_client.get(url, timeout=20.0)
            if dl_resp.status_code != 200 or not dl_resp.content:
                print(f"  {Colors.YELLOW}[Skip]{Colors.RESET} {title} ({asset_type}): HTTP {dl_resp.status_code} downloading {url}")
                return False
            raw_bytes = dl_resp.content
        except Exception as exc:
            print(f"  {Colors.YELLOW}[Error]{Colors.RESET} Failed to fetch {url}: {exc}")
            return False

        # 2. Open with Pillow and optimize
        try:
            with Image.open(io.BytesIO(raw_bytes)) as img:
                # Convert color palette & format
                color_guess = extract_dominant_color(img)
                
                # Convert RGBA/RGB to WebP
                buf = io.BytesIO()
                target_img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")
                target_img.save(buf, format="WEBP", quality=self.webp_quality, method=4)
                webp_bytes = buf.getvalue()
        except Exception as exc:
            print(f"  {Colors.RED}[Corrupt]{Colors.RESET} Image processing failed for {url}: {exc}")
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
                self.total_processed += 1
                self.total_bytes += len(webp_bytes)
                saved_pct = (1.0 - len(webp_bytes) / max(1, len(raw_bytes))) * 100
                print(
                    f"  {Colors.GREEN}[Done]{Colors.RESET} {Colors.BOLD}{title}{Colors.RESET} ({asset_type}) "
                    f"-> {len(webp_bytes) / 1024:.1f} KB ({saved_pct:+.1f}% vs raw) [{color_guess}]"
                )
                return True
            else:
                print(f"  {Colors.RED}[Reject]{Colors.RESET} Server rejected submission for asset {asset_id}: {sub_resp.text}")
                return False
        except Exception as exc:
            print(f"  {Colors.RED}[Submit Error]{Colors.RESET} {exc}")
            return False

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

    def run(self, once: bool = False, idle_sleep: int = 5):
        """Main compute loop."""
        self.authenticate()

        # Handle Ctrl+C gracefully
        def handle_sigint(signum, frame):
            print(f"\n{Colors.YELLOW}Shutting down compute worker gracefully...{Colors.RESET}")
            self.running = False

        signal.signal(signal.SIGINT, handle_sigint)

        print(f"{Colors.CYAN}Ready! Starting distributed processing loop...{Colors.RESET}\n")

        with ThreadPoolExecutor(max_workers=self.concurrency) as executor:
            while self.running:
                jobs = self.claim_jobs()
                if not jobs:
                    if once:
                        print("No jobs available and --once set. Exiting.")
                        break
                    print(f"{Colors.GRAY}No pending artwork jobs. Waiting {idle_sleep}s... (Press Ctrl+C to stop){Colors.RESET}")
                    time.sleep(idle_sleep)
                    continue

                print(f"{Colors.BOLD}Claimed batch of {len(jobs)} assets. Processing with {self.concurrency} threads...{Colors.RESET}")
                self.in_flight_ids = [j["asset_id"] for j in jobs]

                futures = {executor.submit(self.process_and_submit_asset, job): job["asset_id"] for job in jobs}
                for future in as_completed(futures):
                    aid = futures[future]
                    if aid in self.in_flight_ids:
                        self.in_flight_ids.remove(aid)

                if once:
                    break

        # Cleanup if stopped with in-flight
        if self.in_flight_ids:
            print(f"Releasing {len(self.in_flight_ids)} remaining leases...")
            self.release_leases(self.in_flight_ids)

        elapsed = max(1.0, time.time() - self.start_time)
        print(f"\n{Colors.CYAN}=========================================================={Colors.RESET}")
        print(f"{Colors.CYAN}                WORKER SESSION SUMMARY                   {Colors.RESET}")
        print(f"{Colors.CYAN}=========================================================={Colors.RESET}")
        print(f"  Assets Processed:   {Colors.GREEN}{self.total_processed}{Colors.RESET}")
        print(f"  Total Data Written: {self.total_bytes / (1024 * 1024):.2f} MB")
        print(f"  Runtime:            {elapsed:.1f}s")
        print(f"  Average Speed:      {self.total_processed / elapsed:.2f} assets/second")
        print(f"{Colors.CYAN}=========================================================={Colors.RESET}\n")


def main():
    parser = argparse.ArgumentParser(description="Otix Admin Distributed Compute Worker")
    parser.add_argument("--server", default="http://localhost:8000", help="Otix server base URL")
    parser.add_argument("--username", help="Admin username or email")
    parser.add_argument("--password", help="Admin password")
    parser.add_argument("--token", help="Direct JWT Bearer token")
    parser.add_argument("--threads", type=int, default=6, help="Concurrent worker threads (default: 6)")
    parser.add_argument("--batch-size", type=int, default=10, help="Assets per claim batch (default: 10)")
    parser.add_argument("--quality", type=int, default=85, help="WebP compression quality (default: 85)")
    parser.add_argument("--once", action="store_true", help="Run one batch and exit")
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
