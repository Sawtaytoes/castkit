"""Swipe destinations the CastKit server draws ahead, held ready for the panel.

The server renders each view a swipe can reach in this worker's own browser
context and publishes an index of them (`/d/<id>/stream-frames`). The feed holds
one long request open against that index, so it hears about a new frame at once
and asks nothing in between, then fetches only the frames whose key changed and
converts each to panel pixels ahead of time. Everything stays in memory.
"""

import asyncio
import base64
import contextlib
import logging
from urllib.parse import quote, urljoin

from manifest import same_origin_url

LOG = logging.getLogger("castkit.remote-display")

# The server answers a held index request after 25 s even when nothing changed.
INDEX_TIMEOUT_MS = 35_000
FRAME_TIMEOUT_MS = 10_000
RETRY_SECONDS = (1, 2, 5, 10, 30)


class StreamFrameFeed:
    def __init__(self, request, index_url, prepare):
        self.request = request
        self.index_url = index_url
        self.prepare = prepare
        # view -> {"view", "key", "png", "pixels", "targets"}, nearest destination first.
        self.frames = {}
        self.tag = None
        self.version = 0
        self.condition = asyncio.Condition()

    def read(self, view):
        """The destination's frame as the server last drew it, or None."""
        return self.frames.get(view)

    def ordered(self):
        return list(self.frames.values())

    async def wait_for_change(self, version):
        async with self.condition:
            await self.condition.wait_for(lambda: self.version != version)

    async def get_json(self, url, timeout):
        response = await self.request.get(url, timeout=timeout)
        try:
            same_origin_url(self.index_url, response.url)
            if response.status == 404:
                return None
            if not response.ok:
                raise ConnectionError(f"Stream frames answered {response.status}")
            return await response.json()
        finally:
            # The driver keeps every response body until it is disposed.
            await response.dispose()

    async def fetch_frame(self, view, key):
        url = urljoin(self.index_url, f"stream-frame/{quote(view, safe='')}")
        document = await self.get_json(url, FRAME_TIMEOUT_MS)
        if not isinstance(document, dict) or document.get("key") != key:
            # Drawn again since the index was read; the next index names it.
            return None
        if not isinstance(document.get("targets"), list):
            # A frame without its touch targets cannot be shown: a touch on it
            # would have nothing to land on.
            LOG.warning("Stream frame %s has no touch targets; skipped", view)
            return None
        png = base64.b64decode(document["png"])
        pixels = await asyncio.to_thread(self.prepare, png)
        return {
            "view": view,
            "key": key,
            "png": png,
            "pixels": pixels,
            "targets": document["targets"],
        }

    async def apply_index(self, index):
        frames = {}
        for entry in index["frames"]:
            view, key = entry["view"], entry["key"]
            held = self.frames.get(view)
            frame = held if held is not None and held["key"] == key else None
            if frame is None:
                frame = await self.fetch_frame(view, key)
            if frame is not None:
                frames[view] = frame
        is_changed = [(view, frame["key"]) for view, frame in frames.items()] != [
            (view, frame["key"]) for view, frame in self.frames.items()
        ]
        self.frames = frames
        self.tag = index["tag"]
        if is_changed:
            async with self.condition:
                self.version += 1
                self.condition.notify_all()

    async def run(self, stop, on_change=None):
        failures = 0
        while not stop.is_set():
            try:
                url = self.index_url + (f"?after={quote(self.tag)}" if self.tag else "")
                index = await self.get_json(url, INDEX_TIMEOUT_MS)
                if index is None:
                    # This server draws no frames ahead; look again much later.
                    LOG.info("Stream frames unavailable; swipes use live frames only")
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(stop.wait(), timeout=300)
                    continue
                await self.apply_index(index)
                if on_change is not None:
                    on_change(len(self.frames))
                failures = 0
            except asyncio.CancelledError:
                raise
            except Exception as error:
                delay = RETRY_SECONDS[min(failures, len(RETRY_SECONDS) - 1)]
                failures += 1
                LOG.warning(
                    "Stream frames unavailable: %s; retrying in %s s", type(error).__name__, delay
                )
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(stop.wait(), timeout=delay)


def plan_slots(slots, frames, count, deferred=frozenset()):
    """Which slot to load with which frame next, nearest destination first.

    A view keeps the slot it already has, so a changed key patches that slot.
    A view without one takes a free slot, then a slot whose view is no longer
    wanted. A `deferred` slot is not rewritten (the board is still settling the
    one it just showed). Returns [(slot, frame)]; an empty list means nothing
    can be loaded now.
    """
    wanted = frames[:count]
    wanted_views = {frame["view"] for frame in wanted}
    used = {
        slot
        for slot, held in slots.items()
        if any(frame["view"] == held["view"] and frame["key"] == held["key"] for frame in wanted)
    }
    plan = []
    for frame in wanted:
        if any(
            held["view"] == frame["view"] and held["key"] == frame["key"] for held in slots.values()
        ):
            continue
        candidates = (
            [slot for slot, held in slots.items() if held["view"] == frame["view"]]
            + [slot for slot in range(count) if slot not in slots]
            + [slot for slot, held in slots.items() if held["view"] not in wanted_views]
        )
        slot = next(
            (slot for slot in candidates if slot not in used and slot not in deferred), None
        )
        if slot is None:
            continue
        used.add(slot)
        plan.append((slot, frame))
    return plan
