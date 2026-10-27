"""Scroll a list on the Presto board itself, over a tall picture drawn ahead.

A drag on a list used to travel to this worker, move the page, and come back as a frame:
about a second per step. Firmware with a scroll window holds a picture of the whole list in
PSRAM and moves its scanout over it, so a drag costs the link nothing. This worker draws
that picture by stepping the list's `scrollTop` and stitching the captures, uploads it when
the list is still and has changed, shows the window when the panel already shows the same
rows, and hides it before any frame that would differ under it. When the board reports
where a drag left the list (`scroll_at`), the page is moved there, so the next tap lands
on what the panel shows.

The window is full panel width, on the board's 8-row grid, inside the list's padding box.
Everything else in those rows must not move with the list: each stitch checks that.
"""

import asyncio
import base64
import contextlib
import io
import logging
import math
import time

import numpy as np
from aioesphomeapi import APIConnectionError
from codec import presto_rows_pixels
from interaction import Target
from PIL import Image
from playwright.async_api import Error as BrowserError

LOG = logging.getLogger("castkit.remote-display")

# The board's window edges sit on its 8-row scanout batches.
WINDOW_ALIGN = 8
# A smaller window is not worth a picture.
MIN_WINDOW_ROWS = 64
# Bands overlap by this many rows; the overlap must match, which proves the list moved
# as one piece (no sticky header, no content that changed between captures).
BAND_OVERLAP_ROWS = 8
# The list and the page must have been still this long before a picture is drawn.
STITCH_QUIET_SECONDS = 0.5
# A picture that could not be drawn waits before it is tried again: REFUSAL_BACKOFF_SECONDS
# after the first refusal, doubling with each refusal in a row up to REFUSAL_RETRY_SECONDS.
# A page that has not changed since waits the whole REFUSAL_RETRY_SECONDS. Every attempt holds
# the capture loop and the page, so a list whose text changes every second or two must not
# be drawn again and again.
REFUSAL_BACKOFF_SECONDS = 2
REFUSAL_RETRY_SECONDS = 30
# The board takes a contact once it travels this far (esphome-presto `ScrollDrag::THRESHOLD`).
# A contact still forwarded past it is never the board's.
BOARD_TAKE_PIXELS = 12
# The board owns a drag from the contact it takes until it reports `scroll_at`.
BOARD_DRAG_SECONDS = 10
# The touch report flags (esphome-presto `TouchFlags`).
TOUCH_TAKEN = 1
TOUCH_WINDOW = 2

