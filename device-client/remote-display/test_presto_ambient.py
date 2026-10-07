"""Hardware LED output and control ACKs stay independent of streamed LCD frames."""

import importlib.util
import json
import pathlib
import types
import unittest
from unittest.mock import AsyncMock, Mock

from test_presto_firmware import load_firmware


def header(**changes):
    return json.dumps(
        {
            "on": True,
            "brightness": 5,
            "mode": "album-glow",
            "colors": [[255, 100, 40]] * 7,
            "progress": 0.25,
            "seconds_until_event": None,
            "weather": "",
            "is_playing": False,
            "duration_seconds": None,
            "demo": False,
            **changes,
        }
    )


def controller():
    path = pathlib.Path(__file__).parent.parent / "presto" / "ambient.py"
    specification = importlib.util.spec_from_file_location("ambient_test", path)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    clock = {"milliseconds": 0}
    module.time = types.SimpleNamespace(
        ticks_ms=lambda: clock["milliseconds"], ticks_diff=lambda end, start: end - start
    )
    screen = types.SimpleNamespace(set_led_rgb=Mock(), update=Mock(), set_backlight=Mock())
    return module.AmbientLight(screen), screen, clock


class AmbientModeTests(unittest.TestCase):
    def setUp(self):
        self.lights, self.screen, self.clock = controller()

    def test_startup_missing_header_and_explicit_off_leave_all_seven_leds_black(self):
        self.assertEqual(
            self.lights.control_state(),
            {"on": False, "brightness": 5, "mode": "album-glow", "demo": False},
        )
        self.assertEqual(self.screen.set_led_rgb.call_count, 7)
        self.lights.apply_header(header())
        self.assertEqual(list(self.lights.output[:3]), [12, 5, 2])
        self.lights.apply_header(header(on=False))
        self.clock["milliseconds"] = 2000
        self.lights.tick()
        self.assertEqual(self.lights.output, bytes(21))
        self.lights.apply_header(header())
        self.lights.apply_header(None)
        self.assertFalse(self.lights.is_on)
        self.assertEqual(self.lights.output, bytes(21))
        self.screen.update.assert_not_called()
        self.screen.set_backlight.assert_not_called()

    def test_invalid_json_numbers_color_bounds_and_types_turn_lights_off(self):
        invalid = [
            "not json",
            "[]",
            "x" * 2049,
            header(on=1),
            header(brightness=True),
            header(brightness=-1),
            header(brightness=101),
            header(mode="unknown"),
            header(demo="true"),
            header(is_playing=1),
            header(progress=-0.1),
            header(progress=1.1),
            header(progress=float("nan")),
            header(seconds_until_event=float("inf")),
            header(duration_seconds=-1),
            header(colors=[[256, 0, 0]] * 7),
            header(colors=[[False, 0, 0]] * 7),
            header(colors=[[0, 0, 0]] * 6),
            header(colors=[[0, 0]] * 7),
        ]
        for encoded in invalid:
            with self.subTest(encoded=encoded[:100]):
                self.lights.apply_header(header())
                self.lights.apply_header(encoded)
                self.assertFalse(self.lights.is_on)
                self.assertEqual(self.lights.output, bytes(21))

    def test_swipe_feedback_runs_locally_and_retreat_cancels_before_release(self):
        self.lights.apply_header(header(mode="swipe-comet"))
        self.lights.touch_event(0, 300, 200)
        self.lights.touch_event(1, 140, 200)
        self.clock["milliseconds"] = 50
        self.lights.tick()
        self.assertGreater(sum(self.lights.output), 0)
        self.lights.touch_event(1, 300, 200)
        self.lights.tick()
        self.assertEqual(self.lights.output, bytes(21))
        self.lights.touch_event(2, 300, 200)
        self.clock["milliseconds"] = 200
        self.lights.tick()
        self.assertEqual(self.lights.output, bytes(21))
        self.lights.touch_event(0, 10, 10)
        self.lights.touch_event(1, 140, 10)
        self.lights.touch_event(2, 140, 10)
        self.clock["milliseconds"] += 100
        self.lights.tick()
        self.assertGreater(sum(self.lights.output), 0)
        self.clock["milliseconds"] += 450
        self.lights.tick()
        self.assertEqual(self.lights.output, bytes(21))

    def test_progress_advances_locally_but_repeated_headers_do_not_reset_its_clock(self):
        encoded = header(
            mode="progress-bar", brightness=100, progress=0, duration_seconds=10, is_playing=True
        )
        self.lights.apply_header(encoded)
        self.clock["milliseconds"] = 5000
        self.lights.apply_header(encoded)
        self.assertEqual(list(self.lights.output[:9]), [40, 210, 170] * 3)
        self.assertEqual(list(self.lights.output[9:12]), [20, 105, 85])
        self.assertEqual(self.lights.output[12:], bytes(9))
        self.lights.apply_header(
            header(
                mode="progress-bar",
                brightness=100,
                progress=0.5,
                is_playing=False,
                duration_seconds=10,
            )
        )
        self.clock["milliseconds"] += 3000
        self.lights.tick()
        self.assertEqual(list(self.lights.output[9:12]), [20, 105, 85])

    def test_real_meeting_uses_metadata_and_expires_without_inventing_an_event(self):
        self.lights.apply_header(header(mode="meeting-fuse"))
        self.assertEqual(self.lights.output, bytes(21))
        self.lights.apply_header(
            header(mode="meeting-fuse", seconds_until_event=300, brightness=100)
        )
        self.assertEqual(list(self.lights.output[:3]), [40, 210, 160])
        self.clock["milliseconds"] = 240000
        self.lights.tick()
        self.assertEqual(list(self.lights.output[:3]), [255, 140, 20])
        self.assertEqual(self.lights.output[6:], bytes(15))
        self.clock["milliseconds"] = 331000
        self.lights.tick()
        self.assertEqual(self.lights.output, bytes(21))

    def test_all_five_demos_light_without_live_data_and_reuse_pixel_buffers(self):
        identities = (
            id(self.lights.output),
            id(self.lights.previous_output),
            id(self.lights.colors),
        )
        for mode in ("album-glow", "swipe-comet", "meeting-fuse", "weather-aura", "progress-bar"):
            with self.subTest(mode=mode):
                self.lights.apply_header(
                    header(
                        mode=mode,
                        demo=True,
                        colors=[[0, 0, 0]] * 7,
                        weather="unknown",
                        seconds_until_event=36000,
                    )
                )
                self.clock["milliseconds"] += 500
                self.lights.tick()
                self.assertGreater(sum(self.lights.output), 0)
                self.assertEqual(
                    identities,
                    (
                        id(self.lights.output),
                        id(self.lights.previous_output),
                        id(self.lights.colors),
                    ),
                )
                self.assertTrue(self.lights.control_state()["demo"])
        self.screen.update.assert_not_called()

    def test_weather_unknown_stays_off_and_brightness_scales_every_channel(self):
        self.lights.apply_header(header(mode="weather-aura", weather="unavailable"))
        self.assertEqual(self.lights.output, bytes(21))
        self.lights.apply_header(header(mode="weather-aura", weather="sunny", brightness=5))
        self.assertGreater(sum(self.lights.output), 0)
        self.assertLessEqual(max(self.lights.output), 12)

    def test_worker_weather_categories_and_real_black_palette_remain_honest(self):
        for weather in ("clear", "rain", "storm", "snow", "cloudy"):
            with self.subTest(weather=weather):
                self.lights.apply_header(header(mode="weather-aura", weather=weather))
                self.assertGreater(sum(self.lights.output), 0)
        self.lights.apply_header(header(colors=[[0, 0, 0]] * 7))
        self.assertEqual(self.lights.output, bytes(21))
        self.lights.apply_header(header(mode="weather-aura", weather="storm", brightness=100))
        peak = sum(self.lights.output)
        self.clock["milliseconds"] = 500
        self.lights.tick()
        self.assertLess(sum(self.lights.output), peak)

    def test_unrelated_metadata_does_not_restart_countdown_or_progress(self):
        self.lights.apply_header(
            header(mode="meeting-fuse", seconds_until_event=300, brightness=100)
        )
        self.clock["milliseconds"] = 240000
        self.lights.apply_header(
            header(mode="meeting-fuse", seconds_until_event=300, brightness=100, progress=0.5)
        )
        self.assertEqual(list(self.lights.output[:3]), [255, 140, 20])
        self.lights.apply_header(
            header(mode="progress-bar", progress=0, duration_seconds=10, is_playing=True)
        )
        self.clock["milliseconds"] += 5000
        self.lights.apply_header(
            header(
                mode="progress-bar",
                progress=0,
                duration_seconds=10,
                is_playing=True,
                seconds_until_event=31622400,
                weather="rain",
            )
        )
        self.assertEqual(list(self.lights.output[9:12]), [1, 5, 4])


class AmbientAckTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        firmware = load_firmware()
        self.client = object.__new__(firmware.CastKitPresto)
        self.lights, self.screen, self.clock = controller()
        self.client.screen = self.screen
        self.client.ambient_light = self.lights
        self.client.backlight_percent = 35
        self.client.request = AsyncMock(return_value=(204, {}, b""))

    async def test_backlight_and_ambient_changes_share_one_ack_and_metadata_does_not_ack(self):
        await self.client.apply_controls(
            {"x-castkit-backlight": "20", "x-castkit-ambient": header()}
        )
        self.client.request.assert_awaited_once_with(
            "POST",
            "/control-ack",
            {
                "backlight_percent": 20,
                "ambient_light": {"on": True, "brightness": 5, "mode": "album-glow", "demo": False},
            },
        )
        await self.client.apply_controls(
            {
                "x-castkit-backlight": "20",
                "x-castkit-ambient": header(
                    progress=0.5, weather="rainy", colors=[[20, 30, 40]] * 7
                ),
            }
        )
        self.assertEqual(self.client.request.await_count, 1)
        await self.client.apply_controls(
            {
                "x-castkit-backlight": "20",
                "x-castkit-ambient": header(progress=0.5),
                "x-castkit-ambient-ack": "1",
            }
        )
        self.assertEqual(self.client.request.await_count, 2)

    async def test_old_worker_missing_ambient_header_turns_off_without_adding_ack(self):
        await self.client.apply_controls(
            {"x-castkit-backlight": "35", "x-castkit-ambient": header()}
        )
        self.client.request.reset_mock()
        await self.client.apply_controls({"x-castkit-backlight": "35"})
        self.assertEqual(self.lights.output, bytes(21))
        self.client.request.assert_not_awaited()
        await self.client.apply_controls({"x-castkit-backlight": "20"})
        self.client.request.assert_awaited_once_with(
            "POST", "/control-ack", {"backlight_percent": 20}
        )


if __name__ == "__main__":
    unittest.main()
