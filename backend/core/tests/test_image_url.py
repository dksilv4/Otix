from django.test import SimpleTestCase

from core.image_url import clean_image_url


class CleanImageUrlTests(SimpleTestCase):
    def test_empty_or_none(self):
        self.assertIsNone(clean_image_url(None))
        self.assertEqual(clean_image_url(""), "")
        self.assertIsNone(clean_image_url("   "))

    def test_normalizes_http_otix_app_uploads_to_root_relative(self):
        url = "http://otix.app/uploads/c58230d426e24fc3947df07347c19d4c.webp"
        self.assertEqual(clean_image_url(url), "/uploads/c58230d426e24fc3947df07347c19d4c.webp")

    def test_normalizes_https_otix_app_uploads_to_root_relative(self):
        url = "https://otix.app/uploads/c58230d426e24fc3947df07347c19d4c.webp"
        self.assertEqual(clean_image_url(url), "/uploads/c58230d426e24fc3947df07347c19d4c.webp")

    def test_normalizes_internal_docker_uploads_to_root_relative(self):
        url = "http://api:8000/uploads/c58230d426e24fc3947df07347c19d4c.webp"
        self.assertEqual(clean_image_url(url), "/uploads/c58230d426e24fc3947df07347c19d4c.webp")

    def test_normalizes_api_v1_uploads_to_root_relative(self):
        url = "https://otix.app/api/v1/uploads/c58230d426e24fc3947df07347c19d4c.webp"
        self.assertEqual(clean_image_url(url), "/uploads/c58230d426e24fc3947df07347c19d4c.webp")

    def test_preserves_root_relative_uploads(self):
        url = "/uploads/c58230d426e24fc3947df07347c19d4c.webp"
        self.assertEqual(clean_image_url(url), "/uploads/c58230d426e24fc3947df07347c19d4c.webp")

    def test_preserves_localhost_uploads_in_dev_and_tests(self):
        url = "http://localhost:8000/uploads/c58230d426e24fc3947df07347c19d4c.webp"
        self.assertEqual(clean_image_url(url), "http://localhost:8000/uploads/c58230d426e24fc3947df07347c19d4c.webp")

    def test_upgrades_otix_app_http_to_https(self):
        url = "http://otix.app/assets/banner.png"
        self.assertEqual(clean_image_url(url), "https://otix.app/assets/banner.png")

    def test_upgrades_known_cdns_to_https(self):
        self.assertEqual(
            clean_image_url("http://avatars.steamstatic.com/abcdef.jpg"),
            "https://avatars.steamstatic.com/abcdef.jpg",
        )
        self.assertEqual(
            clean_image_url("http://image.tmdb.org/t/p/w500/xyz.jpg"),
            "https://image.tmdb.org/t/p/w500/xyz.jpg",
        )
        self.assertEqual(
            clean_image_url("http://images.igdb.com/igdb/image/upload/t_original/123.jpg"),
            "https://images.igdb.com/igdb/image/upload/t_original/123.jpg",
        )
        self.assertEqual(
            clean_image_url("http://lh3.googleusercontent.com/a/photo.jpg"),
            "https://lh3.googleusercontent.com/a/photo.jpg",
        )

    def test_preserves_unrelated_http_url(self):
        url = "http://192.168.1.100:8080/image.png"
        self.assertEqual(clean_image_url(url), "http://192.168.1.100:8080/image.png")
