"""SABnzbd Downloader Provider.

Concrete implementation of BaseDownloader using SABnzbd REST API.
"""

from typing import Any, Dict
from otix_server.providers.base import BaseDownloader
from otix_server.usenet_types import SabnzbdConfig, ServerDownloadQueue
from otix_server.usenet_utils import (
    test_sabnzbd_connection,
    send_nzb_to_sabnzbd,
    fetch_sabnzbd_queue,
    delete_sabnzbd_slot,
    pause_sabnzbd_queue,
    resume_sabnzbd_queue,
)


class SabnzbdDownloader(BaseDownloader):
    """SABnzbd Usenet download client driver."""

    name = "SABnzbd"
    protocol = "usenet"

    def __init__(self, config: SabnzbdConfig) -> None:
        self.config = config

    def is_configured(self) -> bool:
        return bool(self.config.api_key and self.config.api_key.strip())

    def test_connection(self) -> Dict[str, Any]:
        return test_sabnzbd_connection(self.config)

    def add_download(
        self, download_url: str, title: str, category: str = "games"
    ) -> Dict[str, Any]:
        target_cat = category or self.config.category or "games"
        return send_nzb_to_sabnzbd(self.config, download_url, title, target_cat)

    def get_queue(self) -> ServerDownloadQueue:
        return fetch_sabnzbd_queue(self.config)

    def delete_download(self, download_id: str) -> bool:
        return delete_sabnzbd_slot(self.config, download_id)

    def pause_queue(self) -> bool:
        return pause_sabnzbd_queue(self.config)

    def resume_queue(self) -> bool:
        return resume_sabnzbd_queue(self.config)

