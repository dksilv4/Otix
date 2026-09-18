"""Load library roots into explorer listings when the browse caller omits them."""

from __future__ import annotations


def install() -> None:
    from otix_server import explorer_utils
    from otix_server.config import load_config

    if not hasattr(explorer_utils, "inspect_directory"):
        return

    original = explorer_utils.inspect_directory
    if getattr(original, "_otix_library_roots", False):
        return

    def inspect_directory(target_path, active_download_path="", server_root=None, extra_library_paths=None):
        if extra_library_paths is None:
            try:
                extra_library_paths = [lib.path for lib in load_config().game_libraries]
            except Exception:
                extra_library_paths = []
        return original(
            target_path,
            active_download_path=active_download_path,
            server_root=server_root,
            extra_library_paths=extra_library_paths,
        )

    inspect_directory._otix_library_roots = True  # type: ignore[attr-defined]
    explorer_utils.inspect_directory = inspect_directory
