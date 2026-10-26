"""A camera alert page hands the glass to server frames, and back to capture after."""

import asyncio
import base64
import os
import unittest
import zlib

from aiohttp import web
from esphome_presto import ESPHomePrestoTransport
from playwright.async_api import async_playwright
from preview import PreviewServer
from worker import DisplaySession

SQUARE = 480 * 480 * 2


def synthetic_frame(shade):
    """Flat shades stand in for camera pictures; no camera image is used."""
    pixels = bytes([shade]) * SQUARE
    return pixels, zlib.compress(pixels[60 * 480 * 2 : 420 * 480 * 2], 1)


class CameraSessionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.sequence = 0
        self.cookies = []

        async def page(_request):
            return web.Response(
                content_type="text/html",
                text='<main data-castkit-ready="true"><section class="stage" data-view="door" '
                'data-castkit-camera-frames="/frames?kind=frames">Door</section></main>',
            )

        async def frames(request):
            self.cookies.append(request.headers.get("Cookie"))
            after = int(request.query["after"])
            if self.sequence <= after:
                await asyncio.sleep(0.05)
                return web.Response(status=204)
            pixels, body = synthetic_frame(self.sequence)
            return web.Response(
                body=pixels + body,
                headers={
                    "x-castkit-frame-sequence": str(self.sequence),
                    "x-castkit-frame-pixels": str(len(pixels)),
                    "x-castkit-frame-patch": "0,60,480,360",
                    "x-castkit-frame-codec": "zlib",
                    "x-castkit-frame-layout": "door-480",
                    "x-castkit-frame-origin": "video",
                },
            )

        application = web.Application()
        application.router.add_get("/page", page)
        application.router.add_get("/frames", frames)
        self.runner = web.AppRunner(application)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.origin = f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}"
        self.playwright = await async_playwright().start()
        executable = os.environ.get("CASTKIT_TEST_CHROMIUM")
        self.browser = await self.playwright.chromium.launch(
            **({"executable_path": executable} if executable else {}),
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        self.context = await self.browser.new_context(
            viewport={"width": 480, "height": 480}, has_touch=True
        )
        await self.context.add_cookies(
            [{"name": "castkit-session", "value": "grant", "url": self.origin}]
        )
        self.page = await self.context.new_page()
        await self.page.goto(f"{self.origin}/page")

    async def asyncTearDown(self):
        await self.browser.close()
        await self.playwright.stop()
        await self.runner.cleanup()

    async def test_server_frames_replace_capture_while_the_alert_shows(self):
        transport = ESPHomePrestoTransport(
            {"mac": "02:00:00:00:00:01", "host": "127.0.0.1"},
            base64.b64encode(bytes(32)).decode(),
        )
        session = DisplaySession(
            {
                "viewport": {"width": 480, "height": 480},
                "max_fps": 8,
                "heartbeat_seconds": 2,
                "manifest_url": f"{self.origin}/castkit.json",
            },
            self.page,
            transport,
            {},
            asyncio.Event(),
            PreviewServer("test", 8),
        )
        sent = []

        async def acknowledge(frame_id, touch_id, payload, prepared=None):
            sent.append((payload, prepared))
            return ["frame", str(frame_id), str(touch_id), "0", "0", "10", "10"]

        transport.send_frame = acknowledge
        task = asyncio.create_task(session.run(1, None))
        try:
            self.sequence = 1
            async with asyncio.timeout(5):
                while not any(prepared for _, prepared in sent):
                    await asyncio.sleep(0.02)
            self.sequence = 2
            async with asyncio.timeout(5):
                while sum(1 for _, prepared in sent if prepared) < 2:
                    await asyncio.sleep(0.02)
            camera = [(payload, prepared) for payload, prepared in sent if prepared]
            self.assertEqual(camera[1][0], synthetic_frame(2)[0])
            self.assertEqual(camera[1][1]["body"], synthetic_frame(2)[1])
            self.assertEqual(camera[1][1]["patch"], (0, 60, 480, 360))
            # The view grant travels with the frames request.
            self.assertIn("castkit-session=grant", self.cookies)
            captures = session.captures
            await asyncio.sleep(0.4)
            # No page capture while fresh camera frames arrive.
            self.assertEqual(session.captures, captures)
            await self.page.evaluate(
                "document.querySelector('section').removeAttribute('data-castkit-camera-frames')"
            )
            async with asyncio.timeout(3):
                while session.captures == captures:
                    await asyncio.sleep(0.02)
            self.assertIsNone(session.camera)
        finally:
            session.stop.set()
            await asyncio.wait_for(task, timeout=5)


if __name__ == "__main__":
    unittest.main()
