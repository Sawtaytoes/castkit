"""Native transport commits frame bases and controls only after device acknowledgements."""

import asyncio
import base64
import struct
import types
import unittest
import zlib
from unittest.mock import AsyncMock

from aioesphomeapi import TextSensorState
from esphome_presto import ESPHomePrestoTransport


class NativePrestoTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = ESPHomePrestoTransport(
            {"mac": "02:00:00:00:00:01", "host": "127.0.0.1", "controls_url": "unused"},
            base64.b64encode(bytes(32)).decode(),
        )
        self.transport.api = types.SimpleNamespace(execute_service=AsyncMock())
        self.transport.event_key = 7
        self.transport.actions = {"frame_chunk": "frame", "set_display_controls": "controls"}
        self.transport.control_task = asyncio.create_task(asyncio.sleep(3600))

    async def asyncTearDown(self):
        self.transport.control_task.cancel()
        await asyncio.gather(self.transport.control_task, return_exceptions=True)

    def event(self, value):
        self.transport.native_state(TextSensorState(key=7, state=value))

    async def wait_calls(self, count):
        async with asyncio.timeout(3):
            while self.transport.api.execute_service.await_count < count:
                await asyncio.sleep(0.001)

    async def test_full_frame_stays_uncommitted_until_matching_physical_ack(self):
        raw = b"\x12\x34\x56\x78" * (480 * 480 // 2)
        sending = asyncio.create_task(self.transport.send_frame(42, 5, raw))
        await self.wait_calls(1)
        self.assertEqual(self.transport.base_id, 0)
        self.event("frame,41,5,0,0,10,20")
        self.event("frame,42,4,0,0,10,20")
        self.assertFalse(sending.done())
        self.event("frame,42,5,0,0,10,20")
        await sending
        calls = self.transport.api.execute_service.call_args_list
        encoded = "".join(call.args[1]["image_data"] for call in calls)
        packet = base64.b64decode(encoded)
        self.assertEqual(struct.unpack(">IHHHHB", packet[:13]), (0, 0, 0, 480, 480, 0))
        self.assertEqual(zlib.decompress(packet[13:]), raw)
        self.assertEqual(self.transport.base_pixels, raw)
        self.assertEqual(self.transport.frames_drawn, 1)
        self.assertTrue(calls[-1].args[1]["final_chunk"])
        self.assertTrue(all(not c.args[1]["final_chunk"] for c in calls[:-1]))

    async def test_rejected_patch_clears_base_and_next_frame_is_full(self):
        raw = bytes(480 * 480 * 2)
        self.transport.base_id, self.transport.base_pixels = 12, raw
        sending = asyncio.create_task(self.transport.send_frame(13, 0, raw))
        await self.wait_calls(1)
        self.event("error,invalid_packet_or_base")
        with self.assertRaisesRegex(ValueError, "rejected"):
            await sending
        self.assertEqual(self.transport.base_id, 0)
        self.assertIsNone(self.transport.base_pixels)
        self.transport.api.execute_service.reset_mock()
        retry = asyncio.create_task(self.transport.send_frame(14, 0, raw))
        await self.wait_calls(1)
        packet = base64.b64decode(
            self.transport.api.execute_service.call_args.args[1]["image_data"]
        )
        self.assertEqual(struct.unpack(">IHHHHB", packet[:13])[0:5], (0, 0, 0, 480, 480))
        self.event("frame,14,0,0,0,1,2")
        await retry

    async def test_controls_require_matching_revision_and_applied_brightness(self):
        self.transport.control_task.cancel()
        await asyncio.gather(self.transport.control_task, return_exceptions=True)
        self.transport.set_backlight(2)
        self.transport.control_task = asyncio.create_task(self.transport.controls_loop())
        await self.wait_calls(1)
        revision = self.transport.api.execute_service.call_args.args[1]["revision"]
        self.event(f"controls,{revision - 1},2")
        self.event(f"controls,{revision},3")
        self.assertIsNone(self.transport.reported_backlight_percent)
        self.event(f"controls,{revision},2")
        await asyncio.sleep(0.01)
        self.assertEqual(self.transport.reported_backlight_percent, 2)
        self.assertEqual(self.transport.api.execute_service.await_count, 1)

    async def test_malformed_and_unpresented_touches_are_ignored(self):
        received = []
        self.transport.subscribe_states(lambda event: received.append(event.state))
        for value in ["touch,1,0,480,20,0,42,0", "touch,1,0,20,20,0,0,0", "touch,x,0,20,20,0,42,0"]:
            self.event(value)
        self.assertEqual(received, [])
        self.event("touch,1,0,20,20,0,42,0")
        self.assertEqual(len(received), 1)

    async def test_wrong_mac_is_rejected_before_actions_or_subscriptions(self):
        self.transport.api = types.SimpleNamespace(
            connect=AsyncMock(),
            disconnect=AsyncMock(),
            device_info=AsyncMock(
                return_value=types.SimpleNamespace(mac_address="02:00:00:00:00:02")
            ),
        )
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            await self.transport.connect()
        self.transport.api.disconnect.assert_awaited_once()
