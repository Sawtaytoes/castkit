"""Camera alert frames the CastKit server decodes once and finishes for this panel.

While the page shows a camera alert it names a frames URL
(`data-castkit-camera-frames`). The server decodes the camera once, scales and
compresses one frame per panel size, and answers a held request with the newest
frame after the one named in `after`. The worker sends those bytes to the board
as fast as the board acknowledges them and never captures the page meanwhile:
a slow board skips pictures instead of queueing them.
"""

import asyncio
import contextlib
import logging
import time
from urllib.parse import urlencode

import aiohttp

LOG = logging.getLogger("castkit.remote-display")

# The server holds a request up to 5 s when no newer picture exists.
REQUEST_TIMEOUT_SECONDS = 10
RETRY_SECONDS = (0.5, 1, 2, 5)
# Without a new picture for this long the alert falls back to page capture, so
# a stalled camera never freezes the glass on an old picture.
STALE_SECONDS = 4
# zlib of big-endian RGB565 for every board; baseline JPEG for a board that reports
# a decoder for it (about a fifth of the bytes of a camera picture).
FRAME_CODECS = ("zlib", "jpeg")


def parse_frame(headers, body):
    """Split a frames response into the whole panel frame and its patch."""
    pixel_count = int(headers["x-castkit-frame-pixels"])
    patch = tuple(int(value) for value in headers["x-castkit-frame-patch"].split(","))
    if len(patch) != 4 or pixel_count <= 0 or pixel_count > len(body):
        raise ValueError("Malformed camera frame")
    codec = headers.get("x-castkit-frame-codec")
    if codec not in FRAME_CODECS:
        raise ValueError("Unsupported camera frame codec")
    return {
        "codec": codec,
        "sequence": int(headers["x-castkit-frame-sequence"]),
        "pixels": bytes(body[:pixel_count]),
        "patch": patch,
        "body": bytes(body[pixel_count:]),
        "layout": headers.get("x-castkit-frame-layout", ""),
        "origin": headers.get("x-castkit-frame-origin", ""),
    }


def frames_url(base, width, height, after, codec="zlib"):
    separator = "&" if "?" in base else "?"
    query = {"width": width, "height": height, "after": after}
    if codec != "zlib":
        query["codec"] = codec
    return f"{base}{separator}{urlencode(query)}"


class CameraFrameFeed:
    """Hold one request open for the newest frame; keep only the latest."""

    def __init__(self, url, cookie_header, width, height, session_factory=None, codec="zlib"):
        self.url = url
        self.codec = codec
        self.cookie_header = cookie_header
        self.width = width
        self.height = height
        self.latest = None
        self.received_at = 0
        self.changed = asyncio.Event()
        self.session_factory = session_factory or (
            lambda: aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SECONDS)
            )
        )
        self.received = 0

    def is_fresh(self):
        return self.latest is not None and time.monotonic() - self.received_at < STALE_SECONDS

    async def wait_for_newer(self, sequence, timeout):
        """The newest frame if it is newer than `sequence`, else None after `timeout`."""
        if self.latest is not None and self.latest["sequence"] > sequence:
            return self.latest
        self.changed.clear()
        if self.latest is not None and self.latest["sequence"] > sequence:
            return self.latest
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self.changed.wait(), timeout=timeout)
        if self.latest is not None and self.latest["sequence"] > sequence:
            return self.latest
        return None

    async def run(self):
        failures = 0
        headers = {"Cookie": self.cookie_header} if self.cookie_header else {}
        async with self.session_factory() as session:
            while True:
                after = self.latest["sequence"] if self.latest else 0
                try:
                    async with session.get(
                        frames_url(self.url, self.width, self.height, after, self.codec),
                        headers=headers,
                    ) as response:
                        if response.status == 204:
                            continue
                        if response.status != 200:
                            raise ConnectionError(f"Camera frames answered {response.status}")
                        frame = parse_frame(response.headers, await response.read())
                    self.latest = frame
                    self.received_at = time.monotonic()
                    self.received += 1
                    self.changed.set()
                    failures = 0
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    delay = RETRY_SECONDS[min(failures, len(RETRY_SECONDS) - 1)]
                    failures += 1
                    LOG.warning(
                        "Camera frames unavailable: %s; retrying in %s s",
                        type(error).__name__,
                        delay,
                    )
                    await asyncio.sleep(delay)
