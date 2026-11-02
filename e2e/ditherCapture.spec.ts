import { existsSync, mkdirSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { captureDitherStory } from "../scripts/captureDitherStory.ts"

test("dither capture waits for completed pixels after network idle", async ({
  page,
}, testInfo) => {
  mkdirSync("__screenshots__", { recursive: true })
  const outputPath = `__screenshots__/dither-ready-${testInfo.project.name}.png`
  const html = `<div id="storybook-root"><div data-dither-preview aria-busy="true"><canvas width="40" height="40"></canvas></div></div><script>setTimeout(() => { const canvas=document.querySelector('canvas'); const context=canvas.getContext('2d'); context.fillStyle='#123456';context.fillRect(0,0,40,40);document.querySelector('[data-dither-preview]').setAttribute('aria-busy','false'); }, 1200);</script>`
  await captureDitherStory({
    page,
    storyId: "delayed",
    url: `data:text/html,${encodeURIComponent(html)}`,
    outputPath,
    previewCount: 1,
  })
  await expect(
    page.locator("[data-dither-preview]"),
  ).toHaveAttribute("aria-busy", "false")
  expect(
    await page
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext("2d")
        return context
          ? Array.from(
              context.getImageData(0, 0, 1, 1).data,
            )
          : []
      }),
  ).toEqual([18, 52, 86, 255])
  expect(existsSync(outputPath)).toBe(true)
})

test("dither capture rejects a render error without writing a baseline", async ({
  page,
}, testInfo) => {
  const outputPath = testInfo.outputPath(
    "failed-dither.png",
  )
  const html = `<div id="storybook-root"><div data-dither-preview aria-busy="true"><canvas width="40" height="40"></canvas></div></div><script>setTimeout(() => {const error=document.createElement('p');error.setAttribute('data-dither-error','');error.textContent='Dither preview failed: font timeout';document.querySelector('[data-dither-preview]').append(error);document.querySelector('[data-dither-preview]').setAttribute('aria-busy','false');},1200);</script>`
  await expect(
    captureDitherStory({
      page,
      storyId: "font-error",
      url: `data:text/html,${encodeURIComponent(html)}`,
      outputPath,
      previewCount: 1,
    }),
  ).rejects.toThrow(
    "Dither capture font-error failed: Dither preview failed: font timeout",
  )
  expect(existsSync(outputPath)).toBe(false)
})
