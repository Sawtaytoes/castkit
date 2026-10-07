"""Input captured during a delayed physical-frame ACK stays behind its frame fence."""

import asyncio
import importlib.util
import pathlib
import sys
import types
import unittest
from unittest.mock import AsyncMock, Mock, patch


def load_firmware():
    path = pathlib.Path(__file__).parent.parent / "presto" / "main.py"
    specification = importlib.util.spec_from_file_location("presto_firmware_test", path)
    module = importlib.util.module_from_spec(specification)
    ambient_specification = importlib.util.spec_from_file_location(
        "ambient", path.parent / "ambient.py"
    )
    ambient = importlib.util.module_from_spec(ambient_specification)
    ambient_specification.loader.exec_module(ambient)
    with patch.dict(
        sys.modules,
        {
            "ambient": ambient,
            "deflate": types.SimpleNamespace(),
            "network": types.SimpleNamespace(),
            "pixels": types.SimpleNamespace(blit_patch=Mock(), decode_rle=Mock()),
            "presto": types.SimpleNamespace(Presto=Mock()),
        },
    ):
        specification.loader.exec_module(module)
    return module


class PrestoFirmwareTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.module = load_firmware()
        self.module.time = types.SimpleNamespace(
            ticks_ms=lambda: 1000,
            ticks_us=lambda: 1000000,
            ticks_diff=lambda end, start: end - start,
        )
        self.module.asyncio = types.SimpleNamespace(
            wait_for=asyncio.wait_for, sleep_ms=self.sleep_ms
        )
        self.module.gc = types.SimpleNamespace(mem_free=lambda: 1024, collect=lambda: None)
        self.contact = types.SimpleNamespace(touched=False, x=20, y=40)
        self.client = object.__new__(self.module.CastKitPresto)
        self.client.screen = types.SimpleNamespace(
            wifi=types.SimpleNamespace(isconnected=lambda: True),
            update=Mock(),
            touch_poll=Mock(),
            touch_a=self.contact,
        )
        self.client.ambient_light = Mock()
        self.client.frame_id = 7
        self.client.last_frame_at = 1000
        self.client.is_presenting = False
        self.client.is_frame_ack_pending = False
        self.client.backlight_percent = 35
        self.client.events = []
        self.client.sequence = 0
        self.client.is_touched = False
        self.client.last_position = (0, 0)
        self.client.has_connection_notice = False
        self.client.frames_drawn = 0
        self.client.apply_controls = AsyncMock()
        self.client.decode_frame = Mock()
        self.client.request = self.request
        self.ack_started = asyncio.Event()
        self.release_ack = asyncio.Event()
        self.recovering = asyncio.Event()
        self.second_frame = asyncio.Event()
        self.stop_requests = asyncio.Event()
        self.ack_status = 204
        self.get_paths = []
        self.sent_batches = []
        self.tasks = []

    async def asyncTearDown(self):
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)

    async def sleep_ms(self, duration):
        if duration >= 1000:
            self.recovering.set()
            await self.stop_requests.wait()
        else:
            await asyncio.sleep(0.001)

    async def request(self, method, path, body=None):
        if method == "GET":
            self.get_paths.append(path)
            if len(self.get_paths) > 1:
                self.second_frame.set()
                await self.stop_requests.wait()
            return (
                200,
                {"x-castkit-frame": "42", "x-castkit-touch": "0", "_body_read_us": 12345},
                b"pixels",
            )
        if path == "/ack":
            self.ack_document = body
            self.ack_started.set()
            await self.release_ack.wait()
            return self.ack_status, {}, b""
        if path == "/touch":
            self.sent_batches.append(body)
            return 204, {}, b""
        raise AssertionError(path)

    async def until(self, predicate):
        async def poll():
            while not predicate():
                await asyncio.sleep(0.001)

        await asyncio.wait_for(poll(), 1)

    async def begin(self):
        self.tasks.append(asyncio.create_task(self.client.fetch_frames()))
        await asyncio.wait_for(self.ack_started.wait(), 1)
        self.assertEqual(self.client.frame_id, 42)
        self.client.screen.update.assert_called_once()
        self.assertFalse(self.client.is_presenting)
        self.assertTrue(self.client.is_frame_ack_pending)
        self.tasks.extend(
            [
                asyncio.create_task(self.client.poll_touch()),
                asyncio.create_task(self.client.send_touches()),
            ]
        )

    async def test_short_drag_is_sampled_during_ack_and_sent_only_after_it_succeeds(self):
        await self.begin()
        self.contact.touched = True
        await self.until(lambda: len(self.client.events) == 1)
        self.contact.x = 140
        await self.until(lambda: len(self.client.events) == 2)
        self.contact.touched = False
        await self.until(lambda: len(self.client.events) == 3)
        self.assertEqual(self.sent_batches, [])
        self.assertEqual(
            self.client.events,
            [[1, 0, 20, 40, 42], [2, 1, 140, 40, 42], [3, 2, 140, 40, 42]],
        )
        self.assertEqual(self.ack_document["body_read_us"], 12345)
        self.release_ack.set()
        await self.until(lambda: len(self.sent_batches) == 1)
        self.assertEqual(
            self.sent_batches,
            [[[1, 0, 20, 40, 42], [2, 1, 140, 40, 42], [3, 2, 140, 40, 42]]],
        )
        self.assertFalse(self.client.is_frame_ack_pending)

    async def test_rejected_ack_discards_its_queued_contact_without_replay(self):
        await self.begin()
        self.contact.touched = True
        await self.until(lambda: len(self.client.events) == 1)
        self.ack_status = 409
        self.release_ack.set()
        await asyncio.wait_for(self.recovering.wait(), 1)
        self.assertEqual(self.client.frame_id, 0)
        self.assertEqual(self.client.events, [])
        self.assertEqual(self.sent_batches, [])
        self.assertFalse(self.client.is_touched)

    async def test_queue_overflow_keeps_recovery_required_after_ack_succeeds(self):
        await self.begin()
        self.client.events = [[index, 1, 20, 40, 42] for index in range(1, 65)]
        self.contact.touched = True
        await self.until(lambda: self.client.frame_id == 0)
        self.assertEqual(self.client.events, [])
        self.assertEqual(self.sent_batches, [])
        self.release_ack.set()
        await asyncio.wait_for(self.second_frame.wait(), 1)
        self.assertEqual(self.get_paths, ["/frame?after=7", "/frame?after=0"])
        self.assertEqual(self.sent_batches, [])


if __name__ == "__main__":
    unittest.main()
