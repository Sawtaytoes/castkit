import { EventEmitter } from "node:events"
import {
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"

const electron = vi.hoisted(() => ({
  fromPartition: vi.fn(),
}))
vi.mock("electron", () => ({
  session: { fromPartition: electron.fromPartition },
}))

const {
  createSharedSignIn,
  decideCookieChange,
  signInCookieName,
} = await import("./sharedSignIn.ts")

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

describe("shared session lifecycle", () => {
  const makeCookies = (
    ownCookie: typeof signIn | null = null,
  ) =>
    Object.assign(new EventEmitter(), {
      get: vi.fn(async () =>
        ownCookie ? [ownCookie] : [],
      ),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    })
  beforeEach(() => {
    electron.fromPartition.mockReset()
  })

  test("an existing sign-in found at startup reaches a window attached earlier", async () => {
    const first = makeCookies()
    const second = makeCookies(signIn)
    electron.fromPartition.mockImplementation(
      (partition) => ({
        cookies: partition === "first" ? first : second,
      }),
    )
    const sharing = createSharedSignIn({
      readServerOrigin: () =>
        "https://castkit.example.test",
      log: vi.fn(),
    })
    await sharing.attach("first")
    await sharing.attach("second")
    expect(first.set).toHaveBeenCalledWith(
      expect.objectContaining({ value: "token-b" }),
    )
  })

  test("changing servers never sends the previous server's sign-in to the new host", async () => {
    const origin = { value: "https://castkit.example.test" }
    const first = makeCookies(signIn)
    const second = makeCookies()
    electron.fromPartition.mockImplementation(
      (partition) => ({
        cookies: partition === "first" ? first : second,
      }),
    )
    const sharing = createSharedSignIn({
      readServerOrigin: () => origin.value,
      log: vi.fn(),
    })
    await sharing.attach("first")
    origin.value = "https://other.example.test"
    await sharing.attach("second")
    expect(second.set).not.toHaveBeenCalled()
  })

  test("detaching a removed window removes its cookie listener", async () => {
    const cookies = makeCookies()
    electron.fromPartition.mockReturnValue({ cookies })
    const sharing = createSharedSignIn({
      readServerOrigin: () =>
        "https://castkit.example.test",
      log: vi.fn(),
    })
    await sharing.attach("first")
    expect(cookies.listenerCount("changed")).toBe(1)
    sharing.detach("first")
    expect(cookies.listenerCount("changed")).toBe(0)
  })
})
