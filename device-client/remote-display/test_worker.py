"""Real Chromium coverage for touch routing and retained-event recovery."""

import asyncio
import os
import unittest
from unittest.mock import AsyncMock

from interaction import Target
from playwright.async_api import async_playwright
from preview import PreviewServer
from worker import DisplaySession


class BrowserTouchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.playwright = await async_playwright().start()
        executable = os.environ.get("CASTKIT_TEST_CHROMIUM")
        self.browser = await self.playwright.chromium.launch(
            **({"executable_path": executable} if executable else {}),
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        self.context = await self.browser.new_context(
            viewport={"width": 480, "height": 320}, has_touch=True
        )
        self.page = await self.context.new_page()
        await self.page.set_content("""<meta name="viewport" content="width=device-width,initial-scale=1">
          <button data-castkit-target="slot:one" style="width:200px;height:40px;touch-action:manipulation"
           onclick="this.textContent='Disc details';this.dataset.castkitTarget='removed:one:job-a'">Slot 1</button>""")
        self.session = DisplaySession(
            {},
            self.page,
            None,
            {},
            asyncio.Event(),
            PreviewServer("castkit-remote-display-test", 10),
        )
        self.session.cdp = await self.context.new_cdp_session(self.page)
        self.session.guard.remember(42, [Target("slot:one", 8, 8, 200, 40)])
        self.task = asyncio.create_task(self.session.input_loop())

    async def asyncTearDown(self):
        self.task.cancel()
        await asyncio.gather(self.task, return_exceptions=True)
        await self.browser.close()
        await self.playwright.stop()

    async def event(self, sequence, phase, frame=42):
        await self.session.touches.put(
            ["touch", str(sequence), str(phase), "30", "25", "0", str(frame), "0"]
        )
        async with asyncio.timeout(3):
            while self.session.processed_touch != sequence:
                if self.task.done():
                    self.task.result()
                await asyncio.sleep(0.01)

    async def test_retained_release_does_not_break_the_next_tap(self):
        await self.event(100, 2)
        await self.event(101, 0)
        await self.event(102, 2)
        self.assertEqual(await self.page.locator("button").inner_text(), "Disc details")

    async def test_old_frame_cannot_activate_new_control_at_same_position(self):
        await self.event(1, 0)
        await self.event(2, 2)
        await self.page.locator("button").evaluate(
            "element => element.onclick = () => element.textContent = 'REMOVED'"
        )
        await self.event(3, 0)
        await self.event(4, 2)
        self.assertEqual(await self.page.locator("button").inner_text(), "Disc details")

    async def test_disabled_or_changed_control_during_contact_cancels_click(self):
        await self.event(1, 0)
        await self.page.locator("button").evaluate(
            "element => element.dataset.castkitTarget = 'slot:replacement'"
        )
        await self.event(2, 2)
        self.assertEqual(await self.page.locator("button").inner_text(), "Slot 1")
        await self.page.locator("button").evaluate(
            "element => { element.dataset.castkitTarget = 'slot:one'; element.disabled = true }"
        )
        await self.event(3, 0)
        await self.event(4, 2)
        self.assertEqual(await self.page.locator("button").inner_text(), "Slot 1")

    async def test_external_view_frame_receives_a_guarded_touch(self):
        await self.page.set_content("""
          <iframe data-castkit-target="external-view:Disc App"
           style="position:absolute;inset:0;width:100%;height:100%;border:0"
           srcdoc="<button onclick=&quot;this.textContent='Opened'&quot; style=&quot;width:200px;height:40px&quot;>Disc App</button>"></iframe>""")
        frame = self.page.frames[1]
        self.session.guard.remember(
            43,
            [Target("external-view:Disc App", 0, 0, 480, 320)],
        )

        await self.event(1, 0, frame=43)
        await self.event(2, 2, frame=43)

        self.assertEqual(await frame.locator("button").inner_text(), "Opened")

    async def test_cache_frame_is_acknowledged_but_never_becomes_a_touch_target(self):
        self.session.client = AsyncMock()
        self.session.services = {"frame_chunk": object()}

        async def acknowledge(service, values):
            if values["final_chunk"]:
                self.session.pending[values["frame_id"]].set_result(
                    ["frame", str(values["frame_id"])]
                )

        self.session.client.execute_service.side_effect = acknowledge
        await self.session.send_frame(b"cached skeleton", 0, [], format_id=3)
        self.assertIsNone(self.session.guard.match(self.session.frame_id, 30, 25, "slot:one"))
        self.assertFalse(self.session.pending)
