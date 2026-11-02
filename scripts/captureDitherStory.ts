import type { Page } from "@playwright/test"

/** Capture a complete rasterized story, rejecting failed preview output. */
export const captureDitherStory = async ({
  page,
  storyId,
  url,
  outputPath,
  previewCount,
}: {
  page: Page
  storyId: string
  url: string
  outputPath: string
  previewCount: number
}) => {
  await page.goto(url)
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(
    (count) => {
      const previews = Array.from(
        document.querySelectorAll("[data-dither-preview]"),
      )
      return (
        document.querySelector("[data-dither-error]") !==
          null ||
        (previews.length === count &&
          previews.every(
            (preview) =>
              preview.getAttribute("aria-busy") === "false",
          ))
      )
    },
    previewCount,
    { timeout: 120000 },
  )
  const errors = await page
    .locator("[data-dither-error]")
    .allTextContents()
  if (errors.length > 0) {
    throw new Error(
      `Dither capture ${storyId} failed: ${errors.join("; ")}`,
    )
  }
  await page.addStyleTag({
    content:
      "* { transition: none !important; animation: none !important; }",
  })
  await page.locator("#storybook-root").screenshot({
    path: outputPath,
    animations: "disabled",
    timeout: 120000,
  })
}
