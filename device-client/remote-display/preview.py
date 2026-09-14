"""Serve the panel's live frame to Home Assistant as a still image and an MJPEG stream.

The render loop already screenshots every cycle to drive the glass, so this adds
no capture cost. A frame is kept in memory and encoded to JPEG only when a
client asks for one, which means a server nobody is watching does no work.

Home Assistant's camera domain is the reason this is pull-based rather than a
push onto MQTT. A camera entity's state is `idle` and never changes per frame,
so the recorder writes nothing no matter how fast the panel updates, and Home
Assistant opens the MJPEG connection when a dashboard shows the camera and
closes it when the last viewer leaves.
"""
import asyncio
import io
import logging
import time

from aiohttp import web
from PIL import Image

LOG = logging.getLogger('castkit.remote-display.preview')

BOUNDARY = 'castkitframe'
JPEG_QUALITY = 80
# Resend the current frame after this long without a change. An MJPEG consumer
# and any proxy between it and us both treat a silent connection as dead.
KEEPALIVE_SECONDS = 5


def encode_jpeg(png, quality=JPEG_QUALITY):
    buffer = io.BytesIO()
    Image.open(io.BytesIO(png)).convert('RGB').save(buffer, format='JPEG', quality=quality)
    return buffer.getvalue()


def validate_preview_port(port):
    if port is None:
        return None
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise ValueError('preview_port must be a TCP port number')
    return port


class PreviewServer:
    """Holds the newest captured frame and serves it only while a viewer watches."""

    def __init__(self, build_marker, max_fps, port=None, host='0.0.0.0'):
        self.build_marker = build_marker
        self.port = validate_preview_port(port)
        self.host = host
        # A preview never needs to outrun the panel itself.
        self.minimum_frame_interval = 1 / max(1, min(max_fps, 20))
        self.latest_png = None
        self.changed_monotonic = None
        self.captured_monotonic = None
        self.sequence = 0
        self.viewers = 0
        self.frame_ready = asyncio.Event()
        self.runner = None

    @property
    def is_enabled(self):
        return self.port is not None

    def set_frame(self, png):
        """Record a freshly captured frame. Called once per render cycle.

        Identical bytes do not bump the sequence, so a static panel parks every
        viewer on the keepalive path instead of re-encoding the same picture ten
        times a second. The render loop already compares its own encoded payload
        this way.
        """
        self.captured_monotonic = time.monotonic()
        if png == self.latest_png:
            return
        self.latest_png = png
        self.changed_monotonic = self.captured_monotonic
        self.sequence += 1
        # set() resolves every waiter synchronously, so set-then-clear is a
        # broadcast pulse rather than a latch a late viewer could read twice.
        self.frame_ready.set()
        self.frame_ready.clear()

    async def wait_for_change(self, seen_sequence, timeout=KEEPALIVE_SECONDS):
        """Return as soon as the frame differs from `seen_sequence`, or on timeout."""
        if self.sequence != seen_sequence:
            return
        try:
            await asyncio.wait_for(self.frame_ready.wait(), timeout=timeout)
        except TimeoutError:
            pass

    async def handle_health(self, request):
        now = time.monotonic()
        return web.json_response({
            'build': self.build_marker,
            'viewers': self.viewers,
            'frames': self.sequence,
            'frameAgeSeconds': None if self.changed_monotonic is None else round(now - self.changed_monotonic, 3),
            'captureAgeSeconds': None if self.captured_monotonic is None else round(now - self.captured_monotonic, 3),
        }, headers={'Cache-Control': 'no-store'})

    async def handle_still(self, request):
        if self.latest_png is None:
            raise web.HTTPServiceUnavailable(text='No frame captured yet')
        jpeg = await asyncio.to_thread(encode_jpeg, self.latest_png)
        return web.Response(body=jpeg, content_type='image/jpeg',
                            headers={'Cache-Control': 'no-store'})

    async def handle_stream(self, request):
        response = web.StreamResponse(headers={
            'Content-Type': f'multipart/x-mixed-replace; boundary={BOUNDARY}',
            'Cache-Control': 'no-store',
        })
        await response.prepare(request)
        self.viewers += 1
        LOG.info('Preview viewer connected; viewers=%s', self.viewers)
        seen_sequence = -1
        try:
            while True:
                if self.latest_png is None:
                    await self.wait_for_change(self.sequence)
                    continue
                await self.wait_for_change(seen_sequence)
                seen_sequence = self.sequence
                jpeg = await asyncio.to_thread(encode_jpeg, self.latest_png)
                await response.write(
                    f'--{BOUNDARY}\r\n'
                    f'Content-Type: image/jpeg\r\n'
                    f'Content-Length: {len(jpeg)}\r\n\r\n'.encode('ascii'))
                await response.write(jpeg)
                await response.write(b'\r\n')
                await asyncio.sleep(self.minimum_frame_interval)
        except (ConnectionResetError, ConnectionError):
            pass
        finally:
            self.viewers -= 1
            LOG.info('Preview viewer disconnected; viewers=%s', self.viewers)
        return response

    def build_application(self):
        application = web.Application()
        application.add_routes([
            web.get('/healthz', self.handle_health),
            web.get('/screen.jpg', self.handle_still),
            web.get('/screen.mjpeg', self.handle_stream),
        ])
        return application

    async def start(self):
        if not self.is_enabled:
            LOG.info('Preview server disabled; set preview_port to enable it')
            return
        self.runner = web.AppRunner(self.build_application(), access_log=None)
        await self.runner.setup()
        await web.TCPSite(self.runner, self.host, self.port).start()
        LOG.info('Preview server listening on %s:%s', self.host, self.port)

    async def stop(self):
        if self.runner is not None:
            await self.runner.cleanup()
            self.runner = None
