"""Ambient controls stay independent of frame delivery and screen brightness."""

import asyncio
import io
import json
import unittest
from unittest.mock import AsyncMock, patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from ambient_light import artwork_bounds, control_state, metadata
from codec import encode_presto_frame, encode_presto_frame_with_palette
from PIL import Image
from presto_transport import PrestoTransport
from worker import poll_controls

CONTROLS = {"isOn": True, "brightness": 5, "mode": "album-glow", "demo": False}


class AmbientLightTests(unittest.TestCase):
    def test_rejects_unbounded_or_malformed_device_controls(self):
        for changed in (
            {"brightness": True},
            {"brightness": 101},
            {"brightness": -1},
            {"isOn": "ON"},
            {"demo": 1},
            {"mode": "other"},
            {"mode": {}},
        ):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                control_state({**CONTROLS, **changed})

    def test_unavailable_metadata_does_not_invent_music_or_meetings(self):
        data = metadata({"progress": float("nan"), "durationSeconds": True, "weather": "bad"})
        self.assertEqual(data["progress"], 0)
        self.assertIsNone(data["duration_seconds"])
        self.assertIsNone(data["seconds_until_event"])
        self.assertFalse(data["is_playing"])
        self.assertEqual(data["weather"], "unknown")
        self.assertEqual(metadata({"weather": "lightning-rainy"})["weather"], "storm")
        self.assertEqual(metadata({"secondsUntilEvent": 0})["seconds_until_event"], 0)

    def test_artwork_palette_does_not_change_pixels_or_pick_the_screen_background(self):
        image = Image.new("RGB", (480, 480), (0, 0, 255))
        image.paste((255, 0, 0), (100, 100, 380, 380))
        source = io.BytesIO()
        image.save(source, format="PNG")
        targets = [
            {"identity": "now-playing-artwork", "x": 100, "y": 100, "width": 280, "height": 280}
        ]
        payload, colors = encode_presto_frame_with_palette(
            source.getvalue(), artwork_bounds(targets)
        )
        self.assertEqual(payload, encode_presto_frame(source.getvalue()))
        self.assertEqual(colors, [[255, 0, 0]] * 7)


class AmbientTransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = PrestoTransport({"mac": "020000000001"}, "a" * 32)
        application = web.Application(middlewares=[self.transport.authenticate])
        application.router.add_get("/frame", self.transport.get_frame)
        application.router.add_post("/control-ack", self.transport.acknowledge_controls)
        self.client = TestClient(TestServer(application))
        await self.client.start_server()
        self.headers = {
            "Authorization": "Bearer " + "a" * 32,
            "X-CastKit-Device": "020000000001",
            "X-CastKit-Boot": "ambient-test",
        }

    async def asyncTearDown(self):
        await self.client.close()

    async def test_control_changes_wake_idle_receiver_and_ack_once_without_a_frame(self):
        self.transport.set_backlight(2)
        waiting = asyncio.create_task(self.client.get("/frame", headers=self.headers))
        await asyncio.sleep(0.02)
        self.transport.set_ambient_light(CONTROLS)
        response = await asyncio.wait_for(waiting, timeout=0.5)
        self.assertEqual(response.status, 204)
        self.assertEqual(response.headers["X-CastKit-Ambient-Ack"], "1")
        ambient = json.loads(response.headers["X-CastKit-Ambient"])
        self.assertTrue(ambient["on"])
        self.assertEqual(ambient["brightness"], 5)
        response = await self.client.post(
            "/control-ack",
            headers=self.headers,
            json={"backlight_percent": 2, "ambient_light": control_state(CONTROLS)},
        )
        self.assertEqual(response.status, 204)
        self.assertNotIn("X-CastKit-Ambient-Ack", self.transport.control_headers())
        self.transport.set_ambient_light(CONTROLS, {"progress": 0.5, "weather": "rainy"})
        self.transport.set_ambient_palette([[255, 0, 0]] * 7)
        self.assertNotIn("X-CastKit-Ambient-Ack", self.transport.control_headers())
        self.assertEqual(self.transport.backlight_percent, 2)
        self.transport.set_ambient_light({**CONTROLS, "isOn": False})
        self.assertEqual(self.transport.control_headers()["X-CastKit-Ambient-Ack"], "1")

    async def test_invalid_ambient_ack_does_not_commit_a_partial_backlight_ack(self):
        response = await self.client.post(
            "/control-ack",
            headers=self.headers,
            json={"backlight_percent": 2, "ambient_light": {**control_state(CONTROLS), "mode": {}}},
        )
        self.assertEqual(response.status, 400)
        self.assertIsNone(self.transport.reported_backlight_percent)

    async def test_polling_accepts_ambient_only_and_legacy_backlight_controls(self):
        for document in ({"ambientLight": CONTROLS}, {"backlight_percent": 2}):
            with self.subTest(document=document):
                stop = asyncio.Event()
                response = AsyncMock()
                response.url = "https://display.example/d/unit/controls.json"
                response.ok = True

                async def read(stop=stop, document=document):
                    stop.set()
                    return document

                response.json.side_effect = read
                context = AsyncMock()
                context.request.get.return_value = response
                with patch("worker.asyncio.sleep", new=AsyncMock()):
                    await poll_controls(
                        context,
                        {
                            "manifest_url": "https://display.example/d/unit/castkit.json",
                            "controls_url": response.url,
                        },
                        self.transport,
                        stop,
                    )
                self.assertEqual(
                    self.transport.ambient_light,
                    control_state(CONTROLS) if "ambientLight" in document else None,
                )
