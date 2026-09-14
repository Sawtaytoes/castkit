import unittest

from manifest import parse_manifest


class ManifestTests(unittest.TestCase):
    def document(self, **changes):
        return {
            "version": 1,
            "viewport": {"width": 480, "height": 320},
            "page_url": "/panel",
            "cache": [{"id": "loading", "url": "/panel/loading", "on_tap": "[data-loading]"}],
            **changes,
        }

    def test_resolves_app_owned_urls_and_timing(self):
        config = parse_manifest(self.document(), "https://example.com/panel/castkit.json")
        self.assertEqual(config["url"], "https://example.com/panel")
        self.assertEqual(config["cache_url"], "https://example.com/panel/loading")
        self.assertEqual(config["loading_selector"], "[data-loading]")
        self.assertEqual(config["heartbeat_seconds"], 2)

    def test_rejects_cross_origin_urls_unsupported_versions_and_unsafe_limits(self):
        for changes in (
            {"version": 2},
            {"page_url": "https://other.example/"},
            {"page_url": "https://user:password@example.com/"},
            {"viewport": {"width": 800, "height": 480}},
            {"refresh": {"heartbeat_ms": 8000}},
            {"input": {"target_attribute": "onclick"}},
            {"input": {"max_frame_age_ms": 30000}},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                parse_manifest(self.document(**changes), "https://example.com/manifest.json")

    def test_no_cache_is_valid_but_extra_cache_slots_are_not_silently_ignored(self):
        self.assertIsNone(
            parse_manifest(self.document(cache=[]), "https://example.com/manifest.json")[
                "cache_url"
            ]
        )
        entry = self.document()["cache"][0]
        with self.assertRaises(ValueError):
            parse_manifest(self.document(cache=[entry, entry]), "https://example.com/manifest.json")
