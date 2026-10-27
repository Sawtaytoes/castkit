"""Read-only native scene navigation and midnight freshness."""

import copy
import json
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from native_lvgl import KidsPointsScene


def moment(day, hour=1):
    return (
        datetime.fromisoformat(f"{day}T{hour:02}:00:00")
        .replace(tzinfo=ZoneInfo("America/Chicago"))
        .timestamp()
        * 1000
    )


class KidsPointsSceneTests(unittest.TestCase):
    def test_castkit_view_style_changes_geometry_without_changing_navigation(self):
        builder = KidsPointsScene()
        scene = builder.build(
            {"kids": []}, moment("2026-10-27"), {"rowHeight": 96, "accent": "#579CE6"}
        )
        self.assertEqual((scene["rowHeight"], scene["accent"]), (96, "#579CE6"))
        for style in ({"rowHeight": 10000}, {"padding": True}, {"accent": "red"}, {"version": 2}):
            with self.assertRaises(ValueError):
                builder.build({"kids": []}, moment("2026-10-27"), style)

    def setUp(self):
        self.now = moment("2026-10-27")
        self.data = {
            "kids": [
                {
                    "id": "sample-one",
                    "name": "Test First",
                    "pointsToday": 30,
                    "goal": 500,
                    "color": "#6DAE4F",
                    "timeZone": "America/Chicago",
                    "day": "2026-10-27",
                    "tasksToday": [
                        {
                            "id": "a",
                            "name": "Reading",
                            "atMs": self.now - 3000,
                            "points": 10,
                            "minutes": 5,
                        },
                        {"id": "b", "name": "Math", "atMs": self.now - 2000, "points": 5},
                        {
                            "id": "c",
                            "name": "Reading",
                            "atMs": self.now - 1000,
                            "points": 15,
                            "minutes": 5,
                        },
                    ],
                }
            ],
        }

    def test_child_task_and_entry_navigation_preserves_authoritative_totals(self):
        builder = KidsPointsScene()
        original = copy.deepcopy(self.data)
        board = builder.build(self.data, self.now)
        self.assertEqual(board["items"][0]["value"], "30")
        self.assertTrue(builder.click("row:0"))
        summary = builder.build(self.data, self.now)
        self.assertEqual(
            [(i["title"], i["value"]) for i in summary["items"]],
            [("Reading", "+25"), ("Math", "+5")],
        )
        self.assertEqual(summary["value"], "30")
        self.assertTrue(builder.click("row:0"))
        detail = builder.build(self.data, self.now)
        self.assertEqual([i["value"] for i in detail["items"]], ["+15", "+10"])
        self.assertFalse(builder.click("row:0"))  # Entries have no write action.
        self.assertTrue(builder.click("back"))
        builder.build(self.data, self.now)
        self.assertIsNone(builder.task_name)
        self.assertTrue(builder.click("back"))
        self.assertEqual(builder.build(self.data, self.now)["id"], "children")
        self.assertEqual(self.data, original)

    def test_previous_day_and_timestamp_mismatch_never_reappear_as_today(self):
        builder = KidsPointsScene()
        builder.kid_id = "sample-one"
        self.data["kids"][0]["tasksToday"].append(
            {"id": "old", "name": "Yesterday", "atMs": moment("2026-10-26", 23), "points": 99}
        )
        self.assertEqual(len(builder.build(self.data, self.now)["items"]), 2)
        self.data["kids"][0]["day"] = "2026-10-26"
        self.assertEqual(builder.build(self.data, self.now)["items"], [])

    def test_removing_a_selected_child_returns_to_board(self):
        builder = KidsPointsScene()
        builder.kid_id = "removed"
        builder.task_name = "Reading"
        self.assertEqual(builder.build(self.data, self.now)["id"], "children")
        self.assertIsNone(builder.kid_id)
        self.assertIsNone(builder.task_name)

    def test_same_page_has_stable_identity_and_no_firmware_specific_data(self):
        builder = KidsPointsScene()
        builder.kid_id = "sample-one"
        first = builder.build(self.data, self.now)
        self.data["kids"][0]["name"] = "A changed name"
        self.data["kids"][0]["pointsToday"] = 45
        second = builder.build(self.data, self.now + 1000)
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(second["title"], "A changed name")
        self.assertEqual(second["value"], "45")
        self.assertNotIn("sample-one", json.dumps(second))

    def test_large_history_is_refused_instead_of_silently_truncated(self):
        builder = KidsPointsScene()
        builder.kid_id = "sample-one"
        builder.task_name = "Reading"
        task = self.data["kids"][0]["tasksToday"][0]
        self.data["kids"][0]["tasksToday"] = [{**task, "id": str(i)} for i in range(33)]
        with self.assertRaisesRegex(ValueError, "at most 32"):
            builder.build(self.data, self.now)
