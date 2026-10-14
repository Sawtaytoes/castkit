import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { createIdleClosingBrowser } from "./idleClosingBrowser.ts"

const createFakeEngine = () => {
  const close = vi.fn(async () => {})
  const renderUrl = vi.fn(
    async (): Promise<Buffer> => Buffer.from("png"),
  )
  return {
    engine: {
      name: "chromium" as const,
      render: async () => Buffer.from(""),
      renderUrl,
      close,
    },
    close,
    renderUrl,
  }
}

const request = {
  url: "http://127.0.0.1/screen/example",
  width: 200,
  height: 200,
  supersampleFactor: 1,
}

describe(createIdleClosingBrowser.name, () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("launches nothing until the first page capture", () => {
    const launch = vi.fn()
    const browser = createIdleClosingBrowser({
      launch,
      idleCloseMilliseconds: 1000,
    })

    expect(launch).not.toHaveBeenCalled()
    expect(browser.getIsOpen()).toBe(false)
  })

  test("closes the browser after the idle time and relaunches on the next capture", async () => {
    const first = createFakeEngine()
    const second = createFakeEngine()
    const launch = vi
      .fn()
      .mockResolvedValueOnce(first.engine)
      .mockResolvedValueOnce(second.engine)
    const browser = createIdleClosingBrowser({
      launch,
      idleCloseMilliseconds: 1000,
    })

    await browser.renderUrl(request)
    expect(browser.getIsOpen()).toBe(true)

    await vi.advanceTimersByTimeAsync(999)
    expect(first.close).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(first.close).toHaveBeenCalledOnce()
    expect(browser.getIsOpen()).toBe(false)

    await browser.renderUrl(request)
    expect(launch).toHaveBeenCalledTimes(2)
    expect(second.renderUrl).toHaveBeenCalledOnce()
  })

  test("a capture inside the idle window keeps the same browser open", async () => {
    const fake = createFakeEngine()
    const launch = vi.fn().mockResolvedValue(fake.engine)
    const browser = createIdleClosingBrowser({
      launch,
      idleCloseMilliseconds: 1000,
    })

    await browser.renderUrl(request)
    await vi.advanceTimersByTimeAsync(900)
    await browser.renderUrl(request)
    await vi.advanceTimersByTimeAsync(900)

    expect(launch).toHaveBeenCalledOnce()
    expect(fake.close).not.toHaveBeenCalled()
  })

  test("concurrent captures share one launch, and a slow capture is not closed under", async () => {
    const fake = createFakeEngine()
    let finishSlowCapture: (value: Buffer) => void =
      () => {}
    fake.renderUrl.mockImplementationOnce(
      () =>
        new Promise<Buffer>((resolve) => {
          finishSlowCapture = resolve
        }),
    )
    const launch = vi.fn().mockResolvedValue(fake.engine)
    const browser = createIdleClosingBrowser({
      launch,
      idleCloseMilliseconds: 1000,
    })

    const slowCapture = browser.renderUrl(request)
    await browser.renderUrl(request)
    await vi.advanceTimersByTimeAsync(5000)

    expect(launch).toHaveBeenCalledOnce()
    expect(fake.close).not.toHaveBeenCalled()

    finishSlowCapture(Buffer.from("png"))
    await slowCapture
    await vi.advanceTimersByTimeAsync(1000)
    expect(fake.close).toHaveBeenCalledOnce()
  })

  test("a failed launch is retried on the next capture", async () => {
    const fake = createFakeEngine()
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error("no browser"))
      .mockResolvedValueOnce(fake.engine)
    const browser = createIdleClosingBrowser({
      launch,
      idleCloseMilliseconds: 1000,
    })

    await expect(
      browser.renderUrl(request),
    ).rejects.toThrow("no browser")
    await browser.renderUrl(request)

    expect(launch).toHaveBeenCalledTimes(2)
    expect(fake.renderUrl).toHaveBeenCalledOnce()
  })
})
