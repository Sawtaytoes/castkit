"""Server camera frames: parsing, the newest-frame feed, and the prepared board patch."""

import asyncio
import base64
import struct
import types
import unittest
import zlib
from unittest.mock import AsyncMock

from aioesphomeapi import TextSensorState
from aiohttp import web
from camera_frames import CameraFrameFeed, frames_url, parse_frame
from esphome_presto import ESPHomePrestoTransport

# A synthetic 480x480 panel frame: flat shades, never a camera picture.
SQUARE = 480 * 480 * 2
CAMERA_PATCH = (0, 60, 480, 360)
# Stands in for a JPEG body: the worker never decodes it, only forwards it.
JPEG_STANDIN = bytes([0xFF, 0xD8, 0xFF, 0xD9])


def synthetic_frame(shade):
    pixels = bytes([shade]) * SQUARE
    body = zlib.compress(pixels[60 * 480 * 2 : 420 * 480 * 2], 1)
    return pixels, body


def frame_headers(sequence, pixels, layout="layout-a"):
    return {
        "x-castkit-frame-sequence": str(sequence),
        "x-castkit-frame-pixels": str(len(pixels)),
        "x-castkit-frame-patch": ",".join(str(value) for value in CAMERA_PATCH),
        "x-castkit-frame-codec": "zlib",
        "x-castkit-frame-layout": layout,
        "x-castkit-frame-origin": "video",
    }


class ParseTests(unittest.TestCase):
    def test_the_body_is_the_whole_frame_then_the_patch(self):
        pixels, body = synthetic_frame(7)
        frame = parse_frame(frame_headers(3, pixels), pixels + body)
        self.assertEqual(frame["sequence"], 3)
        self.assertEqual(frame["pixels"], pixels)
        self.assertEqual(frame["body"], body)
        self.assertEqual(frame["patch"], CAMERA_PATCH)

    def test_an_unknown_codec_is_refused(self):
        pixels, body = synthetic_frame(7)
        headers = {**frame_headers(3, pixels), "x-castkit-frame-codec": "webp"}
        with self.assertRaisesRegex(ValueError, "codec"):
            parse_frame(headers, pixels + body)

    def test_a_jpeg_frame_names_its_codec(self):
        pixels, _ = synthetic_frame(7)
        headers = {**frame_headers(3, pixels), "x-castkit-frame-codec": "jpeg"}
        frame = parse_frame(headers, pixels + JPEG_STANDIN)
        self.assertEqual((frame["codec"], frame["body"]), ("jpeg", JPEG_STANDIN))

    def test_only_a_jpeg_request_names_a_codec(self):
        base = "http://castkit/m?kind=frames"
        self.assertNotIn("codec", frames_url(base, 480, 480, 1))
        self.assertTrue(frames_url(base, 480, 480, 1, "jpeg").endswith("&codec=jpeg"))

    def test_the_request_names_the_panel_size_and_the_last_frame(self):
        self.assertEqual(
            frames_url("http://castkit/api/display/view/a/media/c/d?kind=frames", 480, 320, 9),
            "http://castkit/api/display/view/a/media/c/d?kind=frames&width=480&height=320&after=9",
        )


class FeedTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.requests = []
        self.sequence = 0

        async def frames(request):
            self.requests.append(
                (request.query.get("after"), request.headers.get("Cookie"), request.query["width"])
            )
            if self.sequence == 0:
                await asyncio.sleep(0.05)
                return web.Response(status=204)
            pixels, body = synthetic_frame(self.sequence)
            return web.Response(body=pixels + body, headers=frame_headers(self.sequence, pixels))

        application = web.Application()
        application.router.add_get("/frames", frames)
        self.runner = web.AppRunner(application)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        self.url = f"http://127.0.0.1:{port}/frames?kind=frames"

    async def asyncTearDown(self):
        await self.runner.cleanup()

    async def test_the_feed_keeps_only_the_newest_frame_and_sends_the_view_cookie(self):
        feed = CameraFrameFeed(self.url, "castkit-session=abc", 480, 480)
        task = asyncio.create_task(feed.run())
        try:
            self.assertIsNone(await feed.wait_for_newer(0, 0.2))
            self.assertFalse(feed.is_fresh())
            self.sequence = 5
            frame = await feed.wait_for_newer(0, 2)
            self.assertEqual(frame["sequence"], 5)
            self.assertTrue(feed.is_fresh())
            self.sequence = 9
            frame = await feed.wait_for_newer(5, 2)
            self.assertEqual(frame["sequence"], 9)
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        self.assertEqual(self.requests[0], ("0", "castkit-session=abc", "480"))
        # Each request names the newest frame held, so the server skips older ones.
        self.assertIn(("5", "castkit-session=abc", "480"), self.requests)


