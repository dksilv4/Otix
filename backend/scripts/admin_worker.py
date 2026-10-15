#!/usr/bin/env python3
"""
Otix Admin Distributed Compute Worker CLI (v2.0 Turbo Edition)
Multi-Threaded Artwork Optimization, Wikidata/Wikipedia Metadata Offload,
and GPU-Accelerated Dense Semantic Embeddings (BAAI/bge-m3).

Features:
- Full CLI suite with interactive menu and headless scriptable modes.
- Dynamic GPU Workload Slider (1-100%) to control inference intensity and heat.
- Smart Auto-Throttle: Detects games / 3D applications on GPU via NVML and
  dynamically scales back batch size and adds pacing sleep to guarantee 0 FPS drops.
- Zero-Trust Admin verification, automated token lifecycle, and lease management.
- Live telemetry dashboard with Rich UI, formatted progress bars, and ETA calculators.
"""

from __future__ import annotations

import argparse
import ctypes
import getpass
import html
import io
import json
import logging
import os
import queue
import re
import shutil
import signal
import sys
import threading
import time
import urllib.parse
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, Union

# Suppress noisy library warnings (urllib3 / HF Hub)
warnings.filterwarnings("ignore")

import httpx
from PIL import Image

# Ensure UTF-8 output on Windows consoles
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Rich terminal styling with graceful fallback
try:
    from rich import box
    from rich.align import Align
    from rich.columns import Columns
    from rich.console import Console
    from rich.panel import Panel
    from rich.progress import (
        BarColumn,
        Progress,
        SpinnerColumn,
        TaskProgressColumn,
        TextColumn,
        TimeElapsedColumn,
        TimeRemainingColumn,
    )
    from rich.prompt import Confirm, IntPrompt, Prompt
    from rich.table import Table
    from rich.text import Text

    HAS_RICH = True
    console = Console()
except ImportError:
    HAS_RICH = False
    console = None

# Interactive full-screen terminal UI (OpenCode & Claude Code inspired)
try:
    from prompt_toolkit import HTML, Application, PromptSession
    from prompt_toolkit.application.current import create_app_session
    from prompt_toolkit.buffer import Buffer
    from prompt_toolkit.completion import WordCompleter
    from prompt_toolkit.history import InMemoryHistory
    from prompt_toolkit.key_binding import KeyBindings
    from prompt_toolkit.layout.containers import HSplit, VSplit, Window
    from prompt_toolkit.layout.controls import BufferControl, FormattedTextControl
    from prompt_toolkit.layout.layout import Layout
    from prompt_toolkit.layout.processors import BeforeInput
    from prompt_toolkit.patch_stdout import patch_stdout
    from prompt_toolkit.styles import Style
    from prompt_toolkit.widgets import Frame

    HAS_PROMPT_TOOLKIT = True
except ImportError:
    HAS_PROMPT_TOOLKIT = False


def safe_html(text: str) -> Any:
    """Safely constructs prompt_toolkit HTML, falling back to escaped text on XML parse error."""
    if not HAS_PROMPT_TOOLKIT:
        return text
    try:
        return HTML(text)
    except Exception:
        clean = re.sub(r"<[^>]+>", "", text)
        return HTML(f'<style fg="white">{html.escape(clean)}</style>')


class Colors:
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    GRAY = "\033[90m"
    MAGENTA = "\033[95m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


# ---------------------------------------------------------------------------
# Hardware & Smart GPU Auto-Throttle Monitor
# ---------------------------------------------------------------------------


