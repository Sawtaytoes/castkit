import type { ContractData } from "@castkit/sdk/contracts"
import {
  render,
  screen,
  waitFor,
} from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { page } from "vitest/browser"
import cameraPicture from "../../../../assets/sample-photos/printer-camera-chamber.jpg"
import printPicture from "../../../../assets/sample-photos/printer-plate-canisters.png"
import { compositionFixture } from "./fixtures.ts"
import { PrintersView } from "./PrintersView.tsx"
import "../styles.css"
import "./platform.css"

const printerData = compositionFixture.channels.prints
  ?.data as ContractData["printers.v1"]
const mount = async ({
  width,
  height,
  isCamera = true,
}: {
  width: number
  height: number
  isCamera?: boolean
}) => {
  await page.viewport(width, height)
  document.documentElement.dataset.scheme = "dark"
  const onAction = vi.fn(async () => undefined)
  render(
    <main class="platform">
      <PrintersView
        data={{
          printers: printerData.printers.map((printer) => ({
            ...printer,
            thumbnailPath: printPicture,
            cameraPath: cameraPicture,
          })),
        }}
        isControlEnabled
        onAction={onAction}
        settings={{ isCameraVisible: isCamera }}
      />
    </main>,
  )
  await document.fonts.ready
  /*
   * A real image load. Four windows put four of them on the runner at once,
   * and one outran `waitFor`'s 1 s default in a full run while passing
   * alone, so the load gets 5 s.
   */
  await waitFor(
    () => {
      const image =
        document.querySelector<HTMLImageElement>(
          ".platform-printer-image",
        )
      expect(image?.naturalWidth).toBeGreaterThan(0)
    },
    { timeout: 5_000 },
  )
  return onAction
}

const card = () =>
  document.querySelector<HTMLElement>(".printer-card")

test("the tall landscape camera card stacks to enlarge the camera, and a short card reorients", async () => {
  await mount({ width: 1814, height: 1376 })
  await waitFor(() =>
    expect(card()?.dataset.orientation).toBe("vertical"),
  )
  const image = document.querySelector(
    ".platform-printer-image",
  ) as HTMLImageElement
  expect(
    image.getBoundingClientRect().width,
  ).toBeGreaterThan(1300)
  await page.viewport(1280, 720)
  await waitFor(() =>
    expect(card()?.dataset.orientation).toBe("horizontal"),
  )
  expect(
    screen
      .getByRole("button", { name: "Stop" })
      .getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(720)
})

test("static images prioritize the facts and both action colors survive platform button rules", async () => {
  await mount({ width: 1280, height: 720, isCamera: false })
  await waitFor(() =>
    expect(card()?.dataset.orientation).toBeDefined(),
  )
  const pause = screen.getByRole("button", {
    name: "Pause",
  })
  const stop = screen.getByRole("button", { name: "Stop" })
  expect(getComputedStyle(pause).color).not.toBe(
    getComputedStyle(stop).color,
  )
  expect(getComputedStyle(pause).color).not.toBe(
    getComputedStyle(card() as HTMLElement).color,
  )
  expect(
    stop.getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(720)
  expect(
    document
      .querySelector(".printer-body")
      ?.getBoundingClientRect().width,
  ).toBeGreaterThanOrEqual(600)
})

test("camera lightbox closes by the image, outside area, and Escape and never sends a printer command", async () => {
  const onAction = await mount({ width: 1280, height: 720 })
  const user = userEvent.setup()
  const trigger = screen.getByRole("button", {
    name: "Enlarge Printer One camera",
  })
  const image = document.querySelector(
    ".platform-printer-image",
  ) as HTMLImageElement
  await user.click(trigger)
  expect(
    screen.getByRole("dialog", {
      name: "Printer One camera",
    }),
  ).toBeVisible()
  expect(
    screen.getByRole("img", { name: "Printer One camera" }),
  ).toBe(image)
  await user.click(image)
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(trigger).toHaveFocus()
  await user.click(trigger)
  await user.click(
    screen.getByRole("button", {
      name: "Close Printer One camera",
    }),
  )
  expect(screen.queryByRole("dialog")).toBeNull()
  await user.click(trigger)
  await user.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(onAction).not.toHaveBeenCalled()
})

test("a static print image also opens and closes", async () => {
  await mount({ width: 1280, height: 720, isCamera: false })
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("button", {
      name: "Enlarge Printer One print image",
    }),
  )
  expect(
    screen.getByRole("dialog", {
      name: "Printer One print image",
    }),
  ).toBeVisible()
  await user.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).toBeNull()
})

