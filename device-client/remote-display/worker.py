#!/usr/bin/env python3
"""CastKit remote-browser client for an ESPHome RGB565 display."""

import argparse
import asyncio
import base64
import contextlib
import logging
import pathlib
import secrets
import signal
import time
import zlib
from urllib.parse import urlsplit

import yaml
from aioesphomeapi import APIClient, TextSensorState
from ambient_light import artwork_bounds
from camera_frames import CameraFrameFeed
from codec import (
    encode_frame,
    presto_frame_pixels,
    presto_frame_pixels_and_rgb,
    presto_frame_pixels_with_palette,
)
from esphome_presto import SLOT_COUNT, ESPHomePrestoTransport
from interaction import FrameGuard, Target
from manifest import parse_manifest, same_origin_url
from playwright.async_api import Error as BrowserError
from playwright.async_api import async_playwright
from presto_transport import FrameSupersededError, PrestoTransport, SlotUnavailableError
from preview import PreviewServer, validate_preview_port
from scroll_window import (
    BOARD_TAKE_PIXELS,
    SCROLL_STATE_SCRIPT,
    TOUCH_TAKEN,
    TOUCH_WINDOW,
    ScrollWindow,
    decode_rgb,
)
from stream_frames import StreamFrameFeed, plan_slots

LOG = logging.getLogger("castkit.remote-display")
ROOT = pathlib.Path(__file__).resolve().parent
BUILD_MARKER = "castkit-remote-display-v31b-stitch-change-count"
BROWSER_TIMEOUT_SECONDS = 5
TARGETS_SCRIPT = """({attribute, loadingSelector, width = 480, height = 320}) => {
const stage = document.querySelector('.stage');
const gestures = stage ? [{identity: `view-gesture:${stage.dataset.view}`,x:0,y:0,width,height,loading:false}] : [];
return gestures.concat(Array.from(document.querySelectorAll(`[${attribute}]`)).filter(element => {
  if (element.closest('[inert],[aria-hidden="true"]')) return false;
  const bounds = element.getBoundingClientRect();
  return bounds.width && bounds.height && bounds.left >= 0 && bounds.top >= 0 && bounds.right <= width && bounds.bottom <= height && !element.matches(':disabled,[aria-disabled="true"]');
}).map(element => { const bounds = element.getBoundingClientRect(); return {
  identity: element.getAttribute(attribute), x: bounds.x, y: bounds.y,
  width: bounds.width, height: bounds.height, loading: loadingSelector ? element.matches(loadingSelector) : false
}; })); }"""
HIT_SCRIPT = """({x,y,attribute}) => {
 const element = document.elementFromPoint(x,y)?.closest(`[${attribute}]`);
 return element && !element.matches(':disabled,[aria-disabled="true"]') ? element.getAttribute(attribute) : document.querySelector('.stage') ? `view-gesture:${document.querySelector('.stage').dataset.view}` : null;
}"""
SLIDER_HIT_SCRIPT = """({x,y}) => Boolean(
 document.elementFromPoint(x,y)?.closest('[role="slider"],input[type="range"]')
)"""
SCROLL_HIT_SCRIPT = """({x,y}) => {
 const hasScrollTarget = (document, pointX, pointY) => {
   const element = document.elementFromPoint(pointX, pointY);
   if (!element) return false;
   if (element.closest('[data-castkit-scroll]')) return true;
   if (element.tagName !== 'IFRAME') return false;
   try {
     const child = element.contentDocument;
     const bounds = element.getBoundingClientRect();
     return child ? hasScrollTarget(child,
       (pointX - bounds.left) * element.clientWidth / bounds.width,
       (pointY - bounds.top) * element.clientHeight / bounds.height) : false;
   } catch { return false; }
 };
 return hasScrollTarget(document,x,y);
}"""
# Longest the panel keeps the last complete view while the page shows a loading
# state. Past it the loading state is sent, so a view that never settles cannot
# freeze the glass. It stays under BROWSER_TIMEOUT_SECONDS.
SETTLE_HOLD_SECONDS = 3
# How often a held page is looked at again. A swipe between native views shows
# its loading state for 20-40 ms, so waiting out a whole capture cycle (125 ms
# at 8 fps) added most of a cycle to every swipe. The look is one evaluation.
HOLD_POLL_SECONDS = 0.02
# A page that reports no change is still captured this often: changes the page
# cannot observe (a decoded image frame, a canvas) reach the panel within it.
IDLE_CAPTURE_SECONDS = 1
# The last view the page asked for, `{id, view}`. Slatecast writes it in the
# same task that sends the request. The loading feedback in the DOM is not a
# usable signal: it renders a microtask later, and the server, on loopback,
# applies a native view so fast that its answer has often replaced the
# feedback before the worker's next evaluation (production: no release ever
# found it). The id tells a new request from one the worker saw already.
NAVIGATION_SCRIPT = "() => window.__castkitNavigation ?? null"
# The stage gesture's release, and the request it made, in one evaluation.
GESTURE_RELEASE_SCRIPT = """({x,y}) => {
 document.querySelector('.stage')?.dispatchEvent(new PointerEvent('pointerup', {bubbles:true,pointerId:1,clientX:x,clientY:y}));
 return window.__castkitNavigation ?? null;
}"""
# After a destination drawn ahead is shown, the live page must have been quiet
# this long (no DOM change, no load) before its capture may replace it. A view
# that has just mounted loads its images and then recolors from them (Now
# Playing's accent); each step would otherwise reach the glass as its own
# frame, and the first would show the artwork missing.
RELEASE_QUIET_SECONDS = 0.15
# How long a camera frame wait may hold the loop before the page is looked at
# again: a swipe or a view change must still end the camera promptly.
CAMERA_WAIT_SECONDS = 0.25
# The camera page's touch targets rarely change; read them again this often.
CAMERA_TARGETS_SECONDS = 1
# A slot loads only after the panel has been quiet this long: no live frame, no
# touch. It is the lowest-priority work on the link and must never delay a frame.
SLOT_QUIET_SECONDS = 0.5
# One cheap evaluation per cycle decides whether a capture is worth its cost.
# `changes` counts DOM mutations and load/animation/scroll events since the
# document started; `isLive` names content that repaints without them;
# `isSettled` is false while the shell is showing a loading state; and
# `hasPendingImages` is true while an image on the glass is still loading (a
# motion-JPEG stream never finishes loading and is left out).
PAGE_STATE_SCRIPT = """() => {
 if (!window.__castkitPageChanges) {
   const state = window.__castkitPageChanges = {count: 1};
   const bump = () => { state.count += 1 };
   new MutationObserver(bump).observe(document, {subtree:true, childList:true, attributes:true, characterData:true});
   for (const type of ['load','error','animationstart','animationend','transitionend','scroll']) document.addEventListener(type, bump, true);
   addEventListener('resize', bump);
   document.fonts?.addEventListener?.('loadingdone', bump);
 }
 const root = document.querySelector('[data-castkit-ready]');
 return {
   cameraFrames: document.querySelector('[data-castkit-camera-frames]')?.dataset.castkitCameraFrames ?? null,
   changes: window.__castkitPageChanges.count,
   isLive: Boolean(document.querySelector('video, canvas, iframe, img[src*="mjpeg" i]'))
     || document.getAnimations().some(animation => animation.playState === 'running'),
   isSettled: (!root || root.dataset.castkitReady === 'true')
     && !document.querySelector('.platform-loading, .platform-view[aria-busy="true"], .navigation-feedback[data-phase="loading"]'),
   // Why the page is not settled, for the log: the first matching loading marker.
   loadingMarker: root && root.dataset.castkitReady !== 'true' ? 'not-ready'
     : (document.querySelector('.platform-loading, .platform-view[aria-busy="true"], .navigation-feedback[data-phase="loading"]')?.className || null),
   hasPendingImages: Array.from(document.images).some(image => {
     if (image.complete || /mjpeg/i.test(image.currentSrc || image.src)) return false;
     const bounds = image.getBoundingClientRect();
     return bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0
       && bounds.left < innerWidth && bounds.top < innerHeight;
   }),
 };
}"""


