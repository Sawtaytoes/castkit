"""Physical frame acknowledgements, reboot handling and bounded input over HTTP."""

import asyncio
import unittest

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from presto_transport import PrestoTransport


class PrestoTransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = PrestoTransport({"mac": "02:00:00:00:00:01"}, "a" * 32)
        application = web.Application(middlewares=[self.transport.authenticate])
        application.router.add_get("/frame", self.transport.get_frame)
        application.router.add_post("/ack", self.transport.acknowledge)
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

    async def test_frame_is_not_complete_until_matching_physical_ack(self):
        sending = asyncio.create_task(self.transport.send_frame(42, 5, b"png-fixture"))
        await asyncio.sleep(0)
        denied = await self.client.get("/frame")
        self.assertEqual(denied.status, 403)
        wrong_device = await self.client.get(
            "/frame", headers={**self.headers, "X-CastKit-Device": "020000000002"}
        )
        self.assertEqual(wrong_device.status, 403)
        response = await self.client.get("/frame", headers=self.headers)
        self.assertEqual(await response.read(), b"png-fixture")
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
        sending = asyncio.create_task(self.transport.send_frame(43, 2, b"png-fixture"))
        await asyncio.sleep(0)
        response = await self.client.get(
            "/frame", headers={**self.headers, "X-CastKit-Boot": "second-boot"}
        )
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


if __name__ == "__main__":
    unittest.main()