test("a short split panel keeps the printer heading and controls inside its card", async () => {
  await mount({ width: 1280, height: 480 })
  const printers = document.querySelector<HTMLElement>(
    ".platform-printers",
  ) as HTMLElement
  printers.style.inlineSize = "560px"
  printers.style.blockSize = "340px"
  printers.style.flex = "none"
  await waitFor(() =>
    expect(card()?.dataset.compact).toBe("true"),
  )
  const bounds = (
    card() as HTMLElement
  ).getBoundingClientRect()
  await waitFor(() => {
    expect(
      screen
        .getByText("Printer One")
        .getBoundingClientRect().top,
    ).toBeGreaterThanOrEqual(bounds.top)
    expect(
      screen
        .getByRole("button", { name: "Stop" })
        .getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(bounds.bottom)
  })
})

test("a loaded static image leaves tall-window facts visible before and after enlargement", async () => {
  await mount({
    width: 1814,
    height: 1376,
    isCamera: false,
  })
  const user = userEvent.setup()
  const checkFit = () => {
    expect(
      document
        .querySelector(".printer-body")
        ?.getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(1376)
    expect(
      document
        .querySelector(".platform-printer-image")
        ?.getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(1376)
  }
  await waitFor(checkFit)
  await user.click(
    screen.getByRole("button", {
      name: "Enlarge Printer One print image",
    }),
  )
  await user.keyboard("{Escape}")
  await waitFor(checkFit)
})

test.each([
  "finished",
  "failed",
] as const)("a %s camera job keeps its card and clears on one tap until the source removes it", async (state) => {
  await page.viewport(1280, 720)
  const onAction = vi.fn(async () => undefined)
  const data = {
    printers: printerData.printers.map((printer) => ({
      ...printer,
      state,
      cameraPath: cameraPicture,
    })),
  }
  const mounted = render(
    <main class="platform">
      <PrintersView
        data={data}
        isControlEnabled
        onAction={onAction}
        settings={{}}
      />
    </main>,
  )
  expect(
    screen.getByText(
      state === "finished"
        ? "Finished · Clear plate"
        : "Failed · Clear plate",
    ),
  ).toBeVisible()
  expect(
    screen.queryByRole("button", { name: "Pause" }),
  ).toBeNull()
  expect(
    screen.queryByRole("button", { name: "Stop" }),
  ).toBeNull()
  expect(screen.queryByText("Finishes")).toBeNull()
  const clear = screen.getByRole("button", {
    name: "Clear plate",
  })
  expect(
    clear.getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(720)
  await userEvent.setup().click(clear)
  expect(onAction).toHaveBeenCalledWith("clear_plate", {
    printerId: data.printers[0]?.id,
  })
  expect(clear).toBeVisible()
  mounted.rerender(
    <main class="platform">
      <PrintersView
        data={{ printers: [] }}
        isControlEnabled
        onAction={onAction}
        settings={{}}
      />
    </main>,
  )
  expect(
    screen.queryByRole("button", { name: "Clear plate" }),
  ).toBeNull()
})

test("read-only completed cards explain disabled plate clearance", () => {
  render(
    <PrintersView
      data={{
        printers: printerData.printers.map((printer) => ({
          ...printer,
          state: "finished",
        })),
      }}
      isControlEnabled={false}
      controlDisabledReason="Sign in to control"
      onAction={vi.fn()}
      settings={{}}
    />,
  )
  expect(
    screen.getByText("Finished · Clear plate"),
  ).toBeVisible()
  expect(
    screen.getByRole("button", { name: "Clear plate" }),
  ).toBeDisabled()
  expect(
    screen.getByText("Sign in to control"),
  ).toBeVisible()
})

test.each([
  { width: 713, height: 423 },
  { width: 348, height: 405 },
])("compact camera cards separate the media and keep multi-filament details inside at $width × $height", async ({
  width,
  height,
}) => {
  await page.viewport(width, height)
  render(
    <main class="platform">
      <PrintersView
        data={{
          printers: printerData.printers.map((printer) => ({
            ...printer,
            cameraPath: cameraPicture,
            filamentText: "PLA Translucent · AMS 1 slot 3",
            finishAtMs: Date.now() + 86400000,
            filaments: [
              {
                name: "PLA Translucent",
                color: "#cc3377",
                location: "AMS 1 slot 3",
              },
              {
                name: "PLA Basic",
                color: "#4477cc",
                location: "AMS 2 slot 1",
              },
            ],
          })),
        }}
        isControlEnabled
        onAction={vi.fn()}
        settings={{ isCompactFacts: true }}
      />
    </main>,
  )
  await document.fonts.ready
  await waitFor(() => {
    const bounds = (
      card() as HTMLElement
    ).getBoundingClientRect()
    const body = document.querySelector(
      ".printer-body",
    ) as HTMLElement
    const media = document.querySelector(
      ".platform-printer-media",
    ) as HTMLElement
    const bodyBounds = body.getBoundingClientRect()
    const mediaBounds = media.getBoundingClientRect()
    expect(card()?.dataset.orientation).toBeDefined()
    const distance =
      card()?.dataset.orientation === "horizontal"
        ? bodyBounds.left - mediaBounds.right
        : bodyBounds.top - mediaBounds.bottom
    expect(distance).toBeGreaterThanOrEqual(11.5)
    const summary = document.querySelector(
      ".printer-filament-summary",
    ) as HTMLElement
    expect(
      summary.getBoundingClientRect().width,
    ).toBeGreaterThan(100)
    const count = document.querySelector(
      ".printer-filament-count",
    ) as HTMLElement
    expect(
      count.getBoundingClientRect().right,
    ).toBeLessThanOrEqual(bounds.right + 1)
    expect(
      count.getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(bounds.bottom + 1)
    expect(body.scrollWidth).toBeLessThanOrEqual(
      body.clientWidth + 1,
    )
  })
})

test("camera and plate preview stay separate and the plate opens without a printer command", async () => {
  const onAction = await mount({ width: 1024, height: 600 })
  const user = userEvent.setup()
  const trigger = screen.getByRole("button", {
    name: "Enlarge Printer One plate preview",
  })
  await waitFor(() => expect(trigger).toBeVisible())
  expect(
    screen.getByRole("button", {
      name: "Enlarge Printer One camera",
    }),
  ).toBeVisible()
  const camera = document.querySelector(
    ".platform-printer-image",
  ) as HTMLImageElement
  expect(camera.src).toContain("printer-camera-chamber")
  const plate = document.querySelector(
    ".platform-printer-plate-preview img",
  ) as HTMLImageElement
  expect(plate.getAttribute("src")).toContain(
    "printer-plate-canisters",
  )
  await user.click(trigger)
  expect(
    screen.getByRole("dialog", {
      name: "Printer One plate preview",
    }),
  ).toBeVisible()
  expect(camera).toBe(
    document.querySelector(".platform-printer-image"),
  )
  await user.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(trigger).toHaveFocus()
  expect(onAction).not.toHaveBeenCalled()
})

test("camera-off mode shows one full print image without duplicating the plate preview", async () => {
  await mount({ width: 1024, height: 600, isCamera: false })
  expect(
    screen.getByRole("button", {
      name: "Enlarge Printer One print image",
    }),
  ).toBeVisible()
  expect(
    screen.queryByRole("button", {
      name: "Enlarge Printer One plate preview",
    }),
  ).toBeNull()
})

test.each([
  210, 190, 170,
])("space reduction at 660 × %s keeps progress and drops metrics before the plate preview", async (height) => {
  await mount({ width: 660, height })
  await waitFor(() =>
    expect(card()?.dataset.orientation).toBeDefined(),
  )
  expect(
    screen.getByRole("button", { name: "Pause" }),
  ).toBeVisible()
  expect(
    screen.getByRole("button", { name: "Stop" }),
  ).toBeVisible()
  expect(
    document.querySelector(".printer-band"),
  ).toBeVisible()
  await waitFor(() => {
    const plate = document.querySelector(
      ".platform-printer-plate-preview",
    )
    const metrics = document.querySelector(
      ".printer-metrics",
    )
    if (card()?.dataset.platePreviewVisible === "false") {
      expect(plate).not.toBeVisible()
      expect(metrics).not.toBeVisible()
    } else {
      expect(plate).toBeVisible()
    }
  })
})

test("a failed secondary plate image yields its space without hiding the camera or progress", async () => {
  await mount({ width: 1024, height: 600 })
  const preview = document.querySelector<HTMLImageElement>(
    ".platform-printer-plate-preview img",
  )
  expect(preview).not.toBeNull()
  preview?.dispatchEvent(new Event("error"))
  await waitFor(() =>
    expect(
      document.querySelector(
        ".platform-printer-plate-preview",
      ),
    ).toBeNull(),
  )
  expect(
    screen.getByRole("button", {
      name: "Enlarge Printer One camera",
    }),
  ).toBeVisible()
  expect(
    screen.getByRole("button", { name: "Pause" }),
  ).toBeVisible()
  expect(
    document.querySelector(".printer-band"),
  ).toBeVisible()
})