def is_navigation_error(error):
    """A document replacement invalidates evaluations without killing the browser."""
    return isinstance(error, BrowserError) and any(
        message in str(error)
        for message in ("Execution context was destroyed", "Cannot find context with specified id")
    )


def read_config(path):
    config = yaml.safe_load(pathlib.Path(path).read_text())
    if not isinstance(config, dict):
        raise ValueError("Display configuration must be a mapping")
    is_presto = config.get("transport") in ("presto", "esphome-presto")
    for key in ("manifest_url", "mac", "secrets_path") + (
        () if config.get("transport") == "presto" else ("host",)
    ):
        if not isinstance(config.get(key), str) or not config[key]:
            raise ValueError(f"Missing display configuration field: {key}")
    parsed = urlsplit(config["manifest_url"])
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise ValueError("Display URL must be HTTP(S), without embedded credentials")
    validate_preview_port(config.get("preview_port"))
    if is_presto:
        port = config.get("listen_port")
        if type(port) is not int or not 1024 <= port <= 65535:
            raise ValueError("Presto requires a listen_port between 1024 and 65535")
        config["viewport"] = {"width": 480, "height": 480}
    return config


class DisplaySession:
    def __init__(self, config, page, client, services, stop, preview, feed=None):
        self.config, self.page, self.client, self.services, self.stop = (
            config,
            page,
            client,
            services,
            stop,
        )
        self.preview = preview
        self.pending = {}
        self.touches = asyncio.Queue(maxsize=128)
        self.queued_touch = None
        self.guard = FrameGuard(config.get("max_frame_age", 7))
        self.target_attribute = config.get("target_attribute", "data-castkit-target")
        self.target_options = {
            "attribute": self.target_attribute,
            "loadingSelector": config.get("loading_selector"),
            **config.get("viewport", {"width": 480, "height": 320}),
        }
        self.processed_touch = 0
        self.last_sequence = 0
        self.contact = None
        self.frame_id = secrets.randbelow(100_000_000) + 1
        self.force_frame = asyncio.Event()
        self.is_reset_required = False
        self.frames = 0
        self.last_report = time.monotonic()
        self.document_revision = 0
        self.document_changed_at = 0
        self.held_since = None
        # The loading state was logged once for this unsettled stretch.
        self.is_unsettled_logged = False
        self.captures = 0
        self.feed = feed
        # What the panel shows now, as the capture loop compares against it. A
        # swipe release that shows a destination drawn ahead writes it too.
        self.previous_payload = None
        self.previous_targets = []
        self.previous_touch = -1
        self.last_sent = time.monotonic()
        # Live frames, slot shows and slot loads share one link to the board.
        self.delivery_lock = asyncio.Lock()
        # Moves on every released swipe: a frame captured before it shows the
        # view being left, and is dropped instead of sent.
        self.release_generation = 0
        self.release_tasks = set()
        self.last_live_activity = 0
        self.releases_ahead = 0
        # Set when a destination drawn ahead was shown: until the live page has
        # built that view and gone quiet, its captures do not replace it.
        # {"until": deadline, "changes": last count seen, "changed_at": when}
        self.release_hold = None
        # The touch a destination drawn ahead acknowledged. The live capture of
        # that same picture is then no news and is not sent again.
        self.shown_release_touch = None
        # Server camera frames while the page shows a camera alert (camera_frames.py).
        self.camera = None
        self.camera_url = None
        self.camera_task = None
        self.camera_sequence = 0
        self.camera_targets = None
        self.camera_targets_at = 0
        self.camera_sent = 0
        self.camera_started = 0
        # A list that scrolls on the board itself (scroll_window.py). Its stitch moves the
        # page's list, so it and touch handling take the page in turn.
        self.page_lock = asyncio.Lock()
        self.pending_input = None
        self.scroll = ScrollWindow(self)

    def state_changed(self, state):
        if not isinstance(state, TextSensorState) or state.key != self.event_key:
            return
        parts = state.state.split(",")
        try:
            if parts[0] == "frame":
                future = self.pending.get(int(parts[1]))
                if future is not None and not future.done():
                    future.set_result(parts)
            elif parts[0] == "touch" and len(parts) >= 8:
                self.last_live_activity = time.monotonic()
                if self.touches.full():
                    while not self.touches.empty():
                        self.touches.get_nowait()
                    self.is_reset_required = True
                    self.queued_touch = None
                self.touches.put_nowait(parts)
            elif parts[0] == "scroll_at" and len(parts) == 3:
                # In order with the touches: the page follows before the next press.
                if not self.touches.full():
                    self.touches.put_nowait(parts)
            elif parts[0] == "error":
                if parts[1] == "device-restarted":
                    self.last_sequence = 0
                    self.processed_touch = 0
                    self.is_reset_required = True
                    self.queued_touch = None
                    while not self.touches.empty():
                        self.touches.get_nowait()
                    self.guard.frames.clear()
                    self.shown_release_touch = None
                    self.force_frame.set()
                for future in self.pending.values():
                    if not future.done():
                        future.set_exception(RuntimeError(parts[1]))
        except (ValueError, IndexError):
            LOG.warning("Ignored malformed display telemetry")

    async def cancel_contact(self):
        if self.contact is not None and self.contact.get("is_native_active"):
            await self.send_cdp(
                "Input.dispatchTouchEvent", {"type": "touchCancel", "touchPoints": []}
            )
        self.contact = None

    async def send_cdp(self, method, parameters):
        # CDP capture/input has no Playwright timeout. A stalled compositor
        # must hand control back to the reconnect loop before the glass goes stale.
        return await asyncio.wait_for(
            self.cdp.send(method, parameters), timeout=BROWSER_TIMEOUT_SECONDS
        )

    async def next_touch(self):
        event = self.queued_touch
        self.queued_touch = None
        if event is None:
            event = await self.touches.get()
        if event[0] != "touch" or int(event[2]) != 1:
            return event
        origin = self.contact or {"x": int(event[3]), "y": int(event[4])}
        direction_x = int(event[3]) - origin["x"]
        direction_y = int(event[4]) - origin["y"]
        while not self.touches.empty():
            candidate = self.touches.get_nowait()
            if candidate[0] != "touch" or int(candidate[2]) != 1:
                self.queued_touch = candidate
                break
            dx = int(candidate[3]) - int(event[3])
            dy = int(candidate[4]) - int(event[4])
            if dx * direction_x < 0 or dy * direction_y < 0:
                # Keep direction changes, so a pull-and-return cannot become a tap.
                self.queued_touch = candidate
                break
            direction_x = direction_x or dx
            direction_y = direction_y or dy
            event = candidate
        return event

    def document_changed(self, frame):
        if frame != self.page.main_frame:
            return
        self.document_revision += 1
        self.document_changed_at = time.monotonic()
        self.release_hold = None
        self.guard.frames.clear()
        self.is_reset_required = True
        self.force_frame.set()
        LOG.info("Display document changed; keeping device connection")

    async def input_loop(self):
        while True:
            try:
                await self.process_input()
            except BrowserError as error:
                if not is_navigation_error(error):
                    raise
                # The replaced document no longer owns this contact. Consume no
                # action from it; a new contact needs a newly acknowledged frame.
                self.contact = None
                self.processed_touch = self.last_sequence
                self.force_frame.set()

    async def process_input(self):
        while True:
            event = await self.next_touch()
            # The scroll window's stitch moves the page's list; a touch waits for it to
            # put the list back, and asks it to stop early.
            self.pending_input = event
            try:
                async with self.page_lock:
                    await self.handle_touch(event)
            finally:
                self.pending_input = None

    async def handle_touch(self, event):
        if event[0] == "scroll_at":
            # The board's own scroll came to rest: the page follows it.
            await self.scroll.board_scrolled(int(event[1]), int(event[2]))
            return
        sequence, phase, x, y = map(int, event[1:5])
        shown_frame = int(event[6])
        # Only scroll-window firmware puts flags and an offset in fields 5 and 7. The WT32
        # firmware puts a millisecond timestamp in field 5, which must never read as flags.
        flags, window_offset = (
            (int(event[5]), int(event[7])) if self.scroll.is_enabled() else (0, 0)
        )
        if self.is_reset_required:
            await self.cancel_contact()
            self.is_reset_required = False
        if sequence <= self.last_sequence or phase not in (0, 1, 2):
            return
        self.last_sequence = sequence
        if flags & TOUCH_TAKEN:
            # The board moves the list under this contact itself, and reports where it
            # rests. The page gives the contact up: no tap, no swipe.
            await self.cancel_contact()
            await self.scroll.board_took(window_offset)
            self.processed_touch = sequence
            self.force_frame.set()
            return
        if phase == 0 and flags & TOUCH_WINDOW:
            # Hit-test against the list where the panel shows it.
            await self.scroll.sync_press(window_offset)
        if phase == 0:
            await self.cancel_contact()
            # A new contact needs live feedback more than a still view.
            self.release_hold = None
            current = await self.page.evaluate(
                HIT_SCRIPT, {"x": x, "y": y, "attribute": self.target_attribute}
            )
            identity = self.guard.match(shown_frame, x, y, current)
            if identity is None:
                self.processed_touch = sequence
                self.force_frame.set()
                return
            self.contact = {
                "identity": identity,
                "x": x,
                "y": y,
                "start_x": x,
                "start_y": y,
                "started": time.monotonic(),
                "is_gesture": False,
                "is_native_active": False,
                "is_slider_drag": await self.page.evaluate(SLIDER_HIT_SCRIPT, {"x": x, "y": y}),
                "is_scroll_drag": await self.page.evaluate(SCROLL_HIT_SCRIPT, {"x": x, "y": y}),
                # The page's last request before this contact; a different
                # one at release was made by this contact.
                "navigation": await self.read_navigation(),
            }
        elif self.contact is None:
            # ESPHome replays its retained sensor value after reconnect.
            self.processed_touch = sequence
            self.force_frame.set()
            return
        if phase == 1 and (
            max(abs(x - self.contact["start_x"]), abs(y - self.contact["start_y"]))
            >= BOARD_TAKE_PIXELS
        ):
            # Forwarded past the board's threshold: the board will not take this contact.
            self.contact["is_past_board_take"] = True
        if phase == 2:
            x, y = self.contact["x"], self.contact["y"]
        if (
            phase == 1
            and not self.contact["is_gesture"]
            and not self.contact.get("is_scroll_drag", False)
            and not self.contact.get("is_slider_drag", False)
            and not self.contact["identity"].startswith("navigation-edge:")
            and max(abs(y - self.contact["start_y"]), abs(x - self.contact["start_x"])) >= 48
            and (
                self.contact["identity"] != "now-playing-artwork"
                or abs(y - self.contact["start_y"]) > abs(x - self.contact["start_x"])
            )
        ):
            if self.contact["is_native_active"]:
                await self.send_cdp(
                    "Input.dispatchTouchEvent", {"type": "touchCancel", "touchPoints": []}
                )
            self.contact["is_native_active"] = False
            self.contact["is_gesture"] = True
            await self.page.evaluate(
                """({x,y}) => document.querySelector('.stage')?.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,pointerId:1,clientX:x,clientY:y}))""",
                {"x": self.contact["start_x"], "y": self.contact["start_y"]},
            )
        if self.contact["is_gesture"]:
            if phase == 2:
                navigation = await self.page.evaluate(GESTURE_RELEASE_SCRIPT, {"x": x, "y": y})
                contact, self.contact = self.contact, None
                await self.release_swipe(sequence, contact, navigation)
            else:
                await self.page.evaluate(
                    """({x,y}) => document.querySelector('.stage')?.dispatchEvent(new PointerEvent('pointermove', {bubbles:true,pointerId:1,clientX:x,clientY:y}))""",
                    {"x": x, "y": y},
                )
                self.contact.update(x=x, y=y)
            self.processed_touch = sequence
            self.force_frame.set()
            return
        current = await self.page.evaluate(
            HIT_SCRIPT, {"x": x, "y": y, "attribute": self.target_attribute}
        )
        if time.monotonic() - self.contact["started"] > 5:
            await self.cancel_contact()
            self.processed_touch = sequence
            self.force_frame.set()
            return
        # Artwork captures its pointer: a horizontal drag can legitimately
        # leave its rectangle and must still receive the release. Other
        # controls retain the cross-control cancellation guard.
        is_artwork_drag = self.contact["identity"] == "now-playing-artwork" and abs(
            x - self.contact["start_x"]
        ) > abs(y - self.contact["start_y"])
        # Shell edges capture their pointer above native and external views.
        # Their acknowledged starting hitbox owns the whole inward pull.
        is_navigation_drag = self.contact["identity"].startswith("navigation-edge:")
        is_scroll_drag = self.contact.get("is_scroll_drag", False)
        # Sliders capture the original contact. Travel past 48 px or
        # outside the track stays an adjustment, never view navigation.
        is_slider_drag = self.contact.get("is_slider_drag", False)
        if (
            phase == 1
            and current != self.contact["identity"]
            and not is_artwork_drag
            and not is_navigation_drag
            and not is_scroll_drag
            and not is_slider_drag
        ):
            # Cancel the tap but keep sampling the finger: it may cross a
            # small control before travelling far enough to commit a swipe.
            if self.contact["is_native_active"]:
                await self.send_cdp(
                    "Input.dispatchTouchEvent", {"type": "touchCancel", "touchPoints": []}
                )
            self.contact.update(x=x, y=y, is_tap_cancelled=True, is_native_active=False)
            self.processed_touch = sequence
            self.force_frame.set()
            return
        if self.contact.get("is_tap_cancelled") or (
            current != self.contact["identity"]
            and not is_artwork_drag
            and not is_navigation_drag
            and not is_scroll_drag
            and not is_slider_drag
        ):
            if phase == 2:
                await self.cancel_contact()
            else:
                self.contact.update(x=x, y=y)
            self.processed_touch = sequence
            self.force_frame.set()
            return
        await self.send_cdp(
            "Input.dispatchTouchEvent",
            {
                "type": ("touchStart", "touchMove", "touchEnd")[phase],
                "touchPoints": [] if phase == 2 else [{"x": x, "y": y, "id": 0}],
            },
        )
        if phase == 2:
            contact, self.contact = self.contact, None
            # A native contact asks for a view too: a pull from a shell edge
            # (the top, bottom, and right strips), or a drag that began on a
            # scroll list or the artwork. The page handled the release inside
            # the touchEnd dispatch.
            await self.release_swipe(sequence, contact)
        else:
            self.contact.update(x=x, y=y, is_native_active=True)
        self.processed_touch = sequence
        self.force_frame.set()

    async def read_targets(self):
        return await asyncio.wait_for(
            self.page.evaluate(TARGETS_SCRIPT, self.target_options),
            timeout=BROWSER_TIMEOUT_SECONDS,
        )

    async def read_navigation(self):
        if self.feed is None or not isinstance(self.client, PrestoTransport):
            return None
        return await self.page.evaluate(NAVIGATION_SCRIPT)

    async def release_swipe(self, touch_id, contact, navigation=None):
        """A contact was released: if it asked for a view, show that view now.

        Every touch path ends here (the stage gesture and every native touch),
        once per contact. Only a request newer than the contact's start counts.
        Whatever the panel was still sending for the pull (its "Release for ..."
        hint) is stopped, and frames captured before the release are dropped, so
        the destination never waits behind them.
        """
        if self.feed is None or not isinstance(self.client, PrestoTransport):
            return
        if navigation is None:
            navigation = await self.read_navigation()
        if (
            not isinstance(navigation, dict)
            or not navigation.get("view")
            or navigation == contact.get("navigation")
        ):
            return
        view = navigation["view"]
        self.release_generation += 1
        self.client.supersede_live()
        frame = self.feed.read(view)
        if frame is None:
            LOG.info("release view=%s path=none (no frame drawn ahead)", view)
        # Held from the release itself: on loopback the page can have the new
        # view half built before the destination is even on the glass.
        self.release_hold = self.start_release_hold() if frame is not None else None
        task = asyncio.create_task(
            self.show_destination(view, frame, touch_id, self.release_generation)
        )
        self.release_tasks.add(task)
        task.add_done_callback(self.release_tasks.discard)

    @staticmethod
    def start_release_hold():
        now = time.monotonic()
        return {"until": now + SETTLE_HOLD_SECONDS, "changes": None, "changed_at": now}

    async def show_destination(self, view, frame, touch_id, generation):
        if frame is None:
            return
        started = time.monotonic()
        try:
            async with self.delivery_lock:
                if generation != self.release_generation:
                    return
                self.last_live_activity = time.monotonic()
                slot = self.client.find_slot(view, frame["key"]) if self.client.has_slots else None
                response = None
                if slot is not None:
                    try:
                        response = await self.client.show_slot(slot, touch_id)
                        frame_id = int(response[1])
                    except SlotUnavailableError as error:
                        # The board answered without changing the picture; send the
                        # frame instead, and the loader fills the slot again later.
                        LOG.info("Slot %s for %s unavailable: %s", slot, view, error)
                        slot = None
                if response is None:
                    # No fresh slot: the frame drawn ahead still beats waiting for
                    # the page to build the view and be captured. A patch leaves a
                    # scroll window in place, so it goes first.
                    await self.scroll.hide()
                    self.frame_id += 1
                    frame_id = self.frame_id
                    response = await self.client.send_frame(frame_id, touch_id, frame["pixels"])
                self.guard.remember(
                    frame_id,
                    [
                        Target(**{key: value for key, value in target.items() if key != "loading"})
                        for target in frame["targets"]
                    ],
                )
                self.preview.set_frame(frame["png"])
                self.previous_payload = frame["pixels"]
                self.previous_targets = frame["targets"]
                self.previous_touch = self.shown_release_touch = touch_id
                self.last_sent = self.last_live_activity = time.monotonic()
                self.frames += 1
                self.releases_ahead += 1
                # The full hold runs from the moment the board shows it.
                self.release_hold = self.start_release_hold()
                self.client.last_release = {
                    "view": view,
                    "path": "slot" if slot is not None else "frame",
                    "ms": round((time.monotonic() - started) * 1000, 1),
                }
                LOG.info(
                    "release view=%s path=%s ms=%s",
                    view,
                    self.client.last_release["path"],
                    self.client.last_release["ms"],
                )
        except FrameSupersededError:
            return
        except Exception as error:
            # The live capture still follows; a failed shortcut costs nothing more.
            LOG.warning("Swipe destination %s not shown ahead: %s", view, error)
            if generation == self.release_generation:
                self.release_hold = None

    async def send_frame(
        self,
        payload,
        touch_id,
        targets,
        format_id=2,
        generation=None,
        prepared=None,
        is_motion=False,
    ):
        self.frame_id += 1
        frame_id = self.frame_id
        if isinstance(self.client, PrestoTransport):
            async with self.delivery_lock:
                if generation is not None and generation != self.release_generation:
                    raise FrameSupersededError(f"Frame {frame_id} shows the view a swipe left")
                self.last_live_activity = time.monotonic()
                try:
                    # A touch can only use a frame that the physical panel acknowledged.
                    response = (
                        await self.client.send_frame(frame_id, touch_id, payload, prepared)
                        if prepared is not None
                        else await self.client.send_frame(
                            frame_id, touch_id, payload, is_motion=is_motion
                        )
                    )
                finally:
                    self.last_live_activity = time.monotonic()
            self.guard.remember(
                frame_id,
                [
                    Target(**{key: value for key, value in target.items() if key != "loading"})
                    for target in targets
                ],
            )
            return response
        if format_id == 2:
            rectangles = ";".join(
                ":".join(str(round(target[key])) for key in ("x", "y", "width", "height"))
                for target in targets
                if target["loading"]
            )
            await self.client.execute_service(
                self.services["configure_touch_regions"],
                {"frame_id": frame_id, "regions": rectangles},
            )
        future = asyncio.get_running_loop().create_future()
        self.pending[frame_id] = future
        encoded = base64.b64encode(payload).decode("ascii")
        try:
            for offset in range(0, len(encoded), 12000):
                await self.client.execute_service(
                    self.services["frame_chunk"],
                    {
                        "frame_id": frame_id,
                        "touch_id": touch_id,
                        "format": format_id,
                        "offset": offset,
                        "final_chunk": offset + 12000 >= len(encoded),
                        "image_data": encoded[offset : offset + 12000],
                    },
                )
            response = await asyncio.wait_for(future, timeout=6)
            if format_id == 2:
                self.guard.remember(
                    frame_id,
                    [
                        Target(**{key: value for key, value in target.items() if key != "loading"})
                        for target in targets
                    ],
                )
            return response
        finally:
            self.pending.pop(frame_id, None)

    def is_release_holding(self, page_state, now):
        """Whether the destination shown at release must stay on the glass.

        It stays until the live page has the view built: settled, every image on
        the glass loaded, and no change for RELEASE_QUIET_SECONDS. Then the next
        capture is compared against it, and only a real difference is sent.
        """
        hold = self.release_hold
        if hold is None:
            return False
        if now >= hold["until"]:
            # A view that never settles cannot freeze the glass.
            self.release_hold = None
            LOG.info(
                "release hold expired: settled=%s pending_images=%s marker=%s",
                page_state["isSettled"],
                page_state.get("hasPendingImages", False),
                page_state.get("loadingMarker"),
            )
            return False
        if self.release_tasks:
            # The destination is still on its way to the board.
            return True
        if page_state["changes"] != hold["changes"]:
            hold["changes"], hold["changed_at"] = page_state["changes"], now
        if (
            page_state["isSettled"]
            and not page_state.get("hasPendingImages", False)
            and now - hold["changed_at"] >= RELEASE_QUIET_SECONDS
        ):
            self.release_hold = None
            return False
        return True

    def has_camera_frames(self):
        """Server camera frames reach ESPHome Prestos and the WT32; the HTTP Presto
        receiver keeps page capture."""
        return isinstance(self.client, ESPHomePrestoTransport) or not isinstance(
            self.client, PrestoTransport
        )

    async def set_camera(self, url):
        """Start or stop reading server camera frames as the page names them."""
        if url == self.camera_url:
            return
        if self.camera_task is not None:
            self.camera_task.cancel()
            await asyncio.gather(self.camera_task, return_exceptions=True)
        if self.camera is not None:
            LOG.info(
                "Camera frames ended: sent=%s received=%s seconds=%.1f",
                self.camera_sent,
                self.camera.received,
                time.monotonic() - self.camera_started,
            )
        self.camera = self.camera_task = None
        self.camera_url = url
        self.camera_sequence = 0
        self.camera_targets = None
        self.camera_sent = 0
        if isinstance(self.client, PrestoTransport):
            self.client.camera = None
        if url is None:
            # The page takes the glass back from the next capture.
            self.force_frame.set()
            return
        # Camera frames are patches drawn under any scroll window.
        await self.scroll.hide()
        resolved = same_origin_url(self.config["manifest_url"], url)
        cookies = await self.page.context.cookies([resolved])
        viewport = self.config.get("viewport", {"width": 480, "height": 320})
        # A board with a JPEG decoder gets about a fifth of the bytes per picture.
        codec = "jpeg" if getattr(self.client, "has_jpeg", False) else "zlib"
        self.camera = CameraFrameFeed(
            resolved,
            "; ".join(f"{cookie['name']}={cookie['value']}" for cookie in cookies),
            viewport["width"],
            viewport["height"],
            codec=codec,
        )
        self.camera_task = asyncio.create_task(self.camera.run())
        self.camera_started = time.monotonic()
        LOG.info("Camera frames started: codec=%s", codec)

    async def camera_cycle(self, cycle, touch_id, generation):
        """Send the newest server camera frame, or wait briefly for one.

        Returns False when the page should be captured instead: no fresh camera
        frame yet (the server is still starting the camera) or it stalled.
        """
        if self.camera_task is not None and self.camera_task.done():
            self.camera_task.result()
        if not self.camera.is_fresh():
            return False
        if self.camera_targets is None or cycle - self.camera_targets_at >= CAMERA_TARGETS_SECONDS:
            self.camera_targets = await asyncio.wait_for(
                self.page.evaluate(TARGETS_SCRIPT, self.target_options),
                timeout=BROWSER_TIMEOUT_SECONDS,
            )
            self.camera_targets_at = cycle
        frame = await self.camera.wait_for_newer(self.camera_sequence, CAMERA_WAIT_SECONDS)
        if frame is None:
            if (
                self.previous_payload is not None
                and time.monotonic() - self.last_sent >= self.config["heartbeat_seconds"]
            ):
                with contextlib.suppress(FrameSupersededError):
                    await self.send_frame(
                        self.previous_payload,
                        self.previous_touch,
                        self.previous_targets,
                        generation=generation,
                    )
                    self.last_sent = time.monotonic()
            return True
        is_presto = isinstance(self.client, PrestoTransport)
        if self.camera.codec == "jpeg" and not getattr(self.client, "has_jpeg", False):
            # The board refused a JPEG patch: ask the server for zlib from now on.
            self.camera.codec = "zlib"
            LOG.info("Camera frames switched: codec=zlib")
        if is_presto:
            payload = frame["pixels"]
            prepared = {
                "patch": frame["patch"],
                "body": frame["body"],
                "layout": frame["layout"],
                "codec": frame["codec"],
            }
        else:
            # The WT32 takes one zlib frame of the whole panel; the server sends
            # exactly that when the patch covers the panel.
            payload = (
                frame["body"]
                if frame["codec"] == "zlib"
                and frame["patch"]
                == (0, 0, self.target_options["width"], self.target_options["height"])
                else await asyncio.to_thread(zlib.compress, frame["pixels"], 1)
            )
            prepared = None
        started = time.monotonic()
        try:
            response = await self.send_frame(
                payload, touch_id, self.camera_targets, generation=generation, prepared=prepared
            )
        except FrameSupersededError:
            # A released swipe took the panel over; the page decides what is next.
            return True
        self.camera_sequence = frame["sequence"]
        self.previous_payload, self.previous_targets = payload, self.camera_targets
        self.last_sent, self.previous_touch = time.monotonic(), touch_id
        self.frames += 1
        self.camera_sent += 1
        elapsed = max(time.monotonic() - self.camera_started, 0.001)
        stats = {
            "frames": self.camera_sent,
            "fps": round(self.camera_sent / elapsed, 2),
            "send_ms": round((time.monotonic() - started) * 1000, 1),
            "origin": frame["origin"],
            "codec": frame["codec"],
            "bytes": len(frame["body"]),
        }
        if response is not None and len(response) >= 7:
            stats.update(decode_ms=int(response[5]) / 1000, draw_ms=int(response[6]) / 1000)
        if is_presto:
            self.client.camera = stats
        if time.monotonic() - self.last_report >= 10:
            LOG.info("camera %s", stats)
            self.last_report = time.monotonic()
        return True

    def is_slot_quiet(self):
        return (
            not self.delivery_lock.locked()
            and self.contact is None
            and self.held_since is None
            and time.monotonic() - self.last_live_activity >= SLOT_QUIET_SECONDS
        )

    async def slot_loop(self):
        """Keep the board's slots holding the current swipe destinations.

        Lowest priority: a load starts only on a quiet panel and stops between
        chunks for any live frame or touch. With every slot fresh it waits for
        the feed to change and uses no time at all.
        """
        while True:
            version = self.feed.version
            deferred = self.client.deferred_slots()
            plan = plan_slots(self.client.slots, self.feed.ordered(), SLOT_COUNT, deferred)
            if not plan:
                if deferred and plan_slots(self.client.slots, self.feed.ordered(), SLOT_COUNT):
                    # Only the slot on screen needs work; it settles first.
                    await asyncio.sleep(HOLD_POLL_SECONDS * 5)
                    continue
                await self.feed.wait_for_change(version)
                continue
            quiet_in = SLOT_QUIET_SECONDS - (time.monotonic() - self.last_live_activity)
            if not self.is_slot_quiet():
                await asyncio.sleep(max(quiet_in, HOLD_POLL_SECONDS * 5))
                continue
            slot, frame = plan[0]
            self.frame_id += 1
            try:
                is_loaded = await self.client.upload_slot(
                    slot, self.frame_id, frame, self.is_slot_quiet
                )
            except (TimeoutError, RuntimeError, ValueError) as error:
                LOG.warning("Slot %s did not load %s: %s", slot, frame["view"], error)
                is_loaded = False
                await asyncio.sleep(1)
            if not is_loaded:
                await asyncio.sleep(HOLD_POLL_SECONDS)

    async def wait_for_cycle(self, cycle, is_holding=False):
        delay = max(0, 1 / self.config["max_fps"] - (time.monotonic() - cycle))
        if is_holding:
            # A touch left the force flag set; waking on it would spin the hold.
            await asyncio.sleep(min(delay, HOLD_POLL_SECONDS))
            return
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self.force_frame.wait(), timeout=delay)

    async def run(self, event_key, loading_frame):
        self.event_key = event_key
        self.cdp = await self.page.context.new_cdp_session(self.page)
        self.client.subscribe_states(self.state_changed)
        self.page.on("framenavigated", self.document_changed)
        if loading_frame is not None:
            await self.send_frame(loading_frame, 0, [], format_id=3)
        input_task = asyncio.create_task(self.input_loop())
        slot_task = (
            asyncio.create_task(self.slot_loop())
            if self.feed is not None and self.client.has_slots
            else None
        )
        self.last_sent = time.monotonic()
        last_capture = 0
        captured_changes = None
        try:
            while not self.stop.is_set():
                if input_task.done():
                    input_task.result()
                if slot_task is not None and slot_task.done():
                    slot_task.result()
                cycle = time.monotonic()
                if cycle - max(self.last_sent, self.document_changed_at) > BROWSER_TIMEOUT_SECONDS:
                    raise TimeoutError("No stable frame captured")
                touch_id = self.processed_touch
                generation = self.release_generation
                document_revision = self.document_revision
                try:
                    page_state = await asyncio.wait_for(
                        self.page.evaluate(PAGE_STATE_SCRIPT),
                        timeout=BROWSER_TIMEOUT_SECONDS,
                    )
                except BrowserError as error:
                    if not is_navigation_error(error):
                        raise
                    await asyncio.sleep(0.05)
                    continue
                except TimeoutError as error:
                    if document_revision == self.document_revision:
                        raise TimeoutError("Browser capture stalled") from error
                    continue
                if page_state["isSettled"]:
                    self.held_since = None
                    self.is_unsettled_logged = False
                elif self.held_since is None:
                    self.held_since = cycle
                elif (
                    cycle - self.held_since >= SETTLE_HOLD_SECONDS and not self.is_unsettled_logged
                ):
                    # Past the hold the loading state reaches the glass; say why.
                    self.is_unsettled_logged = True
                    LOG.info(
                        "page unsettled for %.1f s, sending it: marker=%s pending_images=%s",
                        cycle - self.held_since,
                        page_state.get("loadingMarker"),
                        page_state.get("hasPendingImages", False),
                    )
                self.scroll.observe(page_state)
                is_scroll_enabled = self.scroll.is_enabled()
                # An image panel costs about half a second to show any frame, so
                # a loading state on the glass both looks broken and delays the
                # finished view behind it. Keep the last complete view instead.
                is_release_holding = self.is_release_holding(page_state, cycle)
                is_holding = is_release_holding or (
                    self.held_since is not None and cycle - self.held_since < SETTLE_HOLD_SECONDS
                )
                await self.set_camera(
                    page_state.get("cameraFrames") if self.has_camera_frames() else None
                )
                # A destination shown at a release keeps the glass until its view
                # is built, so a camera alert being swiped away never draws over it.
                if (
                    self.camera is not None
                    and page_state["isSettled"]
                    and self.contact is None
                    and not is_release_holding
                    and await self.camera_cycle(cycle, touch_id, generation)
                ):
                    continue
                is_capture_due = (
                    self.force_frame.is_set()
                    or self.contact is not None
                    or page_state["isLive"]
                    or page_state["changes"] != captured_changes
                    or self.previous_payload is None
                    or cycle - last_capture
                    >= min(IDLE_CAPTURE_SECONDS, self.config["heartbeat_seconds"])
                )
                if is_holding or not is_capture_due:
                    if (
                        self.previous_payload is not None
                        and cycle - self.last_sent >= self.config["heartbeat_seconds"]
                    ):
                        # The heartbeat repeats what the panel already shows; it
                        # never acknowledges a touch the held page has not drawn.
                        with contextlib.suppress(FrameSupersededError):
                            await self.send_frame(
                                self.previous_payload,
                                self.previous_touch,
                                self.previous_targets,
                                generation=generation,
                            )
                            self.last_sent = time.monotonic()
                    await self.wait_for_cycle(cycle, is_holding)
                    continue
                try:
                    before = await asyncio.wait_for(
                        self.page.evaluate(TARGETS_SCRIPT, self.target_options),
                        timeout=BROWSER_TIMEOUT_SECONDS,
                    )
                    capture_started = time.monotonic()
                    if isinstance(self.client, PrestoTransport):
                        shot = await self.send_cdp(
                            "Page.captureScreenshot",
                            {
                                "format": "png",
                                "fromSurface": True,
                                "captureBeyondViewport": False,
                                "optimizeForSpeed": True,
                            },
                        )
                        png = base64.b64decode(shot["data"])
                    else:
                        png = await self.page.screenshot(
                            type="png", animations="disabled", timeout=5000
                        )
                    capture_finished = time.monotonic()
                    after = await asyncio.wait_for(
                        self.page.evaluate(TARGETS_SCRIPT, self.target_options),
                        timeout=BROWSER_TIMEOUT_SECONDS,
                    )
                    # A loading state that began during the capture would
                    # otherwise reach the glass for one frame.
                    is_settled_after = (
                        await asyncio.wait_for(
                            self.page.evaluate(PAGE_STATE_SCRIPT),
                            timeout=BROWSER_TIMEOUT_SECONDS,
                        )
                    )["isSettled"]
                    # Where the list marked to scroll is, for the scroll window.
                    scroll_state = (
                        await asyncio.wait_for(
                            self.page.evaluate(SCROLL_STATE_SCRIPT, self.scroll.options()),
                            timeout=BROWSER_TIMEOUT_SECONDS,
                        )
                        if is_scroll_enabled
                        else None
                    )
                except BrowserError as error:
                    if not is_navigation_error(error):
                        raise
                    # A real document reload invalidates capture. Keep it bounded
                    # without rebuilding the encrypted device session.
                    await asyncio.sleep(0.05)
                    continue
                except TimeoutError as error:
                    if document_revision == self.document_revision:
                        # Name the stall so a reconnect log separates a browser capture
                        # stall from a board that never acknowledged its frame.
                        raise TimeoutError("Browser capture stalled") from error
                    continue
                if document_revision != self.document_revision or before != after:
                    continue
                if not is_settled_after and self.held_since is None:
                    self.held_since = time.monotonic()
                    continue
                self.captures += 1
                captured_changes, last_capture = page_state["changes"], capture_started
                self.preview.set_frame(png)
                needs_palette = (
                    isinstance(self.client, PrestoTransport)
                    and self.client.ambient_light is not None
                    and self.client.ambient_light["on"]
                    and self.client.ambient_light["mode"] in ("album-glow", "swipe-comet")
                )
                # The capture's RGB, kept only to compare it with the scroll picture.
                rgb = None
                if needs_palette:
                    payload, colors = await asyncio.to_thread(
                        presto_frame_pixels_with_palette, png, artwork_bounds(after)
                    )
                    self.client.set_ambient_palette(colors)
                    if scroll_state is not None:
                        rgb = await asyncio.to_thread(decode_rgb, png)
                elif scroll_state is not None:
                    payload, rgb = await asyncio.to_thread(presto_frame_pixels_and_rgb, png)
                else:
                    payload = (
                        await asyncio.to_thread(presto_frame_pixels, png)
                        if isinstance(self.client, PrestoTransport)
                        else await asyncio.to_thread(encode_frame, png)
                    )
                encoded_at = time.monotonic()
                if isinstance(self.client, PrestoTransport):
                    self.client.capture_ms = round((capture_finished - capture_started) * 1000, 1)
                    self.client.encode_ms = round((encoded_at - capture_finished) * 1000, 1)
                is_forced = self.force_frame.is_set()
                self.force_frame.clear()
                # The built view matches the destination shown at its release,
                # which already acknowledged this touch with these pixels.
                is_release_echo = (
                    self.shown_release_touch is not None
                    and touch_id == self.previous_touch == self.shown_release_touch
                    and payload == self.previous_payload
                )
                if is_scroll_enabled:
                    # A patch is drawn under a shown window; one that differs there hides it.
                    await self.scroll.before_frame(rgb, scroll_state)
                if (
                    payload != self.previous_payload
                    # Captured gestures with no visual change need no extra
                    # round trip for every move. Preserve changed drag frames,
                    # the release acknowledgement and the periodic heartbeat.
                    or (
                        self.contact is None
                        and (touch_id != self.previous_touch or (is_forced and not is_release_echo))
                    )
                    or cycle - self.last_sent >= self.config["heartbeat_seconds"]
                ):
                    try:
                        # A finger on the glass: the frame is gone in a fraction of a
                        # second, so it may travel as JPEG on a board that decodes one.
                        response = await self.send_frame(
                            payload,
                            touch_id,
                            after,
                            generation=generation,
                            is_motion=self.contact is not None,
                        )
                    except FrameSupersededError:
                        # A released swipe took the panel over; capture again.
                        continue
                    self.shown_release_touch = None
                    (
                        self.previous_payload,
                        self.previous_targets,
                        self.last_sent,
                        self.previous_touch,
                    ) = (
                        payload,
                        after,
                        time.monotonic(),
                        touch_id,
                    )
                    self.frames += 1
                    if time.monotonic() - self.last_report >= 30:
                        LOG.info(
                            "frames=%s captures=%s releases_ahead=%s payload=%s decode_ms=%.1f draw_ms=%.1f",
                            self.frames,
                            self.captures,
                            self.releases_ahead,
                            len(payload),
                            int(response[5]) / 1000,
                            int(response[6]) / 1000,
                        )
                        self.last_report = time.monotonic()
                if is_scroll_enabled:
                    await self.scroll.after_frame(rgb, scroll_state, page_state, payload)
                await self.wait_for_cycle(cycle)
        finally:
            self.page.remove_listener("framenavigated", self.document_changed)
            background = [input_task, *self.release_tasks] + (
                [slot_task] if slot_task is not None else []
            )
            for task in background:
                task.cancel()
            await asyncio.gather(*background, return_exceptions=True)
            await self.scroll.close()
            await self.set_camera(None)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self.cancel_contact(), timeout=BROWSER_TIMEOUT_SECONDS)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self.cdp.detach(), timeout=BROWSER_TIMEOUT_SECONDS)


