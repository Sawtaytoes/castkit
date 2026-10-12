import { describe, expect, test } from "vitest"
import {
  isAllowedNavigation,
  isCastkitPageUrl,
  isExternalWebUrl,
  normalizeServerOrigin,
  rebaseUrl,
  resolvePageUrl,
} from "./castkitUrl.ts"

const serverOrigin = "http://castkit.example:8788"

describe(normalizeServerOrigin.name, () => {
  test("a host and port without a scheme becomes an http origin", () => {
    expect(
      normalizeServerOrigin(" castkit.example:8788 "),
    ).toBe(serverOrigin)
  })

  test("a full URL keeps only its origin", () => {
    expect(
      normalizeServerOrigin(
        "https://castkit.example/manage/displays",
      ),
    ).toBe("https://castkit.example")
  })

  test("other schemes and empty input are refused", () => {
    expect(
      normalizeServerOrigin("file:///etc/passwd"),
    ).toBe(null)
    expect(normalizeServerOrigin("   ")).toBe(null)
  })
})

describe(resolvePageUrl.name, () => {
  test("a path resolves against the server", () => {
    expect(
      resolvePageUrl({
        input: "/screen/kitchen",
        serverOrigin,
      }),
    ).toEqual({ url: `${serverOrigin}/screen/kitchen` })
  })

  test("a full URL on the server is kept with its query", () => {
    expect(
      resolvePageUrl({
        input: `${serverOrigin}/view/clock?device=desk`,
        serverOrigin,
      }),
    ).toEqual({
      url: `${serverOrigin}/view/clock?device=desk`,
    })
  })

  test("a page on another server is refused", () => {
    expect(
      resolvePageUrl({
        input: "https://elsewhere.example/screen/kitchen",
        serverOrigin,
      }),
    ).toEqual({
      error: `The page must be on the CastKit server (${serverOrigin}).`,
    })
  })

  test("a server path that is not a display page is refused", () => {
    expect(
      resolvePageUrl({ input: "/manage", serverOrigin }),
    ).toEqual({
      error:
        "Use a /screen/<id>, /view/<id>, or /d/<id> page.",
    })
  })
})

describe(isCastkitPageUrl.name, () => {
  test("all three page kinds are display pages", () => {
    expect(
      ["/screen/one", "/view/two", "/d/three"].map((path) =>
        isCastkitPageUrl({
          url: `${serverOrigin}${path}`,
          serverOrigin,
        }),
      ),
    ).toEqual([true, true, true])
  })
})

describe(isAllowedNavigation.name, () => {
  test("only the configured origin loads inside the app", () => {
    expect(
      isAllowedNavigation({
        url: `${serverOrigin}/manage`,
        serverOrigin,
      }),
    ).toBe(true)
    expect(
      isAllowedNavigation({
        url: "http://castkit.example:9999/screen/one",
        serverOrigin,
      }),
    ).toBe(false)
  })
})

describe(isExternalWebUrl.name, () => {
  test("only web links go to the system browser", () => {
    expect(isExternalWebUrl("https://example.com/")).toBe(
      true,
    )
    expect(isExternalWebUrl("file:///C:/Windows")).toBe(
      false,
    )
    expect(isExternalWebUrl("javascript:alert(1)")).toBe(
      false,
    )
  })
})

describe(rebaseUrl.name, () => {
  test("a page keeps its path and query on the new server", () => {
    expect(
      rebaseUrl({
        url: `${serverOrigin}/view/clock?device=desk`,
        serverOrigin: "https://castkit.example",
      }),
    ).toBe("https://castkit.example/view/clock?device=desk")
  })
})
