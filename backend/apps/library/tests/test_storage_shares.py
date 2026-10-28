"""Tests for Storage Shares, Node Paths, and Game Match Center."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.library.models import GameMatchRecord, NodeLibraryPath, StorageShare, UserNode
from apps.media.models import MediaItem

User = get_user_model()


class StorageSharesAndMatchingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="gamer1", email="gamer1@example.com", password="password123"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.node = UserNode.objects.create(
            user=self.user,
            name="Gaming PC",
            local_url="http://127.0.0.1:8090",
            is_local_desktop=True,
        )

        self.media_item = MediaItem.objects.create(
            title="Elden Ring",
            slug="elden-ring",
            media_type="game",
        )

    def test_create_and_list_storage_share(self):
        resp = self.client.post(
            "/api/v1/library/shares",
            {
                "name": "NAS Games",
                "protocol": "smb",
                "host": "192.168.1.100",
                "export_path": "/mnt/user/games",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["name"], "NAS Games")
        share_id = resp.data["id"]

        list_resp = self.client.get("/api/v1/library/shares")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_resp.data), 1)
        self.assertEqual(list_resp.data[0]["id"], share_id)

    def test_node_library_paths_crud(self):
        share = StorageShare.objects.create(
            user=self.user,
            name="NAS Pool",
            protocol="smb",
        )

        resp = self.client.post(
            f"/api/v1/library/nodes/{self.node.id}/paths",
            {
                "name": "Local RPGs",
                "path": "Z:/Games/RPGs",
                "kind": "game",
                "roles": ["installed_game"],
                "storage_share_id": share.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["name"], "Local RPGs")
        self.assertEqual(resp.data["storage_share_name"], "NAS Pool")
        path_id = resp.data["id"]

        list_resp = self.client.get(f"/api/v1/library/nodes/{self.node.id}/paths")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_resp.data), 1)

        del_resp = self.client.delete(f"/api/v1/library/nodes/{self.node.id}/paths/{path_id}")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(NodeLibraryPath.objects.count(), 0)

    def test_manifest_ingest_and_pure_database_matching(self):
        share = StorageShare.objects.create(
            user=self.user,
            name="Shared Games",
            protocol="smb",
        )
        NodeLibraryPath.objects.create(
            node=self.node,
            name="Games Share",
            path="Z:/Games",
            storage_share=share,
            roles=["installed_game"],
        )

        manifest = [
            {
                "filename": "eldenring.exe",
                "filepath": "Z:/Games/Elden Ring/Game/eldenring.exe",
                "relative_path": "Elden Ring/Game/eldenring.exe",
                "game_title": "Elden Ring",
                "format_category": "game",
                "filesize": 1024 * 1024 * 70,
                "sha256_head": "abc1234567890",
            },
            {
                "filename": "random_unknown_tool.exe",
                "filepath": "Z:/Games/Misc/random_unknown_tool.exe",
                "relative_path": "Misc/random_unknown_tool.exe",
                "game_title": "Random Unknown Tool",
                "format_category": "game",
                "filesize": 1024 * 500,
                "sha256_head": "def9876543210",
            },
        ]

        resp = self.client.post(
            f"/api/v1/library/nodes/{self.node.id}/manifest",
            {"files": manifest},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        stats = resp.data["stats"]
        self.assertEqual(stats["total_processed"], 2)
        self.assertEqual(stats["auto_matched"], 1)
        self.assertEqual(stats["unmatched"], 1)

        # Check GameMatchRecord
        records = list(GameMatchRecord.objects.filter(user=self.user))
        self.assertEqual(len(records), 2)

        matched_rec = next(r for r in records if r.cleaned_title == "Elden Ring")
        self.assertEqual(matched_rec.match_status, "matched")
        self.assertEqual(matched_rec.media_item_id, self.media_item.id)
        self.assertEqual(matched_rec.storage_share_id, share.id)

        # Query Match Center
        center_resp = self.client.get("/api/v1/library/matches?status=matched")
        self.assertEqual(center_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(center_resp.data), 1)
        self.assertEqual(center_resp.data[0]["cleaned_title"], "Elden Ring")

    def test_confirm_and_unmatch(self):
        record = GameMatchRecord.objects.create(
            user=self.user,
            canonical_key="node:1:game.exe",
            raw_title="game.exe",
            cleaned_title="Game Title",
            relative_path="game.exe",
            match_status="unmatched",
        )

        confirm_resp = self.client.post(
            f"/api/v1/library/matches/{record.id}/confirm",
            {"media_item_id": str(self.media_item.id)},
            format="json",
        )
        self.assertEqual(confirm_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_resp.data["match_status"], "matched")
        self.assertEqual(confirm_resp.data["media_item_id"], self.media_item.id)

        unmatch_resp = self.client.post(
            f"/api/v1/library/matches/{record.id}/unmatch",
            format="json",
        )
        self.assertEqual(unmatch_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(unmatch_resp.data["match_status"], "unmatched")
        self.assertIsNone(unmatch_resp.data["media_item_id"])