async def create_browser_context(browser, config):
    """Restore infrastructure credentials without changing panel rendering properties."""
    return await browser.new_context(
        viewport=config.get("viewport", {"width": 480, "height": 320}),
        device_scale_factor=1,
        has_touch=True,
        is_mobile=True,
        reduced_motion="reduce",
        accept_downloads=False,
        storage_state=config.get("browser_storage_state"),
    )


async def guard_navigation(page, origin):
    """Keep the top document on the kiosk origin; leave every subresource alone.

    `page.route("**/*")` did this before, but a Playwright route turns EVERY
    request into a Request, Response and Route object that the driver and this
    process both keep until the driver's per-type cap of 10,000. View preparation
    made that a steady stream of image and data requests, so each driver grew by
    100 MiB or more over a day. Chromium's own interception, limited to
    documents, sees only navigations and creates no Playwright objects.
    """
    cdp = await page.context.new_cdp_session(page)
    main_frame_id = (await cdp.send("Page.getFrameTree"))["frameTree"]["frame"]["id"]

    async def decide(event):
        requested = urlsplit(event["request"]["url"])
        is_blocked = (
            event.get("frameId") == main_frame_id and (requested.scheme, requested.netloc) != origin
        )
        # A request for a page that has since closed has nobody left to answer.
        with contextlib.suppress(Exception):
            if is_blocked:
                await cdp.send(
                    "Fetch.failRequest",
                    {"requestId": event["requestId"], "errorReason": "BlockedByClient"},
                )
            else:
                await cdp.send("Fetch.continueRequest", {"requestId": event["requestId"]})

    cdp.on("Fetch.requestPaused", lambda event: asyncio.ensure_future(decide(event)))
    await cdp.send(
        "Fetch.enable",
        {"patterns": [{"urlPattern": "*", "resourceType": "Document", "requestStage": "Request"}]},
    )
    return cdp


