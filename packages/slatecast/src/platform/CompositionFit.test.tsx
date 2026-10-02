import type { ContractData } from "@castkit/sdk/contracts"
import { render, waitFor } from "@testing-library/preact"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import cameraPicture from "../../../../assets/sample-photos/printer-camera-chamber.jpg"
import {
  aiUsageFixture,
  compositionFixture,
} from "./fixtures.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

test.each([
  { width: 1024, height: 600 },
  { width: 683, height: 400 },
])("three printers and usage fit at $width × $height without clipping essential controls", async ({
  width,
  height,
}) => {
  await page.viewport(width, height)
  document.documentElement.dataset.scheme = "dark"
  const source = compositionFixture.channels.prints!
  const printer = (
    source.data as ContractData["printers.v1"]
  ).printers[0]!
  const snapshot = {
    ...compositionFixture,
    view: {
      ...compositionFixture.view,
      layout: "adaptive" as const,
      panels: [
        {
          ...compositionFixture.view.panels[0]!,
          settings: { title: "", isCompactFacts: true },
        },
        aiUsageFixture.view.panels[0]!,
      ],
    },
    channels: {
      ...compositionFixture.channels,
      ...aiUsageFixture.channels,
      usage: {
        ...aiUsageFixture.channels.usage!,
        data: {
          providers: ["Alpha", "Beta", "Gamma"].map(
            (name) => ({
              id: name,
              name,
              isOk: true,
              windows: [
                {
                  id: "weekly",
                  label: "Weekly",
                  percentUsed: 50,
                  periodHours: 168,
                },
              ],
            }),
          ),
        },
      },
      prints: {
        ...source,
        data: {
          printers: [1, 2, 3].map((index) => ({
            ...printer,
            id: `printer-${index}`,
            name: `Printer ${index}`,
            cameraPath: cameraPicture,
            cameraIsLive: false,
            finishAtMs: Date.now() + 5 * 60 * 60 * 1000,
            remainingMinutes: 300,
          })),
        },
      },
    },
  }
  render(
    <main class="platform">
      <DisplayComposition
        snapshot={snapshot}
        isConnected
        onAction={async () => undefined}
      />
    </main>,
  )
  await document.fonts.ready
  await waitFor(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".printer-card",
      ),
    )
    expect(cards).toHaveLength(3)
    cards.forEach((card) => {
      const bounds = card.getBoundingClientRect()
      expect(card.dataset.detailLevel).not.toBe("3")
      const media = card.querySelector<HTMLElement>(
        ".platform-printer-media",
      )!
      expect(
        media.getBoundingClientRect().height,
      ).toBeGreaterThan(50)
      card
        .querySelectorAll<HTMLElement>(
          ".printer-action, .printer-band",
        )
        .forEach((element) => {
          const content = element.getBoundingClientRect()
          expect(content.top).toBeGreaterThanOrEqual(
            bounds.top,
          )
          expect(content.bottom).toBeLessThanOrEqual(
            bounds.bottom + 1,
          )
          expect(content.right).toBeLessThanOrEqual(
            bounds.right + 1,
          )
          expect(content.left).toBeGreaterThanOrEqual(
            bounds.left - 1,
          )
        })
    })
    document
      .querySelectorAll<HTMLElement>(".platform-panel")
      .forEach((panel) => {
        expect(panel.scrollHeight).toBeLessThanOrEqual(
          panel.clientHeight + 1,
        )
        expect(panel.scrollWidth).toBeLessThanOrEqual(
          panel.clientWidth + 1,
        )
      })
  })
})