# The first list marked `data-castkit-scroll` that overflows and lies wholly on the glass.
FIND_SCROLL = """({attribute, width, height}) => {
 const element = Array.from(document.querySelectorAll('[data-castkit-scroll]')).find(element => {
   if (element.closest('[inert],[aria-hidden="true"]')) return false;
   const bounds = element.getBoundingClientRect();
   return element.scrollHeight > element.clientHeight && bounds.width > 0 && bounds.height > 0
     && bounds.left >= 0 && bounds.top >= 0 && bounds.right <= width && bounds.bottom <= height;
 }) ?? null;
 window.__castkitScrollElement = element;
 if (!element) return null;
 const bounds = element.getBoundingClientRect();
 return {
   identity: element.getAttribute(attribute) ?? '',
   left: bounds.left + element.clientLeft, top: bounds.top + element.clientTop,
   width: element.clientWidth, height: element.clientHeight,
   scrollTop: element.scrollTop, scrollHeight: element.scrollHeight,
 };
}"""
SCROLL_STATE_SCRIPT = f"options => ({FIND_SCROLL})(options)"
# Move the list named `identity` to `top`; returns where it was and is, or null when the
# list on the glass is another one.
SCROLL_TO_SCRIPT = f"""options => {{
 const state = ({FIND_SCROLL})(options);
 if (!state || state.identity !== options.identity) return null;
 const element = window.__castkitScrollElement;
 if (element.scrollTop !== options.top) element.scrollTop = options.top;
 return {{before: state.scrollTop, after: element.scrollTop}};
}}"""
# The document events the page's change count listens to (PAGE_STATE_SCRIPT in worker.py).
STITCH_EVENTS = "['load', 'error', 'animationstart', 'animationend', 'transitionend', 'scroll']"
# Start a stitch: watch the document for any change, and say whether anything covers the
# list's window rows or plays inside it.
STITCH_BEGIN_SCRIPT = f"""options => {{
 const STITCH_EVENTS = {STITCH_EVENTS};
 const state = ({FIND_SCROLL})(options);
 if (!state) return null;
 const element = window.__castkitScrollElement;
 let isCovered = false;
 for (let y = options.top + 4; y < options.bottom; y += 16) {{
   for (let x = state.left + 4; x < state.left + state.width; x += 16) {{
     const hit = document.elementFromPoint(x, y);
     if (!hit || !element.contains(hit)) isCovered = true;
   }}
 }}
 const isLive = Boolean(element.querySelector('video, canvas, iframe, img[src*="mjpeg" i]'))
   || element.getAnimations({{subtree: true}}).some(animation => animation.playState === 'running');
 const stitch = window.__castkitStitch = {{
   changes: 0, start: element.scrollTop, element, pageChanges: window.__castkitPageChanges?.count,
 }};
 stitch.bump = () => {{ stitch.changes += 1 }};
 stitch.observer = new MutationObserver(stitch.bump);
 stitch.observer.observe(document, {{subtree: true, childList: true, attributes: true, characterData: true}});
 // Everything the page's change count hears (PAGE_STATE_SCRIPT), except the stitch's own
 // scrolling of the list: END puts the count back to its start plus these, so a change of
 // any kind during a stitch still reaches the capture loop.
 stitch.onEvent = event => {{
   if (event.type !== 'scroll' || event.target !== element) stitch.changes += 1;
 }};
 for (const type of STITCH_EVENTS) document.addEventListener(type, stitch.onEvent, true);
 addEventListener('resize', stitch.bump);
 document.fonts?.addEventListener?.('loadingdone', stitch.bump);
 return {{...state, isCovered, isLive}};
}}"""
# One band: move the list, let two frames paint, and report what happened meanwhile.
STITCH_STEP_SCRIPT = """async top => {
 const stitch = window.__castkitStitch;
 if (!stitch || !stitch.element.isConnected) return null;
 stitch.element.scrollTop = top;
 await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
 const bounds = stitch.element.getBoundingClientRect();
 return {
   scrollTop: stitch.element.scrollTop,
   changes: stitch.changes,
   hasPendingImages: Array.from(stitch.element.querySelectorAll('img')).some(image => {
     if (image.complete) return false;
     const box = image.getBoundingClientRect();
     return box.width > 0 && box.height > 0 && box.bottom > bounds.top && box.top < bounds.bottom;
   }),
 };
}"""
# End a stitch: put the list back where the person left it, stop watching, and take the
# stitch's own scroll events back out of the page's change count, so drawing a picture never
# reads as a page change (which would draw it again, or retry a refused one at once).
STITCH_END_SCRIPT = f"""async () => {{
 const STITCH_EVENTS = {STITCH_EVENTS};
 const stitch = window.__castkitStitch;
 if (!stitch) return null;
 if (stitch.element.isConnected) stitch.element.scrollTop = stitch.start;
 await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
 window.__castkitStitch = null;
 stitch.observer.disconnect();
 for (const type of STITCH_EVENTS) document.removeEventListener(type, stitch.onEvent, true);
 removeEventListener('resize', stitch.bump);
 document.fonts?.removeEventListener?.('loadingdone', stitch.bump);
 const page = window.__castkitPageChanges;
 if (page && stitch.pageChanges !== undefined) page.count = stitch.pageChanges + stitch.changes;
 return {{changes: stitch.changes, scrollTop: stitch.element.scrollTop}};
}}"""


class StitchRefusedError(Exception):
    """This list cannot be drawn as one picture now; `reason` says why."""

    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


