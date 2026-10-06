"""Codec compatibility and memory bounds of the native pixel routines.

Execute the same routines with checked little-endian pointers on the host;
physical Viper compilation/timings also need verification on a Presto.
"""

import ast
import asyncio
import importlib.util
import json
import random
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

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
namespace = {"blit_patch": pixels.blit_patch, "decode_rle": pixels.decode_rle}
exec(compile(ast.Module(body=class_tree, type_ignores=[]), str(source), "exec"), namespace)
Client = namespace["CastKitPresto"]


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
