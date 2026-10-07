"""Encrypted native-API RGB565 patches for a Presto running ESPHome."""

import asyncio
import base64
import importlib.util
import json
import pathlib
import struct
import time

from aioesphomeapi import APIClient, TextSensorState
from aiohttp import web
from codec import encode_presto_patch
from presto_transport import PrestoTransport


class ESPHomePrestoTransport(PrestoTransport):
    transport_build = "castkit-esphome-presto-v1"

    def __init__(self, config, key):
        super().__init__(config, key)
        self.api = APIClient(config["host"], 6053, None, noise_psk=key)
        self.actions = {}
        self.event_key = None
        self.control_task = None
        self.control_revision = 0
        self.control_pending = None
        self.control_sent = None
        self.unsubscribe = None
        self.led_pixels = bytearray(21)
        path = pathlib.Path(__file__).resolve().parent.parent / "presto" / "ambient.py"
        specification = importlib.util.spec_from_file_location("presto_effects", path)
        module = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(module)
        self.effects = module.AmbientLight(self)

    def set_led_rgb(self, index, red, green, blue):
        self.led_pixels[index * 3 : index * 3 + 3] = bytes((red, green, blue))

    async def start(self):
        # No HTTP frame/control ingress: those travel only over the encrypted API.
        application = web.Application()
        application.router.add_get("/healthz", self.health)
        self.runner = web.AppRunner(application)
        await self.runner.setup()
        await web.TCPSite(
            self.runner, self.config.get("listen_host", "0.0.0.0"), self.config["listen_port"]
        ).start()

    async def connect(self, login=True):
        await self.api.connect(login=login)
        info = await self.api.device_info()
        if info.mac_address.lower().replace(":", "") != self.mac:
            await self.api.disconnect()
            raise ValueError("Device identity mismatch")
        entities, services = await self.api.list_entities_services()
        self.actions = {service.name: service for service in services}
        if not {"frame_chunk", "set_display_controls"} <= self.actions.keys():
            raise ValueError("The Presto needs native frame/control actions")
        self.event_key = next(entity.key for entity in entities if entity.name == "Display Events")
        self.build_marker = f"esphome-presto-rgb565-v1 {info.compilation_time}"
        self.base_id, self.base_pixels = 0, None
        self.control_sent = None
        self.reported_backlight_percent = None
        self.reported_ambient_light = None
        self.connected.set()
        self.unsubscribe = self.api.subscribe_states(self.native_state)
        self.control_task = asyncio.create_task(self.controls_loop())

    def native_state(self, state):
        if not isinstance(state, TextSensorState) or state.key != self.event_key:
            return
        parts = state.state.split(",")
        self.last_seen = time.monotonic()
        if parts[0] == "frame":
            if (
                len(parts) == 7
                and self.frame is not None
                and parts[1:3] == [str(self.frame["id"]), str(self.frame["touch_id"])]
                and self.pending is not None
                and not self.pending.done()
            ):
                self.pending.set_result(parts)
        elif parts[0] == "error":
            if self.pending is not None and not self.pending.done():
                self.pending.set_exception(ValueError("Presto rejected frame"))
        elif parts[0] == "touch" and len(parts) == 8:
            try:
                sequence, phase, x, y, shown = map(int, [*parts[1:5], parts[6]])
                if (
                    sequence <= 0
                    or phase not in (0, 1, 2)
                    or not 0 <= x < 480
                    or not 0 <= y < 480
                    or shown <= 0
                ):
                    return
            except ValueError:
                return
            self.effects.touch_event(phase, x, y)
            if len(self.touch_received_at) >= 128:
                self.touch_received_at.clear()
            self.touch_received_at[sequence] = time.monotonic()
            self.touches_received += 1
            self.report(state.state)
        elif parts[0] == "controls" and len(parts) == 3 and self.control_pending is not None:
            revision, percent, state_snapshot, future = self.control_pending
            if parts[1:3] == [str(revision), str(percent)] and not future.done():
                self.reported_backlight_percent = percent
                self.reported_ambient_light = state_snapshot
                future.set_result(None)

    async def disconnect(self):
        if self.control_task is not None:
            self.control_task.cancel()
            await asyncio.gather(self.control_task, return_exceptions=True)
            self.control_task = None
        if self.unsubscribe is not None:
            self.unsubscribe()
            self.unsubscribe = None
        await self.api.disconnect()
        await super().disconnect()

    async def controls_loop(self):
        while True:
            if self.ambient_light is not None:
                self.effects.apply_header(
                    json.dumps(
                        {
                            **self.ambient_light,
                            **self.ambient_metadata,
                            "colors": self.ambient_palette,
                        }
                    )
                )
            else:
                self.effects.apply_header(None)
            self.effects.tick()
            percent = self.backlight_percent
            state = self.ambient_light
            identity = (percent, bytes(self.led_pixels), json.dumps(state, sort_keys=True))
            if percent is not None and identity != self.control_sent:
                self.control_revision += 1
                future = asyncio.get_running_loop().create_future()
                self.control_pending = (self.control_revision, percent, state, future)
                await self.api.execute_service(
                    self.actions["set_display_controls"],
                    {
                        "revision": self.control_revision,
                        "backlight": percent,
                        "colors": base64.b64encode(identity[1]).decode("ascii"),
                    },
                )
                await asyncio.wait_for(future, timeout=3)
                self.control_sent = identity
                self.control_pending = None
            await asyncio.sleep(0.05)

    async def send_frame(self, frame_id, touch_id, raw):
        if self.control_task.done():
            self.control_task.result()
        started = time.monotonic()
        body, encoding, rectangle = await asyncio.to_thread(
            encode_presto_patch, raw, self.base_pixels
        )
        self.patch_prepare_ms = round((time.monotonic() - started) * 1000, 1)
        packet = struct.pack(">IHHHHB", self.base_id, *rectangle, int(encoding == "rle")) + body
        encoded = base64.b64encode(packet).decode("ascii")
        self.pending = asyncio.get_running_loop().create_future()
        self.frame = {"id": frame_id, "touch_id": touch_id, "created": time.monotonic()}
        sent = time.monotonic()
        try:
            for offset in range(0, len(encoded), 4000):
                await self.api.execute_service(
                    self.actions["frame_chunk"],
                    {
                        "frame_id": frame_id,
                        "touch_id": touch_id,
                        "format": 4,
                        "offset": offset,
                        "final_chunk": offset + 4000 >= len(encoded),
                        "image_data": encoded[offset : offset + 4000],
                    },
                )
                # Yield/backpressure instead of buffering a full frame in native RAM.
                await asyncio.sleep(0.003)
            response = await asyncio.wait_for(self.pending, timeout=6)
            self.base_id, self.base_pixels = frame_id, raw
            self.frames_drawn += 1
            self.last_ack = {
                "frame_id": frame_id,
                "touch_id": touch_id,
                "decode_us": int(response[5]),
                "draw_us": int(response[6]),
            }
            self.last_delivery = {
                "frame_id": frame_id,
                "touch_id": touch_id,
                "bytes": len(packet),
                "encoding": encoding,
                "rectangle": rectangle,
                "ack_ms": round((time.monotonic() - sent) * 1000, 1),
            }
            eligible = [sequence for sequence in self.touch_received_at if sequence <= touch_id]
            if eligible:
                self.last_touch_latency_ms = round(
                    (time.monotonic() - self.touch_received_at[max(eligible)]) * 1000, 1
                )
                for sequence in eligible:
                    self.touch_received_at.pop(sequence)
            return response
        except Exception:
            self.base_id, self.base_pixels = 0, None
            raise
        finally:
            self.pending = None
