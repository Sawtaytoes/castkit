"""Codec compatibility and memory bounds of the native pixel routines.

Execute the same routines with checked little-endian pointers on the host;
physical Viper compilation/timings also need verification on a Presto.
"""

import ast
import asyncio
import importlib.util
import io
import json
import random
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import numpy as np
from aiohttp import web
from aiohttp.test_utils import TestServer
from codec import encode_presto_patch, encode_rle


class Pointer:
    def __init__(self, buffer):
        self.buffer = memoryview(buffer).cast("B")

    def __getitem__(self, index):
        if index < 0 or index * 2 + 2 > len(self.buffer):
            raise IndexError("Pointer outside buffer")
        return int.from_bytes(self.buffer[index * 2 : index * 2 + 2], "little")

    def __setitem__(self, index, value):
        if index < 0 or index * 2 + 2 > len(self.buffer):
            raise IndexError("Pointer outside buffer")
        self.buffer[index * 2 : index * 2 + 2] = value.to_bytes(2, "little")


spec = importlib.util.spec_from_file_location(
    "presto_pixels", Path(__file__).parent.parent / "presto/pixels.py"
)
pixels = importlib.util.module_from_spec(spec)
pixels.ptr16 = Pointer
with patch.dict(
    sys.modules, {"micropython": types.SimpleNamespace(viper=lambda function: function)}
):
    spec.loader.exec_module(pixels)

source = Path(__file__).parent.parent / "presto/main.py"
class_tree = [
    node
    for node in ast.parse(source.read_text()).body
    if isinstance(node, (ast.ClassDef, ast.Assign))
]
namespace = {
    "blit_patch": pixels.blit_patch,
    "decode_rle": pixels.decode_rle,
    "time": types.SimpleNamespace(ticks_us=lambda: 0, ticks_diff=lambda end, start: end - start),
}
exec(compile(ast.Module(body=class_tree, type_ignores=[]), str(source), "exec"), namespace)
Client = namespace["CastKitPresto"]


class FakeReader:
    def __init__(self, response):
        self.response = io.BytesIO(response)

    async def readline(self):
        return self.response.readline()

    async def read(self, length):
        return self.response.read(length)


class FakeWriter:
    def __init__(self):
        self.writes = []
        self.drains = 0
        self.is_closed = False

    def write(self, data):
        self.writes.append(data)

    async def drain(self):
        self.drains += 1

    def close(self):
        self.is_closed = True

    async def wait_closed(self):
        pass


class FirmwareWritesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        namespace.update(
            {
                "asyncio": asyncio,
                "json": json,
                "BUILD_MARKER": "test",
                "secrets": types.SimpleNamespace(
                    CASTKIT_HOST="display.example.test",
                    CASTKIT_PORT=8791,
                    CASTKIT_TOKEN="a" * 32,
                ),
            }
        )
        self.client = Client.__new__(Client)
        self.client.connections = {}
        self.client.mac, self.client.boot_id = "020000000001", "boot"

    async def test_json_headers_and_body_are_one_complete_http_write(self):
        writer = FakeWriter()
        self.client.connections["frame"] = (
            FakeReader(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n"),
            writer,
        )
        payload = {"frame_id": 42, "caption": "caf\u00e9"}
        self.assertEqual((await self.client.request("POST", "/ack", payload))[0], 204)
        self.assertEqual(len(writer.writes), 1)
        head, body = writer.writes[0].split(b"\r\n\r\n", 1)
        lines = head.decode().split("\r\n")
        self.assertEqual(lines[0], "POST /ack HTTP/1.1")
        headers = dict(line.split(": ", 1) for line in lines[1:])
        self.assertEqual(body, json.dumps(payload).encode())
        self.assertEqual(int(headers["Content-Length"]), len(body))
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(headers["Connection"], "keep-alive")
        self.assertEqual(headers["Host"], "display.example.test")
        self.assertEqual(headers["Authorization"], "Bearer " + "a" * 32)
        self.assertEqual(headers["X-CastKit-Device"], "020000000001")
        self.assertEqual(headers["X-CastKit-Boot"], "boot")
        self.assertEqual(headers["X-CastKit-Accept"], "rgb565-patch-v1")
        self.assertEqual(writer.drains, 1)

    async def test_empty_get_and_json_touch_batch_each_use_one_write(self):
        response = b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n"
        for channel, method, path, payload, expected in (
            ("frame", "GET", "/frame?after=42", None, b""),
            ("touch", "POST", "/touch", [], b"[]"),
        ):
            writer = FakeWriter()
            self.client.connections[channel] = (FakeReader(response), writer)
            await self.client.request(method, path, payload)
            self.assertEqual(len(writer.writes), 1)
            head, body = writer.writes[0].split(b"\r\n\r\n", 1)
            self.assertEqual(body, expected)
            self.assertIn(f"Content-Length: {len(expected)}\r\n".encode(), head)

    async def test_broken_frame_connection_recovers_without_closing_touch_channel(self):
        broken = FakeWriter()
        touch = (FakeReader(b""), FakeWriter())
        self.client.connections = {
            "frame": (
                FakeReader(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nbad"),
                broken,
            ),
            "touch": touch,
        }
        with self.assertRaisesRegex(OSError, "Incomplete frame"):
            await self.client.request("GET", "/frame?after=42")
        self.assertTrue(broken.is_closed)
        self.assertNotIn("frame", self.client.connections)
        self.assertIs(self.client.connections["touch"], touch)
        recovered = (
            FakeReader(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nframe"),
            FakeWriter(),
        )
        with patch.object(asyncio, "open_connection", AsyncMock(return_value=recovered)) as connect:
            self.assertEqual((await self.client.request("GET", "/frame?after=42"))[2], b"frame")
        connect.assert_awaited_once_with("display.example.test", 8791)
        self.assertIs(self.client.connections["frame"], recovered)
        self.assertEqual(len(recovered[1].writes), 1)
        self.assertFalse(touch[1].is_closed)

    async def test_relay_confirmation_request_acknowledges_unchanged_brightness_once(self):
        applied = []
        self.client.screen = types.SimpleNamespace(set_backlight=applied.append)
        self.client.backlight_percent = 35
        self.client.request = AsyncMock(return_value=(204, {}, b""))
        await self.client.apply_controls(
            {"x-castkit-backlight": "35", "x-castkit-backlight-ack": "1"}
        )
        self.client.request.assert_awaited_once_with(
            "POST", "/control-ack", {"backlight_percent": 35}
        )
        await self.client.apply_controls({"x-castkit-backlight": "35"})
        self.assertEqual(self.client.request.await_count, 1)
        self.assertEqual(applied, [])
        await self.client.apply_controls({"x-castkit-backlight-ack": "1"})
        self.assertEqual(self.client.request.await_count, 1)
        self.assertEqual(applied, [1.0])

    async def test_rejected_confirmation_retries_until_accepted(self):
        applied = []
        self.client.screen = types.SimpleNamespace(set_backlight=applied.append)
        self.client.backlight_percent = 35
        self.client.request = AsyncMock(side_effect=[(409, {}, b""), (204, {}, b"")])
        headers = {"x-castkit-backlight": "35", "x-castkit-backlight-ack": "1"}
        with self.assertRaisesRegex(OSError, "Backlight acknowledgement rejected"):
            await self.client.apply_controls(headers)
        self.assertIsNone(self.client.backlight_percent)
        await self.client.apply_controls(headers)
        self.assertEqual(self.client.backlight_percent, 35)
        self.assertEqual(applied, [0.35])
        self.assertEqual(self.client.request.await_count, 2)
        await self.client.apply_controls({"x-castkit-backlight": "35"})
        self.assertEqual(self.client.request.await_count, 2)


class PrestoPixelsTests(unittest.TestCase):
    def test_firmware_rejects_wrong_patch_base_bounds_and_partial_recovery(self):
        client = Client.__new__(Client)
        client.frame_id = 42
        client.framebuffer = bytearray(460800)
        headers = {
            "content-type": "application/vnd.castkit.rgb565-patch+rle",
            "x-castkit-base-frame": "42",
            "x-castkit-rect": "479,479,1,1",
        }
        client.decode_frame(headers, bytes.fromhex("0080001f"))
        self.assertEqual(client.framebuffer[-2:], bytes.fromhex("001f"))
        for change in (
            {"x-castkit-base-frame": "41"},
            {"x-castkit-base-frame": "0"},
            {"x-castkit-rect": "480,479,1,1"},
            {"x-castkit-rect": "0,0,480"},
            {"content-type": "application/vnd.castkit.rgb565-patch+unknown"},
        ):
            with self.assertRaises(ValueError):
                client.decode_frame({**headers, **change}, bytes.fromhex("0080001f"))

    def test_runs_literals_and_long_blocks_preserve_pixel_bytes(self):
        rng = random.Random(17)
        for raw in (
            bytes.fromhex("f80007e0001fffff"),
            b"\xf8\x00" * 230400,
            rng.randbytes(460800),
            b"\x07\xe0" * 32769 + rng.randbytes(100),
        ):
            encoded = encode_rle(raw)
            destination = bytearray(len(raw))
            self.assertEqual(pixels.decode_rle(encoded, destination, len(raw) // 2), len(raw) // 2)
            self.assertEqual(destination, raw)

    def test_invalid_rle_never_reads_or_writes_outside_buffer(self):
        for source, count in (
            (b"\x00", 1),
            (b"\x00\x80", 1),
            (b"\x01\x00\x00\x00", 2),
            (b"\xff\xff\xf8\x00", 2),
            (b"\x00\x00\xf8\x00", 2),
            (b"\x00\x80\xf8\x00", -1),
            (b"\x00\x80\xf8\x00", 3),
        ):
            self.assertEqual(pixels.decode_rle(source, bytearray(4), count), -1)
        rng = random.Random(18)
        for _ in range(500):
            source = rng.randbytes(rng.randrange(50))
            pixels.decode_rle(source, bytearray(100), 50)

    def test_changed_rectangle_and_heartbeat_apply_to_exact_frame(self):
        before = bytearray(460800)
        after = bytearray(before)
        array = np.frombuffer(after, dtype="<u2").reshape(480, 480)
        array[100:130, 120:140] = 123
        for target, expected in ((after, (120, 100, 20, 30)), (before, (0, 0, 1, 1))):
            encoded, encoding, rectangle = encode_presto_patch(target, before)
            self.assertEqual(encoding, "rle")
            self.assertEqual(rectangle, expected)
            x, y, width, height = rectangle
            patch_pixels = bytearray(width * height * 2)
            self.assertEqual(
                pixels.decode_rle(encoded, patch_pixels, width * height), width * height
            )
            destination = bytearray(before)
            self.assertEqual(pixels.blit_patch(patch_pixels, destination, x, y, width, height), 0)
            self.assertEqual(destination, target)

    def test_copy_bounds_and_source_length_are_checked(self):
        destination = bytearray(460800)
        self.assertEqual(pixels.blit_patch(bytes.fromhex("001f"), destination, 479, 479, 1, 1), 0)
        self.assertEqual(destination[-2:], bytes.fromhex("001f"))
        for rectangle in ((480, 0, 1, 1), (-1, 0, 1, 1), (0, 0, 0, 1), (479, 479, 2, 1)):
            self.assertEqual(pixels.blit_patch(bytes(4), destination, *rectangle), -1)
        self.assertEqual(pixels.blit_patch(bytes(4), destination, 0, 0, 1, 1), -1)
        self.assertEqual(pixels.blit_patch(bytes(2), bytes(2), 0, 0, 1, 1), -1)


class FirmwareRequestTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.served = []

        async def respond(request):
            self.served.append(
                (request.path, request.transport, request.headers.get("X-CastKit-Accept"))
            )
            if request.path == "/wait":
                await asyncio.sleep(1)
            response = web.Response(
                body=b"frame" if request.path == "/frame" else None,
                status=200 if request.path == "/frame" else 204,
            )
            if request.path == "/close":
                response.force_close()
            return response

        app = web.Application()
        app.router.add_route("*", "/{path}", respond)
        self.server = TestServer(app)
        await self.server.start_server()
        namespace.update(
            {
                "asyncio": asyncio,
                "json": json,
                "BUILD_MARKER": "test",
                "secrets": types.SimpleNamespace(
                    CASTKIT_HOST=self.server.host,
                    CASTKIT_PORT=self.server.port,
                    CASTKIT_TOKEN="a" * 32,
                ),
            }
        )
        self.client = Client.__new__(Client)
        self.client.connections = {}
        self.client.mac, self.client.boot_id = "020000000001", "boot"

    async def asyncTearDown(self):
        for _, writer in self.client.connections.values():
            writer.close()
            await writer.wait_closed()
        await self.server.close()

    async def test_frame_and_ack_reuse_connection_with_separate_touch_channel(self):
        status, _, body = await self.client.request("GET", "/frame")
        self.assertEqual((status, body), (200, b"frame"))
        self.assertEqual((await self.client.request("POST", "/ack", {"frame_id": 1}))[0], 204)
        await self.client.request("POST", "/touch", [])
        self.assertIs(self.served[0][1], self.served[1][1])
        self.assertIsNot(self.served[0][1], self.served[2][1])
        self.assertEqual(self.served[0][2], "rgb565-patch-v1")

    async def test_backlight_uses_hardware_api_and_acknowledges_changes_only(self):
        self.client.backlight_percent = None
        applied = []
        self.client.screen = types.SimpleNamespace(set_backlight=applied.append)
        await self.client.apply_controls({"x-castkit-backlight": "35"})
        await self.client.apply_controls({"x-castkit-backlight": "35"})
        await self.client.apply_controls({"x-castkit-backlight": "0"})
        self.assertEqual(applied, [0.35, 0])
        self.assertEqual([request[0] for request in self.served], ["/control-ack", "/control-ack"])
        with self.assertRaises(ValueError):
            await self.client.apply_controls({"x-castkit-backlight": "101"})
        self.assertEqual(self.client.backlight_percent, 0)

    async def test_server_close_or_cancel_discards_connection_before_retry(self):
        await self.client.request("GET", "/close")
        self.assertEqual(self.client.connections, {})
        with self.assertRaises(TimeoutError):
            await asyncio.wait_for(self.client.request("GET", "/wait"), 0.05)
        self.assertEqual(self.client.connections, {})
        self.assertEqual((await self.client.request("GET", "/frame"))[2], b"frame")