def plan_window(state, capacity):
    """The window rows and picture height for a list, or StitchRefusedError.

    The window snaps inward to the 8-row grid, so it never shows rows outside the list. At
    offset `k` the window shows the list as it looks at `scrollTop` `k`; the picture is the
    window's height plus every row the list can scroll.
    """
    if state is None:
        raise StitchRefusedError("no_list")
    top = max(0, math.ceil(state["top"] / WINDOW_ALIGN) * WINDOW_ALIGN)
    bottom = min(480, math.floor((state["top"] + state["height"]) / WINDOW_ALIGN) * WINDOW_ALIGN)
    window_rows = bottom - top
    if window_rows < MIN_WINDOW_ROWS:
        raise StitchRefusedError("small")
    max_scroll = state["scrollHeight"] - state["height"]
    if max_scroll <= 0:
        raise StitchRefusedError("no_overflow")
    rows = window_rows + max_scroll
    if rows > capacity:
        raise StitchRefusedError("too_tall")
    left = max(0, math.floor(state["left"]))
    right = min(480, math.ceil(state["left"] + state["width"]))
    return {
        "key": (state["identity"], top, bottom, rows, left, right),
        "top": top,
        "bottom": bottom,
        "rows": rows,
        "max_scroll": max_scroll,
        "left": left,
        "right": right,
    }


def band_offsets(window_rows, max_scroll):
    """Where the list is scrolled for each capture: overlapping bands, then the end."""
    step = window_rows - BAND_OVERLAP_ROWS
    return [*range(0, max_scroll, step), max_scroll]


def scroll_offset(state):
    return round(state["scrollTop"]) if state is not None else None


def rows_match(picture, rgb, state):
    """Whether the panel rows of `rgb` in the window are the picture at the list's offset.

    The comparison is in RGB, before quantization, so it holds at any offset: the board's
    rows and the picture's then differ only in their dither phase.
    """
    if picture is None or state is None or rgb is None:
        return False
    try:
        plan = plan_window(state, picture["rows"])
    except StitchRefusedError:
        return False
    if plan["key"] != picture["key"]:
        return False
    offset = scroll_offset(state)
    if not 0 <= offset <= picture["max_scroll"]:
        return False
    top, bottom = picture["top"], picture["bottom"]
    return np.array_equal(rgb[top:bottom], picture["rgb"][offset : offset + bottom - top])


def decode_rgb(png):
    return np.asarray(Image.open(io.BytesIO(png)).convert("RGB"))


