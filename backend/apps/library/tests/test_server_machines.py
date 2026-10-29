"""Tests for UserHome and UserServerMachine (homelab computers, OS, SMB, and drive configs)."""

from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.library.models import UserHome, UserNode, UserServerMachine

User = get_user_model()


class ServerMachinesTestCase(APITestCase):
    """Test suite for Homes and Server Machines APIs."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="homelabber",
            email="homelab@example.com",
            password="testpassword123",
        )
        self.client.force_authenticate(user=self.user)

        self.home = UserHome.objects.create(
            user=self.user,
            name="Main Residence",
            description="Home network",
            is_default=True,
        )

        self.node = UserNode.objects.create(
            user=self.user,
            name="Unraid Worker Node",
            local_url="http://192.168.1.150:8090",
            auth_token="secret-token-123",
            home=self.home,
        )

    def test_list_and_create_homes(self):
        res = self.client.get("/api/v1/library/homes")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["name"], "Main Residence")
        self.assertEqual(res.data[0]["nodes_count"], 1)

        create_res = self.client.post(
            "/api/v1/library/homes",
            {
                "name": "Offsite Cabin",
                "description": "Remote vacation cabin",
                "wifi_ssid": "Cabin_5GHz",
                "gateway_mac": "aa:bb:cc:dd:ee:ff",
                "bssid": "11:22:33:44:55:66",
                "local_server_url": "http://192.168.10.50:8090",
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_res.data["name"], "Offsite Cabin")
        self.assertEqual(create_res.data["wifi_ssid"], "Cabin_5GHz")
        self.assertEqual(create_res.data["gateway_mac"], "aa:bb:cc:dd:ee:ff")
        self.assertEqual(create_res.data["bssid"], "11:22:33:44:55:66")
        self.assertEqual(create_res.data["local_server_url"], "http://192.168.10.50:8090")
        self.assertEqual(UserHome.objects.filter(user=self.user).count(), 2)

    def test_create_and_update_server_machine(self):
        payload = {
            "name": "Tower NAS",
            "home_id": self.home.id,
            "os": "unraid",
            "os_version": "6.12.8",
            "host": "192.168.1.150",
            "hosted_node_id": self.node.id,
            "smb_enabled": True,
            "smb_share_name": "games",
            "smb_username": "nobody",
            "smb_port": 445,
            "smb_node_ids": [self.node.id],
            "drives_config": [
                {
                    "id": "disk1",
                    "drive": "/mnt/disk1",
                    "label": "Array Disk 1",
                    "file_system": "xfs",
                    "total_bytes": 14000000000000,
                    "free_bytes": 4000000000000,
                    "used_bytes": 10000000000000,
                    "type": "hdd",
                }
            ],
        }
        res = self.client.post("/api/v1/library/server-machines", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        server_id = res.data["id"]
        self.assertEqual(res.data["os"], "unraid")
        self.assertEqual(res.data["total_storage_bytes"], 14000000000000)
        self.assertEqual(res.data["free_storage_bytes"], 4000000000000)
        self.assertEqual(res.data["hosted_node_id"], self.node.id)
        self.assertIn(self.node.id, res.data["smb_node_ids"])

        # Patch server machine
        patch_res = self.client.patch(
            f"/api/v1/library/server-machines/{server_id}",
            {"name": "Tower NAS (Primary)", "os_version": "6.12.10"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["name"], "Tower NAS (Primary)")
        self.assertEqual(patch_res.data["os_version"], "6.12.10")

    def test_child_node_inherits_home_from_parent_server_machine(self):
        orphan_node = UserNode.objects.create(
            user=self.user,
            name="Orphan Node",
            local_url="http://192.168.1.199:8090",
            auth_token="token-orphan",
            home=None,
        )
        self.assertIsNone(orphan_node.home_id)
        self.assertIsNone(orphan_node.effective_home)

        # Create server machine with home and attach orphan_node as hosted_node
        res = self.client.post(
            "/api/v1/library/server-machines",
            {
                "name": "Rack Server",
                "home_id": self.home.id,
                "hosted_node_id": orphan_node.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        orphan_node.refresh_from_db()
        # Direct foreign key remains None (not directly linked to home node)
        self.assertIsNone(orphan_node.home_id)
        # But inherits home dynamically from parent server machine
        self.assertEqual(orphan_node.effective_home, self.home)

        # Verify serializer output returns inherited home
        node_res = self.client.get("/api/v1/library/servers")
        matching = next(n for n in node_res.data if n["id"] == orphan_node.id)
        self.assertEqual(matching["home_id"], self.home.id)
        self.assertEqual(matching["home_name"], self.home.name)

    @mock.patch("apps.library.views.server_machines.httpx.Client")
    def test_detect_drives_from_node(self, mock_client_cls):
        mock_client = mock.MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client

        mock_response = mock.MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "storage": [
                {
                    "drive": "/mnt/user",
                    "label": "Unraid User Share Pool",
                    "fileSystem": "btrfs",
                    "totalBytes": 20000000000000,
                    "freeBytes": 8000000000000,
                    "usedBytes": 12000000000000,
                }
            ],
            "os": {
                "name": "Unraid OS",
                "platform": "linux",
            },
        }
        mock_client.get.return_value = mock_response

        server = UserServerMachine.objects.create(
            user=self.user,
            home=self.home,
            name="Homelab Box",
            hosted_node=self.node,
            os="other",
        )

        res = self.client.post(
            f"/api/v1/library/server-machines/{server.id}/detect-drives",
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        server.refresh_from_db()
        self.assertEqual(server.os, "unraid")
        self.assertEqual(server.total_storage_bytes, 20000000000000)
        self.assertEqual(server.free_storage_bytes, 8000000000000)
        self.assertEqual(len(server.drives_config), 1)
        self.assertEqual(server.drives_config[0]["file_system"], "btrfs")

    def test_unauthenticated_access_is_rejected(self):
        self.client.logout()
        res_homes = self.client.get("/api/v1/library/homes")
        self.assertIn(
            res_homes.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        )

        res_machines = self.client.get("/api/v1/library/server-machines")
        self.assertIn(
            res_machines.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        )

    def test_cross_user_isolation_forbidden(self):
        other_user = User.objects.create_user(
            username="other_user",
            email="other@example.com",
            password="testpassword123",
        )
        self.client.force_authenticate(user=other_user)

        # Other user cannot see primary user's homes or server machines
        res_homes = self.client.get("/api/v1/library/homes")
        self.assertEqual(res_homes.status_code, status.HTTP_200_OK)
        # Other user gets their own default home, NOT the primary user's home
        home_ids = [h["id"] for h in res_homes.data]
        self.assertNotIn(self.home.id, home_ids)

        # Other user cannot fetch or patch primary user's home
        self.assertEqual(
            self.client.get(f"/api/v1/library/homes/{self.home.id}").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/v1/library/homes/{self.home.id}", {"name": "Hacked"}
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

        # Other user cannot see primary user's server machines
        res_machines = self.client.get("/api/v1/library/server-machines")
        self.assertEqual(res_machines.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_machines.data), 0)
