"""Authenticated frame pull and acknowledged touch transport for a Presto.

Run behind TLS when crossing untrusted networks. A dedicated token grants only
this relay's frame and touch endpoints, never CastKit management access.
"""

import asyncio
import contextlib
import json
import secrets
import time
import zlib

from aioesphomeapi import TextSensorState
from aiohttp import web
from ambient_light import control_state, metadata
from codec import encode_presto_patch


class PrestoTransport:
    def __init__(self, config, token):
        if not isinstance(token, str) or len(token) < 32:
            raise ValueError("Presto requires a dedicated token of at least 32 characters")
        self.config, self.token = config, token
        self.mac = config["mac"].lower().replace(":", "")
        self.connected = asyncio.Event()
        self.callback = None
        self.frame = None
        self.pending = None
        self.frame_ready = asyncio.Event()
        self.base_pixels = None
        self.base_id = 0
        self.last_delivery = None
        self.capture_ms = None
        self.encode_ms = None
        self.touch_received_at = {}
        self.last_touch_latency_ms = None
        self.boot_id = None
        self.build_marker = "unknown"
        self.last_seen = 0
        self.last_ack = None
        self.backlight_percent = 0 if config.get("controls_url") else None
        self.reported_backlight_percent = None
        self.ambient_light = None
        self.reported_ambient_light = None
        self.ambient_metadata = metadata(None)
        self.ambient_palette = [[0, 0, 0] for _ in range(7)]
        self.frames_drawn = 0
        self.touches_received = 0
        self.runner = None

    @web.middleware
    async def authenticate(self, request, handler):
        if request.path == "/healthz":
            return await handler(request)
        if (
            not secrets.compare_digest(
                request.headers.get("Authorization", ""), f"Bearer {self.token}"
            )
            or request.headers.get("X-CastKit-Device", "").lower().replace(":", "") != self.mac
        ):
            raise web.HTTPForbidden()
        boot_id = request.headers.get("X-CastKit-Boot", "")
        if not 1 <= len(boot_id) <= 64:
            raise web.HTTPBadRequest(text="Missing boot identity")
        if self.boot_id is not None and self.boot_id != boot_id:
            # Sequence numbers restart after a physical reboot; rebuild the
            # browser contact/acknowledgement state before accepting that input.
            self.report("error,device-restarted")
            self.reported_backlight_percent = None
            self.reported_ambient_light = None
            self.frame = None
            self.base_pixels, self.base_id = None, 0
            self.touch_received_at.clear()
            if self.pending is not None and not self.pending.done():
                self.pending.set_exception(ConnectionError("Presto restarted"))
        self.boot_id = boot_id
        self.build_marker = request.headers.get("X-CastKit-Build", "unknown")[:100]
        self.last_seen = time.monotonic()
        self.connected.set()
        return await handler(request)

    def report(self, value):
        if self.callback is not None:
            self.callback(TextSensorState(key=1, state=value))

    async def start(self):
        application = web.Application(middlewares=[self.authenticate], client_max_size=16384)
        application.router.add_get("/frame", self.get_frame)
        application.router.add_post("/ack", self.acknowledge)
        application.router.add_post("/control-ack", self.acknowledge_controls)
        application.router.add_post("/touch", self.receive_touch)
        application.router.add_get("/healthz", self.health)
        self.runner = web.AppRunner(application)
        await self.runner.setup()
        await web.TCPSite(
            self.runner, self.config.get("listen_host", "0.0.0.0"), self.config["listen_port"]
        ).start()

    async def stop(self):
        if self.runner is not None:
            await self.runner.cleanup()

    async def connect(self, login=True):
        await asyncio.wait_for(self.connected.wait(), timeout=30)

    async def disconnect(self):
        self.callback = None
        self.frame = None
        self.base_pixels, self.base_id = None, 0
        self.connected.clear()

    def subscribe_states(self, callback):
        self.callback = callback

    def set_backlight(self, percent):
        if type(percent) is not int or not 0 <= percent <= 100:
            raise ValueError("Backlight requires an integer percentage")
        if percent != self.backlight_percent:
            self.backlight_percent = percent
            self.frame_ready.set()

    async def acknowledge_controls(self, request):
        document = await self.read_json(request)
        percent = document.get("backlight_percent") if isinstance(document, dict) else None
        if type(percent) is not int or not 0 <= percent <= 100:
            raise web.HTTPBadRequest(text="Invalid backlight acknowledgement")
        ambient = document.get("ambient_light")
        if ambient is not None:
            try:
                ambient = control_state(ambient)
            except ValueError as error:
                raise web.HTTPBadRequest(text="Invalid ambient acknowledgement") from error
        self.reported_ambient_light = ambient
        self.reported_backlight_percent = percent
        return web.Response(status=204)

    def set_ambient_light(self, controls, data=None):
        state = control_state(controls) if controls is not None else None
        data = metadata(data)
        if state != self.ambient_light or data != self.ambient_metadata:
            self.ambient_light, self.ambient_metadata = state, data
            self.frame_ready.set()

    def set_ambient_palette(self, colors):
        if colors != self.ambient_palette:
            self.ambient_palette = colors
            self.frame_ready.set()

    async def get_frame(self, request):
        frame = self.frame
        if frame is None or request.query.get("after") == str(frame["id"]):
            # Wait for a capture instead of adding a fixed polling delay.
            self.frame_ready.clear()
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self.frame_ready.wait(), timeout=1)
            frame = self.frame
        if (
            frame is None
            or time.monotonic() - frame["created"] > 7
            or request.query.get("after") == str(frame["id"])
        ):
            return web.Response(status=204, headers=self.control_headers())
        headers = {
            **self.control_headers(),
            "Cache-Control": "no-store",
            "X-CastKit-Frame": str(frame["id"]),
            "X-CastKit-Touch": str(frame["touch_id"]),
        }
        body, content_type = frame["png"], "application/vnd.castkit.rgb565+zlib"
        if request.headers.get("X-CastKit-Accept") == "rgb565-patch-v1":
            use_patch = frame["base_id"] > 0 and request.query.get("after") == str(frame["base_id"])
            body, encoding, rectangle = frame["patch"] if use_patch else frame["full"]
            headers["X-CastKit-Rect"] = ",".join(map(str, rectangle))
            headers["X-CastKit-Base-Frame"] = str(frame["base_id"] if use_patch else 0)
            content_type = f"application/vnd.castkit.rgb565-patch+{encoding}"
            self.last_delivery = {
                "bytes": len(body),
                "encoding": encoding,
                "rectangle": rectangle,
                "base_id": frame["base_id"] if use_patch else 0,
            }
        frame["served_at"] = time.monotonic()
        return web.Response(body=body, content_type=content_type, headers=headers)

    def control_headers(self):
        headers = {}
        if self.backlight_percent is not None:
            headers["X-CastKit-Backlight"] = str(self.backlight_percent)
        if (
            self.backlight_percent is not None
            and self.reported_backlight_percent != self.backlight_percent
        ):
            headers["X-CastKit-Backlight-Ack"] = "1"
        if self.ambient_light is not None:
            headers["X-CastKit-Ambient"] = json.dumps(
                {**self.ambient_light, **self.ambient_metadata, "colors": self.ambient_palette},
                separators=(",", ":"),
            )
            if self.reported_ambient_light != self.ambient_light:
                headers["X-CastKit-Ambient-Ack"] = "1"
        return headers

    async def acknowledge(self, request):
        document = await self.read_json(request)
        if not isinstance(document, dict) or any(
            type(document.get(key)) is not int or not 0 <= document[key] <= 2**53
            for key in ("frame_id", "touch_id", "decode_us", "draw_us")
        ):
            raise web.HTTPBadRequest(text="Invalid frame acknowledgement")
        frame = self.frame
        if (
            frame is None
            or time.monotonic() - frame["created"] > 7
            or (document["frame_id"], document["touch_id"])
            != (
                frame["id"],
                frame["touch_id"],
            )
        ):
            raise web.HTTPConflict(text="Frame is no longer current")
        if self.pending is not None and not self.pending.done():
            self.base_pixels, self.base_id = frame["pixels"], frame["id"]
            if self.last_delivery is not None and "served_at" in frame:
                self.last_delivery["ack_ms"] = round(
                    (time.monotonic() - frame["served_at"]) * 1000, 1
                )
            eligible = [
                sequence for sequence in self.touch_received_at if sequence <= frame["touch_id"]
            ]
            if eligible:
                self.last_touch_latency_ms = round(
                    (time.monotonic() - self.touch_received_at[max(eligible)]) * 1000, 1
                )
                for sequence in eligible:
                    self.touch_received_at.pop(sequence)
            self.last_ack = document
            self.frames_drawn += 1
            self.pending.set_result(
                [
                    "frame",
                    str(frame["id"]),
                    str(frame["touch_id"]),
                    "0",
                    "0",
                    str(document["decode_us"]),
                    str(document["draw_us"]),
                ]
            )
        return web.Response(status=204)

    async def receive_touch(self, request):
        document = await self.read_json(request)
        if not isinstance(document, list) or len(document) > 64:
            raise web.HTTPBadRequest(text="Invalid touch batch")
        for event in document:
            if (
                not isinstance(event, list)
                or len(event) != 5
                or any(type(value) is not int for value in event)
            ):
                raise web.HTTPBadRequest(text="Invalid touch")
            sequence, phase, x, y, frame_id = event
            if not (
                0 < sequence <= 2**53
                and phase in (0, 1, 2)
                and 0 <= x < 480
                and 0 <= y < 480
                and 0 < frame_id <= 2**53
            ):
                raise web.HTTPBadRequest(text="Touch outside panel bounds")
        for sequence, phase, x, y, frame_id in document:
            if len(self.touch_received_at) >= 128:
                self.touch_received_at.clear()
            self.touch_received_at[sequence] = time.monotonic()
            self.report(f"touch,{sequence},{phase},{x},{y},0,{frame_id},0")
        self.touches_received += len(document)
        return web.Response(status=204)

    async def read_json(self, request):
        try:
            return await request.json()
        except ValueError as error:
            raise web.HTTPBadRequest(text="Invalid JSON") from error

    async def health(self, request):
        return web.json_response(
            {
                "build": "castkit-presto-transport-v5-ambient-light",
                "firmware": self.build_marker,
                "last_seen_seconds": round(time.monotonic() - self.last_seen, 1)
                if self.last_seen
                else None,
                "frames_drawn": self.frames_drawn,
                "touches_received": self.touches_received,
                "last_ack": self.last_ack,
                "last_delivery": self.last_delivery,
                "backlight_percent": self.backlight_percent,
                "reported_backlight_percent": self.reported_backlight_percent,
                "ambient_light": self.ambient_light,
                "reported_ambient_light": self.reported_ambient_light,
                "capture_ms": self.capture_ms,
                "encode_ms": self.encode_ms,
                "last_touch_to_ack_ms": self.last_touch_latency_ms,
            }
        )

    async def send_frame(self, frame_id, touch_id, png):
        raw = zlib.decompress(png)
        full = await asyncio.to_thread(encode_presto_patch, raw)
        base_id, base_pixels = self.base_id, self.base_pixels
        patch = (
            await asyncio.to_thread(encode_presto_patch, raw, base_pixels)
            if base_pixels is not None
            else full
        )
        # A reboot while encoding invalidates the base. The full fallback remains valid.
        if base_id != self.base_id:
            base_id, patch = 0, full
        self.pending = asyncio.get_running_loop().create_future()
        self.frame = {
            "id": frame_id,
            "touch_id": touch_id,
            "png": png,
            "pixels": raw,
            "base_id": base_id,
            "full": full,
            "patch": patch,
            "created": time.monotonic(),
        }
        self.frame_ready.set()
        try:
            return await asyncio.wait_for(self.pending, timeout=10)
        finally:
            self.pending = None
