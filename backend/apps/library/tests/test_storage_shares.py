import uuid
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.library.models import GameMatchRecord, NodeLibraryPath, StorageShare, UserNode
from apps.library.models.game_source import NodeGameSource, UserGame
from apps.library.services.otix_sync import node_write_otix
from apps.media.models import MediaAsset, MediaItem

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

    def test_ps5_dump_confirmation_updates_external_ids(self):
        ps5_media = MediaItem.objects.create(
            title="Demon's Souls",
            slug="demons-souls",
            media_type="game",
        )
        record = GameMatchRecord.objects.create(
            user=self.user,
            canonical_key="node:1:ps5/demons souls [ppsa01234]/ppsa01234-app0/eboot.bin",
            raw_title="eboot.bin",
            cleaned_title="Demon's Souls [PPSA01234]",
            relative_path="PS5/Demon's Souls [PPSA01234]/PPSA01234-app0/eboot.bin",
            match_status="needs_review",
        )

        confirm_resp = self.client.post(
            f"/api/v1/library/matches/{record.id}/confirm",
            {"media_item_id": str(ps5_media.id), "title_id": "PPSA01234"},
            format="json",
        )
        self.assertEqual(confirm_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_resp.data["match_status"], "matched")
        self.assertEqual(confirm_resp.data["media_item_id"], ps5_media.id)
        # Check external_ids exposed in serializer response
        self.assertIn("external_ids", confirm_resp.data)
        self.assertEqual(confirm_resp.data["external_ids"].get("playstation"), "PPSA01234")

        # Verify ExternalID model rows in database
        from apps.media.models import ExternalID
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(MediaItem)
        ext = ExternalID.objects.filter(content_type=ct, object_id=ps5_media.id, provider="playstation").first()
        self.assertIsNotNone(ext)
        self.assertEqual(ext.external_id, "PPSA01234")

        # Verify subsequent manifest search matches immediately via PS ID
        from apps.library.services.game_matching import find_matching_candidates
        cands = find_matching_candidates("Unknown Game", "eboot.bin", "PS5/PPSA01234-app0/eboot.bin")
        self.assertEqual(len(cands), 1)
        self.assertEqual(cands[0]["media_id"], str(ps5_media.id))
        self.assertEqual(cands[0]["confidence"], 1.0)

    def test_manifest_ingest_with_uuid_machine_id(self):
        remote_node = UserNode.objects.create(
            user=self.user,
            name="Remote NAS",
            local_url="http://192.168.1.150:7777",
            api_key="secret-key-123",
        )
        manifest = [
            {
                "filename": "eldenring.exe",
                "filepath": "/mnt/games/Elden Ring/eldenring.exe",
                "relative_path": "Elden Ring/eldenring.exe",
                "game_title": "Elden Ring",
                "format_category": "game",
                "filesize": 1024 * 1024 * 100,
                "sha256_head": "uuidtest123",
            }
        ]
        resp = self.client.post(
            f"/api/v1/nodes/{remote_node.machine_id}/manifest/",
            {"files": manifest},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["stats"]["total_processed"], 1)
        self.assertEqual(resp.data["stats"]["auto_matched"], 1)

        source = NodeGameSource.objects.filter(node=remote_node, canonical_path="/mnt/games/Elden Ring/eldenring.exe").first()
        self.assertIsNotNone(source)
        self.assertEqual(source.user_game.media_item_id, self.media_item.id)

    def test_manifest_ingest_bearer_token_unauthenticated_client(self):
        daemon_node = UserNode.objects.create(
            user=self.user,
            name="Daemon Node",
            local_url="http://192.168.1.200:7777",
            api_key="daemon-api-token-xyz",
        )
        anon_client = APIClient()
        manifest = [
            {
                "filename": "eldenring.exe",
                "filepath": "/srv/games/Elden Ring/eldenring.exe",
                "relative_path": "Elden Ring/eldenring.exe",
                "game_title": "Elden Ring",
                "format_category": "game",
                "filesize": 1024 * 1024 * 50,
                "sha256_head": "daemontoken123",
            }
        ]

        # 1. Test Authorization Bearer header
        anon_client.credentials(HTTP_AUTHORIZATION=f"Bearer {daemon_node.api_key}")
        resp = anon_client.post(
            f"/api/v1/nodes/{daemon_node.machine_id}/manifest",
            {"files": manifest},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["stats"]["total_processed"], 1)

        # 2. Test invalid token rejected
        anon_client.credentials(HTTP_AUTHORIZATION="Bearer invalid-token")
        bad_resp = anon_client.post(
            f"/api/v1/nodes/{daemon_node.machine_id}/manifest",
            {"files": manifest},
            format="json",
        )
        self.assertEqual(bad_resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_multi_node_sources_grouping_under_canonical_user_game(self):
        node2 = UserNode.objects.create(
            user=self.user,
            name="Living Room PC",
            local_url="http://192.168.1.180:7777",
        )
        manifest1 = [
            {
                "filename": "eldenring.exe",
                "filepath": "C:/Games/Elden Ring/eldenring.exe",
                "relative_path": "Elden Ring/eldenring.exe",
                "game_title": "Elden Ring",
                "format_category": "game",
                "filesize": 1024 * 1024 * 100,
            }
        ]
        resp1 = self.client.post(
            f"/api/v1/nodes/{self.node.id}/manifest",
            {"files": manifest1},
            format="json",
        )
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)

        manifest2 = [
            {
                "filename": "setup.exe",
                "filepath": "Z:/Installers/Elden.Ring.v1.10.Setup/setup.exe",
                "relative_path": "Elden.Ring.v1.10.Setup/setup.exe",
                "game_title": "Elden Ring",
                "format_category": "installer",
                "filesize": 1024 * 1024 * 80,
            }
        ]
        resp2 = self.client.post(
            f"/api/v1/nodes/{node2.id}/manifest",
            {"files": manifest2},
            format="json",
        )
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)

        user_games = UserGame.objects.filter(user=self.user, media_item=self.media_item)
        self.assertEqual(user_games.count(), 1)
        canonical_game = user_games.first()

        sources = canonical_game.sources.all()
        self.assertEqual(sources.count(), 2)
        source_nodes = {s.node_id for s in sources}
        self.assertEqual(source_nodes, {self.node.id, node2.id})

        games_resp = self.client.get("/api/v1/library/games")
        self.assertEqual(games_resp.status_code, status.HTTP_200_OK)
        game_list = games_resp.data["games"]
        self.assertEqual(len(game_list), 1)
        self.assertEqual(game_list[0]["clean_title"], "Elden Ring")
        self.assertEqual(len(game_list[0]["sources"]), 2)

    def test_canonical_games_artwork_enrichment(self):
        MediaAsset.objects.create(
            media_item=self.media_item,
            asset_type="poster",
            url="https://images.example.com/elden-poster.jpg",
        )
        MediaAsset.objects.create(
            media_item=self.media_item,
            asset_type="backdrop",
            url="https://images.example.com/elden-backdrop.jpg",
        )
        UserGame.objects.create(
            user=self.user,
            media_item=self.media_item,
            clean_title="Elden Ring",
            platform="pc",
        )

        resp = self.client.get("/api/v1/library/games")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        games = resp.data["games"]
        self.assertEqual(len(games), 1)
        self.assertEqual(games[0]["catalog_poster_url"], "https://images.example.com/elden-poster.jpg")
        self.assertEqual(games[0]["catalog_backdrop_url"], "https://images.example.com/elden-backdrop.jpg")

    def test_node_write_otix_persists_purely_to_database(self):
        status_code, res = node_write_otix(self.node, {"items": [{"dummy": True}]})
        self.assertEqual(status_code, 200)
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["written"], 0)
        self.assertTrue(res["persisted_to_database"])
