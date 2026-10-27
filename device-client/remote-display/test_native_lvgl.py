"""Read-only native scene navigation and midnight freshness."""

import asyncio
import copy
import json
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from native_lvgl import KidsPointsScene, apply_scene


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

    def test_multibyte_and_control_text_remains_valid_through_navigation(self):
        builder = KidsPointsScene()
        kid = self.data["kids"][0]
        kid["name"] = "É\n\t\x00\x7f" + "é" * 100
        task_name = "読書\n\t" + "📚" * 60
        for task in kid["tasksToday"]:
            task["name"] = task_name
        scenes = [builder.build(self.data, self.now)]
        builder.click("row:0")
        scenes.append(builder.build(self.data, self.now))
        builder.click("row:0")
        scenes.append(builder.build(self.data, self.now))
        for scene in scenes:
            for obj in [scene, *scene["items"]]:
                for key in ("title", "subtitle", "detail", "value"):
                    if key in obj:
                        value = obj[key]
                        self.assertLessEqual(len(value.encode("utf-8")), 100)
                        self.assertFalse(any(ord(char) < 32 or ord(char) == 127 for char in value))
                        self.assertNotIn("\ufffd", value)
        self.assertTrue(scenes[0]["items"][0]["title"].startswith("É    é"))
        self.assertTrue(scenes[2]["items"][0]["title"].startswith("読書  📚"))


class SceneAcknowledgementTests(unittest.IsolatedAsyncioTestCase):
    async def test_normalized_scene_is_transmitted_and_exact_revision_is_acknowledged(self):
        status = {"value": "applied,40,1"}
        builder = KidsPointsScene()
        scene = builder.build(
            {"kids": [{"id": "sample", "name": "é\n" * 80, "pointsToday": 1}]},
            moment("2026-10-27"),
        )
        sent = []

        class API:
            is_connected = True

            def execute_service(self, action, args):
                sent.append(json.loads(args["document"]))
                status["value"] = "applied,40,1"  # A previous revision cannot satisfy this request.
                asyncio.get_running_loop().call_later(
                    0.01, status.update, {"value": "applied,41,1"}
                )

        document_bytes = await apply_scene(API(), object(), scene, 41, status, timeout=0.2)
        self.assertEqual(sent[0]["revision"], 41)
        self.assertEqual(sent[0]["items"][0]["title"], "é " * 33)
        self.assertLessEqual(document_bytes, 6144)

    async def test_firmware_rejection_and_disconnect_are_reported(self):
        scene = KidsPointsScene().build({"kids": []}, moment("2026-10-27"))
        for reply, connected, exception in (
            ("error,invalid_scene", True, ValueError),
            ("", False, TimeoutError),
            ("applied,40,0", True, TimeoutError),
        ):
            status = {"value": ""}

            class API:
                def __init__(self, connected, status, reply):
                    self.is_connected = connected
                    self.status = status
                    self.reply = reply

                def execute_service(self, action, args):
                    self.status["value"] = self.reply

            with self.subTest(reply=reply, connected=connected), self.assertRaises(exception):
                await apply_scene(
                    API(connected, status, reply), object(), scene, 41, status, timeout=0
                )
