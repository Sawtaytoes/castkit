"""Encrypted native-API RGB565 patches for a Presto running ESPHome."""

import asyncio
import base64
import contextlib
import importlib.util
import json
import logging
import pathlib
import struct
import time

from aioesphomeapi import APIClient, TextSensorState
from aiohttp import web
from codec import encode_presto_patch
from presto_transport import FrameSupersededError, PrestoTransport, SlotUnavailableError

LOG = logging.getLogger("castkit.remote-display")

# A weak 2.4 GHz link stalls for several seconds without dropping the association. The
# board blanks to a red line 7 s after its last frame, and a reconnect costs a page reload,
# a new encrypted session and the loading frame, so a missed acknowledgement is resent in
# full on the same link first. A dead link still fails the send with APIConnectionError.
FRAME_ATTEMPTS = 3
FRAME_ACK_SECONDS = 6
# The patch header's codec byte. JPEG is lossy: after a JPEG patch the board's
# pixels inside it only approximate `base_pixels`, which is harmless because the
# next camera frame replaces the whole rectangle and any other frame differs there.
PATCH_CODECS = {"zlib": 0, "rle": 1, "jpeg": 2}
# Firmware that holds frames on the board names these three actions. A board
# without them keeps today's path: every frame travels when it is shown.
SLOT_ACTIONS = frozenset({"slot_chunk", "show_slot", "drop_slots"})
SLOT_COUNT = 6
# The board decodes an upload in bounded pieces between live frames, so its
# `slot,` event can trail the final chunk by a while.
SLOT_ACK_SECONDS = 10
# Rewriting the slot on screen first moves the scanout off it, which holds the API for
# about 200 ms, and right after a show the board is still copying that slot into both
# framebuffers. The slot just shown is left alone this long unless a live frame replaced it.
SHOWN_SLOT_DEFER_SECONDS = 3
# A slot show is a pointer swap acknowledged within tens of milliseconds.
SHOW_RECHECK_SECONDS = 0.5


class FrameRejectedError(ValueError):
    """The board reported an error event while a frame was pending."""