class PreparedPatchTests(unittest.IsolatedAsyncioTestCase):
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

    async def send(self, frame_id, pixels, prepared):
        calls_before = len(self.transport.api.execute_service.call_args_list)
        sending = asyncio.create_task(self.transport.send_frame(frame_id, 0, pixels, prepared))
        async with asyncio.timeout(3):
            while self.transport.pending is None or self.transport.frame["id"] != frame_id:
                await asyncio.sleep(0.001)
            while not self.transport.api.execute_service.call_args_list[-1].args[1]["final_chunk"]:
                await asyncio.sleep(0.001)
        self.transport.native_state(TextSensorState(key=7, state=f"frame,{frame_id},0,0,0,10,20"))
        await sending
        calls = self.transport.api.execute_service.call_args_list[calls_before:]
        return base64.b64decode("".join(call.args[1]["image_data"] for call in calls))

    async def test_a_camera_frame_on_a_camera_frame_sends_the_server_patch_unchanged(self):
        first_pixels, first_body = synthetic_frame(10)
        second_pixels, second_body = synthetic_frame(20)
        layout = {"patch": CAMERA_PATCH, "layout": "layout-a"}
        # The first camera frame follows a page frame, so the worker encodes it itself.
        first = await self.send(5, first_pixels, {**layout, "body": first_body})
        self.assertEqual(struct.unpack(">IHHHHB", first[:13])[:5], (0, 0, 0, 480, 480))
        second = await self.send(6, second_pixels, {**layout, "body": second_body})
        self.assertEqual(struct.unpack(">IHHHHB", second[:13]), (5, 0, 60, 480, 360, 0))
        self.assertEqual(second[13:], second_body)
        self.assertEqual(self.transport.base_pixels, second_pixels)
        # A different label band (another layout) is never patched over.
        third_pixels, third_body = synthetic_frame(30)
        third = await self.send(
            7, third_pixels, {"patch": CAMERA_PATCH, "layout": "layout-b", "body": third_body}
        )
        self.assertEqual(struct.unpack(">IHHHHB", third[:13])[:5], (6, 0, 0, 480, 480))
        self.assertNotEqual(third[13:], third_body)

    async def test_a_jpeg_patch_goes_out_as_codec_two_only_on_firmware_that_reports_jpeg(self):
        first_pixels, first_body = synthetic_frame(10)
        second_pixels, _ = synthetic_frame(20)
        layout = {"patch": CAMERA_PATCH, "layout": "layout-a"}
        await self.send(5, first_pixels, {**layout, "body": first_body})
        jpeg = {**layout, "body": JPEG_STANDIN, "codec": "jpeg"}
        # Old firmware: no decoder, so the worker sends its own zlib patch instead.
        fallback = await self.send(6, second_pixels, jpeg)
        self.assertNotEqual(struct.unpack(">IHHHHB", fallback[:13])[5], 2)
        self.assertNotEqual(fallback[13:], JPEG_STANDIN)
        # The board reports its codecs on "Display Codecs".
        self.transport.codecs_key = 9
        self.transport.native_state(TextSensorState(key=9, state="zlib,rle,jpeg"))
        self.assertTrue(self.transport.has_jpeg)
        third_pixels, _ = synthetic_frame(30)
        sent = await self.send(7, third_pixels, jpeg)
        self.assertEqual(struct.unpack(">IHHHHB", sent[:13]), (6, 0, 60, 480, 360, 2))
        self.assertEqual(sent[13:], JPEG_STANDIN)

    async def test_a_refused_jpeg_patch_turns_jpeg_off_until_the_board_reconnects(self):
        first_pixels, first_body = synthetic_frame(10)
        layout = {"patch": CAMERA_PATCH, "layout": "layout-a"}
        await self.send(5, first_pixels, {**layout, "body": first_body})
        self.transport.codecs_key = 9
        self.transport.native_state(TextSensorState(key=9, state="zlib,rle,jpeg"))
        jpeg = {**layout, "body": JPEG_STANDIN, "codec": "jpeg"}
        second_pixels, _ = synthetic_frame(20)
        sending = asyncio.create_task(self.transport.send_frame(6, 0, second_pixels, jpeg))
        async with asyncio.timeout(3):
            while self.transport.pending is None:
                await asyncio.sleep(0.001)
        self.transport.native_state(TextSensorState(key=7, state="error,jpeg_unsupported"))
        self.assertFalse(self.transport.has_jpeg)
        self.assertEqual(self.transport.jpeg_refusal, "jpeg_unsupported")
        # The resend is the worker's own zlib frame; let the board acknowledge it.
        async with asyncio.timeout(3):
            while self.transport.pending is None or self.transport.pending.done():
                await asyncio.sleep(0.001)
            while not self.transport.api.execute_service.call_args_list[-1].args[1]["final_chunk"]:
                await asyncio.sleep(0.001)
        self.transport.native_state(TextSensorState(key=7, state="frame,6,0,0,0,10,20"))
        await sending
        # A replayed codecs state does not turn JPEG back on in the same session.
        self.transport.native_state(TextSensorState(key=9, state="zlib,rle,jpeg"))
        self.assertFalse(self.transport.has_jpeg)
        third_pixels, _ = synthetic_frame(30)
        sent = await self.send(7, third_pixels, jpeg)
        self.assertNotEqual(struct.unpack(">IHHHHB", sent[:13])[5], 2)

    async def test_one_bad_jpeg_frame_keeps_jpeg_and_three_in_a_row_end_it(self):
        self.transport.codecs_key = 9
        self.transport.native_state(TextSensorState(key=9, state="zlib,rle,jpeg"))
        for reason in ("jpeg_too_large", "jpeg_invalid"):
            self.transport.native_state(TextSensorState(key=7, state=f"error,{reason}"))
        self.assertTrue(self.transport.has_jpeg)
        self.assertIsNone(self.transport.jpeg_refusal)
        self.transport.native_state(TextSensorState(key=7, state="error,jpeg_size_mismatch"))
        self.assertFalse(self.transport.has_jpeg)
        self.assertEqual(self.transport.jpeg_refusal, "jpeg_size_mismatch")

    async def test_a_board_level_jpeg_error_ends_jpeg_at_once(self):
        self.transport.codecs_key = 9
        self.transport.native_state(TextSensorState(key=9, state="zlib,rle,jpeg"))
        self.transport.native_state(TextSensorState(key=7, state="error,jpeg_unavailable"))
        self.assertFalse(self.transport.has_jpeg)


if __name__ == "__main__":
    unittest.main()
