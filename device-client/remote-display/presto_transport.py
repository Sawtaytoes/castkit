"""Authenticated frame pull and acknowledged touch transport for a Presto.

Run behind TLS when crossing untrusted networks. A dedicated token grants only
this relay's frame and touch endpoints, never CastKit management access.
"""

import asyncio
import secrets
import time

from aioesphomeapi import TextSensorState
from aiohttp import web


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
        self.boot_id = None
        self.build_marker = "unknown"
        self.last_seen = 0
        self.last_ack = None
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
            self.frame = None
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
        self.connected.clear()

    def subscribe_states(self, callback):
        self.callback = callback

    async def get_frame(self, request):
        frame = self.frame
        if frame is None or time.monotonic() - frame["created"] > 7:
            return web.Response(status=204)
        if request.query.get("after") == str(frame["id"]):
            return web.Response(status=204)
        return web.Response(
            body=frame["png"],
            content_type="application/vnd.castkit.rgb565+zlib",
            headers={
                "Cache-Control": "no-store",
                "X-CastKit-Frame": str(frame["id"]),
                "X-CastKit-Touch": str(frame["touch_id"]),
            },
        )

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
                "build": "castkit-presto-transport-v1",
                "firmware": self.build_marker,
                "last_seen_seconds": round(time.monotonic() - self.last_seen, 1)
                if self.last_seen
                else None,
                "frames_drawn": self.frames_drawn,
                "touches_received": self.touches_received,
                "last_ack": self.last_ack,
            }
        )

    async def send_frame(self, frame_id, touch_id, png):
        self.pending = asyncio.get_running_loop().create_future()
        self.frame = {"id": frame_id, "touch_id": touch_id, "png": png, "created": time.monotonic()}
        try:
            return await asyncio.wait_for(self.pending, timeout=10)
        finally:
            self.pending = None