class ESPHomePrestoTransport(PrestoTransport):
    transport_build = "castkit-esphome-presto-v2-frame-slots"

    def __init__(self, config, key):
        super().__init__(config, key)
        self.api = APIClient(config["host"], 6053, None, noise_psk=key)
        self.actions = {}
        self.event_key = None
        self.slot_event_key = None
        self.control_task = None
        self.control_revision = 0
        self.control_pending = None
        self.control_sent = None
        self.wake_sent = None
        self.wake_requested_at = None
        self.unsubscribe = None
        self.has_slots = False
        # Firmware with a JPEG patch decoder reports `zlib,rle,jpeg` on "Display Codecs".
        self.codecs_key = None
        self.has_jpeg = False
        # The first `error,jpeg_*` this session: the board then gets zlib until it
        # reconnects, instead of every JPEG patch costing a rejection and a resend.
        self.jpeg_refusal = None
        # slot -> {"view", "key", "frame_id", "pixels", "targets"}: what the board holds.
        self.slots = {}
        self.slot_pending = None
        # A reconnect drops every slot; an upload begun before it must not record one.
        self.slot_epoch = 0
        self.live = None
        # (slot, monotonic time) of the slot on screen, until a live frame replaces it.
        self.shown_slot = None
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
        # ESPHome keeps only the newest queued state per entity under backpressure, so
        # slot firmware reports uploads on their own entity, where a `slot,` event can
        # never replace a frame acknowledgement.
        self.slot_event_key = next(
            (entity.key for entity in entities if entity.name == "Display Slot Events"), None
        )
        self.codecs_key = next(
            (entity.key for entity in entities if entity.name == "Display Codecs"), None
        )
        self.has_jpeg = False
        self.jpeg_refusal = None
        self.build_marker = f"esphome-presto-rgb565-v1 {info.compilation_time}"
        self.base_id, self.base_pixels = 0, None
        # Slot firmware reports uploads only on "Display Slot Events"; without that
        # entity no slot can ever be confirmed, so the board is treated as slotless.
        self.has_slots = self.actions.keys() >= SLOT_ACTIONS and self.slot_event_key is not None
        self.slots = {}
        self.shown_slot = None
        self.slot_epoch += 1
        if self.has_slots:
            # Nothing the board kept from an earlier session is known to this one.
            await self.api.execute_service(self.actions["drop_slots"], {})
        self.control_sent = None
        self.wake_sent = None
        self.wake_requested_at = None
        self.reported_backlight_percent = None
        self.reported_ambient_light = None
        self.connected.set()
        self.unsubscribe = self.api.subscribe_states(self.native_state)
        self.control_task = asyncio.create_task(self.controls_loop())

    def native_state(self, state):
        if not isinstance(state, TextSensorState):
            return
        if self.codecs_key is not None and state.key == self.codecs_key:
            self.has_jpeg = "jpeg" in state.state.split(",") and self.jpeg_refusal is None
            return
        parts = state.state.split(",")
        if state.key == self.slot_event_key and state.key != self.event_key:
            if parts[0] == "slot":
                self.slot_event(parts)
            return
        if state.key != self.event_key:
            return
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
        elif parts[0] == "slot":
            self.slot_event(parts)
        elif parts[0] == "error":
            # An upload reports its own failures in its `slot,` event, so an error
            # event belongs to the frame or show that is waiting.
            reason = parts[1] if len(parts) > 1 else "unknown"
            if reason.startswith("jpeg_") and self.has_jpeg:
                self.has_jpeg, self.jpeg_refusal = False, reason
                LOG.warning(
                    "Presto refused a JPEG patch (%s); sending zlib until it reconnects", reason
                )
            if self.pending is not None and not self.pending.done():
                self.pending.set_exception(
                    SlotUnavailableError("Presto holds no frame in that slot")
                    if reason == "slot_unavailable"
                    and self.frame is not None
                    and "slot" in self.frame
                    else FrameRejectedError(f"Presto rejected frame: {reason}")
                )
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
            self.confirm_shown_frame(shown)
            self.effects.touch_event(phase, x, y)
            if len(self.touch_received_at) >= 128:
                self.touch_received_at.clear()
            self.touch_received_at[sequence] = time.monotonic()
            self.touches_received += 1
            self.report(state.state)
        elif parts[0] == "wake_controls" and len(parts) == 3:
            with contextlib.suppress(ValueError):
                self.wake_sent = (int(parts[1]), int(parts[2]))
        elif parts[0] == "controls" and len(parts) == 3 and self.control_pending is not None:
            revision, percent, state_snapshot, future = self.control_pending
            if parts[1:3] == [str(revision), str(percent)] and not future.done():
                self.reported_backlight_percent = percent
                self.reported_ambient_light = state_snapshot
                future.set_result(None)

    def slot_event(self, parts):
        """`slot,<slot>,<frame_id>,<status>` finishes the upload waiting for it."""
        if len(parts) != 4 or self.slot_pending is None:
            return
        slot, frame_id, future = self.slot_pending
        if parts[1:3] == [str(slot), str(frame_id)] and not future.done():
            future.set_result(parts[3])

    def confirm_shown_frame(self, shown):
        # Every board event shares one "Display Events" sensor, and ESPHome keeps only the
        # newest queued state per entity while its send buffer is full. On a weak Wi-Fi
        # link a swipe's touch event can replace the queued frame acknowledgement, so the
        # touch's shown-frame field is the only confirmation that ever arrives.
        if (
            self.frame is not None
            and shown == self.frame["id"]
            and self.pending is not None
            and not self.pending.done()
        ):
            self.pending.set_result(
                ["frame", str(shown), str(self.frame["touch_id"]), "0", "0", "0", "0"]
            )

    async def disconnect(self):
        if self.control_task is not None:
            self.control_task.cancel()
            await asyncio.gather(self.control_task, return_exceptions=True)
            self.control_task = None
        if self.unsubscribe is not None:
            self.unsubscribe()
            self.unsubscribe = None
        await self.api.disconnect()
        self.slots = {}
        self.shown_slot = None
        self.slot_epoch += 1
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
            await self.send_wake_controls()
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
                try:
                    await asyncio.wait_for(future, timeout=3)
                except TimeoutError as error:
                    raise TimeoutError("Presto did not acknowledge display controls") from error
                self.control_sent = identity
                self.control_pending = None
            await asyncio.sleep(0.05)

    async def send_wake_controls(self):
        """Firmware without the action keeps its old no-touch-when-dark behavior."""
        wake = self.wake_controls
        if wake is None or wake == self.wake_sent or "set_wake_controls" not in self.actions:
            return
        # The board echoes `wake_controls,<percent>,<seconds>`; resend until it does.
        now = time.monotonic()
        if self.wake_requested_at is not None and now - self.wake_requested_at < 3:
            return
        self.wake_requested_at = now
        await self.api.execute_service(
            self.actions["set_wake_controls"],
            {"wake_backlight": wake[0], "wake_seconds": wake[1]},
        )

    async def send_frame(self, frame_id, touch_id, raw, prepared=None):
        for attempt in range(1, FRAME_ATTEMPTS + 1):
            try:
                return await self.deliver_frame(frame_id, touch_id, raw, prepared)
            except (TimeoutError, FrameRejectedError) as error:
                # A failed attempt has cleared the base, so the retry is a full frame,
                # which the board accepts even after its offline blank reset its base.
                # An error event carries no frame id, so a late one from the previous
                # attempt or a reconnect's state replay costs one retry, not the session.
                if attempt == FRAME_ATTEMPTS:
                    raise
                LOG.warning("%s; resending in full on the same link", error)

    def can_use_prepared(self, prepared):
        """A server patch replaces only its rectangle, so the board must already show
        a frame whose pixels outside it are the same: a camera frame of that layout.
        A JPEG patch also needs firmware that decodes one."""
        return (
            prepared is not None
            and (prepared.get("codec", "zlib") != "jpeg" or self.has_jpeg)
            and self.base_pixels is not None
            and self.base_id != 0
            and self.base_layout == prepared["layout"]
        )

    async def deliver_frame(self, frame_id, touch_id, raw, prepared=None):
        if self.control_task.done():
            self.control_task.result()
        started = time.monotonic()
        if self.can_use_prepared(prepared):
            # Compressed once on the server for every panel of this size.
            body, encoding, rectangle = (
                prepared["body"],
                prepared.get("codec", "zlib"),
                tuple(prepared["patch"]),
            )
        else:
            body, encoding, rectangle = await asyncio.to_thread(
                encode_presto_patch, raw, self.base_pixels
            )
        # What the board shows after this frame, outside any later patch.
        layout = (
            prepared["layout"]
            if prepared is not None
            else self.base_layout
            if self.base_pixels is not None and raw == self.base_pixels
            else None
        )
        self.patch_prepare_ms = round((time.monotonic() - started) * 1000, 1)
        packet = struct.pack(">IHHHHB", self.base_id, *rectangle, PATCH_CODECS[encoding]) + body
        encoded = base64.b64encode(packet).decode("ascii")
        self.pending = asyncio.get_running_loop().create_future()
        self.frame = {"id": frame_id, "touch_id": touch_id, "created": time.monotonic()}
        live = self.live = {"is_superseded": False, "future": self.pending}
        sent = time.monotonic()
        try:
            for offset in range(0, len(encoded), 4000):
                if live["is_superseded"]:
                    # The board never completed this frame, so its base is unchanged.
                    raise FrameSupersededError(f"Frame {frame_id} superseded while sending")
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
            try:
                response = await asyncio.wait_for(self.pending, timeout=FRAME_ACK_SECONDS)
            except FrameSupersededError:
                # Every chunk reached the board, which draws this frame before
                # anything queued behind it, so it is the next frame's base.
                self.base_id, self.base_pixels, self.base_layout = frame_id, raw, layout
                self.shown_slot = None
                raise
            except TimeoutError as error:
                raise TimeoutError(
                    f"Presto did not acknowledge frame {frame_id} ({len(packet)} bytes)"
                ) from error
            self.base_id, self.base_pixels, self.base_layout = frame_id, raw, layout
            self.shown_slot = None
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
        except FrameSupersededError:
            raise
        except Exception:
            self.base_id, self.base_pixels = 0, None
            raise
        finally:
            if live["future"].done() and not live["future"].cancelled():
                live["future"].exception()
            self.live = None
            self.pending = None

    def supersede_live(self):
        """Stop the frame in flight: a released swipe has a newer one."""
        live = self.live
        if live is None:
            return
        live["is_superseded"] = True
        if not live["future"].done():
            live["future"].set_exception(FrameSupersededError("Frame superseded by a swipe"))

    def find_slot(self, view, key):
        """The slot holding `view` drawn from `key`, or None when none is fresh."""
        return next(
            (
                slot
                for slot, held in self.slots.items()
                if held["view"] == view and held["key"] == key
            ),
            None,
        )

    def deferred_slots(self):
        """Slots the loader must not rewrite yet: the one just shown, while it settles."""
        if self.shown_slot is None:
            return frozenset()
        slot, shown_at = self.shown_slot
        if time.monotonic() - shown_at >= SHOWN_SLOT_DEFER_SECONDS:
            return frozenset()
        return frozenset({slot})

    async def show_slot(self, slot, touch_id):
        """Show a held frame now; it is acknowledged like any frame and becomes the base.

        The board abandons a live frame it was half way through receiving, so the
        caller holds the delivery lock and nothing live is in flight. A slot the board
        does not hold raises SlotUnavailableError with the picture and base unchanged.
        """
        held = self.slots.get(slot)
        if held is None:
            raise SlotUnavailableError(f"Slot {slot} holds no frame")
        if self.control_task.done():
            self.control_task.result()
        self.pending = asyncio.get_running_loop().create_future()
        self.frame = {
            "id": held["frame_id"],
            "touch_id": touch_id,
            "slot": slot,
            "created": time.monotonic(),
        }
        sent = time.monotonic()
        try:
            # A show is safe to repeat: the board swaps to a slot already on screen
            # for free and acknowledges it again. ESPHome can drop a queued
            # acknowledgement under backpressure, so a short re-ask beats waiting out
            # the whole timeout.
            response = None
            while response is None:
                remaining = FRAME_ACK_SECONDS - (time.monotonic() - sent)
                if remaining <= 0:
                    raise TimeoutError(f"Presto did not show slot {slot}")
                await self.api.execute_service(
                    self.actions["show_slot"], {"slot": slot, "touch_id": touch_id}
                )
                with contextlib.suppress(TimeoutError):
                    response = await asyncio.wait_for(
                        asyncio.shield(self.pending), timeout=min(SHOW_RECHECK_SECONDS, remaining)
                    )
            self.base_id, self.base_pixels = held["frame_id"], held["pixels"]
            self.base_layout = None
            self.shown_slot = (slot, time.monotonic())
            self.frames_drawn += 1
            self.last_ack = {
                "frame_id": held["frame_id"],
                "touch_id": touch_id,
                "decode_us": int(response[5]),
                "draw_us": int(response[6]),
            }
            self.last_delivery = {
                "frame_id": held["frame_id"],
                "touch_id": touch_id,
                "slot": slot,
                "view": held["view"],
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
        except SlotUnavailableError:
            # Nothing changed on the board; only this slot is known to be empty.
            self.slots.pop(slot, None)
            raise
        except Exception:
            self.base_id, self.base_pixels = 0, None
            raise
        finally:
            self.pending = None

    async def upload_slot(self, slot, frame_id, frame, should_continue):
        """Load `frame` into `slot` as a patch on what the slot holds.

        `should_continue` is asked before every chunk, so a live frame or a touch
        stops the upload between chunks. The board rewrites a slot in place from the
        first chunk, so the slot is empty from then until its `slot,` event reports
        success; a stopped upload leaves it empty, and the next one is a full frame.
        """
        epoch = self.slot_epoch
        previous = self.slots.get(slot)
        base_id, base_pixels = (
            (previous["frame_id"], previous["pixels"]) if previous is not None else (0, None)
        )
        body, encoding, rectangle = await asyncio.to_thread(
            encode_presto_patch, frame["pixels"], base_pixels
        )
        packet = struct.pack(">IHHHHB", base_id, *rectangle, int(encoding == "rle")) + body
        encoded = base64.b64encode(packet).decode("ascii")
        future = asyncio.get_running_loop().create_future()
        for offset in range(0, len(encoded), 4000):
            if not should_continue() or epoch != self.slot_epoch:
                return False
            is_final = offset + 4000 >= len(encoded)
            if offset == 0:
                # The board empties the slot here; it abandons any unfinished upload too.
                self.slots.pop(slot, None)
            if is_final:
                self.slot_pending = (slot, frame_id, future)
            await self.api.execute_service(
                self.actions["slot_chunk"],
                {
                    "slot": slot,
                    "frame_id": frame_id,
                    "format": 4,
                    "offset": offset,
                    "final_chunk": is_final,
                    "image_data": encoded[offset : offset + 4000],
                },
            )
            await asyncio.sleep(0.003)
        try:
            status = await asyncio.wait_for(future, timeout=SLOT_ACK_SECONDS)
        finally:
            self.slot_pending = None
        if status != "0" or epoch != self.slot_epoch:
            return False
        self.slots[slot] = {
            "view": frame["view"],
            "key": frame["key"],
            "frame_id": frame_id,
            "pixels": frame["pixels"],
            "targets": frame["targets"],
        }
        return True