class ScrollWindow:
    """One display session's scroll window: picture, uploads, show and hide, sync."""

    def __init__(self, session):
        self.session = session
        # The newest picture drawn: key, geometry, rgb, pixels, and its frame id once sent.
        self.picture = None
        self.upload_task = None
        self.board_drag_until = None
        self.changes = None
        self.changed_at = time.monotonic()
        # The last picture that could not be drawn: {"key", "reason", "changes", "at",
        # "count", "retry_at"}.
        self.refusal = None
        self.stats = {
            "stitch_attempts": 0,
            "stitches": 0,
            "uploads": 0,
            "shows": 0,
            "hides": 0,
            "board_scrolls": 0,
            "last_stitch": None,
            "last_upload": None,
            "refusal": None,
        }

    @property
    def client(self):
        return self.session.client

    def is_enabled(self):
        # Only ESPHomePrestoTransport sets this, and only on scroll-window firmware.
        return getattr(self.client, "has_scroll", False) is True

    def is_board_dragging(self):
        until = self.board_drag_until
        if until is None:
            return False
        if time.monotonic() >= until:
            self.board_drag_until = None
            return False
        return True

    def is_window_shown(self):
        return self.is_enabled() and self.client.window["is_shown"]

    def is_picture_on_board(self):
        held = getattr(self.client, "scroll_picture", None)
        return (
            self.picture is not None
            and held is not None
            and held["frame_id"] == self.picture.get("frame_id")
        )

    def options(self, **extra):
        viewport = self.session.target_options
        return {
            "attribute": self.session.target_attribute,
            "width": viewport["width"],
            "height": viewport["height"],
            **extra,
        }

    def observe(self, page_state):
        """Called every cycle: how long the page has been still."""
        if page_state["changes"] != self.changes:
            self.changes, self.changed_at = page_state["changes"], time.monotonic()

    def publish(self):
        if not self.is_enabled():
            return
        picture = self.picture
        self.client.scroll_stats = {
            **self.stats,
            "picture": None
            if picture is None
            else {
                "identity": picture["key"][0],
                "top": picture["top"],
                "bottom": picture["bottom"],
                "rows": picture["rows"],
                "frame_id": picture.get("frame_id"),
                "is_on_board": self.is_picture_on_board(),
            },
            "is_board_dragging": self.is_board_dragging(),
        }

    # Touch -----------------------------------------------------------------------------

    async def board_took(self, offset):
        """The board took a contact over: it owns the drag until `scroll_at`."""
        self.board_drag_until = time.monotonic() + BOARD_DRAG_SECONDS
        with contextlib.suppress(BrowserError):
            await self.move_page(offset)
        self.publish()

    async def board_scrolled(self, frame_id, offset):
        """`scroll_at`: a local scroll came to rest at `offset`; move the page there."""
        self.board_drag_until = None
        self.stats["board_scrolls"] += 1
        if self.picture is not None and self.picture.get("frame_id") == frame_id:
            await self.move_page(offset)
        self.session.force_frame.set()
        self.publish()

    async def sync_press(self, offset):
        """A press on a shown window carries its offset: make sure the page agrees."""
        await self.move_page(offset)

    async def move_page(self, offset):
        """Scroll the page's list to `offset`, and bind the shown frame to its targets.

        Only the list the picture was drawn from: the page may have moved on to another.
        """
        if self.picture is None:
            return
        moved = await self.session.page.evaluate(
            SCROLL_TO_SCRIPT, self.options(top=offset, identity=self.picture["key"][0])
        )
        if moved is None or moved["before"] == moved["after"]:
            return
        # The board shows the frame it showed before, with the list moved under the
        # window; its targets are where the page's are now.
        targets = await self.session.read_targets()
        base_id = getattr(self.client, "base_id", 0)
        if base_id:
            self.session.guard.remember(
                base_id,
                [
                    Target(**{key: value for key, value in target.items() if key != "loading"})
                    for target in targets
                ],
            )

    # Frames ----------------------------------------------------------------------------

    def is_contact_on_window(self):
        """A contact that began on the window and that the board may still take over."""
        contact = self.session.contact
        window = self.client.window
        return (
            contact is not None
            and window["top"] <= contact["start_y"] < window["bottom"]
            and not contact.get("is_past_board_take", False)
        )

    async def before_frame(self, rgb, state):
        """Keep the window only over rows that still are the picture."""
        if not self.is_window_shown() or self.is_board_dragging():
            return
        if self.is_contact_on_window():
            # A press on the list may still become the board's drag; hiding now would
            # hand that drag back to this worker. Once the contact has travelled past the
            # board's threshold without being taken (a sideways drag that the page scrolls
            # itself), it never will be, and a change under the window hides it as usual.
            # A press that stays still keeps the window until its release.
            return
        offset = scroll_offset(state)
        if rows_match(self.picture, rgb, state) and self.is_picture_on_board():
            if offset != self.client.window["offset"]:
                # The page moved its own list: move the window with it.
                async with self.session.delivery_lock:
                    await self.show(offset)
            return
        await self.hide()

    async def after_frame(self, rgb, state, page_state, payload):
        """With the panel showing `payload`: show the window, or draw a new picture."""
        if not self.is_enabled():
            return
        session = self.session
        if session.contact is not None or self.is_board_dragging() or session.camera is not None:
            return
        if rows_match(self.picture, rgb, state):
            if not self.is_window_shown() and self.is_picture_on_board():
                async with session.delivery_lock:
                    # Only over the rows the panel shows now: the same RGB, so the same
                    # content. The quantized pixels are identical too when the offset is on
                    # the 8-row grid; elsewhere only the dither phase differs. Up to 7 rows
                    # of the list above and below the window stay the panel's own.
                    if session.previous_payload == payload:
                        await self.show(scroll_offset(state))
            return
        if self.is_window_shown() or state is None:
            return
        now = time.monotonic()
        if (
            now - self.changed_at < STITCH_QUIET_SECONDS
            or not page_state["isSettled"]
            or page_state.get("hasPendingImages", False)
            or session.release_hold is not None
            or session.held_since is not None
        ):
            return
        try:
            plan = plan_window(state, self.client.scroll_capacity)
        except StitchRefusedError as error:
            self.refuse(None, error.reason)
            return
        refusal = self.refusal
        if (
            refusal is not None
            and refusal["key"] == plan["key"]
            and (
                now < refusal["retry_at"]
                or (
                    refusal["changes"] == page_state["changes"]
                    and now - refusal["at"] < REFUSAL_RETRY_SECONDS
                )
            )
        ):
            return
        self.stats["stitch_attempts"] += 1
        try:
            picture = await self.stitch(plan, state, rgb)
        except StitchRefusedError as error:
            self.refuse(plan["key"], error.reason)
            return
        self.refusal = None
        self.stats["refusal"] = None
        self.picture = picture
        if self.upload_task is not None:
            self.upload_task.cancel()
        self.upload_task = asyncio.create_task(self.upload(picture))
        self.upload_task.add_done_callback(self.upload_finished)
        self.publish()

    def refuse(self, key, reason):
        now = time.monotonic()
        previous = self.refusal
        if key is None or reason == "touch":
            # Nothing was drawn (no list, or a list that cannot use a window, which costs
            # nothing to learn again), or a person interrupted it: no backoff.
            self.refusal = None
        else:
            count = previous["count"] + 1 if previous and previous["key"] == key else 1
            delay = min(REFUSAL_BACKOFF_SECONDS * 2 ** (count - 1), REFUSAL_RETRY_SECONDS)
            self.refusal = {
                "key": key,
                "reason": reason,
                "changes": self.changes,
                "at": now,
                "count": count,
                "retry_at": now + delay,
            }
        if self.stats["refusal"] != reason:
            LOG.info("Scroll picture not drawn: %s", reason)
        self.stats["refusal"] = reason
        self.publish()

    async def show(self, offset):
        picture = self.picture
        status = await self.client.show_scroll(
            picture["frame_id"], picture["top"], picture["bottom"], offset
        )
        if status == "0":
            self.stats["shows"] += 1
        elif status is not None:
            LOG.info("Presto refused the scroll window: status %s", status)
        self.publish()

    async def hide(self):
        """Before anything is drawn under a window that may be shown."""
        if self.is_window_shown():
            await self.client.hide_scroll()
            self.stats["hides"] += 1
            self.publish()

    # Drawing and loading the picture ---------------------------------------------------

    def is_input_pending(self):
        session = self.session
        return (
            session.pending_input is not None
            or session.queued_touch is not None
            or not session.touches.empty()
        )

    async def capture(self):
        shot = await self.session.send_cdp(
            "Page.captureScreenshot",
            {
                "format": "png",
                "fromSurface": True,
                "captureBeyondViewport": False,
                "optimizeForSpeed": True,
            },
        )
        return await asyncio.to_thread(decode_rgb, base64.b64decode(shot["data"]))

    async def stitch(self, plan, state, live_rgb):
        """Draw the whole list as one picture, the window's rows at every offset."""
        session = self.session
        started = time.monotonic()
        top, bottom, rows = plan["top"], plan["bottom"], plan["rows"]
        window_rows = bottom - top
        outside = np.ones(480, dtype=bool)
        outside[plan["left"] : plan["right"]] = False
        picture = np.empty((rows, 480, 3), dtype=np.uint8)
        offsets = band_offsets(window_rows, plan["max_scroll"])
        async with session.page_lock:
            if self.is_input_pending():
                raise StitchRefusedError("touch")
            page = session.page
            try:
                begin = await page.evaluate(
                    STITCH_BEGIN_SCRIPT, self.options(top=top, bottom=bottom)
                )
            except BrowserError as error:
                raise StitchRefusedError("navigation") from error
            try:
                if begin is None or plan_window(begin, rows)["key"] != plan["key"]:
                    raise StitchRefusedError("moved")
                if begin["isCovered"]:
                    raise StitchRefusedError("covered")
                if begin["isLive"]:
                    raise StitchRefusedError("live")
                edges = None
                written = 0
                for offset in offsets:
                    if self.is_input_pending():
                        raise StitchRefusedError("touch")
                    step = await page.evaluate(STITCH_STEP_SCRIPT, offset)
                    if step is None or step["changes"]:
                        raise StitchRefusedError("changed")
                    if step["scrollTop"] != offset:
                        raise StitchRefusedError("scroll")
                    if step["hasPendingImages"]:
                        raise StitchRefusedError("images")
                    band = (await self.capture())[top:bottom]
                    if edges is None:
                        edges = band[0, outside]
                    # Columns beside the list are on the window too, so they must not
                    # change down its rows: they would scroll with the picture.
                    if not np.array_equal(
                        band[:, outside], np.broadcast_to(edges, (window_rows, *edges.shape))
                    ):
                        raise StitchRefusedError("edges")
                    overlap = written - offset
                    if overlap > 0 and not np.array_equal(band[:overlap], picture[offset:written]):
                        raise StitchRefusedError("overlap")
                    picture[offset : offset + window_rows] = band
                    written = offset + window_rows
            except BrowserError as error:
                raise StitchRefusedError("navigation") from error
            finally:
                with contextlib.suppress(BrowserError):
                    end = await page.evaluate(STITCH_END_SCRIPT)
                    if end is not None and end["changes"]:
                        raise StitchRefusedError("changed")
        offset = scroll_offset(state)
        if not np.array_equal(live_rgb[top:bottom], picture[offset : offset + window_rows]):
            # The panel's own capture must be part of the picture, exactly.
            raise StitchRefusedError("unstable")
        pixels = await asyncio.to_thread(presto_rows_pixels, picture)
        self.stats["stitches"] += 1
        self.stats["last_stitch"] = {
            "bands": len(offsets),
            "rows": rows,
            "ms": round((time.monotonic() - started) * 1000, 1),
        }
        session.force_frame.set()
        return {**plan, "rgb": picture, "pixels": pixels, "frame_id": None}

    async def upload(self, picture):
        """Send the picture to the board between live frames; then the loop shows it."""
        session = self.session
        attempts = 0
        while self.picture is picture and attempts < 3:
            if not session.is_slot_quiet():
                await asyncio.sleep(0.1)
                continue
            session.frame_id += 1
            picture["frame_id"] = session.frame_id
            started = time.monotonic()
            try:
                is_loaded = await self.client.upload_scroll(
                    picture["frame_id"], picture["pixels"], picture["rows"], session.is_slot_quiet
                )
            except APIConnectionError as error:
                # The link is gone; the session reconnects and the board starts empty.
                LOG.warning("Scroll picture did not load, link lost: %s", error)
                picture["frame_id"] = None
                self.publish()
                return
            except (TimeoutError, RuntimeError, ValueError) as error:
                LOG.warning("Scroll picture did not load: %s", error)
                picture["frame_id"] = None
                attempts += 1
                await asyncio.sleep(1)
                continue
            if is_loaded:
                self.stats["uploads"] += 1
                self.stats["last_upload"] = {
                    **(self.client.scroll_upload or {}),
                    "ms": round((time.monotonic() - started) * 1000, 1),
                }
                session.force_frame.set()
                self.publish()
                return
            await asyncio.sleep(0.05)

    @staticmethod
    def upload_finished(task):
        # Nothing awaits an upload; an unexpected failure is logged rather than lost.
        if not task.cancelled() and task.exception() is not None:
            LOG.warning("Scroll picture upload failed: %r", task.exception())

    async def close(self):
        if self.upload_task is not None:
            self.upload_task.cancel()
            await asyncio.gather(self.upload_task, return_exceptions=True)
