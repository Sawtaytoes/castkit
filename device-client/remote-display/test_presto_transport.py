"""Physical frame acknowledgements, reboot handling and bounded input over HTTP."""

import asyncio
import unittest
import zlib

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from presto_transport import PrestoTransport


class PrestoTransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = PrestoTransport({"mac": "02:00:00:00:00:01"}, "a" * 32)
        application = web.Application(middlewares=[self.transport.authenticate])
        application.router.add_get("/frame", self.transport.get_frame)
        application.router.add_post("/ack", self.transport.acknowledge)
        application.router.add_post("/control-ack", self.transport.acknowledge_controls)
        application.router.add_post("/touch", self.transport.receive_touch)
        self.client = TestClient(TestServer(application))
        await self.client.start_server()
        self.headers = {
            "Authorization": "Bearer " + "a" * 32,
            "X-CastKit-Device": "020000000001",
            "X-CastKit-Boot": "first-boot",
        }
        self.events = []
        self.transport.subscribe_states(lambda event: self.events.append(event.state))

    async def asyncTearDown(self):
        await self.client.close()

    async def test_backlight_changes_arrive_without_a_new_frame_and_require_physical_ack(self):
        waiting = asyncio.create_task(self.client.get("/frame", headers=self.headers))
        await asyncio.sleep(0.02)
        self.transport.set_backlight(35)
        response = await asyncio.wait_for(waiting, timeout=0.5)
        self.assertEqual(response.status, 204)
        self.assertEqual(response.headers["X-CastKit-Backlight"], "35")
        self.assertIsNone(self.transport.reported_backlight_percent)
        response = await self.client.post(
            "/control-ack", headers=self.headers, json={"backlight_percent": 35}
        )
        self.assertEqual(response.status, 204)
        self.assertEqual(self.transport.reported_backlight_percent, 35)
        response = await self.client.post(
            "/control-ack", headers=self.headers, json={"backlight_percent": 101}
        )
        self.assertEqual(response.status, 400)
        self.transport.set_backlight(0)
        self.assertEqual(self.transport.control_headers()["X-CastKit-Backlight"], "0")

    async def test_frame_is_not_complete_until_matching_physical_ack(self):
        sending = asyncio.create_task(
            self.transport.send_frame(42, 5, zlib.compress(bytes(480 * 480 * 2)))
        )
        while self.transport.frame is None:
            await asyncio.sleep(0.001)
        denied = await self.client.get("/frame")
        self.assertEqual(denied.status, 403)
        wrong_device = await self.client.get(
            "/frame", headers={**self.headers, "X-CastKit-Device": "020000000002"}
        )
        self.assertEqual(wrong_device.status, 403)
        response = await self.client.get("/frame", headers=self.headers)
        self.assertEqual(zlib.decompress(await response.read()), bytes(480 * 480 * 2))
        self.assertEqual(response.headers["X-CastKit-Frame"], "42")
        self.assertFalse(sending.done())
        unchanged = await self.client.get("/frame?after=42", headers=self.headers)
        self.assertEqual(unchanged.status, 204)
        ack = {"frame_id": 41, "touch_id": 5, "decode_us": 200, "draw_us": 100}
        wrong_ack = await self.client.post("/ack", headers=self.headers, json=ack)
        self.assertEqual(wrong_ack.status, 409)
        self.assertFalse(sending.done())
        response = await self.client.post(
            "/ack", headers=self.headers, json={**ack, "frame_id": 42}
        )
        self.assertEqual(response.status, 204)
        self.assertEqual((await sending)[1:3], ["42", "5"])
        self.assertEqual(self.transport.frames_drawn, 1)

    async def test_input_validation_is_atomic_and_reboot_cancels_pending_frame(self):
        response = await self.client.post(
            "/touch", headers=self.headers, json=[[1, 0, 10, 470, 42], [2, 2, 480, 470, 42]]
        )
        self.assertEqual(response.status, 400)
        self.assertEqual(self.events, [])
        response = await self.client.post(
            "/touch", headers=self.headers, json=[[1, 0, 10, 470, 42], [2, 2, 10, 470, 42]]
        )
        self.assertEqual(response.status, 204)
        self.assertEqual(self.events[-1], "touch,2,2,10,470,0,42,0")
        malformed = await self.client.post("/touch", headers=self.headers, data="not json")
        self.assertEqual(malformed.status, 400)
        sending = asyncio.create_task(
            self.transport.send_frame(43, 2, zlib.compress(bytes(480 * 480 * 2)))
        )
        while self.transport.frame is None:
            await asyncio.sleep(0.001)
        self.transport.reported_backlight_percent = 35
        response = await self.client.get(
            "/frame", headers={**self.headers, "X-CastKit-Boot": "second-boot"}
        )
        self.assertIsNone(self.transport.reported_backlight_percent)
        self.assertEqual(response.status, 204)
        with self.assertRaises(ConnectionError):
            await sending
        self.assertEqual(self.events[-1], "error,device-restarted")

    async def test_expired_frames_and_oversized_batches_are_rejected(self):
        self.transport.frame = {"id": 42, "touch_id": 0, "png": b"fixture", "created": 0}
        response = await self.client.get("/frame", headers=self.headers)
        self.assertEqual(response.status, 204)
        response = await self.client.post(
            "/ack",
            headers=self.headers,
            json={"frame_id": 42, "touch_id": 0, "decode_us": 0, "draw_us": 0},
        )
        self.assertEqual(response.status, 409)
        response = await self.client.post(
            "/touch", headers=self.headers, json=[[1, 0, 10, 10, 42]] * 65
        )
        self.assertEqual(response.status, 400)

    async def test_patch_uses_only_acknowledged_base_and_missed_base_gets_full(self):
        headers = {**self.headers, "X-CastKit-Accept": "rgb565-patch-v1"}
        raw = bytes(480 * 480 * 2)
        sending = asyncio.create_task(self.transport.send_frame(10, 0, zlib.compress(raw)))
        while self.transport.frame is None:
            await asyncio.sleep(0.001)
        first = await self.client.get("/frame?after=0", headers=headers)
        self.assertEqual(first.headers["X-CastKit-Rect"], "0,0,480,480")
        self.assertEqual(self.transport.base_id, 0)
        await self.client.post(
            "/ack",
            headers=headers,
            json={"frame_id": 10, "touch_id": 0, "decode_us": 10, "draw_us": 10},
        )
        await sending
        changed = bytearray(raw)
        changed[(479 * 480 + 478) * 2 : (479 * 480 + 478) * 2 + 4] = bytes.fromhex("f80007e0")
        sending = asyncio.create_task(self.transport.send_frame(11, 1, zlib.compress(changed)))
        while self.transport.frame["id"] != 11:
            await asyncio.sleep(0.001)
        response = await self.client.get("/frame?after=10", headers=headers)
        self.assertEqual(response.headers["X-CastKit-Rect"], "478,479,2,1")
        self.assertEqual(response.headers["X-CastKit-Base-Frame"], "10")
        self.assertEqual(await response.read(), bytes.fromhex("0100f80007e0"))
        response = await self.client.get("/frame?after=0", headers=headers)
        self.assertEqual(response.headers["X-CastKit-Rect"], "0,0,480,480")
        self.assertEqual(response.headers["X-CastKit-Base-Frame"], "0")
        self.assertEqual(self.transport.base_id, 10)
        await self.client.post(
            "/ack",
            headers=headers,
            json={"frame_id": 11, "touch_id": 1, "decode_us": 10, "draw_us": 10},
        )
        await sending
        await self.transport.disconnect()
        self.assertIsNone(self.transport.base_pixels)
        self.assertEqual(self.transport.base_id, 0)

    async def test_long_poll_wakes_when_new_frame_arrives(self):
        waiting = asyncio.create_task(self.client.get("/frame?after=0", headers=self.headers))
        await asyncio.sleep(0.05)
        self.assertFalse(waiting.done())
        sending = asyncio.create_task(self.transport.send_frame(1, 0, zlib.compress(bytes(460800))))
        response = await asyncio.wait_for(waiting, timeout=0.5)
        self.assertEqual(response.headers["X-CastKit-Frame"], "1")
        await self.client.post(
            "/ack",
            headers=self.headers,
            json={"frame_id": 1, "touch_id": 0, "decode_us": 10, "draw_us": 10},
        )
        await sending


if __name__ == "__main__":
    unittest.main()