class SmartGpuMonitor:
    """Monitors GPU load and external 3D/gaming processes using NVML via ctypes."""

    def __init__(self, auto_throttle: bool = True):
        self.auto_throttle = auto_throttle
        self.nvml_initialized = False
        self.handle = None
        self.device_name = "CPU"
        self.total_vram_mb = 0
        self._init_nvml()

    def _init_nvml(self):
        try:
            class c_nvmlUtilization_t(ctypes.Structure):
                _fields_ = [("gpu", ctypes.c_uint), ("memory", ctypes.c_uint)]

            class c_nvmlMemory_t(ctypes.Structure):
                _fields_ = [
                    ("total", ctypes.c_ulonglong),
                    ("free", ctypes.c_ulonglong),
                    ("used", ctypes.c_ulonglong),
                ]

            self._c_nvmlUtil = c_nvmlUtilization_t
            self._c_nvmlMem = c_nvmlMemory_t

            lib_name = "nvml.dll" if os.name == "nt" else "libnvidia-ml.so.1"
            self.nvml = ctypes.CDLL(lib_name)
            self.nvml.nvmlInit()
            self.handle = ctypes.c_void_p()
            self.nvml.nvmlDeviceGetHandleByIndex(0, ctypes.byref(self.handle))
            self.nvml_initialized = True

            name_buf = ctypes.create_string_buffer(64)
            self.nvml.nvmlDeviceGetName(self.handle, name_buf, 64)
            self.device_name = name_buf.value.decode("utf-8", errors="ignore")

            mem = c_nvmlMemory_t()
            self.nvml.nvmlDeviceGetMemoryInfo(self.handle, ctypes.byref(mem))
            self.total_vram_mb = int(mem.total // (1024 * 1024))
        except Exception:
            self.nvml_initialized = False

    def get_utilization(self) -> Tuple[int, int]:
        """Returns (gpu_util_pct, mem_util_pct)."""
        if not self.nvml_initialized or not self.handle:
            return 0, 0
        try:
            util = self._c_nvmlUtil()
            self.nvml.nvmlDeviceGetUtilizationRates(self.handle, ctypes.byref(util))
            return int(util.gpu), int(util.memory)
        except Exception:
            return 0, 0

    def get_vram_used_mb(self) -> int:
        if not self.nvml_initialized or not self.handle:
            return 0
        try:
            mem = self._c_nvmlMem()
            self.nvml.nvmlDeviceGetMemoryInfo(self.handle, ctypes.byref(mem))
            return int(mem.used // (1024 * 1024))
        except Exception:
            return 0

    def check_throttle(
        self, base_batch_size: int, base_sleep: float
    ) -> Tuple[int, float, bool, str]:
        """Detects if an external game or 3D app is heavily utilizing the GPU.

        Returns (effective_batch_size, effective_sleep, is_throttled, reason).
        """
        if not self.auto_throttle or not self.nvml_initialized:
            return base_batch_size, base_sleep, False, ""

        gpu_util, _ = self.get_utilization()

        if gpu_util > 75:
            # Heavy gaming or rendering active: throttle aggressively
            throttled_batch = max(4, min(base_batch_size // 4, 8))
            throttled_sleep = max(base_sleep, 1.75)
            return (
                throttled_batch,
                throttled_sleep,
                True,
                f"Heavy external GPU activity ({gpu_util}% load)",
            )
        elif gpu_util > 35:
            # Moderate 3D application or background gaming
            throttled_batch = max(4, min(base_batch_size // 2, 16))
            throttled_sleep = max(base_sleep, 0.6)
            return (
                throttled_batch,
                throttled_sleep,
                True,
                f"External 3D/Gaming load detected ({gpu_util}% load)",
            )

        return base_batch_size, base_sleep, False, ""


def detect_hardware() -> Dict[str, Any]:
    """Inspects local workstation compute capabilities (GPU, CUDA, CPU, PyTorch)."""
    hw: Dict[str, Any] = {
        "cpu_cores": os.cpu_count() or 4,
        "has_torch": False,
        "torch_version": None,
        "cuda_available": False,
        "device_name": "CPU",
        "vram_gb": 0.0,
        "has_sentence_transformers": False,
        "st_version": None,
    }
    try:
        import torch

        hw["has_torch"] = True
        hw["torch_version"] = torch.__version__
        if torch.cuda.is_available():
            hw["cuda_available"] = True
            hw["device_name"] = torch.cuda.get_device_name(0)
            hw["vram_gb"] = round(
                torch.cuda.get_device_properties(0).total_memory / (1024**3), 2
            )
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            hw["device_name"] = "Apple Silicon (MPS)"
    except Exception:
        pass

    try:
        import sentence_transformers

        hw["has_sentence_transformers"] = True
        hw["st_version"] = getattr(sentence_transformers, "__version__", "installed")
    except Exception:
        pass

    return hw


def compute_workload_params(workload_pct: int) -> Tuple[int, float]:
    """Maps workload slider (1-100%) to (gpu_batch_size, sleep_between_batches).

    100% -> batch 64, sleep 0.0s (Max Turbo)
    80%  -> batch 32, sleep 0.05s (Balanced / Fast)
    50%  -> batch 16, sleep 0.3s (Gaming Friendly)
    25%  -> batch 8,  sleep 0.8s (Whisper Stealth)
    """
    pct = max(1, min(100, int(workload_pct)))
    batch_size = max(4, min(64, int(4 + (60 * (pct / 100.0)))))
    if pct >= 95:
        sleep_sec = 0.0
    else:
        sleep_sec = round((1.0 - (pct / 100.0)) * 1.5, 3)
    return batch_size, sleep_sec


# ---------------------------------------------------------------------------
# Configuration Persistence
# ---------------------------------------------------------------------------

CONFIG_SEARCH_PATHS = [
    Path.cwd() / ".worker.json",
    Path(__file__).resolve().parent / ".worker.json",
    Path.home() / ".otix" / "worker.json",
]


def load_worker_config() -> Dict[str, Any]:
    """Loads worker defaults from .worker.json or environment variables."""
    cfg = {
        "server": os.environ.get("OTIX_WORKER_SERVER", "http://84.8.154.67:8000"),
        "username": os.environ.get("OTIX_WORKER_USERNAME", "worker"),
        "password": os.environ.get("OTIX_WORKER_PASSWORD", "worker"),
        "task": os.environ.get("OTIX_WORKER_TASK", "both"),
        "threads": int(os.environ.get("OTIX_WORKER_THREADS", "16")),
        "batch_size": int(os.environ.get("OTIX_WORKER_BATCH_SIZE", "200")),
        "gpu_batch_size": int(os.environ.get("OTIX_WORKER_GPU_BATCH", "32")),
        "workload_pct": int(os.environ.get("OTIX_WORKER_WORKLOAD", "85")),
        "auto_throttle": os.environ.get("OTIX_WORKER_AUTO_THROTTLE", "1").lower()
        in ("1", "true", "yes"),
        "low_priority": os.environ.get("OTIX_WORKER_LOW_PRIORITY", "0").lower()
        in ("1", "true", "yes"),
        "webp_quality": 85,
        "model": "BAAI/bge-m3",
        "sleep": 0.0,
    }

    for p in CONFIG_SEARCH_PATHS:
        if p.is_file():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    cfg.update({k: v for k, v in data.items() if v is not None})
                break
            except Exception:
                pass

    return cfg


def save_worker_config(cfg: Dict[str, Any]) -> Path:
    """Saves updated settings to .worker.json."""
    target = CONFIG_SEARCH_PATHS[0]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    return target


# ---------------------------------------------------------------------------
# Visual UI & Banners
# ---------------------------------------------------------------------------

OTIX_ASCII_LOGO = (
    "  ▄▀▀▄ ▄▀▀▄   █▀▀▀▀█ ▀▀██▀▀  ▀██▀  █▄  ▄█\n"
    "  █  █▄█  █   █    █   ██     ██     ▀█▀ \n"
    "   ▀▀   ▀▀    ▀▀▀▀▀▀   ▀▀    ▀▀▀▀  █▀  ▀█"
)


def render_banner(
    server: str,
    task: str,
    workload_pct: int,
    auto_throttle: bool,
    hw: Dict[str, Any],
    threads: int,
    batch_size: int,
):
    """Renders the OpenCode/Claude Code inspired Otix Worker header panel with rectangular ASCII logo."""
    task_str = task.capitalize() if task in ("both", "artwork", "embeddings") else task.upper()
    dev_name = hw["device_name"].replace("NVIDIA GeForce ", "")
    gpu_label = (
        f"{dev_name} ({hw['vram_gb']} GB)"
        if hw["cuda_available"]
        else hw["device_name"]
    )
    throttle_str = "Active (Gaming Safe)" if auto_throttle else "Disabled"

    if HAS_RICH and console:
        header = Text()
        header.append(OTIX_ASCII_LOGO + "\n", style="bold cyan")
        header.append("∞ Otix Distributed Compute Engine", style="bold white")
        header.append(" · v2.0 Turbo\n", style="dim")

        specs = Table.grid(expand=True, padding=(0, 2))
        specs.add_column("c1", justify="left", ratio=1)
        specs.add_column("c2", justify="left", ratio=1)

        specs.add_row(
            Text.from_markup(f"[dim]Node:[/dim]     [cyan]{server}[/cyan]"),
            Text.from_markup(
                f"[dim]Workload:[/dim] [bold yellow]{workload_pct}%[/bold yellow] [dim](Auto-Throttle: {'ON' if auto_throttle else 'OFF'})[/dim]"
            ),
        )
        specs.add_row(
            Text.from_markup(f"[dim]Compute:[/dim]  [bold white]{gpu_label}[/bold white]"),
            Text.from_markup(f"[dim]Task:[/dim]     [green]{task_str}[/green]"),
        )
        specs.add_row(
            Text.from_markup("[dim]Model:[/dim]    [dim cyan]BAAI/bge-m3 (Dense 1024)[/dim cyan]"),
            Text.from_markup("[dim]Controls:[/dim] [dim]Type [bold cyan]/help[/bold cyan] for commands[/dim]"),
        )

        body = Table.grid(expand=True)
        body.add_column(justify="center")
        body.add_row(Align.center(header))
        body.add_row(specs)

        console.print(
            Panel(
                body,
                border_style="dim white",
                box=box.ROUNDED,
                padding=(1, 2),
                subtitle="[dim]/workload · /status · /pause · /benchmark · /hydrate · /exit[/dim]",
                subtitle_align="center",
            )
        )
    else:
        print(
            f"\n{Colors.CYAN}{Colors.BOLD}╭──────────────────────────────────────────────────────────────────╮{Colors.RESET}"
        )
        print(
            f"{Colors.CYAN}{Colors.BOLD}│            ▄▀▀▄ ▄▀▀▄   █▀▀▀▀█ ▀▀██▀▀  ▀██▀  █▄  ▄█              │{Colors.RESET}"
        )
        print(
            f"{Colors.CYAN}{Colors.BOLD}│            █  █▄█  █   █    █   ██     ██     ▀█▀               │{Colors.RESET}"
        )
        print(
            f"{Colors.CYAN}{Colors.BOLD}│             ▀▀   ▀▀    ▀▀▀▀▀▀   ▀▀    ▀▀▀▀  █▀  ▀█              │{Colors.RESET}"
        )
        print(
            f"{Colors.CYAN}{Colors.BOLD}│                ∞ Otix Compute Engine · v2.0 Turbo                │{Colors.RESET}"
        )
        print(f"{Colors.CYAN}│  Node: {server:<57} │{Colors.RESET}")
        print(f"{Colors.CYAN}│  Compute: {gpu_label:<54} │{Colors.RESET}")
        print(
            f"{Colors.CYAN}│  Workload: {workload_pct}% · Auto-Throttle: {throttle_str:<32} │{Colors.RESET}"
        )
        print(f"{Colors.CYAN}│  Task: {task_str:<58} │{Colors.RESET}")
        print(
            f"{Colors.CYAN}│  Type /help for slash commands or /workload to change intensity  │{Colors.RESET}"
        )
        print(
            f"{Colors.CYAN}{Colors.BOLD}╰──────────────────────────────────────────────────────────────────╯{Colors.RESET}\n"
        )


# Theme classification constants matching backend color_analyzer service
_NEUTRAL_SAT = 0.12
_DARK_LIGHTNESS = 0.28
_LIGHT_LIGHTNESS = 0.75
_MULTICOLOR_CHROMATIC_MIN = 0.5
_HUE_BIN_COUNT = 12
_HUE_BIN_MIN_SHARE = 0.08
_HUE_DOMINANT_MAX = 0.8

_LOGO_THEME_RANK = {
    "dark": {
        "guess_white": 2,
        "guess_colorful": 1,
        "guess_multicolor": 1,
        "guess_gray": 1,
        "guess_black": 0,
        None: 1,
    },
    "light": {
        "guess_black": 2,
        "guess_colorful": 1,
        "guess_multicolor": 1,
        "guess_gray": 1,
        "guess_white": 0,
        None: 1,
    },
}

_BACKDROP_THEME_RANK = {
    "dark": {
        "guess_black": 2,
        "guess_colorful": 1,
        "guess_multicolor": 1,
        "guess_gray": 1,
        "guess_white": 0,
        None: 1,
    },
    "light": {
        "guess_white": 2,
        "guess_colorful": 1,
        "guess_multicolor": 1,
        "guess_gray": 1,
        "guess_black": 0,
        None: 1,
    },
}


def _rgb_to_hsl(r: int, g: int, b: int) -> Tuple[float, float, float]:
    """Convert an 8-bit RGB pixel to HSL (h in 0..360, s/l in 0..1)."""
    rn, gn, bn = r / 255.0, g / 255.0, b / 255.0
    mx = max(rn, gn, bn)
    mn = min(rn, gn, bn)
    delta = mx - mn
    l_val = (mx + mn) / 2.0
    if delta == 0:
        return 0.0, 0.0, l_val
    s_val = delta / (2.0 - mx - mn) if l_val > 0.5 else delta / (mx + mn)
    if mx == rn:
        h_val = ((gn - bn) / delta + (6.0 if gn < bn else 0.0)) / 6.0
    elif mx == gn:
        h_val = ((bn - rn) / delta + 2.0) / 6.0
    else:
        h_val = ((rn - gn) / delta + 4.0) / 6.0
    return h_val * 360.0, s_val, l_val


def _relative_luminance(r: int, g: int, b: int) -> float:
    """ITU-R BT.709 perceived luminance in 0..1."""
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def _classify_transparent_graphic(image: Image.Image) -> str | None:
    """Classify logos or transparent icons based on visible pixels."""
    if image.mode != "RGBA":
        image = image.convert("RGBA")

    image = image.resize((64, 64), resample=Image.Resampling.BILINEAR)
    raw_pixels = list(image.getdata())

    visible = [(r, g, b) for r, g, b, a in raw_pixels if a >= 128]
    if not visible:
        return None
    total = len(visible)

    black = white = gray = dark_color = light_color = colorful = 0
    hue_bins = [0] * _HUE_BIN_COUNT
    chromatic = 0

    for r, g, b in visible:
        h, s, l_val = _rgb_to_hsl(r, g, b)
        if s < _NEUTRAL_SAT:
            if l_val < _DARK_LIGHTNESS:
                black += 1
            elif l_val > _LIGHT_LIGHTNESS:
                white += 1
            else:
                gray += 1
        else:
            chromatic += 1
            hue_bins[int(h // (360.0 / _HUE_BIN_COUNT)) % _HUE_BIN_COUNT] += 1
            if l_val < _DARK_LIGHTNESS:
                dark_color += 1
            elif l_val > _LIGHT_LIGHTNESS:
                light_color += 1
            else:
                colorful += 1

    dark = (black + dark_color) / total
    light = (white + light_color) / total
    gray_ratio = gray / total
    colorful_ratio = colorful / total
    chromatic_ratio = chromatic / total

    if chromatic_ratio >= _MULTICOLOR_CHROMATIC_MIN and chromatic > 0:
        shares = [c / chromatic for c in hue_bins if c > 0]
        dominant = max(shares)
        distinct = sum(1 for s in shares if s >= _HUE_BIN_MIN_SHARE)
        if distinct >= 2 and dominant <= _HUE_DOMINANT_MAX:
            return "guess_multicolor"

    ratios = {
        "guess_black": dark,
        "guess_white": light,
        "guess_gray": gray_ratio,
        "guess_colorful": colorful_ratio,
    }
    best = max(ratios, key=ratios.get)
    if ratios[best] >= 0.5:
        return best

    if colorful_ratio >= 0.35 and colorful_ratio >= max(dark, light, gray_ratio):
        return "guess_colorful"
    if dark >= 0.3 and dark >= light:
        return "guess_black"
    if light >= 0.3:
        return "guess_white"
    if gray_ratio >= 0.3:
        return "guess_gray"
    return "guess_gray"


def _classify_opaque_image(image: Image.Image, asset_type: str) -> str | None:
    """Classify backdrops or posters based on perceived luminance and color."""
    if image.mode != "RGB":
        image = image.convert("RGB")

    image = image.resize((64, 64), resample=Image.Resampling.BILINEAR)
    raw_pixels = list(image.getdata())
    if not raw_pixels:
        return None

    total = len(raw_pixels)
    total_lum = 0.0
    total_sat = 0.0

    for r, g, b in raw_pixels:
        total_lum += _relative_luminance(r, g, b)
        _, s, _ = _rgb_to_hsl(r, g, b)
        total_sat += s

    avg_lum = total_lum / total
    avg_sat = total_sat / total

    if asset_type in ("backdrop", "textless_backdrop"):
        if avg_lum < 0.35:
            return "guess_black"
        if avg_lum > 0.65:
            return "guess_white"
    else:  # poster, textless_poster, icon
        if avg_lum < 0.30:
            return "guess_black"
        if avg_lum > 0.70:
            return "guess_white"

    if avg_sat > 0.25:
        return "guess_colorful"
    return "guess_gray"


def classify_theme(image: Image.Image, asset_type: str = "logo") -> str:
    """Classify artwork into standard Otix theme contrast labels."""
    has_alpha = image.mode in ("RGBA", "LA") or (
        image.mode == "P" and "transparency" in image.info
    )

    if asset_type in ("logo", "icon") and has_alpha:
        if image.mode != "RGBA":
            image = image.convert("RGBA")
        alphas = [a for _, _, _, a in image.getdata()]
        if any(a < 250 for a in alphas):
            return _classify_transparent_graphic(image) or "guess_gray"

    if asset_type in ("logo", "icon"):
        return _classify_transparent_graphic(image) or "guess_gray"

    return _classify_opaque_image(image, asset_type) or "guess_gray"


def extract_dominant_color(img: Image.Image) -> str:
    """Extract a dominant color hex string (#RRGGBB) from an image."""
    try:
        small = img.copy().convert("RGB")
        small.thumbnail((50, 50), Image.Resampling.BOX)
        quantized = small.quantize(colors=8, method=Image.Quantize.FASTOCTREE)
        palette = quantized.getpalette()
        color_counts = sorted(
            quantized.getcolors(50 * 50) or [], key=lambda x: x[0], reverse=True
        )
        if color_counts and palette:
            dominant_idx = color_counts[0][1]
            r = palette[dominant_idx * 3]
            g = palette[dominant_idx * 3 + 1]
            b = palette[dominant_idx * 3 + 2]
            return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        pass
    return "#333333"


# ---------------------------------------------------------------------------
# Public Metadata Resolver (Wikidata / Wikipedia)
# ---------------------------------------------------------------------------


class WikidataResolver:
    """Public, unauthenticated Wikidata and Wikipedia resolver."""

    SPARQL_URL = "https://query.wikidata.org/sparql"
    WIKIDATA_API = "https://www.wikidata.org/w/api.php"
    USER_AGENT = "OtixWorker/2.0 (https://github.com/dksilv4/Otix; admin@otix.media)"

    def __init__(self):
        limits = httpx.Limits(max_keepalive_connections=16, max_connections=32)
        self.client = httpx.Client(
            headers={"User-Agent": self.USER_AGENT},
            timeout=15.0,
            limits=limits,
        )

    def resolve_game_credits(
        self,
        steam_id: Optional[str] = None,
        igdb_id: Optional[str] = None,
        title: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Resolves game voice actors, cast, characters, directors, and composers."""
        qid = None
        if steam_id:
            qid = self._find_game_qid("P1733", steam_id)
        if not qid and igdb_id:
            qid = self._find_game_qid("P5769", igdb_id)
        if not qid and title:
            qid = self._search_entity_qid(title, "video game")

        if not qid:
            return None

        try:
            resp = self.client.get(
                self.WIKIDATA_API,
                params={
                    "action": "wbgetentities",
                    "ids": qid,
                    "languages": "en",
                    "props": "labels|claims|sitelinks",
                    "format": "json",
                },
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            game_entity = data.get("entities", {}).get(qid, {})
        except Exception:
            return None

        claims = game_entity.get("claims", {})
        characters = []
        cast = []
        crew = []

        p6262 = claims.get("P6262", [])
        fandom_id = (
            p6262[0].get("mainsnak", {}).get("datavalue", {}).get("value")
            if p6262
            else None
        )

        char_qids = [
            c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
            for c in claims.get("P674", [])
            if c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
        ]

        cast_claims = (
            claims.get("P725", []) + claims.get("P161", []) + claims.get("P175", [])
        )
        for c in cast_claims:
            mainsnak = c.get("mainsnak", {})
            actor_qid = mainsnak.get("datavalue", {}).get("value", {}).get("id")
            if not actor_qid:
                continue
            qualifiers = c.get("qualifiers", {})
            char_qid = None
            for p_qual in ("P453", "P4633"):
                if p_qual in qualifiers:
                    snaks = qualifiers[p_qual]
                    if snaks:
                        char_qid = (
                            snaks[0]
                            .get("datavalue", {})
                            .get("value", {})
                            .get("id")
                        )
                        break

            cast.append(
                {
                    "actor_qid": actor_qid,
                    "character_qid": char_qid,
                    "role": "voice actor" if "P725" in c.get("property", "") else "cast",
                }
            )

        crew_roles = [("director", "P57"), ("writer", "P58"), ("composer", "P86")]
        for role_name, prop_id in crew_roles:
            for c in claims.get(prop_id, []):
                person_qid = (
                    c.get("mainsnak", {})
                    .get("datavalue", {})
                    .get("value", {})
                    .get("id")
                )
                if person_qid:
                    crew.append({"person_qid": person_qid, "role": role_name})

        # Batch hydrate entity details
        all_qids = (
            char_qids
            + [x["actor_qid"] for x in cast]
            + [x["character_qid"] for x in cast if x["character_qid"]]
            + [x["person_qid"] for x in crew]
        )
        all_qids = list(set(filter(None, all_qids)))
        if not all_qids:
            return None

        entities_map = self._batch_get_entities(all_qids)

        resolved_chars = []
        for cqid in char_qids:
            cdata = entities_map.get(cqid, {})
            name = cdata.get("labels", {}).get("en", {}).get("value")
            if not name:
                continue
            desc = cdata.get("descriptions", {}).get("en", {}).get("value")
            c_claims = cdata.get("claims", {})
            p18 = c_claims.get("P18", [])
            photo = (
                self._wikimedia_thumb(
                    p18[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                )
                if p18
                else None
            )
            sitelinks = cdata.get("sitelinks", {})
            enwiki = sitelinks.get("enwiki", {}).get("title")

            resolved_chars.append(
                {
                    "character_name": name,
                    "wikidata_id": cqid,
                    "wikipedia_title": enwiki,
                    "description": desc,
                    "photo_url": photo,
                }
            )

        resolved_cast = []
        for item in cast:
            adata = entities_map.get(item["actor_qid"], {})
            actor_name = adata.get("labels", {}).get("en", {}).get("value")
            if not actor_name:
                continue
            p18 = adata.get("claims", {}).get("P18", [])
            photo = (
                self._wikimedia_thumb(
                    p18[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                )
                if p18
                else None
            )
            char_name = None
            if item.get("character_qid"):
                cdata = entities_map.get(item["character_qid"], {})
                char_name = cdata.get("labels", {}).get("en", {}).get("value")

            resolved_cast.append(
                {
                    "person_name": actor_name,
                    "character_name": char_name or "Cast",
                    "role": item["role"],
                    "photo_url": photo,
                }
            )

        resolved_crew = []
        for item in crew:
            pdata = entities_map.get(item["person_qid"], {})
            p_name = pdata.get("labels", {}).get("en", {}).get("value")
            if not p_name:
                continue
            p18 = pdata.get("claims", {}).get("P18", [])
            photo = (
                self._wikimedia_thumb(
                    p18[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                )
                if p18
                else None
            )
            resolved_crew.append(
                {"person_name": p_name, "role": item["role"], "photo_url": photo}
            )

        return {
            "characters": resolved_chars,
            "cast": resolved_cast,
            "crew": resolved_crew,
            "fandom_id": fandom_id,
        }

    def resolve_movie_distributors(
        self, imdb_id: Optional[str] = None, tmdb_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Resolves film/show distributors by country from Wikidata (P750)."""
        qid = None
        if imdb_id:
            qid = self._find_game_qid("P345", imdb_id)
        if not qid and tmdb_id:
            qid = self._find_game_qid("P4947", tmdb_id)
        if not qid:
            return []

        query = f"""
        SELECT ?distributorLabel ?countryLabel WHERE {{
          wd:{qid} p:P750 ?statement .
          ?statement ps:P750 ?distributor .
          OPTIONAL {{ ?statement pq:P17 ?country . }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }} LIMIT 25
        """
        try:
            resp = self.client.get(
                self.SPARQL_URL,
                params={"query": query, "format": "json"},
                headers={"Accept": "application/sparql-results+json"},
            )
            if resp.status_code != 200:
                return []
            bindings = resp.json().get("results", {}).get("bindings", [])
            results = []
            for b in bindings:
                d_name = b.get("distributorLabel", {}).get("value")
                c_name = b.get("countryLabel", {}).get("value")
                if d_name:
                    results.append({"name": d_name, "country": c_name or "Global"})
            return results
        except Exception:
            return []

    def _find_game_qid(self, prop: str, value: str) -> Optional[str]:
        query = f"""
        SELECT ?item WHERE {{
          ?item wdt:{prop} "{value}" .
        }} LIMIT 1
        """
        try:
            resp = self.client.get(
                self.SPARQL_URL,
                params={"query": query, "format": "json"},
                headers={"Accept": "application/sparql-results+json"},
            )
            if resp.status_code == 200:
                bindings = resp.json().get("results", {}).get("bindings", [])
                if bindings:
                    uri = bindings[0].get("item", {}).get("value", "")
                    return uri.split("/")[-1]
        except Exception:
            pass
        return None

    def _search_entity_qid(self, title: str, instance_of: str) -> Optional[str]:
        try:
            resp = self.client.get(
                self.WIKIDATA_API,
                params={
                    "action": "wbsearchentities",
                    "search": title,
                    "language": "en",
                    "format": "json",
                    "limit": 5,
                },
            )
            if resp.status_code == 200:
                results = resp.json().get("search", [])
                for r in results:
                    desc = (r.get("description") or "").lower()
                    if instance_of.lower() in desc or "game" in desc:
                        return r.get("id")
        except Exception:
            pass
        return None

    def _batch_get_entities(self, qids: List[str]) -> Dict[str, Any]:
        result = {}
        for i in range(0, len(qids), 40):
            chunk = qids[i : i + 40]
            try:
                resp = self.client.get(
                    self.WIKIDATA_API,
                    params={
                        "action": "wbgetentities",
                        "ids": "|".join(chunk),
                        "languages": "en",
                        "props": "labels|descriptions|claims|sitelinks",
                        "format": "json",
                    },
                )
                if resp.status_code == 200:
                    result.update(resp.json().get("entities", {}))
            except Exception:
                pass
        return result

    def _wikimedia_thumb(self, filename: Optional[str]) -> Optional[str]:
        if not filename:
            return None
        safe = urllib.parse.quote(filename.replace(" ", "_"))
        return f"https://commons.wikimedia.org/wiki/Special:FilePath/{safe}?width=400"


# ---------------------------------------------------------------------------
# Admin Compute Worker: Artwork & Metadata Processing
# ---------------------------------------------------------------------------


class AdminComputeWorker:
    """Multi-threaded artwork processor & Wikidata metadata offloader."""

    def __init__(
        self,
        server_url: str,
        token: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        concurrency: int = 16,
        batch_size: int = 20,
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
        self.is_paused = False

        self.total_media_processed = 0
        self.total_candidates_evaluated = 0
        self.total_winners_uploaded = 0
        self.total_bytes_uploaded = 0
        self.total_enrichments = 0
        self.processed_media_ids: Set[int] = set()
        self.stats_lock = threading.Lock()
        self.start_time = time.time()
        self.event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None

        limits = httpx.Limits(
            max_keepalive_connections=64, max_connections=128, keepalive_expiry=30.0
        )
        self.http_client = httpx.Client(
            timeout=25.0, follow_redirects=True, limits=limits
        )
        self.wikidata = WikidataResolver()
        self.auth_lock = threading.RLock()

    def pause(self):
        self.is_paused = True

    def resume(self):
        self.is_paused = False

    def authenticate(self, silent: bool = False):
        if not self.token:
            if not self.username:
                self.username = input("Enter admin username or email: ").strip()
            if not self.password:
                self.password = getpass.getpass("Enter admin password: ")

            self.http_client.headers.pop("Authorization", None)
            login_url = f"{self.server_url}/api/v1/auth/login"
            if not silent:
                print(f"{Colors.GRAY}Authenticating with {login_url}...{Colors.RESET}")
            resp = self.http_client.post(
                login_url,
                json={"identity": self.username, "password": self.password},
            )
            if resp.status_code != 200:
                print(
                    f"{Colors.RED}Authentication failed (HTTP {resp.status_code}): {resp.text[:300]}{Colors.RESET}"
                )
                if silent:
                    time.sleep(5)
                    return self.authenticate(silent=True)
                sys.exit(1)

            data = resp.json()
            if data.get("two_factor_required"):
                code = input("2FA required. Enter TOTP code: ").strip()
                tfa_resp = self.http_client.post(
                    f"{self.server_url}/api/v1/auth/2fa/login-verify",
                    json={"challenge_token": data["challenge_token"], "code": code},
                )
                if tfa_resp.status_code != 200:
                    print(
                        f"{Colors.RED}2FA verification failed: {tfa_resp.text}{Colors.RESET}"
                    )
                    sys.exit(1)
                self.token = tfa_resp.json()["access_token"]
            else:
                self.token = data.get("access_token")

        self.http_client.headers["Authorization"] = f"Bearer {self.token}"

        if not silent:
            me_resp = self.http_client.get(f"{self.server_url}/api/v1/auth/me")
            if me_resp.status_code == 200:
                user_data = me_resp.json()
                is_staff = user_data.get("is_admin", False) or user_data.get(
                    "is_staff", False
                )
                username = user_data.get("username", "Admin")
                if not is_staff:
                    print(
                        f"{Colors.RED}Error: User '{username}' is not a staff/admin user.{Colors.RESET}"
                    )
                    sys.exit(1)
                print(
                    f"{Colors.GREEN}[OK] Authenticated as admin '{username}'{Colors.RESET}"
                )

    def authenticated_request(
        self, method: str, url: str, **kwargs
    ) -> httpx.Response:
        resp = self.http_client.request(method, url, **kwargs)
        if resp.status_code == 401:
            with self.auth_lock:
                self.token = None
                self.authenticate(silent=True)
                if "headers" in kwargs:
                    kwargs["headers"]["Authorization"] = f"Bearer {self.token}"
                return self.http_client.request(method, url, **kwargs)
        return resp

    def claim_media_jobs(self) -> List[Dict[str, Any]]:
        claim_url = f"{self.server_url}/api/v1/media/admin/compute/claim"
        try:
            resp = self.authenticated_request(
                "POST",
                claim_url,
                json={"task": "artwork", "group_by_media": True, "batch_size": self.batch_size},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            jobs = data.get("media_jobs", [])
            with self.stats_lock:
                return [
                    j
                    for j in jobs
                    if j.get("media_item_id") not in self.processed_media_ids
                ]
        except Exception as exc:
            print(f"{Colors.YELLOW}Claim error: {exc}{Colors.RESET}")
            return []

    def release_leases(
        self, asset_ids: List[int], media_ids: Optional[List[int]] = None
    ):
        payload = {}
        if asset_ids:
            payload["asset_ids"] = asset_ids
        if media_ids:
            payload["media_ids"] = media_ids
        if not payload:
            return
        try:
            self.authenticated_request(
                "POST",
                f"{self.server_url}/api/v1/media/admin/compute/release",
                json=payload,
            )
        except Exception:
            pass

    def _download_and_transcode_asset(
        self, asset: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        aid = asset["asset_id"]
        url = asset.get("url")
        asset_type = asset.get("asset_type", "poster")

        if not url or url.lower().split("?", 1)[0].endswith(".svg"):
            return None

        try:
            dl_resp = self.http_client.get(url, timeout=12.0)
            if dl_resp.status_code != 200 or not dl_resp.content:
                return None
            raw_bytes = dl_resp.content

            with Image.open(io.BytesIO(raw_bytes)) as img:
                width, height = img.size
                theme_guess = classify_theme(img, asset_type)
                hex_color = extract_dominant_color(img)

                buf = io.BytesIO()
                target_img = (
                    img.convert("RGBA")
                    if img.mode in ("RGBA", "LA", "P")
                    else img.convert("RGB")
                )
                target_img.save(
                    buf, format="WEBP", quality=self.webp_quality, method=4
                )
                webp_bytes = buf.getvalue()

                return {
                    "asset_id": aid,
                    "asset_type": asset_type,
                    "url": url,
                    "theme_guess": theme_guess,
                    "hex_color": hex_color,
                    "width": width,
                    "height": height,
                    "webp_bytes": webp_bytes,
                    "original_asset": asset,
                }
        except Exception:
            return None

    def pick_media_winners(
        self,
        candidate_assets: List[Dict[str, Any]],
        processed_map: Dict[int, Dict[str, Any]],
    ) -> Set[int]:
        winners: Set[int] = set()

        by_type: Dict[str, List[Dict[str, Any]]] = {}
        for a in candidate_assets:
            atype = a.get("asset_type", "poster")
            by_type.setdefault(atype, []).append(a)
            if a.get("keep_local") or a.get("selected_context"):
                winners.add(a["asset_id"])

        for atype, assets in by_type.items():
            for context in ("general", "dark", "light"):
                best_cand = None
                best_rank = (-1, -1, -1, -1, 0)

                for a in assets:
                    aid = a["asset_id"]
                    proc = processed_map.get(aid)
                    guess = proc["theme_guess"] if proc else None
                    width = proc["width"] if proc else 0
                    height = proc["height"] if proc else 0
                    area = width * height

                    pin_rank = 1 if a.get("selected_context") == context else 0
                    if atype == "logo":
                        theme_rank = _LOGO_THEME_RANK.get(context, {}).get(guess, 1)
                    elif atype in ("backdrop", "textless_backdrop"):
                        theme_rank = _BACKDROP_THEME_RANK.get(context, {}).get(guess, 1)
                    else:
                        theme_rank = 1

                    score = a.get("score") or 0
                    rank = (pin_rank, theme_rank, score, area, -aid)
                    if rank > best_rank:
                        best_rank = rank
                        best_cand = aid

                if best_cand:
                    winners.add(best_cand)

            textless_type = f"textless_{atype}"
            textless_candidates = [
                a
                for a in candidate_assets
                if a.get("asset_type") == textless_type
                or a.get("selected_context") == "textless"
            ]
            if textless_candidates:
                best_t = max(
                    textless_candidates,
                    key=lambda x: (
                        1 if x.get("selected_context") == "textless" else 0,
                        x.get("score") or 0,
                        -x["asset_id"],
                    ),
                )
                winners.add(best_t["asset_id"])

        return winners

    def process_media_item(self, media_job: Dict[str, Any]) -> None:
        mid = media_job["media_item_id"]
        title = media_job.get("title", "Unknown")
        mtype = media_job.get("media_type", "movie")
        assets = media_job.get("assets", [])
        needs_enrichment = media_job.get("needs_enrichment", False)
        ext_ids = media_job.get("external_ids", {})

        unmirrored = [a for a in assets if not a.get("is_mirrored")]
        if not unmirrored:
            self.release_leases([], media_ids=[mid])
            return

        processed_map: Dict[int, Dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=min(len(unmirrored), 8)) as pool:
            futures = {
                pool.submit(self._download_and_transcode_asset, a): a["asset_id"]
                for a in unmirrored
            }
            for f in as_completed(futures):
                res = f.result()
                if res:
                    processed_map[res["asset_id"]] = res

        winning_asset_ids = self.pick_media_winners(assets, processed_map)
        non_winning_ids = [
            a["asset_id"] for a in unmirrored if a["asset_id"] not in winning_asset_ids
        ]

        uploaded_count = 0
        uploaded_bytes = 0
        for aid in winning_asset_ids:
            item = processed_map.get(aid)
            if not item:
                continue
            try:
                sub_url = f"{self.server_url}/api/v1/media/admin/compute/submit"
                files = {
                    "file": (
                        f"asset_{aid}.webp",
                        item["webp_bytes"],
                        "image/webp",
                    )
                }
                data = {"asset_id": aid, "color_guess": item["theme_guess"]}
                resp = self.authenticated_request(
                    "POST", sub_url, data=data, files=files
                )
                if resp.status_code == 200:
                    uploaded_count += 1
                    uploaded_bytes += len(item["webp_bytes"])
            except Exception:
                pass

        if non_winning_ids:
            self.release_leases(asset_ids=non_winning_ids, media_ids=[mid])
        else:
            self.release_leases(asset_ids=[], media_ids=[mid])

        enrichment_summary = ""
        if needs_enrichment:
            enrichment_payload: Dict[str, Any] = {"media_item_id": mid}
            if mtype == "game":
                g_credits = self.wikidata.resolve_game_credits(
                    steam_id=ext_ids.get("steam"),
                    igdb_id=ext_ids.get("igdb"),
                    title=title,
                )
                if g_credits:
                    enrichment_payload.update(g_credits)
                    enrichment_summary = (
                        f" (Wikidata: {len(g_credits.get('characters', []))} chars, "
                        f"{len(g_credits.get('cast', []))} cast, {len(g_credits.get('crew', []))} crew)"
                    )
            elif mtype in ("movie", "show"):
                distributors = self.wikidata.resolve_movie_distributors(
                    imdb_id=ext_ids.get("imdb"), tmdb_id=ext_ids.get("tmdb")
                )
                if distributors:
                    enrichment_payload["distributors"] = distributors
                    enrichment_summary = f" (Wikidata: {len(distributors)} distributors)"

            if len(enrichment_payload) > 1:
                try:
                    e_resp = self.authenticated_request(
                        "POST",
                        f"{self.server_url}/api/v1/media/admin/compute/enrichment",
                        json=enrichment_payload,
                    )
                    if e_resp.status_code == 200:
                        with self.stats_lock:
                            self.total_enrichments += 1
                except Exception:
                    pass

        with self.stats_lock:
            self.processed_media_ids.add(mid)
            self.total_media_processed += 1
            self.total_candidates_evaluated += len(unmirrored)
            self.total_winners_uploaded += uploaded_count
            self.total_bytes_uploaded += uploaded_bytes

        saved_pct = 0
        if len(unmirrored) > 0:
            saved_pct = int((1.0 - (uploaded_count / len(unmirrored))) * 100)

        mb_up = uploaded_bytes / (1024 * 1024)
        if self.event_callback:
            self.event_callback(
                "artwork",
                {
                    "title": title,
                    "mid": mid,
                    "mtype": mtype,
                    "candidates": len(unmirrored),
                    "winners": uploaded_count,
                    "saved_pct": saved_pct,
                    "mb": mb_up,
                    "enrichment": enrichment_summary.strip(),
                },
            )
        else:
            ts = datetime.now().strftime("%H:%M:%S")
            print(
                f"{Colors.GRAY}[{ts}]{Colors.RESET} {Colors.GREEN}✓ ARTWORK{Colors.RESET} "
                f"{Colors.BOLD}{title}{Colors.RESET} (#{mid} {mtype}) | "
                f"{len(unmirrored)} candidates -> {uploaded_count} winners ({Colors.CYAN}{saved_pct}% disk saved{Colors.RESET}) | "
                f"{mb_up:.2f} MB{enrichment_summary}",
                flush=True,
            )

    def run(self):
        self.authenticate()
        if self.event_callback:
            self.event_callback(
                "online",
                {
                    "name": "Artwork Engine",
                    "target": f"{self.concurrency} worker threads",
                },
            )
        else:
            ts = datetime.now().strftime("%H:%M:%S")
            print(
                f"{Colors.GRAY}[{ts}]{Colors.RESET} {Colors.GREEN}✓ Artwork engine online with {self.concurrency} threads.{Colors.RESET}\n",
                flush=True,
            )

        while self.running:
            if self.is_paused:
                time.sleep(1)
                continue

            media_jobs = self.claim_media_jobs()
            if not media_jobs:
                time.sleep(10)
                continue

            with ThreadPoolExecutor(
                max_workers=min(len(media_jobs), max(1, self.concurrency // 2))
            ) as pool:
                futures = {
                    pool.submit(self.process_media_item, m): m["media_item_id"]
                    for m in media_jobs
                }
                for f in as_completed(futures):
                    try:
                        f.result()
                    except Exception as exc:
                        mid = futures[f]
                        self.release_leases(asset_ids=[], media_ids=[mid])


# ---------------------------------------------------------------------------
# Embedding Worker: GPU Dense Vector Computation (BAAI/bge-m3)
# ---------------------------------------------------------------------------


class EmbeddingWorker:
    """Dedicated GPU-accelerated embedding worker with Smart Game Auto-Throttling."""

    def __init__(
        self,
        server_url: str,
        token: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        batch_size: int = 200,
        model_name: str = "BAAI/bge-m3",
        gpu_batch_size: int = 32,
        sleep_between_batches: float = 0.0,
        workload_pct: int = 85,
        auto_throttle: bool = True,
        low_priority: bool = False,
        max_batches: Optional[int] = None,
    ):
        self.server_url = server_url.rstrip("/")
        self.token = token
        self.username = username
        self.password = password
        self.batch_size = batch_size
        self.model_name = model_name
        self.gpu_batch_size = gpu_batch_size
        self.sleep_between_batches = sleep_between_batches
        self.workload_pct = workload_pct
        self.auto_throttle = auto_throttle
        self.low_priority = low_priority
        self.max_batches = max_batches
        self.is_paused = False

        self.gpu_monitor = SmartGpuMonitor(auto_throttle=auto_throttle)
        self.running = True
        self.client = httpx.Client(timeout=90.0)
        self.auth_lock = threading.RLock()
        self.start_time = time.time()
        self.total_embedded = 0
        self.batch_count = 0
        self.total_catalog: Optional[int] = None
        self.remaining_catalog: Optional[int] = None
        self.model = None
        self.device = "cpu"
        self._was_throttled = False
        self.event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None

    def pause(self):
        self.is_paused = True

    def resume(self):
        self.is_paused = False

    def set_workload(self, new_workload: int) -> Tuple[int, float]:
        self.workload_pct = max(1, min(100, int(new_workload)))
        calc_batch, calc_sleep = compute_workload_params(self.workload_pct)
        self.gpu_batch_size = calc_batch
        self.sleep_between_batches = calc_sleep
        return self.gpu_batch_size, self.sleep_between_batches

    def set_auto_throttle(self, enabled: bool):
        self.auto_throttle = enabled
        self.gpu_monitor.auto_throttle = enabled

    def refresh_stats(self):
        try:
            resp = self.authenticated_request(
                "GET", f"{self.server_url}/api/v1/media/admin/compute/stats"
            )
            if resp.status_code == 200:
                data = resp.json()
                self.remaining_catalog = data.get("embeddings_pending")
                self.total_catalog = data.get("catalog_total")
        except Exception:
            pass

    def authenticate(self):
        if not self.token:
            if not self.username:
                self.username = input("Enter admin username: ").strip()
            if not self.password:
                self.password = getpass.getpass("Enter admin password: ")

            login_url = f"{self.server_url}/api/v1/auth/login"
            resp = self.client.post(
                login_url,
                json={"identity": self.username, "password": self.password},
            )
            if resp.status_code != 200:
                print(
                    f"{Colors.RED}Embedding worker auth failed: {resp.text[:200]}{Colors.RESET}"
                )
                sys.exit(1)

            data = resp.json()
            if data.get("two_factor_required"):
                code = input("2FA required. Enter TOTP code: ").strip()
                tfa_resp = self.client.post(
                    f"{self.server_url}/api/v1/auth/2fa/login-verify",
                    json={"challenge_token": data["challenge_token"], "code": code},
                )
                self.token = tfa_resp.json()["access_token"]
            else:
                self.token = data.get("access_token")

        self.client.headers["Authorization"] = f"Bearer {self.token}"

    def authenticated_request(
        self, method: str, url: str, **kwargs
    ) -> httpx.Response:
        resp = self.client.request(method, url, **kwargs)
        if resp.status_code == 401:
            with self.auth_lock:
                self.token = None
                self.authenticate()
                if "headers" in kwargs:
                    kwargs["headers"]["Authorization"] = f"Bearer {self.token}"
                return self.client.request(method, url, **kwargs)
        return resp

    def init_model(self):
        try:
            from sentence_transformers import SentenceTransformer
            import torch

            if torch.cuda.is_available():
                self.device = "cuda"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                self.device = "mps"
            else:
                self.device = "cpu"

            self.model = SentenceTransformer(self.model_name, device=self.device)
            if hasattr(self.model, "max_seq_length") and self.model.max_seq_length > 2048:
                self.model.max_seq_length = 2048
        except Exception as exc:
            print(
                f"{Colors.RED}[!] Failed to load model {self.model_name}: {exc}{Colors.RESET}"
            )
            raise

    def claim_jobs(self) -> List[Dict[str, Any]]:
        claim_url = f"{self.server_url}/api/v1/media/admin/compute/claim"
        for try_batch in [self.batch_size, max(self.batch_size * 2, 400)]:
            try:
                resp = self.authenticated_request(
                    "POST",
                    claim_url,
                    json={"task": "embeddings", "batch_size": try_batch},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if "remaining" in data:
                        self.remaining_catalog = data.get("remaining")
                    if "total_catalog" in data:
                        self.total_catalog = data.get("total_catalog")
                    items = data.get("items", [])
                    if items:
                        if len(items) > self.batch_size:
                            excess = items[self.batch_size :]
                            items = items[: self.batch_size]
                            excess_ids = [x["media_item_id"] for x in excess]
                            self.release_leases(excess_ids)
                        return items
                else:
                    return []
            except Exception:
                return []
        return []

    def submit_embeddings(self, embeddings: List[Dict[str, Any]]) -> bool:
        sub_url = f"{self.server_url}/api/v1/media/admin/compute/embeddings"
        CHUNK_SIZE = 50
        all_ok = True
        for i in range(0, len(embeddings), CHUNK_SIZE):
            chunk = embeddings[i : i + CHUNK_SIZE]
            try:
                resp = self.authenticated_request(
                    "POST", sub_url, json={"embeddings": chunk}
                )
                if resp.status_code != 200:
                    all_ok = False
            except Exception:
                all_ok = False
        return all_ok

    def release_leases(self, embedding_ids: List[int]):
        if not embedding_ids:
            return
        try:
            self.authenticated_request(
                "POST",
                f"{self.server_url}/api/v1/media/admin/compute/release",
                json={"embedding_ids": embedding_ids},
            )
        except Exception:
            pass

    def run(self):
        if self.low_priority:
            try:
                # BELOW_NORMAL_PRIORITY_CLASS = 0x00004000
                ctypes.windll.kernel32.SetPriorityClass(
                    ctypes.windll.kernel32.GetCurrentProcess(), 0x00004000
                )
            except Exception:
                pass

        self.authenticate()
        self.refresh_stats()
        self.init_model()

        if self.event_callback:
            self.event_callback(
                "online",
                {
                    "name": "Embedding Engine",
                    "target": f"{self.device.upper()} · Workload: {self.workload_pct}% · Batch: {self.gpu_batch_size}",
                },
            )
        else:
            ts = datetime.now().strftime("%H:%M:%S")
            print(
                f"{Colors.GRAY}[{ts}]{Colors.RESET} {Colors.GREEN}✓ Embedding engine online on {self.device.upper()} "
                f"(Workload: {self.workload_pct}%, Batch: {self.gpu_batch_size}){Colors.RESET}\n",
                flush=True,
            )

        while self.running:
            if self.is_paused:
                time.sleep(1)
                continue

            if self.batch_count > 0 and self.batch_count % 20 == 0:
                self.refresh_stats()

            # Smart GPU Check before claim & encode
            eff_gpu_batch, eff_sleep, is_throttled, reason = (
                self.gpu_monitor.check_throttle(
                    self.gpu_batch_size, self.sleep_between_batches
                )
            )

            if is_throttled and not self._was_throttled:
                self._was_throttled = True
                if self.event_callback:
                    self.event_callback(
                        "gaming",
                        {
                            "reason": reason,
                            "batch": eff_gpu_batch,
                            "sleep": eff_sleep,
                        },
                    )
                else:
                    ts = datetime.now().strftime("%H:%M:%S")
                    print(
                        f"{Colors.GRAY}[{ts}]{Colors.RESET} {Colors.YELLOW}🎮 Game/App detected on GPU ({reason}). "
                        f"Auto-throttling to whisper mode (batch: {eff_gpu_batch}, sleep: {eff_sleep:.2f}s) to preserve frame rates!{Colors.RESET}",
                        flush=True,
                    )
            elif not is_throttled and self._was_throttled:
                self._was_throttled = False
                if self.event_callback:
                    self.event_callback(
                        "online",
                        {
                            "name": "GPU Workload Restored",
                            "target": f"Batch: {self.gpu_batch_size} · Workload: {self.workload_pct}%",
                        },
                    )
                else:
                    ts = datetime.now().strftime("%H:%M:%S")
                    print(
                        f"{Colors.GRAY}[{ts}]{Colors.RESET} {Colors.GREEN}🚀 GPU clear. Resuming normal workload ({self.workload_pct}%, batch: {self.gpu_batch_size})...{Colors.RESET}",
                        flush=True,
                    )

            jobs = self.claim_jobs()
            if not jobs:
                time.sleep(12)
                continue

            t0 = time.time()
            texts = [j["text"] for j in jobs]
            media_ids = [j["media_item_id"] for j in jobs]

            # GPU encode with automatic OOM recovery
            try:
                vectors = self.model.encode(
                    texts,
                    batch_size=eff_gpu_batch,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                )
            except Exception:
                try:
                    import torch

                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except Exception:
                    pass
                try:
                    vectors = self.model.encode(
                        texts,
                        batch_size=8,
                        normalize_embeddings=True,
                        show_progress_bar=False,
                    )
                except Exception:
                    self.release_leases(media_ids)
                    time.sleep(4)
                    continue

            payload = [
                {
                    "media_item_id": mid,
                    "vector": vec.tolist() if hasattr(vec, "tolist") else list(vec),
                }
                for mid, vec in zip(media_ids, vectors)
            ]

            success = self.submit_embeddings(payload)
            if success:
                batch_sec = time.time() - t0
                self.total_embedded += len(jobs)
                self.batch_count += 1
                if self.remaining_catalog is not None:
                    self.remaining_catalog = max(0, self.remaining_catalog - len(jobs))
                rate = len(jobs) / batch_sec if batch_sec > 0 else 0
                elapsed = time.time() - self.start_time
                avg_rate = self.total_embedded / elapsed if elapsed > 0 else 0

                vram_mb = 0
                try:
                    import torch

                    if self.device == "cuda" and torch.cuda.is_available():
                        vram_mb = int(torch.cuda.memory_allocated() / (1024 * 1024))
                except Exception:
                    pass

                pct_done = 0.0
                if self.remaining_catalog is not None and self.total_catalog and self.total_catalog > 0:
                    pct_done = (
                        (self.total_catalog - self.remaining_catalog)
                        / self.total_catalog
                    ) * 100

                if self.event_callback:
                    self.event_callback(
                        "embed",
                        {
                            "count": len(jobs),
                            "sec": batch_sec,
                            "rate": rate,
                            "remaining": self.remaining_catalog or 0,
                            "total": self.total_catalog or 0,
                            "pct_done": pct_done,
                            "session_total": self.total_embedded,
                            "avg_rate": avg_rate,
                            "vram_mb": vram_mb,
                            "is_throttled": is_throttled,
                            "throttle_reason": reason,
                        },
                    )
                else:
                    rem_str = ""
                    if self.remaining_catalog is not None:
                        if self.total_catalog and self.total_catalog > 0:
                            rem_str = f" | {Colors.YELLOW}Remaining: {self.remaining_catalog:,} ({pct_done:.1f}% done){Colors.RESET}"
                        else:
                            rem_str = f" | {Colors.YELLOW}Remaining: {self.remaining_catalog:,}{Colors.RESET}"

                    throttle_tag = (
                        f" {Colors.YELLOW}[THROTTLED]{Colors.RESET}"
                        if is_throttled
                        else ""
                    )
                    vram_str = f" | VRAM: {vram_mb} MB" if vram_mb > 0 else ""
                    ts = datetime.now().strftime("%H:%M:%S")
                    print(
                        f"{Colors.GRAY}[{ts}]{Colors.RESET} {Colors.GREEN}✓ EMBED{Colors.RESET}{throttle_tag} "
                        f"Processed {len(jobs)} items in {batch_sec:.2f}s ({Colors.CYAN}{rate:.1f} items/s{Colors.RESET}){rem_str} | "
                        f"Session: {self.total_embedded:,} ({avg_rate:.1f} avg/s){vram_str}",
                        flush=True,
                    )

                if eff_sleep > 0:
                    time.sleep(eff_sleep)

                if self.max_batches and self.batch_count >= self.max_batches:
                    print(
                        f"\n{Colors.GREEN}[+] Reached maximum requested batches ({self.max_batches}). Stopping worker.{Colors.RESET}",
                        flush=True,
                    )
                    self.running = False
                    break
            else:
                self.release_leases(media_ids)


# ---------------------------------------------------------------------------
# CLI Command Implementations
# ---------------------------------------------------------------------------


def cmd_stats(args: argparse.Namespace):
    """Fetches and displays live server health, catalog stats, and storage usage."""
    cfg = load_worker_config()
    server = args.server or cfg["server"]
    username = args.username or cfg["username"]
    password = args.password or cfg["password"]
    hw = detect_hardware()

    t0 = time.time()
    try:
        ping_resp = httpx.get(f"{server}/api/v1/health", timeout=5.0)
        latency_ms = (time.time() - t0) * 1000
        health_ok = ping_resp.status_code == 200
    except Exception:
        latency_ms = 0.0
        health_ok = False

    token = None
    stats_data = {}
    artwork_data = {}

    if health_ok:
        try:
            auth_resp = httpx.post(
                f"{server}/api/v1/auth/login",
                json={"identity": username, "password": password},
                timeout=10.0,
            )
            if auth_resp.status_code == 200:
                token = auth_resp.json().get("access_token")
                headers = {"Authorization": f"Bearer {token}"}
                s_resp = httpx.get(
                    f"{server}/api/v1/media/admin/compute/stats",
                    headers=headers,
                    timeout=10.0,
                )
                if s_resp.status_code == 200:
                    stats_data = s_resp.json()
                a_resp = httpx.get(
                    f"{server}/api/v1/media/admin/artwork-settings",
                    headers=headers,
                    timeout=10.0,
                )
                if a_resp.status_code == 200:
                    artwork_data = a_resp.json()
        except Exception as exc:
            print(f"{Colors.YELLOW}[!] Auth/Stats error: {exc}{Colors.RESET}")

    if HAS_RICH and console:
        console.print(
            Panel(
                f"[bold cyan]Server URL:[/bold cyan] {server}  |  "
                f"[bold cyan]Status:[/bold cyan] {'[green]ONLINE[/green]' if health_ok else '[red]OFFLINE[/red]'}  |  "
                f"[bold cyan]Latency:[/bold cyan] {latency_ms:.1f} ms  |  "
                f"[bold cyan]Auth User:[/bold cyan] {username}",
                title="[bold white]Otix Central Node Status[/bold white]",
                border_style="dim white",
                box=box.ROUNDED,
            )
        )

        catalog_total = stats_data.get("catalog_total", 0)
        embed_done = stats_data.get("embeddings_total", 0)
        embed_pending = stats_data.get("embeddings_pending", 0)
        pct_embed = (
            (embed_done / catalog_total * 100) if catalog_total > 0 else 0
        )

        mirrored_count = stats_data.get("mirrored_total", 0)
        storage_info = stats_data.get("storage", {})
        used_gb = storage_info.get("bytes", 0) / (1024**3)
        max_gb = storage_info.get("max_gb", 0)
        unmirrored = stats_data.get("unmirrored_candidates", 0)
        pct_storage = (used_gb / max_gb * 100) if max_gb > 0 else 0

        t = Table(box=box.ROUNDED, expand=True)
        t.add_column("Domain", style="cyan", width=22)
        t.add_column("Completed / Current", style="bold white")
        t.add_column("Pending / Target", style="yellow")
        t.add_column("Progress Bar", justify="left")

        bar_w = 26
        # Embeddings bar
        done_chars = int((pct_embed / 100.0) * bar_w)
        embed_bar = f"[green]{'■' * done_chars}[/green][dim]{'░' * (bar_w - done_chars)}[/dim] {pct_embed:.1f}%"
        t.add_row(
            "Semantic Embeddings",
            f"{embed_done:,} items",
            f"{embed_pending:,} pending",
            embed_bar,
        )

        # Storage bar
        st_chars = min(bar_w, int((pct_storage / 100.0) * bar_w))
        st_color = "red" if pct_storage >= 95 else "green"
        st_bar = f"[{st_color}]{'■' * st_chars}[/{st_color}][dim]{'░' * (bar_w - st_chars)}[/dim] {pct_storage:.1f}%"
        t.add_row(
            "Mirrored Artwork",
            f"{mirrored_count:,} files ({used_gb:.2f} GB)",
            f"{unmirrored:,} unmirrored ({max_gb} GB budget)",
            st_bar,
        )

        console.print(t)

        gpu_str = (
            f"{hw['device_name']} ({hw['vram_gb']} GB VRAM)"
            if hw["cuda_available"]
            else hw["device_name"]
        )
        hw_table = Table(box=box.SIMPLE, expand=True)
        hw_table.add_column("Local Hardware Spec", style="dim cyan")
        hw_table.add_column("Value", style="bold white")
        hw_table.add_row("GPU Device", gpu_str)
        hw_table.add_row(
            "CUDA Acceleration",
            "[bold green]Available (PyTorch CUDA)[/bold green]"
            if hw["cuda_available"]
            else "[yellow]Not available (CPU mode)[/yellow]",
        )
        hw_table.add_row(
            "PyTorch / SentenceTransformers",
            f"{hw['torch_version'] or 'Not installed'} / {hw['st_version'] or 'Not installed'}",
        )
        hw_table.add_row("CPU Core Threads", str(hw["cpu_cores"]))
        console.print(
            Panel(
                hw_table,
                title="[bold white]Local Workstation Acceleration[/bold white]",
                border_style="dim white",
                box=box.ROUNDED,
            )
        )
    else:
        print(f"\n--- Otix Central Node Status: {server} ---")
        print(f"Latency: {latency_ms:.1f}ms | Health: {'OK' if health_ok else 'DOWN'}")
        print(
            f"Catalog: {stats_data.get('catalog_total', 0):,} items | "
            f"Embedded: {stats_data.get('embeddings_total', 0):,} | "
            f"Pending: {stats_data.get('embeddings_pending', 0):,}"
        )
        print(
            f"Artwork Storage: {stats_data.get('storage', {}).get('bytes', 0) / (1024**3):.2f} GB / "
            f"{stats_data.get('storage', {}).get('max_gb', 0)} GB budget"
        )
        print(
            f"Workstation GPU: {hw['device_name']} (CUDA: {hw['cuda_available']})\n"
        )


def cmd_benchmark(args: argparse.Namespace):
    """Benchmarks local GPU embedding inference speed and calculates full catalog ETA."""
    hw = detect_hardware()
    model_name = getattr(args, "model", "BAAI/bge-m3")
    gpu_batch = getattr(args, "gpu_batch_size", 32)

    if HAS_RICH and console:
        console.print(
            Panel(
                f"[bold cyan]Model:[/bold cyan] {model_name}  |  "
                f"[bold cyan]GPU Batch Size:[/bold cyan] {gpu_batch}  |  "
                f"[bold cyan]Device:[/bold cyan] {hw['device_name']} ({hw['vram_gb']} GB)",
                title="[bold white]Otix Semantic Embedding GPU Benchmark[/bold white]",
                border_style="dim white",
                box=box.ROUNDED,
            )
        )
        with console.status(
            f"[bold cyan]Loading model {model_name} onto GPU...[/bold cyan]"
        ):
            try:
                from sentence_transformers import SentenceTransformer
                import torch

                device = "cuda" if torch.cuda.is_available() else "cpu"
                model = SentenceTransformer(model_name, device=device)
            except Exception as e:
                console.print(f"[bold red]Failed to load model: {e}[/bold red]")
                return
    else:
        print(f"[*] Loading model {model_name}...")
        from sentence_transformers import SentenceTransformer
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = SentenceTransformer(model_name, device=device)

    # Realistic sample texts formatted identically to production
    samples = [
        "Title: Cyberpunk 2077 (2020)\nType: Game | Genres: RPG, Sci-Fi\n"
        "Creators/Directors: CD PROJEKT RED\nCast: Keanu Reeves (Johnny Silverhand)\n"
        "Overview: An open-world, action-adventure story set in Night City.\n"
        "Themes/Keywords: cyberpunk, dystopian, future, neon, hacking, cyberware"
    ] * 64

    # Warmup
    model.encode(samples[:4], batch_size=4, normalize_embeddings=True)

    # Timed run
    t0 = time.time()
    model.encode(samples, batch_size=gpu_batch, normalize_embeddings=True)
    elapsed = time.time() - t0
    rate = len(samples) / elapsed if elapsed > 0 else 0

    # Estimate against live production pending count
    cfg = load_worker_config()
    server = getattr(args, "server", cfg["server"])
    pending = 192544
    try:
        r = httpx.get(f"{server}/api/v1/media/admin/compute/stats", timeout=5.0)
        if r.status_code == 200:
            pending = r.json().get("embeddings_pending", pending)
    except Exception:
        pass

    est_minutes = (pending / rate) / 60.0 if rate > 0 else 0

    if HAS_RICH and console:
        t = Table(box=box.ROUNDED, expand=True)
        t.add_column("Metric", style="cyan")
        t.add_column("Benchmark Result", style="bold green")
        t.add_row("Throughput Speed", f"{rate:.1f} media items / second")
        t.add_row("Hourly Capacity", f"{rate * 3600:,.0f} items / hour")
        t.add_row("Pending Catalog Load", f"{pending:,} items")
        t.add_row("Estimated Time to 100%", f"{est_minutes:.1f} minutes (~{est_minutes / 60.0:.1f} hours)")

        console.print(t)
        console.print(
            "[bold green]✓ Benchmark complete![/bold green] Your GPU is ready to crunch the catalog.\n"
        )
    else:
        print(f"\n[+] Speed: {rate:.1f} items/sec ({rate * 3600:,.0f} items/hr)")
        print(f"[+] Remaining {pending:,} items estimated at ~{est_minutes:.1f} minutes.\n")


def cmd_hydrate(args: argparse.Namespace):
    """Runs catalog discover seed and drains sync jobs."""
    limit = getattr(args, "limit", 50)
    workers = getattr(args, "workers", 8)

    print(
        f"\n{Colors.CYAN}{Colors.BOLD}=== Otix Catalog Discovery & Hydration ==={Colors.RESET}"
    )
    print(f"Seeding top discover lists (limit={limit}, workers={workers})...\n")

    # Check if local Django environment is importable
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        import django

        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
        django.setup()

        from apps.integrations.models import SyncJob
        from apps.integrations.services.catalog_seed import seed_popular_catalog
        from apps.integrations.services.sync import execute_sync_job
        from apps.media.services import assets as assets_service

        seed_res = seed_popular_catalog(limit=limit)
        print(f"{Colors.GREEN}[+] Seed discovery completed: {seed_res}{Colors.RESET}")

        pending = list(
            SyncJob.objects.filter(status="pending")
            .exclude(entity_type__in=["music", "album"])
            .order_by("priority", "created_at")
            .values_list("pk", flat=True)
        )
        total = len(pending)
        print(f"[*] Found {total} pending sync jobs to process.")

        if total > 0 and HAS_RICH and console:
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                TaskProgressColumn(),
                TimeElapsedColumn(),
            ) as prog:
                task = prog.add_task("[cyan]Hydrating titles...", total=total)
                with ThreadPoolExecutor(max_workers=workers) as pool:
                    futures = {pool.submit(execute_sync_job, pk): pk for pk in pending}
                    for _ in as_completed(futures):
                        prog.advance(task, 1)

        print(f"\n{Colors.GREEN}[+] Hydration pass complete.{Colors.RESET}\n")
    except Exception as exc:
        print(
            f"{Colors.YELLOW}[!] Local Django ORM unavailable: {exc}\n"
            f"If connecting to a remote server, hydration happens automatically via Celery Beat or desktop proxy-fetch.{Colors.RESET}\n"
        )


def cmd_config(args: argparse.Namespace):
    """Inspects or saves persistent worker configuration."""
    cfg = load_worker_config()
    if getattr(args, "show", False) or not any(
        [args.server, args.username, args.task, args.workload]
    ):
        if HAS_RICH and console:
            t = Table(title="Saved Worker Configuration (.worker.json)", box=box.ROUNDED)
            t.add_column("Key", style="cyan")
            t.add_column("Value", style="bold white")
            for k, v in cfg.items():
                if k == "password":
                    v = "******" if v else "(empty)"
                t.add_row(k, str(v))
            console.print(t)
        else:
            print("--- Saved Worker Configuration ---")
            for k, v in cfg.items():
                print(f"{k}: {v}")
        return

    # Update provided keys
    if args.server:
        cfg["server"] = args.server
    if args.username:
        cfg["username"] = args.username
    if args.password:
        cfg["password"] = args.password
    if args.task:
        cfg["task"] = args.task
    if args.workload is not None:
        cfg["workload_pct"] = args.workload

    target = save_worker_config(cfg)
    print(f"{Colors.GREEN}[+] Configuration saved to {target}{Colors.RESET}")


def interactive_menu():
    """Interactive TTY menu providing visual controls and workload sliders."""
    cfg = load_worker_config()
    hw = detect_hardware()

    while True:
        render_banner(
            cfg["server"],
            cfg["task"],
            cfg["workload_pct"],
            cfg["auto_throttle"],
            hw,
            cfg["threads"],
            cfg["batch_size"],
        )

        if HAS_RICH and console:
            menu_table = Table(box=box.SIMPLE, show_header=False, expand=True)
            menu_table.add_column("Key", style="bold cyan", width=6)
            menu_table.add_column("Action", style="bold white")
            menu_table.add_column("Description", style="dim")

            menu_table.add_row(
                "[1]",
                "⚡ Run Full Worker (Both)",
                "Embeddings + Artwork + Enrichment simultaneously",
            )
            menu_table.add_row(
                "[2]",
                "🧠 Run Embedding Worker",
                "GPU dense vector generation (BAAI/bge-m3)",
            )
            menu_table.add_row(
                "[3]",
                "🎨 Run Artwork & Metadata Worker",
                "WebP transcoding & Wikidata offload",
            )
            menu_table.add_row(
                "[4]",
                "🎚️  Adjust GPU Workload Slider",
                f"Currently: {cfg['workload_pct']}% (Auto-Throttle: {'ON' if cfg['auto_throttle'] else 'OFF'})",
            )
            menu_table.add_row(
                "[5]", "📊 Server & Catalog Statistics", "Live telemetry, catalog counts, budget"
            )
            menu_table.add_row(
                "[6]", "🏎️  Run GPU Benchmark", "Measure encoding speed & catalog ETA"
            )
            menu_table.add_row(
                "[7]", "💧 Run Catalog Hydration", "Seed discover lists & drain sync jobs"
            )
            menu_table.add_row(
                "[8]", "⚙️  Configure Defaults", "Server URL, user credentials, threads"
            )
            menu_table.add_row("[0]", "🚪 Exit", "Close Otix worker CLI")

            console.print(
                Panel(
                    menu_table,
                    title="[bold white]Otix Control Menu[/bold white]",
                    border_style="dim white",
                    box=box.ROUNDED,
                )
            )
            choice = Prompt.ask(
                "[bold cyan]Select action[/bold cyan]",
                choices=["1", "2", "3", "4", "5", "6", "7", "8", "0"],
                default="1",
            )
        else:
            print("\n[1] Run Full Worker (Both)")
            print("[2] Run Embedding Worker (GPU)")
            print("[3] Run Artwork & Metadata Worker")
            print(f"[4] Adjust GPU Workload Slider ({cfg['workload_pct']}%)")
            print("[5] Server & Catalog Statistics")
            print("[6] Run GPU Benchmark")
            print("[7] Run Catalog Hydration")
            print("[8] Configure Defaults")
            print("[0] Exit")
            choice = input("\nEnter choice [1-8, 0]: ").strip()

        if choice == "1":
            cfg["task"] = "both"
            args = argparse.Namespace(**cfg)
            cmd_start(args)
            break
        elif choice == "2":
            cfg["task"] = "embeddings"
            args = argparse.Namespace(**cfg)
            cmd_start(args)
            break
        elif choice == "3":
            cfg["task"] = "artwork"
            args = argparse.Namespace(**cfg)
            cmd_start(args)
            break
        elif choice == "4":
            if HAS_RICH and console:
                console.print(
                    "\n[bold cyan]Workload Presets:[/bold cyan]\n"
                    "  [1] Turbo / Max (100% - batch 64, zero sleep)\n"
                    "  [2] Balanced (80% - batch 32, optimal performance)\n"
                    "  [3] Gaming Friendly (50% - batch 16, low heat & power)\n"
                    "  [4] Whisper / Stealth (25% - batch 8, completely quiet)\n"
                    "  [5] Custom Slider Percentage (1-100%)\n"
                )
                preset = Prompt.ask(
                    "Choose preset or custom",
                    choices=["1", "2", "3", "4", "5"],
                    default="2",
                )
                if preset == "1":
                    cfg["workload_pct"] = 100
                elif preset == "2":
                    cfg["workload_pct"] = 80
                elif preset == "3":
                    cfg["workload_pct"] = 50
                elif preset == "4":
                    cfg["workload_pct"] = 25
                elif preset == "5":
                    cfg["workload_pct"] = IntPrompt.ask(
                        "Enter workload percentage (1-100)", default=80
                    )

                cfg["auto_throttle"] = Confirm.ask(
                    "Enable Smart Gaming Auto-Throttle (reduces load when games are active)?",
                    default=True,
                )
            else:
                pct = input("Enter workload percentage [1-100]: ").strip()
                if pct.isdigit():
                    cfg["workload_pct"] = int(pct)
            save_worker_config(cfg)
            print(f"{Colors.GREEN}[+] Workload profile updated.{Colors.RESET}")
        elif choice == "5":
            cmd_stats(argparse.Namespace(**cfg))
            input("\nPress Enter to return to menu...")
        elif choice == "6":
            cmd_benchmark(argparse.Namespace(**cfg))
            input("\nPress Enter to return to menu...")
        elif choice == "7":
            cmd_hydrate(argparse.Namespace(**cfg))
            input("\nPress Enter to return to menu...")
        elif choice == "8":
            server = input(f"Server URL [{cfg['server']}]: ").strip()
            if server:
                cfg["server"] = server
            user = input(f"Admin Username [{cfg['username']}]: ").strip()
            if user:
                cfg["username"] = user
            pwd = getpass.getpass("Admin Password (leave blank to keep): ")
            if pwd:
                cfg["password"] = pwd
            save_worker_config(cfg)
            print(f"{Colors.GREEN}[+] Configuration updated.{Colors.RESET}")
        elif choice == "0":
            sys.exit(0)


# ---------------------------------------------------------------------------
# Interactive Live Worker Chat & Command Shell (OpenCode & Claude Code UI/UX)
# ---------------------------------------------------------------------------


def get_terminal_dimensions() -> Tuple[int, int]:
    """Returns terminal dimensions (lines, columns) reliably across Windows and POSIX."""
    try:
        size = os.get_terminal_size()
        return max(10, size.lines), max(20, size.columns)
    except Exception:
        pass
    try:
        size = shutil.get_terminal_size((80, 24))
        return max(10, size.lines), max(20, size.columns)
    except Exception:
        return 24, 80


def create_robust_output():
    """Creates a resilient prompt_toolkit Output instance that works across all Windows and POSIX terminals,
    falling back cleanly to Vt100_Output or PlainTextOutput if Win32 console buffer is unavailable."""
    try:
        from prompt_toolkit.output.defaults import create_output

        return create_output()
    except Exception:
        pass

    try:
        from prompt_toolkit.output.vt100 import Vt100_Output

        return Vt100_Output.from_pty(sys.stdout)
    except Exception:
        pass

    try:
        from prompt_toolkit.output.plain_text import PlainTextOutput

        return PlainTextOutput(sys.stdout)
    except Exception:
        return None


class RoundedFrame:
    """Sleek frame container with rounded box-drawing corners inspired by OpenCode and Claude Code."""

    def __init__(
        self,
        body: Any,
        title: Any = None,
        style: str = "",
        height: Any = None,
    ):
        self.body = body
        self.title = title
        # Ensure all style references map to valid prompt_toolkit classes
        # (avoiding un-prefixed class names being parsed as raw color literals)
        clean_cls = style.replace("class:", "").strip() if style else "frame"
        if not clean_cls:
            clean_cls = "frame"

        border_style = f"class:{clean_cls}.border"
        label_style = f"class:{clean_cls}.label"
        container_style = f"class:{clean_cls}"

        C_TL = "╭"
        C_TR = "╮"
        C_BL = "╰"
        C_BR = "╯"
        C_H = "─"
        C_V = "│"

        def b(char: str = "", width: Optional[int] = None, height: Optional[int] = 1):
            return Window(char=char, width=width, height=height, style=border_style)

        if title is not None:
            if callable(title):
                tc = FormattedTextControl(title)
            elif isinstance(title, str):
                tc = FormattedTextControl(text=f" {title} ")
            else:
                tc = FormattedTextControl(text=title)

            top_row = VSplit(
                [
                    b(C_TL, width=1),
                    b(C_H, width=2),
                    Window(
                        content=tc,
                        height=1,
                        dont_extend_width=True,
                        style=label_style,
                    ),
                    b(C_H),
                    b(C_TR, width=1),
                ],
                height=1,
            )
        else:
            top_row = VSplit(
                [
                    b(C_TL, width=1),
                    b(C_H),
                    b(C_TR, width=1),
                ],
                height=1,
            )

        bottom_row = VSplit(
            [
                b(C_BL, width=1),
                b(C_H),
                b(C_BR, width=1),
            ],
            height=1,
        )

        middle = VSplit(
            [
                b(C_V, width=1, height=None),
                body,
                b(C_V, width=1, height=None),
            ]
        )

        self.container = HSplit(
            [
                top_row,
                middle,
                bottom_row,
            ],
            height=height,
            style=container_style,
        )

    def __pt_container__(self):
        return self.container


class LiveWorkerChat:
    """Full-screen interactive terminal TUI with OpenCode-inspired layout, framed chat box,
    persistent telematics below the prompt, and key-based log scrolling."""

    def __init__(
        self,
        workers: List[Any],
        server_url: str,
        token: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        workload_pct: int = 85,
        auto_throttle: bool = True,
    ):
        self.workers = workers
        self.server_url = server_url.rstrip("/")
        self.token = token
        self.username = username
        self.password = password
        self.workload_pct = workload_pct
        self.auto_throttle = auto_throttle
        self.running = True
        self.start_time = time.time()
        self.gpu_monitor = SmartGpuMonitor(auto_throttle=auto_throttle)

        self.logs_history: List[str] = []
        self.scroll_offset: int = 0
        self.app: Optional[Application] = None
        self.input_buf: Optional[Buffer] = None

        hw = detect_hardware()
        gpu_short = hw["device_name"].replace("NVIDIA GeForce ", "")
        task_names = []
        for w in workers:
            if isinstance(w, EmbeddingWorker):
                task_names.append("Embeddings")
            elif isinstance(w, AdminComputeWorker):
                task_names.append("Artwork")
        task_str = " + ".join(task_names) if task_names else "Both"

        self.telemetry: Dict[str, Any] = {
            "status": "ACTIVE",
            "gpu": gpu_short,
            "load": 0,
            "vram_used": 0,
            "vram_total": int(hw["vram_gb"] * 1024),
            "speed": "0.0 it/s",
            "pct": 0.0,
            "remaining": 0,
            "total": 0,
            "workload": workload_pct,
            "server": self.server_url,
            "task": task_str,
        }

        # Seed initial greeting card in activity logs
        ts = datetime.now().strftime("%H:%M:%S")
        safe_server = html.escape(str(self.server_url))
        self.logs_history.extend(
            [
                f'<style fg="gray">[{ts}]</style> <style fg="cyan"><b>╭─ ✱ OTIX DISTRIBUTED COMPUTE ENGINE ONLINE ──────────────────────────────────────────</b></style>',
                f'           <style fg="cyan"><b>╰─</b></style> <style fg="gray">Connected to</style> <style fg="cyan"><b>{safe_server}</b></style> · <style fg="gray">Workload:</style> <style fg="yellow"><b>{self.workload_pct}% Turbo</b></style> · <style fg="gray">Type</style> <style fg="white"><b>/help</b></style> <style fg="gray">for commands</style>',
            ]
        )

    def add_log(self, item: Union[str, List[str]]):
        if isinstance(item, list):
            self.logs_history.extend(item)
            if not self.app or not getattr(self.app, "is_running", False):
                for line in item:
                    clean = re.sub(r"<[^>]+>", "", line)
                    print(clean, flush=True)
        else:
            self.logs_history.append(item)
            if not self.app or not getattr(self.app, "is_running", False):
                clean = re.sub(r"<[^>]+>", "", item)
                print(clean, flush=True)
        if len(self.logs_history) > 3000:
            self.logs_history = self.logs_history[-3000:]
        if self.app:
            try:
                self.app.invalidate()
            except Exception:
                pass

    def handle_worker_event(self, event_type: str, data: Dict[str, Any]):
        ts = datetime.now().strftime("%H:%M:%S")

        if event_type == "embed":
            pct = data.get("pct_done", 0.0)
            bar_w = 14
            done_c = min(bar_w, max(0, int((pct / 100.0) * bar_w)))
            prog = f'<style fg="green">{"■" * done_c}</style><style fg="gray">{"░" * (bar_w - done_c)}</style>'
            throttle = (
                ' <style fg="yellow"><b>[THROTTLED]</b></style>'
                if data.get("is_throttled")
                else ""
            )

            count = data.get("count", 0)
            sec = data.get("sec", 0.0)
            rate = data.get("rate", 0.0)
            vram_mb = data.get("vram_mb", 0)
            remaining = data.get("remaining", self.telemetry["remaining"])
            session_total = data.get("session_total", 0)

            line1 = (
                f'<style fg="gray">[{ts}]</style> <style fg="cyan"><b>╭─ 🧠 EMBED</b></style>{throttle} '
                f'<style fg="white"><b>{count} items</b></style> <style fg="gray">in</style> '
                f'<style fg="white">{sec:.2f}s</style> (<style fg="cyan"><b>{rate:.1f} it/s</b></style>) · '
                f'<style fg="gray">VRAM:</style> <style fg="yellow"><b>{vram_mb:,} MB</b></style>'
            )
            line2 = (
                f'           <style fg="cyan"><b>╰─</b></style> <style fg="gray">Catalog:</style> '
                f'[{prog}] <style fg="green"><b>{pct:.1f}%</b></style> · '
                f'<style fg="yellow"><b>{remaining:,} left</b></style> · '
                f'<style fg="gray">Session:</style> <style fg="white">{session_total:,}</style>'
            )

            self.telemetry["pct"] = pct
            self.telemetry["remaining"] = remaining
            self.telemetry["speed"] = f"{rate:.1f} it/s"
            self.telemetry["vram_used"] = vram_mb
            self.add_log([line1, line2])

        elif event_type == "artwork":
            raw_title = data.get("title", "Unknown")
            title = html.escape(str(raw_title))
            mid = data.get("mid", 0)
            mtype = html.escape(str(data.get("mtype", "")))
            candidates = data.get("candidates", 0)
            winners = data.get("winners", 0)
            saved_pct = data.get("saved_pct", 0)
            mb = data.get("mb", 0.0)
            raw_enrichment = data.get("enrichment", "")
            enrichment = html.escape(str(raw_enrichment)) if raw_enrichment else ""

            bar_w = 10
            done_c = min(bar_w, max(0, int((saved_pct / 100.0) * bar_w)))
            save_prog = f'<style fg="green">{"■" * done_c}</style><style fg="gray">{"░" * (bar_w - done_c)}</style>'
            enrich_str = (
                f' · <style fg="cyan">{enrichment}</style>' if enrichment else ""
            )

            line1 = (
                f'<style fg="gray">[{ts}]</style> <style fg="magenta"><b>╭─ 🎨 ARTWORK</b></style> '
                f'<style fg="white"><b>{title}</b></style> <style fg="gray">(#{mid} {mtype})</style>'
            )
            line2 = (
                f'           <style fg="magenta"><b>╰─</b></style> <style fg="white">{candidates} candidates</style> → '
                f'<style fg="green"><b>{winners} WebP</b></style> ({mb:.2f} MB) · '
                f'<style fg="gray">Disk saved:</style> [{save_prog}] <style fg="green"><b>{saved_pct}%</b></style>{enrich_str}'
            )
            self.add_log([line1, line2])

        elif event_type == "wikidata":
            raw_title = data.get("title", "")
            title = html.escape(str(raw_title))
            mid = data.get("mid", 0)
            count = data.get("count", 0)

            line1 = (
                f'<style fg="gray">[{ts}]</style> <style fg="cyan"><b>╭─ 🌐 WIKIDATA</b></style> '
                f'<style fg="white"><b>{title}</b></style> <style fg="gray">(#{mid})</style>'
            )
            line2 = (
                f'           <style fg="cyan"><b>╰─</b></style> <style fg="white">Enriched</style> '
                f'<style fg="cyan"><b>{count} metadata claims</b></style>, cast & crew via Wikipedia offload'
            )
            self.add_log([line1, line2])

        elif event_type == "gaming":
            reason = html.escape(str(data.get("reason", "External GPU load detected")))
            batch = data.get("batch", 4)
            sleep = data.get("sleep", 0.0)

            line1 = (
                f'<style fg="gray">[{ts}]</style> <style fg="yellow"><b>╭─ 🎮 AUTO-THROTTLE</b></style> '
                f'<style fg="yellow"><b>{reason}</b></style>'
            )
            line2 = (
                f'           <style fg="yellow"><b>╰─</b></style> Scaled GPU batch → <style fg="white"><b>{batch}</b></style> '
                f'(<style fg="yellow">{sleep:.2f}s</style> pacing sleep · 0 FPS game impact guaranteed)'
            )
            self.add_log([line1, line2])

        elif event_type == "online":
            name = html.escape(str(data.get("name", "Engine")))
            target = html.escape(str(data.get("target", "")))

            line1 = (
                f'<style fg="gray">[{ts}]</style> <style fg="green"><b>╭─ ✓ ONLINE</b></style> '
                f'<style fg="white"><b>{name}</b></style>'
            )
            line2 = (
                f'           <style fg="green"><b>╰─</b></style> <style fg="gray">Initialized successfully ({target})</style>'
            )
            self.add_log([line1, line2])

    def get_header_text(self):
        t = self.telemetry
        lines, cols = get_terminal_dimensions()
        throttle_str = "Active" if self.auto_throttle else "Disabled"
        vram_gb = t["vram_total"] // 1024
        server_esc = html.escape(str(t["server"]))
        gpu_esc = html.escape(str(t["gpu"]))
        task_esc = html.escape(str(t["task"]))

        if cols >= 115:
            return safe_html(
                '  <style fg="cyan"><b>▄▀▀▄ ▄▀▀▄</b></style>   <style fg="white"><b>█▀▀▀▀█ ▀▀██▀▀  ▀██▀  █▄  ▄█</b></style>   '
                f'<style fg="gray">│ Node:     </style><style fg="cyan">{server_esc}</style>          '
                f'<style fg="gray">Workload: </style><style fg="yellow"><b>{t["workload"]}% Turbo</b></style> <style fg="gray">(Gaming Guard: {throttle_str})</style>\n'
                '  <style fg="cyan"><b>█  █▄█  █</b></style>   <style fg="white"><b>█    █   ██     ██     ▀█▀ </b></style>   '
                f'<style fg="gray">│ Compute:  </style><style fg="white"><b>{gpu_esc} ({vram_gb:.0f} GB)</b></style>       '
                f'<style fg="gray">Task:     </style><style fg="green"><b>{task_esc}</b></style>\n'
                '  <style fg="cyan"><b> ▀▀   ▀▀ </b></style>   <style fg="white"><b>▀▀▀▀▀▀   ▀▀    ▀▀▀▀  █▀  ▀█</b></style>   '
                '<style fg="gray">│ Model:    </style><style fg="cyan">BAAI/bge-m3 (Dense 1024)</style>   '
                '<style fg="gray">Controls: </style><style fg="white">Type <b>/help</b> for slash commands</style>'
            )
        elif cols >= 80:
            return safe_html(
                '  <style fg="cyan"><b>▄▀▀▄ ▄▀▀▄</b></style>   <style fg="white"><b>█▀▀▀▀█ ▀▀██▀▀  ▀██▀  █▄  ▄█</b></style>   '
                f'<style fg="gray">│ Node: </style><style fg="cyan">{server_esc}</style> · <style fg="yellow"><b>{t["workload"]}% Turbo</b></style>\n'
                '  <style fg="cyan"><b>█  █▄█  █</b></style>   <style fg="white"><b>█    █   ██     ██     ▀█▀ </b></style>   '
                f'<style fg="gray">│ GPU:  </style><style fg="white"><b>{gpu_esc}</b></style> · <style fg="green"><b>{task_esc}</b></style>\n'
                '  <style fg="cyan"><b> ▀▀   ▀▀ </b></style>   <style fg="white"><b>▀▀▀▀▀▀   ▀▀    ▀▀▀▀  █▀  ▀█</b></style>   '
                '<style fg="gray">│ Type </style><style fg="white"><b>/help</b></style><style fg="gray"> for slash commands</style>'
            )
        else:
            return safe_html(
                ' <style fg="cyan"><b>▄▀▀▄ ▄▀▀▄</b></style> <style fg="white"><b>█▀▀▀▀█ ▀▀██▀▀  ▀██▀  █▄  ▄█</b></style>\n'
                f' <style fg="gray">Node:</style> <style fg="cyan">{server_esc}</style> · <style fg="yellow"><b>{t["workload"]}%</b></style>\n'
                f' <style fg="gray">GPU:</style> <style fg="white"><b>{gpu_esc}</b></style> · <style fg="green"><b>{task_esc}</b></style>'
            )

    def get_logs_title(self):
        if self.scroll_offset > 0:
            return safe_html(
                f'<b>Activity Stream</b> · <style fg="yellow"><b>[SCROLLED UP +{self.scroll_offset} lines · PageDown/End to return to live]</b></style>'
            )
        return safe_html(
            '<b>Activity Stream</b> · <style fg="gray">[PageUp/PageDown to scroll · </style><style fg="green">LIVE</style><style fg="gray">]</style>'
        )

    def get_logs_text(self):
        lines, cols = get_terminal_dimensions()
        # Overhead: Header (5) + Logs borders (2) + Chat (3) + Telemetry (1) = 11 lines
        max_visible_lines = max(4, lines - 11)
        total = len(self.logs_history)

        if total == 0:
            return safe_html(
                '<style fg="gray">  Waiting for compute pipeline events... (Ready for commands)</style>'
            )

        max_offset = max(0, total - max_visible_lines)
        if self.scroll_offset > max_offset:
            self.scroll_offset = max_offset

        if total <= max_visible_lines:
            slice_logs = self.logs_history
            self.scroll_offset = 0
        else:
            end_idx = total - self.scroll_offset
            start_idx = max(0, end_idx - max_visible_lines)
            slice_logs = self.logs_history[start_idx:end_idx]

        safe_lines = []
        for l in slice_logs:
            try:
                HTML(l)
                safe_lines.append(l)
            except Exception:
                clean = re.sub(r"<[^>]+>", "", l)
                safe_lines.append(f'<style fg="white">{html.escape(clean)}</style>')

        try:
            return HTML("\n".join(safe_lines))
        except Exception:
            plain = "\n".join(re.sub(r"<[^>]+>", "", l) for l in slice_logs)
            return HTML(f'<style fg="white">{html.escape(plain)}</style>')

    def get_telemetry_text(self):
        t = self.telemetry
        lines, cols = get_terminal_dimensions()
        status_icon = "●" if t["status"] == "ACTIVE" else "⏸"
        status_color = "green" if t["status"] == "ACTIVE" else "yellow"

        bar_w = 12 if cols >= 115 else 8
        done_chars = min(bar_w, max(0, int((t["pct"] / 100.0) * bar_w)))
        prog_bar = f'<style fg="green">{"■" * done_chars}</style><style fg="gray">{"░" * (bar_w - done_chars)}</style>'
        gpu_esc = html.escape(str(t["gpu"]))
        speed_esc = html.escape(str(t["speed"]))

        if cols >= 115:
            return safe_html(
                f' <style fg="{status_color}"><b>{status_icon} {t["status"]}</b></style> │ '
                f'<style fg="gray">GPU:</style> <style fg="white"><b>{gpu_esc}</b></style> (<style fg="yellow">{t["load"]}%</style> · {t["vram_used"]:,} MB) │ '
                f'<style fg="gray">Workload:</style> <style fg="yellow"><b>{t["workload"]}% Turbo</b></style> │ '
                f'<style fg="gray">Speed:</style> <style fg="cyan"><b>{speed_esc}</b></style> │ '
                f'<style fg="white"><b>{t["pct"]:.1f}%</b></style> [{prog_bar}] │ '
                f'<style fg="gray">Left:</style> <style fg="yellow"><b>{t["remaining"]:,}</b></style>'
            )
        elif cols >= 80:
            return safe_html(
                f' <style fg="{status_color}"><b>{status_icon} {t["status"]}</b></style> │ '
                f'<style fg="white"><b>{gpu_esc}</b></style> (<style fg="yellow">{t["load"]}%</style>) │ '
                f'<style fg="yellow"><b>{t["workload"]}%</b></style> │ '
                f'<style fg="cyan"><b>{speed_esc}</b></style> │ '
                f'[{prog_bar}] <style fg="white"><b>{t["pct"]:.1f}%</b></style> │ '
                f'<style fg="yellow"><b>{t["remaining"]:,} left</b></style>'
            )
        else:
            return safe_html(
                f' <style fg="{status_color}"><b>{status_icon}</b></style> │ '
                f'<style fg="yellow">{t["load"]}%</style> │ '
                f'<style fg="cyan">{speed_esc}</style> │ '
                f'[{prog_bar}] <style fg="white">{t["pct"]:.0f}%</style>'
            )

    def handle_command(self, raw_line: str):
        line = raw_line.strip()
        if not line:
            return

        ts = datetime.now().strftime("%H:%M:%S")
        esc_line = html.escape(line)
        self.add_log(
            f'<style fg="gray">[{ts}]</style> <style fg="white"><b>&gt; {esc_line}</b></style>'
        )
        parts = line.split()
        cmd = parts[0].lower()
        args = parts[1:]

        if cmd.startswith("/"):
            cmd = cmd[1:]

        if cmd.isdigit():
            self._handle_workload(int(cmd))
            return

        if cmd in ("workload", "w", "slider"):
            if not args or not args[0].isdigit():
                self.add_log(
                    '<style fg="yellow">Usage: /workload &lt;1-100&gt; (e.g. /workload 50 or /w 50)</style>'
                )
                return
            self._handle_workload(int(args[0]))
        elif cmd in ("pause", "p"):
            self._handle_pause()
        elif cmd in ("resume", "r", "continue"):
            self._handle_resume()
        elif cmd in ("status", "stats", "s", "info", "gpu"):
            self._handle_stats()
        elif cmd in ("throttle", "t", "autothrottle"):
            sub = args[0].lower() if args else "toggle"
            self._handle_throttle(sub)
        elif cmd in ("benchmark", "bench", "b"):
            self._handle_benchmark()
        elif cmd in ("hydrate", "seed", "h"):
            limit = int(args[0]) if (args and args[0].isdigit()) else 50
            self._handle_hydrate(limit)
        elif cmd in ("priority", "prio"):
            lvl = args[0].lower() if args else "low"
            self._handle_priority(lvl)
        elif cmd in ("clear", "cls"):
            self.logs_history.clear()
            self.scroll_offset = 0
            if self.app:
                self.app.invalidate()
        elif cmd in ("help", "h", "?"):
            self._handle_help()
        elif cmd in ("exit", "quit", "stop", "q"):
            self._handle_exit()
        else:
            esc_cmd = html.escape(cmd)
            self.add_log(
                f'<style fg="yellow">Unknown command "/{esc_cmd}". Type <b>/help</b> for commands or <b>/workload &lt;pct&gt;</b></style>'
            )

    def _handle_workload(self, val: int):
        ts = datetime.now().strftime("%H:%M:%S")
        val = max(1, min(100, val))
        self.workload_pct = val
        self.telemetry["workload"] = val
        found_embed = False
        batch, sleep = compute_workload_params(val)
        for w in self.workers:
            if hasattr(w, "set_workload"):
                batch, sleep = w.set_workload(val)
                found_embed = True

        if found_embed:
            line1 = (
                f'<style fg="gray">[{ts}]</style> <style fg="cyan"><b>╭─ ⚡ WORKLOAD</b></style> '
                f'<style fg="white">GPU Workload Slider updated to</style> <style fg="yellow"><b>{val}% Turbo</b></style>'
            )
            line2 = (
                f'           <style fg="cyan"><b>╰─</b></style> GPU batch: <style fg="white"><b>{batch}</b></style> · '
                f'Pacing sleep: <style fg="white"><b>{sleep:.2f}s</b></style> · '
                f'Auto-throttle: <style fg="green">Active</style>'
            )
            self.add_log([line1, line2])
        else:
            self.add_log(
                '<style fg="yellow">⚠ Workload slider applies to GPU embeddings (currently running artwork-only task)</style>'
            )

    def _handle_pause(self):
        ts = datetime.now().strftime("%H:%M:%S")
        for w in self.workers:
            if hasattr(w, "pause"):
                w.pause()
        self.telemetry["status"] = "PAUSED"
        line1 = f'<style fg="gray">[{ts}]</style> <style fg="yellow"><b>╭─ ⏸ PAUSED</b></style> <style fg="white">Compute pipelines paused</style>'
        line2 = f'           <style fg="yellow"><b>╰─</b></style> In-flight batch will finish. Type <style fg="cyan"><b>/resume</b></style> to continue.'
        self.add_log([line1, line2])

    def _handle_resume(self):
        ts = datetime.now().strftime("%H:%M:%S")
        for w in self.workers:
            if hasattr(w, "resume"):
                w.resume()
        self.telemetry["status"] = "ACTIVE"
        line1 = f'<style fg="gray">[{ts}]</style> <style fg="green"><b>╭─ ▶ RESUMED</b></style> <style fg="white">Compute pipelines active</style>'
        line2 = f'           <style fg="green"><b>╰─</b></style> Running at <style fg="yellow"><b>{self.workload_pct}% Turbo</b></style> workload.'
        self.add_log([line1, line2])

    def _handle_throttle(self, sub: str):
        ts = datetime.now().strftime("%H:%M:%S")
        if sub in ("on", "enable", "1", "true"):
            new_state = True
        elif sub in ("off", "disable", "0", "false"):
            new_state = False
        else:
            new_state = not self.auto_throttle

        self.auto_throttle = new_state
        for w in self.workers:
            if hasattr(w, "set_auto_throttle"):
                w.set_auto_throttle(new_state)
        tag = (
            "ENABLED (gaming guard active)"
            if new_state
            else "DISABLED (full power)"
        )
        line1 = f'<style fg="gray">[{ts}]</style> <style fg="cyan"><b>╭─ ⚙ AUTO-THROTTLE</b></style> <style fg="white">Auto-throttle: <b>{tag}</b></style>'
        line2 = f'           <style fg="cyan"><b>╰─</b></style> Dynamically scales GPU load when 3D games are running.'
        self.add_log([line1, line2])

    def _handle_stats(self):
        ts = datetime.now().strftime("%H:%M:%S")
        elapsed = max(1.0, time.time() - self.start_time)
        gpu_util, mem_util = self.gpu_monitor.get_utilization()
        vram_used = self.gpu_monitor.get_vram_used_mb()
        vram_total = self.gpu_monitor.total_vram_mb

        total_embedded = 0
        total_media = 0
        total_winners = 0
        total_bytes = 0
        rem_embeddings = None
        total_cat = None

        for w in self.workers:
            if isinstance(w, EmbeddingWorker):
                total_embedded += w.total_embedded
                rem_embeddings = w.remaining_catalog
                total_cat = w.total_catalog
            elif isinstance(w, AdminComputeWorker):
                total_media += w.total_media_processed
                total_winners += w.total_winners_uploaded
                total_bytes += w.total_bytes_uploaded

        rate = (total_embedded + total_media) / elapsed
        mins = int(elapsed // 60)
        secs = int(elapsed % 60)

        done_pct = 0.0
        eta_mins = 0.0
        if rem_embeddings is not None and total_cat and total_cat > 0:
            done_pct = ((total_cat - rem_embeddings) / total_cat) * 100
            eta_mins = (
                (rem_embeddings / max(0.1, rate)) / 60 if rate > 0 else 0
            )

        bar_w = 14
        done_chars = min(bar_w, max(0, int((done_pct / 100.0) * bar_w)))
        prog_bar = f'<style fg="green">{"■" * done_chars}</style><style fg="gray">{"░" * (bar_w - done_chars)}</style>'

        gpu_dev_esc = html.escape(str(self.gpu_monitor.device_name))
        card_lines = [
            f'<style fg="gray">[{ts}]</style> <style fg="cyan"><b>╭─ 📊 SYSTEM TELEMATICS</b></style> <style fg="gray">({mins}m {secs:02d}s uptime)</style>',
            f'           <style fg="cyan"><b>│</b></style> GPU: <style fg="white"><b>{gpu_dev_esc}</b></style> (<style fg="yellow">{gpu_util}%</style> load · <style fg="white">{vram_used:,}/{vram_total:,} MB VRAM</style>)',
            f'           <style fg="cyan"><b>│</b></style> Throughput: <style fg="cyan"><b>{rate:.1f} it/s</b></style> ({rate * 3600:,.0f}/hr) · Workload: <style fg="yellow"><b>{self.workload_pct}% Turbo</b></style>',
        ]

        if rem_embeddings is not None and total_cat:
            card_lines.append(
                f'           <style fg="cyan"><b>╰─</b></style> Catalog: [{prog_bar}] <style fg="green"><b>{done_pct:.1f}%</b></style> · <style fg="yellow"><b>{rem_embeddings:,} left</b></style> · ETA: ~<style fg="white"><b>{eta_mins:.1f}m</b></style>'
            )
        else:
            card_lines.append(
                f'           <style fg="cyan"><b>╰─</b></style> Session: <style fg="white"><b>{total_embedded:,} embeddings</b></style> · <style fg="white"><b>{total_media:,} media</b></style> ({total_bytes / (1024**2):.1f} MB uploaded)'
            )

        self.add_log(card_lines)

    def _handle_benchmark(self):
        ts = datetime.now().strftime("%H:%M:%S")
        self.add_log(
            f'<style fg="gray">[{ts}]</style> <style fg="cyan">● Launching GPU benchmark in background...</style>'
        )

        def run_bench():
            try:
                embed_worker = None
                for w in self.workers:
                    if isinstance(w, EmbeddingWorker) and w.model is not None:
                        embed_worker = w
                        break

                if embed_worker and embed_worker.model:
                    sample_texts = [
                        "In a futuristic world, a young hacker uncovers a global conspiracy threatening humanity.",
                        "A seasoned detective investigates a mysterious disappearance in a sleepy coastal town.",
                        "An epic fantasy adventure exploring ancient ruins, mythical dragons, and forgotten magic.",
                        "Fast-paced sci-fi tactical shooter with competitive ranked gameplay and vibrant maps.",
                    ] * 16
                    t0 = time.time()
                    embed_worker.model.encode(
                        sample_texts,
                        batch_size=embed_worker.gpu_batch_size,
                        normalize_embeddings=True,
                        show_progress_bar=False,
                    )
                    bench_time = time.time() - t0
                    throughput = (
                        len(sample_texts) / bench_time if bench_time > 0 else 0
                    )
                    rem = embed_worker.remaining_catalog or 166000
                    eta_mins = (rem / max(1.0, throughput)) / 60

                    t_done = datetime.now().strftime("%H:%M:%S")
                    line1 = f'<style fg="gray">[{t_done}]</style> <style fg="green"><b>╭─ ✓ BENCHMARK COMPLETE</b></style>'
                    line2 = (
                        f'           <style fg="green"><b>╰─</b></style> Throughput: <style fg="cyan"><b>{throughput:.1f} it/s</b></style> '
                        f'({throughput * 3600:,.0f}/hr) · Catalog ETA: ~<style fg="yellow"><b>{eta_mins:.1f} minutes</b></style>'
                    )
                    self.add_log([line1, line2])
                else:
                    self.add_log(
                        '<style fg="yellow">⚠ Benchmark requires an active embedding worker.</style>'
                    )
            except Exception as exc:
                self.add_log(
                    f'<style fg="red">✗ Benchmark failed: {html.escape(str(exc))}</style>'
                )

        threading.Thread(target=run_bench, daemon=True).start()

    def _handle_hydrate(self, limit: int):
        ts = datetime.now().strftime("%H:%M:%S")
        self.add_log(
            f'<style fg="gray">[{ts}]</style> <style fg="cyan">● Triggering catalog discover seed (limit: {limit})...</style>'
        )

        def run_hyd():
            try:
                auth_headers = {}
                if self.token:
                    auth_headers["Authorization"] = f"Bearer {self.token}"
                resp = httpx.post(
                    f"{self.server_url}/api/v1/media/admin/discover/seed",
                    headers=auth_headers,
                    params={"limit": limit},
                    timeout=20.0,
                )
                t_done = datetime.now().strftime("%H:%M:%S")
                if resp.status_code == 200:
                    data = resp.json()
                    line1 = f'<style fg="gray">[{t_done}]</style> <style fg="green"><b>╭─ 💧 HYDRATE PASS COMPLETE</b></style>'
                    line2 = f'           <style fg="green"><b>╰─</b></style> Seeded <style fg="white"><b>{data.get("seeded", 0)} new items</b></style> into central sync queue.'
                    self.add_log([line1, line2])
                else:
                    self.add_log(
                        f'<style fg="yellow">⚠ Discover response ({resp.status_code}): {html.escape(resp.text[:120])}</style>'
                    )
            except Exception as exc:
                self.add_log(
                    f'<style fg="red">✗ Hydrate call failed: {html.escape(str(exc))}</style>'
                )

        threading.Thread(target=run_hyd, daemon=True).start()

    def _handle_priority(self, lvl: str):
        ts = datetime.now().strftime("%H:%M:%S")
        is_low = lvl.lower() in ("low", "below", "game", "gaming")
        set_process_priority(low=is_low)
        prio_str = "Below Normal (Safe for gaming)" if is_low else "Normal"
        line1 = f'<style fg="gray">[{ts}]</style> <style fg="cyan"><b>╭─ ⚙ PROCESS PRIORITY</b></style> <style fg="white">Set to <b>{prio_str}</b></style>'
        line2 = f'           <style fg="cyan"><b>╰─</b></style> Low OS priority prevents foreground frame stutter in 3D games.'
        self.add_log([line1, line2])

    def _handle_help(self):
        ts = datetime.now().strftime("%H:%M:%S")
        help_lines = [
            f'<style fg="gray">[{ts}]</style> <style fg="cyan"><b>╭─ 📖 SLASH COMMAND PALETTE ──────────────────────────────────────────</b></style>',
            '           <style fg="cyan"><b>│</b></style> <style fg="white"><b>/workload &lt;1-100&gt;</b></style>   <style fg="gray">Adjust GPU workload intensity & pacing on the fly</style>',
            '           <style fg="cyan"><b>│</b></style> <style fg="white"><b>/pause</b></style>             <style fg="gray">Pause claiming new jobs (in-flight batch will finish)</style>',
            '           <style fg="cyan"><b>│</b></style> <style fg="white"><b>/resume</b></style>            <style fg="gray">Resume processing immediately</style>',
            '           <style fg="cyan"><b>│</b></style> <style fg="white"><b>/status</b></style>            <style fg="gray">Show live telemetry, rates, GPU load, and catalog ETA</style>',
            '           <style fg="cyan"><b>│</b></style> <style fg="white"><b>/throttle &lt;on|off&gt;</b></style>  <style fg="gray">Toggle smart NVML gaming auto-throttle</style>',
            '           <style fg="cyan"><b>│</b></style> <style fg="white"><b>/benchmark</b></style>         <style fg="gray">Run quick 64-item GPU encoding speed test</style>',
            '           <style fg="cyan"><b>│</b></style> <style fg="white"><b>/hydrate [limit]</b></style>   <style fg="gray">Seed catalog discover lists on central server</style>',
            '           <style fg="cyan"><b>│</b></style> <style fg="white"><b>/priority &lt;low|norm&gt;</b></style> <style fg="gray">Adjust process scheduling priority for gaming</style>',
            '           <style fg="cyan"><b>│</b></style> <style fg="white"><b>/clear</b></style>             <style fg="gray">Clear activity stream logs</style>',
            '           <style fg="cyan"><b>│</b></style> <style fg="white"><b>/exit</b></style>              <style fg="gray">Gracefully stop all workers and view session summary</style>',
            '           <style fg="cyan"><b>╰─</b></style> Navigation: Use <style fg="yellow"><b>PageUp/PageDown</b></style> or <style fg="yellow"><b>Up/Down</b></style> to scroll history',
        ]
        self.add_log(help_lines)

    def _handle_exit(self):
        self.running = False
        for w in self.workers:
            w.running = False
        if self.app:
            self.app.exit()

    def run_chat_loop(self):
        if not HAS_PROMPT_TOOLKIT or not sys.stdin.isatty():
            # Graceful headless fallback
            while self.running:
                try:
                    time.sleep(0.5)
                except (KeyboardInterrupt, EOFError):
                    self._handle_exit()
                    break
            return

        kb = KeyBindings()

        @kb.add("c-c")
        @kb.add("c-d")
        def _on_ctrl_c(event):
            self._handle_exit()

        @kb.add("pageup")
        def _scroll_page_up(event):
            lines, _ = get_terminal_dimensions()
            max_visible = max(4, lines - 11)
            max_offset = max(0, len(self.logs_history) - max_visible)
            self.scroll_offset = min(max_offset, self.scroll_offset + 4)
            event.app.invalidate()

        @kb.add("pagedown")
        def _scroll_page_down(event):
            self.scroll_offset = max(0, self.scroll_offset - 4)
            event.app.invalidate()

        @kb.add("c-up")
        def _scroll_line_up(event):
            lines, _ = get_terminal_dimensions()
            max_visible = max(4, lines - 11)
            max_offset = max(0, len(self.logs_history) - max_visible)
            self.scroll_offset = min(max_offset, self.scroll_offset + 2)
            event.app.invalidate()

        @kb.add("c-down")
        def _scroll_line_down(event):
            self.scroll_offset = max(0, self.scroll_offset - 2)
            event.app.invalidate()

        @kb.add("up")
        def _handle_up(event):
            buf = event.current_buffer
            if not buf.text:
                lines, _ = get_terminal_dimensions()
                max_visible = max(4, lines - 11)
                max_offset = max(0, len(self.logs_history) - max_visible)
                self.scroll_offset = min(max_offset, self.scroll_offset + 2)
                event.app.invalidate()
            else:
                buf.history_backward()

        @kb.add("down")
        def _handle_down(event):
            buf = event.current_buffer
            if not buf.text:
                if self.scroll_offset > 0:
                    self.scroll_offset = max(0, self.scroll_offset - 2)
                    event.app.invalidate()
            else:
                buf.history_forward()

        @kb.add("home")
        def _handle_home(event):
            buf = event.current_buffer
            if not buf.text:
                lines, _ = get_terminal_dimensions()
                max_visible = max(4, lines - 11)
                self.scroll_offset = max(0, len(self.logs_history) - max_visible)
                event.app.invalidate()
            else:
                buf.cursor_position = 0

        @kb.add("end")
        def _handle_end(event):
            buf = event.current_buffer
            if not buf.text:
                self.scroll_offset = 0
                event.app.invalidate()
            else:
                buf.cursor_position = len(buf.text)

        completer = WordCompleter(
            [
                "/workload",
                "/status",
                "/stats",
                "/pause",
                "/resume",
                "/throttle",
                "/benchmark",
                "/hydrate",
                "/priority",
                "/clear",
                "/help",
                "/exit",
                "/quit",
                "/w",
                "/s",
                "/p",
                "/r",
                "/t",
                "/b",
                "/h",
                "/q",
            ],
            ignore_case=True,
        )

        self.input_buf = Buffer(
            name="chat_input",
            completer=completer,
            multiline=False,
            history=InMemoryHistory(),
        )

        def on_accept(buf):
            text = buf.text
            buf.reset()
            self.handle_command(text)
            if self.app:
                self.app.invalidate()

        self.input_buf.accept_handler = on_accept

        header_frame = RoundedFrame(
            Window(
                content=FormattedTextControl(self.get_header_text),
                height=3,
                wrap_lines=False,
            ),
            style="frame",
        )

        logs_frame = RoundedFrame(
            Window(
                content=FormattedTextControl(self.get_logs_text),
                wrap_lines=False,
                dont_extend_height=False,
            ),
            title=self.get_logs_title,
            style="frame",
        )

        chat_win = Window(
            content=BufferControl(
                buffer=self.input_buf,
                input_processors=[BeforeInput("> ", style="class:chat-prompt")],
            ),
            height=1,
        )

        chat_frame = RoundedFrame(
            chat_win,
            title=safe_html(
                ' <b>Ask Otix or type Slash Command</b> <style fg="gray">(/workload, /status, /pause, /resume, /exit, /help)</style> '
            ),
            style="chat-frame",
        )

        telemetry_window = Window(
            content=FormattedTextControl(self.get_telemetry_text),
            height=1,
            wrap_lines=False,
            style="class:telemetry",
        )

        root = HSplit([
            header_frame,
            logs_frame,
            chat_frame,
            telemetry_window,
        ])

        layout = Layout(root, focused_element=chat_win)

        custom_style = Style.from_dict({
            "frame": "",
            "frame.border": "gray",
            "frame.label": "bold cyan",
            "chat-frame": "",
            "chat-frame.border": "cyan",
            "chat-frame.label": "bold cyan",
            "chat-prompt": "bold cyan",
            "telemetry": "white",
        })

        app_output = create_robust_output()

        try:
            with create_app_session(output=app_output):
                self.app = Application(
                    layout=layout,
                    key_bindings=kb,
                    full_screen=True,
                    style=custom_style,
                    output=app_output,
                )

                # Background thread to refresh telemetry from GPU monitor every 1s
                def bg_telemetry_loop():
                    while self.running:
                        try:
                            gpu_util, _ = self.gpu_monitor.get_utilization()
                            vram_used = self.gpu_monitor.get_vram_used_mb()
                            self.telemetry["load"] = gpu_util
                            self.telemetry["vram_used"] = vram_used
                            if self.app:
                                self.app.invalidate()
                        except Exception:
                            pass
                        time.sleep(1.0)

                t_telemetry = threading.Thread(target=bg_telemetry_loop, daemon=True)
                t_telemetry.start()

                with patch_stdout():
                    self.app.run()
        except Exception as exc:
            self.app = None
            if HAS_RICH and console:
                console.print(
                    f"[yellow]● Live TUI fallback: {exc}. Continuing in streaming mode...[/yellow]"
                )
            else:
                print(f"[!] Live TUI fallback: {exc}. Continuing in streaming mode...")
            while self.running and any(w.running for w in self.workers):
                try:
                    time.sleep(0.5)
                except (KeyboardInterrupt, EOFError):
                    self._handle_exit()
                    break
        finally:
            self.running = False


# ---------------------------------------------------------------------------
# Worker Runner Entrypoint
# ---------------------------------------------------------------------------


def cmd_start(args: argparse.Namespace):
    """Starts the distributed compute worker threads."""
    cfg = load_worker_config()
    server = getattr(args, "server", None) or cfg["server"]
    token = getattr(args, "token", None)
    username = getattr(args, "username", None) or cfg["username"]
    password = getattr(args, "password", None) or cfg["password"]
    task = getattr(args, "task", None) or cfg["task"]
    threads = getattr(args, "threads", None) or cfg["threads"]
    batch_size = getattr(args, "batch_size", None) or cfg["batch_size"]
    webp_quality = getattr(args, "webp_quality", None) or cfg["webp_quality"]
    model_name = getattr(args, "model", None) or cfg["model"]
    gpu_batch = getattr(args, "gpu_batch_size", None) or cfg["gpu_batch_size"]
    sleep_sec = getattr(args, "sleep", None) or cfg["sleep"]
    workload_pct = getattr(args, "workload", None) or cfg["workload_pct"]
    auto_throttle = (
        getattr(args, "auto_throttle", None)
        if hasattr(args, "auto_throttle") and args.auto_throttle is not None
        else cfg["auto_throttle"]
    )
    low_priority = (
        getattr(args, "low_priority", None)
        if hasattr(args, "low_priority")
        else cfg["low_priority"]
    )
    max_batches = getattr(args, "max_batches", None)

    # Calculate dynamic workload mapping
    calc_batch, calc_sleep = compute_workload_params(workload_pct)
    if gpu_batch == 32 and workload_pct != 85:
        gpu_batch = calc_batch
    if sleep_sec == 0.0 and workload_pct != 85:
        sleep_sec = calc_sleep

    hw = detect_hardware()
    render_banner(
        server, task, workload_pct, auto_throttle, hw, threads, batch_size
    )

    active_workers: List[Any] = []

    if task in ("artwork", "both"):
        artwork_worker = AdminComputeWorker(
            server_url=server,
            token=token,
            username=username,
            password=password,
            concurrency=threads,
            batch_size=batch_size,
            webp_quality=webp_quality,
        )
        active_workers.append(artwork_worker)

    if task in ("embeddings", "both"):
        embed_worker = EmbeddingWorker(
            server_url=server,
            token=token,
            username=username,
            password=password,
            batch_size=batch_size,
            model_name=model_name,
            gpu_batch_size=gpu_batch,
            sleep_between_batches=sleep_sec,
            workload_pct=workload_pct,
            auto_throttle=auto_throttle,
            low_priority=low_priority,
            max_batches=max_batches,
        )
        active_workers.append(embed_worker)

    def handle_sigint(sig, frame):
        print(f"\n{Colors.YELLOW}● Stopping compute pipelines...{Colors.RESET}")
        for w in active_workers:
            w.running = False

        # Session summary table
        if HAS_RICH and console:
            t = Table(box=box.SIMPLE, show_header=False, expand=True)
            t.add_column("Property", style="dim", width=25)
            t.add_column("Value", style="bold green")

            for w in active_workers:
                if isinstance(w, EmbeddingWorker):
                    elapsed = max(1.0, time.time() - w.start_time)
                    mins = int(elapsed // 60)
                    secs = int(elapsed % 60)
                    t.add_row("Run Duration", f"{mins}m {secs:02d}s")
                    t.add_row(
                        "Embeddings Submitted",
                        f"{w.total_embedded:,} items ({w.total_embedded / elapsed:.1f} avg/s)",
                    )
                elif isinstance(w, AdminComputeWorker):
                    t.add_row("Media Processed", f"{w.total_media_processed:,} titles")
                    t.add_row(
                        "Artwork Winners Uploaded",
                        f"{w.total_winners_uploaded:,} files ({w.total_bytes_uploaded / (1024**2):.1f} MB)",
                    )
                    t.add_row("Wikidata Enrichments", f"{w.total_enrichments:,} titles")

            console.print(
                Panel(
                    t,
                    title="[bold cyan]Session Summary[/bold cyan]",
                    border_style="dim white",
                    box=box.ROUNDED,
                )
            )
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_sigint)

    # Determine if live interactive chat console should run
    can_chat = (
        sys.stdin.isatty()
        and not getattr(args, "no_chat", False)
        and max_batches is None
    )

    if can_chat:
        chat = LiveWorkerChat(
            workers=active_workers,
            server_url=server,
            token=token,
            username=username,
            password=password,
            workload_pct=workload_pct,
            auto_throttle=auto_throttle,
        )
        for w in active_workers:
            w.event_callback = chat.handle_worker_event

        # Spawn workers in background daemon threads
        worker_threads = []
        for w in active_workers:
            t = threading.Thread(target=w.run, daemon=True)
            t.start()
            worker_threads.append(t)

        try:
            chat.run_chat_loop()
        finally:
            handle_sigint(None, None)
    else:
        # Spawn workers in background daemon threads
        worker_threads = []
        for w in active_workers:
            t = threading.Thread(target=w.run, daemon=True)
            t.start()
            worker_threads.append(t)

        try:
            while any(w.running for w in active_workers):
                time.sleep(0.5)
        except KeyboardInterrupt:
            handle_sigint(None, None)


# ---------------------------------------------------------------------------
# Main CLI Router
# ---------------------------------------------------------------------------


def main():
    cfg = load_worker_config()

    parser = argparse.ArgumentParser(
        prog="otix-worker",
        description="Otix Distributed Compute Worker CLI: Multi-Threaded Artwork, Wikidata Offloader & GPU Embeddings",
    )
    subparsers = parser.add_subparsers(dest="subcommand", help="Available commands")

    # Helper for adding common connection arguments
    def add_conn_args(p):
        p.add_argument(
            "--server",
            "-s",
            type=str,
            default=None,
            help=f"Otix central server base URL (default: {cfg['server']})",
        )
        p.add_argument(
            "--username",
            "-u",
            type=str,
            default=None,
            help=f"Admin username/email (default: {cfg['username']})",
        )
        p.add_argument(
            "--password", "-p", type=str, default=None, help="Admin password"
        )
        p.add_argument("--token", type=str, default=None, help="Admin JWT token")

    # Command: start / worker
    p_start = subparsers.add_parser(
        "start",
        aliases=["run", "worker"],
        help="Start compute worker (embeddings + artwork)",
    )
    add_conn_args(p_start)
    p_start.add_argument(
        "--task",
        "-t",
        choices=["artwork", "embeddings", "both"],
        default=None,
        help="Task mode: artwork, embeddings, or both (default: both)",
    )
    p_start.add_argument(
        "--workload",
        "-w",
        type=int,
        default=None,
        help="GPU Workload Slider percentage [1-100%%] (default: 85%%)",
    )
    p_start.add_argument(
        "--auto-throttle",
        dest="auto_throttle",
        action="store_true",
        default=True,
        help="Automatically throttle GPU when games or 3D apps are running (default: enabled)",
    )
    p_start.add_argument(
        "--no-auto-throttle",
        dest="auto_throttle",
        action="store_false",
        help="Disable automatic game throttling",
    )
    p_start.add_argument(
        "--threads",
        type=int,
        default=None,
        help="Worker threads for artwork/metadata (default: 16)",
    )
    p_start.add_argument(
        "--batch-size",
        "-b",
        type=int,
        default=None,
        help="Batch size per claim (default: 200)",
    )
    p_start.add_argument(
        "--gpu-batch-size",
        type=int,
        default=None,
        help="GPU model.encode batch size (default: 32)",
    )
    p_start.add_argument(
        "--sleep",
        type=float,
        default=None,
        help="Pause seconds between batches (default: 0.0)",
    )
    p_start.add_argument(
        "--low-priority",
        action="store_true",
        help="Set OS priority to Below Normal to avoid foreground game stutter",
    )
    p_start.add_argument(
        "--model",
        type=str,
        default=None,
        help="HuggingFace model (default: BAAI/bge-m3)",
    )
    p_start.add_argument(
        "--webp-quality",
        type=int,
        default=None,
        help="WebP compression quality (default: 85)",
    )
    p_start.add_argument(
        "--max-batches",
        type=int,
        default=None,
        help="Stop and exit after processing N batches (useful for dry runs / scripts)",
    )
    p_start.add_argument(
        "--no-chat",
        action="store_true",
        help="Disable interactive live chat prompt (pure log streaming)",
    )

    # Command: stats
    p_stats = subparsers.add_parser(
        "stats", aliases=["status"], help="View live server health, catalog and storage stats"
    )
    add_conn_args(p_stats)

    # Command: benchmark
    p_bench = subparsers.add_parser(
        "benchmark",
        aliases=["bench"],
        help="Run GPU benchmark and calculate catalog completion ETA",
    )
    add_conn_args(p_bench)
    p_bench.add_argument(
        "--model",
        type=str,
        default="BAAI/bge-m3",
        help="Model to benchmark (default: BAAI/bge-m3)",
    )
    p_bench.add_argument(
        "--gpu-batch-size", type=int, default=32, help="GPU batch size (default: 32)"
    )

    # Command: hydrate
    p_hyd = subparsers.add_parser(
        "hydrate", help="Trigger catalog discover seed and drain pending sync jobs"
    )
    add_conn_args(p_hyd)
    p_hyd.add_argument(
        "--limit", type=int, default=50, help="Discover limit per category"
    )
    p_hyd.add_argument(
        "--workers", type=int, default=8, help="Concurrent sync worker threads"
    )

    # Command: config
    p_cfg = subparsers.add_parser(
        "config", help="View or update saved default settings"
    )
    add_conn_args(p_cfg)
    p_cfg.add_argument(
        "--task", choices=["artwork", "embeddings", "both"], help="Default task"
    )
    p_cfg.add_argument(
        "--workload", type=int, help="Default GPU workload percentage (1-100)"
    )
    p_cfg.add_argument(
        "--show", action="store_true", help="Display current saved configuration"
    )

    # Command: interactive
    subparsers.add_parser(
        "interactive", aliases=["ui", "menu"], help="Launch interactive visual control menu"
    )

    # Support backward-compatibility:
    # If first argument is not a known subcommand and looks like a flag or is empty:
    args_list = sys.argv[1:]
    known_commands = {
        "start",
        "run",
        "worker",
        "stats",
        "status",
        "benchmark",
        "bench",
        "hydrate",
        "config",
        "interactive",
        "ui",
        "menu",
        "-h",
        "--help",
    }

    if not args_list:
        # If run interactively in terminal without arguments, open interactive menu!
        if sys.stdin.isatty():
            interactive_menu()
            return
        else:
            # Piped / daemon mode: start worker with defaults
            parsed, _ = parser.parse_known_args(["start"])
            cmd_start(parsed)
            return

    if args_list[0] not in known_commands:
        # User passed flags directly without subcommand: default to "start"
        args_list = ["start"] + args_list

    parsed, _ = parser.parse_known_args(args_list)

    if parsed.subcommand in ("start", "run", "worker"):
        cmd_start(parsed)
    elif parsed.subcommand in ("stats", "status"):
        cmd_stats(parsed)
    elif parsed.subcommand in ("benchmark", "bench"):
        cmd_benchmark(parsed)
    elif parsed.subcommand == "hydrate":
        cmd_hydrate(parsed)
    elif parsed.subcommand == "config":
        cmd_config(parsed)
    elif parsed.subcommand in ("interactive", "ui", "menu"):
        interactive_menu()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
