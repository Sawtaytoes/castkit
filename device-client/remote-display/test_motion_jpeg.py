"""A frame drawn while a finger moves may travel as JPEG; the next one repairs it."""

import asyncio
import base64
import io
import struct
import types
import unittest
from unittest.mock import AsyncMock

import numpy as np
from aioesphomeapi import TextSensorState
from codec import encode_presto_jpeg, motion_jpeg_rectangle, union_rectangle
from esphome_presto import ESPHomePrestoTransport
from PIL import Image


def picture(seed, band=None, band_seed=None):
    """Synthetic smooth color waves, like artwork: JPEG beats zlib on them.

    `band` (top, bottom) rows are drawn from `band_seed` instead, so only they change.
    """

    def waves(wave_seed):
        rows, columns = np.mgrid[0:480, 0:480].astype(np.float64)
        phase = wave_seed * 0.7
        red = (np.sin(columns / 23 + phase) + 1) * 15.5
        green = (np.sin(rows / 31 + columns / 47 + phase * 2) + 1) * 31.5
        blue = (np.cos(rows / 19 - phase) + 1) * 15.5
        return (
            (red.astype(np.uint16) << 11) | (green.astype(np.uint16) << 5) | blue.astype(np.uint16)
        )

    pixels = waves(seed)
    if band is not None:
        top, bottom = band
        pixels[top:bottom] = waves(band_seed)[top:bottom]
    return pixels.astype(">u2").tobytes()


def header(packet):
    return struct.unpack(">IHHHHB", packet[:13])


class MotionJpegCodecTests(unittest.TestCase):
    def test_a_rectangle_snaps_outward_to_the_block_grid(self):
        self.assertEqual(motion_jpeg_rectangle((5, 17, 30, 20)), (0, 16, 48, 32))
        self.assertEqual(motion_jpeg_rectangle((470, 470, 10, 10)), (464, 464, 16, 16))

    def test_union_covers_both_and_treats_none_as_empty(self):
        self.assertEqual(union_rectangle(None, (1, 2, 3, 4)), (1, 2, 3, 4))
        self.assertEqual(union_rectangle((0, 0, 10, 10), (20, 5, 5, 20)), (0, 0, 25, 25))

    def test_the_jpeg_is_baseline_and_exactly_the_rectangle(self):
        jpeg = encode_presto_jpeg(picture(1), (16, 32, 160, 96))
        image = Image.open(io.BytesIO(jpeg))
        self.assertEqual((image.format, image.size), ("JPEG", (160, 96)))
        self.assertFalse(image.info.get("progressive", False))


class MotionJpegTransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = ESPHomePrestoTransport(
            {"mac": "02:00:00:00:00:01", "host": "127.0.0.1", "controls_url": "unused"},
            base64.b64encode(bytes(32)).decode(),
        )
        self.transport.api = types.SimpleNamespace(execute_service=AsyncMock())
        self.transport.event_key = 7
        self.transport.actions = {"frame_chunk": "frame", "set_display_controls": "controls"}
        self.transport.control_task = asyncio.create_task(asyncio.sleep(3600))
        self.transport.codecs_key = 9
        self.transport.native_state(TextSensorState(key=9, state="zlib,rle,jpeg"))

    async def asyncTearDown(self):
        self.transport.control_task.cancel()
        await asyncio.gather(self.transport.control_task, return_exceptions=True)

    async def send(self, frame_id, pixels, is_motion):
        calls_before = len(self.transport.api.execute_service.call_args_list)
        sending = asyncio.create_task(
            self.transport.send_frame(frame_id, 0, pixels, is_motion=is_motion)
        )
        async with asyncio.timeout(5):
            while self.transport.pending is None or self.transport.frame["id"] != frame_id:
                await asyncio.sleep(0.001)
            while not self.transport.api.execute_service.call_args_list[-1].args[1]["final_chunk"]:
                await asyncio.sleep(0.001)
        self.transport.native_state(TextSensorState(key=7, state=f"frame,{frame_id},0,0,0,10,20"))
        await sending
        calls = self.transport.api.execute_service.call_args_list[calls_before:]
        return base64.b64decode("".join(call.args[1]["image_data"] for call in calls))

    async def test_a_motion_frame_is_jpeg_and_the_next_still_frame_repairs_it(self):
        await self.send(1, picture(1), is_motion=False)
        moved = picture(1, (100, 300), 2)
        sent = await self.send(2, moved, is_motion=True)
        self.assertEqual(header(sent), (1, 0, 96, 480, 208, 2))
        self.assertEqual(self.transport.lossy_rectangle, (0, 96, 480, 208))
        # The finger lifts on the same picture: the patch is lossless and covers
        # everything the JPEG approximated, though no pixel changed.
        repaired = await self.send(3, moved, is_motion=False)
        self.assertEqual(header(repaired)[1:5], (0, 96, 480, 208))
        self.assertNotEqual(header(repaired)[5], 2)
        self.assertIsNone(self.transport.lossy_rectangle)

    async def test_lossy_rectangles_accumulate_across_motion_frames(self):
        await self.send(1, picture(1), is_motion=False)
        await self.send(2, picture(1, (0, 100), 2), is_motion=True)
        await self.send(3, picture(1, (300, 480), 3), is_motion=True)
        # Frame 3 also restores rows 0-100, so its patch spans the whole panel.
        self.assertEqual(self.transport.lossy_rectangle, (0, 0, 480, 480))

    async def test_a_small_motion_patch_stays_lossless(self):
        first = picture(1)
        await self.send(1, first, is_motion=False)
        moved = bytearray(first)
        moved[0:960] = bytes(960)
        sent = await self.send(2, bytes(moved), is_motion=True)
        self.assertNotEqual(header(sent)[5], 2)
        self.assertIsNone(self.transport.lossy_rectangle)

    async def test_a_board_without_jpeg_gets_lossless_motion_frames(self):
        self.transport.has_jpeg = False
        await self.send(1, picture(1), is_motion=False)
        sent = await self.send(2, picture(1, (100, 300), 2), is_motion=True)
        self.assertNotEqual(header(sent)[5], 2)
        self.assertIsNone(self.transport.lossy_rectangle)


if __name__ == "__main__":
    unittest.main()