async def poll_controls(context, config, transport, stop):
    """Read app-owned controls independently of capture and frame acknowledgements."""
    while not stop.is_set():
        try:
            response = await context.request.get(config["controls_url"], timeout=5000)
            try:
                same_origin_url(config["manifest_url"], response.url)
                if not response.ok:
                    raise ConnectionError("Controls unavailable")
                controls = await response.json()
            finally:
                # The Playwright driver keeps every APIResponse body and fetch log
                # until it is disposed or the context closes. At two polls a second
                # that grew each worker's driver by about 10 MiB a minute.
                await response.dispose()
            if "backlight_percent" in controls:
                transport.set_backlight(controls["backlight_percent"])
            if "wake_percent" in controls:
                transport.set_wake(controls["wake_percent"], controls.get("wake_seconds", 30))
            transport.set_ambient_light(
                controls.get("ambientLight"), controls.get("ambientLightData")
            )
        except Exception as error:
            LOG.warning("Display controls unavailable: %s", type(error).__name__)
        await asyncio.sleep(0.5)


async def serve(config):
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        asyncio.get_running_loop().add_signal_handler(sig, stop.set)
    credentials = yaml.safe_load(pathlib.Path(config["secrets_path"]).read_text())
    is_presto = config.get("transport") in ("presto", "esphome-presto")
    api_key = credentials[
        config.get(
            "api_key_name",
            "presto_token" if config.get("transport") == "presto" else "api_encryption_key",
        )
    ]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            **({"executable_path": config["chromium"]} if config.get("chromium") else {}),
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await create_browser_context(browser, config)
        manifest_response = await context.request.get(config["manifest_url"], timeout=15000)
        same_origin_url(config["manifest_url"], manifest_response.url)
        if not manifest_response.ok:
            raise ConnectionError("CastKit manifest unavailable")
        config = {
            **config,
            **parse_manifest(
                await manifest_response.json(),
                config["manifest_url"],
                config.get("viewport"),
                max_cache_entries=0 if is_presto else 1,
            ),
        }
        # Refresh limits describe transport capability, not a user-facing view setting.
        if is_presto:
            config = {**config, "max_fps": min(config["max_fps"], 8)}
        presto = (
            ESPHomePrestoTransport(config, api_key)
            if config.get("transport") == "esphome-presto"
            else PrestoTransport(config, api_key)
            if is_presto
            else None
        )
        controls_task = None
        feed = None
        feed_task = None
        if presto is not None:
            await presto.start()
            if config.get("controls_url"):
                controls_task = asyncio.create_task(poll_controls(context, config, presto, stop))
            if config.get("stream_frames_url"):
                feed = StreamFrameFeed(
                    context.request, config["stream_frames_url"], presto_frame_pixels
                )

                def count_frames(count):
                    presto.frames_ahead = count

                feed_task = asyncio.create_task(feed.run(stop, count_frames))
        page = await context.new_page()
        requested_origin = urlsplit(config["url"])
        origin = (requested_origin.scheme, requested_origin.netloc)
        await guard_navigation(page, origin)
        loading_frame = None
        if config["cache_url"]:
            loading = await context.new_page()
            response = await loading.goto(
                config["cache_url"], wait_until="networkidle", timeout=15000
            )
            same_origin_url(config["manifest_url"], loading.url)
            if response is None or not response.ok:
                raise ConnectionError("Cached image URL unavailable")
            await loading.evaluate("document.fonts.ready")
            loading_frame = await asyncio.to_thread(
                encode_frame, await loading.screenshot(type="png", animations="disabled")
            )
            await loading.close()
        LOG.info("%s starting", BUILD_MARKER)
        preview = PreviewServer(BUILD_MARKER, config["max_fps"], config.get("preview_port"))
        await preview.start()
        try:
            while not stop.is_set():
                client = presto or APIClient(config["host"], 6053, None, noise_psk=api_key)
                try:
                    if page.is_closed():
                        page = await context.new_page()
                        await guard_navigation(page, origin)
                    if page.url == "about:blank" or (
                        config["ready_selector"]
                        and not await page.locator(config["ready_selector"]).count()
                    ):
                        response = await page.goto(
                            config["url"], wait_until="domcontentloaded", timeout=15000
                        )
                        if response is None or not response.ok:
                            raise ConnectionError("Kiosk page unavailable")
                        if config["ready_selector"]:
                            await page.locator(config["ready_selector"]).wait_for(timeout=15000)
                    await client.connect(login=True)
                    if is_presto:
                        actions, event_key = {}, 1
                        LOG.info(
                            "Presto connected; firmware=%s slots=%s",
                            client.build_marker,
                            getattr(client, "has_slots", False),
                        )
                    else:
                        info = await client.device_info()
                        if info.mac_address.lower().replace(":", "") != config[
                            "mac"
                        ].lower().replace(":", ""):
                            raise ValueError("Device identity mismatch")
                        entities, services = await client.list_entities_services()
                        actions = {service.name: service for service in services}
                        if not {"frame_chunk", "configure_touch_regions"} <= actions.keys():
                            raise ValueError("The display needs CastKit remote-display firmware")
                        event_key = next(
                            entity.key for entity in entities if entity.name == "Display Events"
                        )
                        LOG.info("Display connected; firmware=%s", info.compilation_time)
                    session = DisplaySession(config, page, client, actions, stop, preview, feed)
                    await session.run(event_key, loading_frame)
                except Exception as error:
                    LOG.warning(
                        "Display session ended: %s: %s; reconnecting", type(error).__name__, error
                    )
                    if not browser.is_connected():
                        # A killed browser has no context left to recreate pages
                        # in. Exit so the service supervisor starts a fresh worker.
                        LOG.error("Capture browser disconnected; restarting worker")
                        raise
                    # Recreate a stalled page instead of reusing its compositor.
                    with contextlib.suppress(Exception):
                        await asyncio.wait_for(page.close(), timeout=BROWSER_TIMEOUT_SECONDS)
                finally:
                    await client.disconnect()
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(stop.wait(), timeout=2)
        finally:
            for task in (controls_task, feed_task):
                if task is not None:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
            await preview.stop()
            if presto is not None:
                await presto.stop()
            await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(serve(read_config(args.config)))
