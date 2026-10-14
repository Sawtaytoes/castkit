import { describe, expect, test, vi } from "vitest"

vi.mock("electron", () => ({ session: {} }))

const { decideCookieChange, signInCookieName } =
  await import("./sharedSignIn.ts")

const signIn = {
  name: signInCookieName,
  value: "token-b",
  domain: "castkit.example.test",
}

describe("decideCookieChange", () => {
  test("a new sign-in from the server is shared", () => {
    expect(
      decideCookieChange({
        cookie: signIn,
        cause: "inserted",
        isRemoved: false,
        serverHost: "castkit.example.test",
        sharedValue: "token-a",
      }),
    ).toBe("share")
  })

  test("the copy this app made is not shared again", () => {
    expect(
      decideCookieChange({
        cookie: signIn,
        cause: "explicit",
        isRemoved: false,
        serverHost: "castkit.example.test",
        sharedValue: "token-b",
      }),
    ).toBe("ignore")
  })

  test("a sign-out or an expiry is removed everywhere, but a replacement is not", () => {
    const removal = {
      cookie: signIn,
      isRemoved: true,
      serverHost: "castkit.example.test",
      sharedValue: "token-b",
    }
    expect(
      decideCookieChange({ ...removal, cause: "expired" }),
    ).toBe("remove")
    expect(
      decideCookieChange({
        ...removal,
        cause: "expired-overwrite",
      }),
    ).toBe("remove")
    expect(
      decideCookieChange({
        ...removal,
        cause: "overwrite",
      }),
    ).toBe("ignore")
    expect(
      decideCookieChange({
        ...removal,
        cause: "explicit",
        sharedValue: null,
      }),
    ).toBe("ignore")
  })

  test("another cookie, or another site's cookie, is left alone", () => {
    expect(
      decideCookieChange({
        cookie: { ...signIn, name: "theme" },
        cause: "inserted",
        isRemoved: false,
        serverHost: "castkit.example.test",
        sharedValue: null,
      }),
    ).toBe("ignore")
    expect(
      decideCookieChange({
        cookie: { ...signIn, domain: ".elsewhere.test" },
        cause: "inserted",
        isRemoved: false,
        serverHost: "castkit.example.test",
        sharedValue: null,
      }),
    ).toBe("ignore")
    expect(
      decideCookieChange({
        cookie: {
          ...signIn,
          domain: ".castkit.example.test",
        },
        cause: "inserted",
        isRemoved: false,
        serverHost: "castkit.example.test",
        sharedValue: null,
      }),
    ).toBe("share")
  })
})
