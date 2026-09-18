from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from otix_server.config import AppConfig, save_config

WINDOWS_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_ENTRY_NAME = "OtixServer"


def get_node_platform() -> str:
    """Return normalized node platform string: 'windows', 'linux', 'darwin', etc."""
    if sys.platform == "win32":
        return "windows"
    if sys.platform.startswith("linux"):
        return "linux"
    if sys.platform == "darwin":
        return "darwin"
    return sys.platform


def is_desktop_platform_supported() -> bool:
    """Check if the server node is running on Windows or Linux."""
    return get_node_platform() in ("windows", "linux")


def get_server_startup_command() -> str:
    """Determine startup command for this Otix server node."""
    exe = sys.executable
    argv0 = sys.argv[0] if sys.argv else ""
    if argv0 and os.path.exists(argv0) and (argv0.endswith(".py") or argv0.endswith(".exe")):
        script_path = str(Path(argv0).resolve())
        if script_path.endswith(".py"):
            return f'"{exe}" "{script_path}"'
        return f'"{script_path}"'
    return f'"{exe}" -m otix_server.main'


def check_windows_autostart() -> bool:
    """Check if OtixServer is registered in Windows CurrentVersion\\Run."""
    if sys.platform != "win32":
        return False
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, WINDOWS_RUN_KEY, 0, winreg.KEY_READ
        ) as key:
            val, _ = winreg.QueryValueEx(key, RUN_ENTRY_NAME)
            return bool(val)
    except (FileNotFoundError, OSError, ImportError):
        return False


def set_windows_autostart(enabled: bool, command: Optional[str] = None) -> bool:
    """Register or unregister OtixServer in Windows CurrentVersion\\Run."""
    if sys.platform != "win32":
        return False
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, WINDOWS_RUN_KEY, 0, winreg.KEY_SET_VALUE
        ) as key:
            if enabled:
                cmd = command or get_server_startup_command()
                winreg.SetValueEx(key, RUN_ENTRY_NAME, 0, winreg.REG_SZ, cmd)
            else:
                try:
                    winreg.DeleteValue(key, RUN_ENTRY_NAME)
                except FileNotFoundError:
                    pass
        return True
    except (OSError, ImportError) as err:
        print(f"[Warning] Failed to set Windows autostart: {err}")
        return False


def get_linux_autostart_path() -> Path:
    """Return path to XDG autostart desktop entry."""
    config_home = os.environ.get("XDG_CONFIG_HOME")
    if config_home:
        base = Path(config_home)
    else:
        base = Path.home() / ".config"
    return base / "autostart" / "otix-server.desktop"


def check_linux_autostart() -> bool:
    """Check if Linux XDG autostart desktop file exists."""
    if not sys.platform.startswith("linux"):
        return False
    try:
        return get_linux_autostart_path().is_file()
    except Exception:
        return False


def set_linux_autostart(enabled: bool, command: Optional[str] = None) -> bool:
    """Create or remove Linux XDG autostart desktop file."""
    if not sys.platform.startswith("linux"):
        return False
    try:
        desktop_path = get_linux_autostart_path()
        if enabled:
            desktop_path.parent.mkdir(parents=True, exist_ok=True)
            cmd = command or get_server_startup_command()
            content = (
                "[Desktop Entry]\n"
                "Type=Application\n"
                "Version=1.0\n"
                "Name=Otix Server\n"
                "Comment=Otix Node Server\n"
                f"Exec={cmd}\n"
                "Terminal=false\n"
                "StartupNotify=false\n"
            )
            desktop_path.write_text(content, encoding="utf-8")
        else:
            if desktop_path.exists():
                desktop_path.unlink()
        return True
    except Exception as err:
        print(f"[Warning] Failed to set Linux autostart: {err}")
        return False


def sync_os_startup(enabled: bool, command: Optional[str] = None) -> bool:
    """Apply startup setting to the host OS if running on Windows or Linux."""
    platform = get_node_platform()
    if platform == "windows":
        return set_windows_autostart(enabled, command=command)
    if platform == "linux":
        return set_linux_autostart(enabled, command=command)
    return False


def check_os_startup() -> Optional[bool]:
    """Inspect OS startup registration status if supported."""
    platform = get_node_platform()
    if platform == "windows":
        return check_windows_autostart()
    if platform == "linux":
        return check_linux_autostart()
    return None


def get_desktop_settings_dict(cfg: AppConfig) -> Dict[str, Any]:
    """Serialize current node desktop settings with platform info."""
    platform = get_node_platform()
    supported = is_desktop_platform_supported()

    # Determine launch on startup state: check OS registry/file if available, fallback to config
    os_startup = check_os_startup()
    launch_on_startup = os_startup if os_startup is not None else cfg.desktop.launch_on_startup

    return {
        "platform": platform,
        "supported": supported,
        "launchOnStartup": launch_on_startup,
        "minimizeToTray": cfg.desktop.minimize_to_tray,
        "closeToTray": cfg.desktop.close_to_tray,
        "alwaysOnTop": cfg.desktop.always_on_top,
        "startMinimized": cfg.desktop.start_minimized,
        "gamesDownloadPath": cfg.desktop.games_download_path or cfg.server.downloads_path,
    }


def apply_desktop_settings(cfg: AppConfig, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply desktop settings update, syncing OS startup and download paths on Windows/Linux."""
    # Handle launchOnStartup / launch_on_startup
    if "launchOnStartup" in payload or "launch_on_startup" in payload:
        val = bool(payload.get("launchOnStartup", payload.get("launch_on_startup")))
        cfg.desktop.launch_on_startup = val
        sync_os_startup(val)

    # Handle window & tray flags
    if "minimizeToTray" in payload or "minimize_to_tray" in payload:
        cfg.desktop.minimize_to_tray = bool(
            payload.get("minimizeToTray", payload.get("minimize_to_tray"))
        )
    if "closeToTray" in payload or "close_to_tray" in payload:
        cfg.desktop.close_to_tray = bool(payload.get("closeToTray", payload.get("close_to_tray")))
    if "alwaysOnTop" in payload or "always_on_top" in payload:
        cfg.desktop.always_on_top = bool(payload.get("alwaysOnTop", payload.get("always_on_top")))
    if "startMinimized" in payload or "start_minimized" in payload:
        cfg.desktop.start_minimized = bool(
            payload.get("startMinimized", payload.get("start_minimized"))
        )

    # Handle download path
    if "gamesDownloadPath" in payload or "games_download_path" in payload:
        path_val = str(
            payload.get("gamesDownloadPath", payload.get("games_download_path")) or ""
        ).strip()
        if path_val:
            cfg.desktop.games_download_path = path_val
            cfg.server.downloads_path = path_val

    save_config(cfg)
    return get_desktop_settings_dict(cfg)
