import { describe, expect, test } from "vitest"
import {
  buildIdentifyOverlayHtml,
  escapeHtml,
} from "./identifyOverlayHtml.ts"

describe(buildIdentifyOverlayHtml.name, () => {
  test("the overlay shows the number, the label, and the size", () => {
    const html = buildIdentifyOverlayHtml({
      number: 3,
      label: "Small Monitor",
      width: 1024,
      height: 600,
    })
    expect(html).toContain('<div class="number">3</div>')
    expect(html).toContain(
      '<div class="name">Small Monitor</div>',
    )
    expect(html).toContain(
      '<div class="size">1024 x 600</div>',
    )
  })

  test("a label from the display driver cannot inject markup", () => {
    expect(
      escapeHtml('<img src=x onerror="alert(1)">'),
    ).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
  })
})
