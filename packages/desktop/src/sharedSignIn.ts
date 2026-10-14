import {
  type Cookie,
  type Session,
  session,
} from "electron"

/** The cookie a CastKit server keeps its PIN unlocks on (`platformAccess.ts`). */
export const signInCookieName = "castkit-session"

/** Why a cookie changed, as Electron's `cookies` `changed` event reports it. */
type CookieChangeCause =
  | "inserted"
  | "inserted-no-change-overwrite"
  | "inserted-no-value-change-overwrite"
  | "explicit"
  | "overwrite"
  | "expired"
  | "evicted"
  | "expired-overwrite"

/**
 * What one window's cookie change means for the others: `share` the new
 * sign-in, `remove` it after a sign-out or an expiry, or `ignore` it. An
 * `overwrite` removal is the first half of a replacement and the insert that
 * follows carries the change, and a value every window already has is the
 * echo of this app's own copy.
 */
export const decideCookieChange = ({
  cookie,
  cause,
  isRemoved,
  serverHost,
  sharedValue,
}: {
  cookie: Pick<Cookie, "name" | "value" | "domain">
  cause: CookieChangeCause
  isRemoved: boolean
  serverHost: string | null
  sharedValue: string | null
}) => {
  const isServerSignIn =
    cookie.name === signInCookieName &&
    serverHost !== null &&
    cookie.domain?.replace(/^\./, "") === serverHost
  if (!isServerSignIn) {
    return "ignore"
  }
  if (isRemoved) {
    return (cause === "explicit" ||
      cause === "expired" ||
      cause === "expired-overwrite") &&
      sharedValue !== null
      ? "remove"
      : "ignore"
  }
  return cookie.value === sharedValue ? "ignore" : "share"
}

/**
 * One sign-in for every window. Each window keeps its own session partition,
 * which is what keeps its zoom its own, but the server's sign-in cookie is
 * copied between them: a PIN typed in one window unlocks every window, and a
 * new window starts signed in. The server keeps every unlock on that one
 * session, so the copy carries all of them.
 */
export const createSharedSignIn = ({
  readServerOrigin,
  log,
}: {
  readServerOrigin: () => string | null
  log: (message: string) => void
}) => {
  const watched = new Map<string, Session>()
  const shared: { cookie: Cookie | null } = { cookie: null }

  const readServerHost = () => {
    const serverOrigin = readServerOrigin()
    return serverOrigin
      ? new URL(serverOrigin).hostname
      : null
  }

  const copyInto = ({
    target,
    cookie,
  }: {
    target: Session
    cookie: Cookie
  }) => {
    const serverOrigin = readServerOrigin()
    if (!serverOrigin) {
      return Promise.resolve()
    }
    return target.cookies
      .set({
        url: `${serverOrigin}/`,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path ?? "/",
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        ...(cookie.expirationDate === undefined
          ? {}
          : { expirationDate: cookie.expirationDate }),
      })
      .catch((error: unknown) => {
        log(`Could not share the sign-in: ${String(error)}`)
      })
  }

  const removeFrom = (target: Session) => {
    const serverOrigin = readServerOrigin()
    return serverOrigin
      ? target.cookies
          .remove(`${serverOrigin}/`, signInCookieName)
          .catch(() => undefined)
      : Promise.resolve()
  }

  /** Watch a window's partition, and start it with the shared sign-in. */
  const attach = async (partition: string) => {
    if (watched.has(partition)) {
      return
    }
    const partitionSession =
      session.fromPartition(partition)
    watched.set(partition, partitionSession)
    partitionSession.cookies.on(
      "changed",
      (_event, cookie, cause, isRemoved) => {
        const decision = decideCookieChange({
          cookie,
          cause,
          isRemoved,
          serverHost: readServerHost(),
          sharedValue: shared.cookie?.value ?? null,
        })
        if (decision === "ignore") {
          return
        }
        shared.cookie = decision === "share" ? cookie : null
        watched.forEach((other, otherPartition) => {
          if (otherPartition === partition) {
            return
          }
          void (decision === "share"
            ? copyInto({ target: other, cookie })
            : removeFrom(other))
        })
      },
    )
    const serverOrigin = readServerOrigin()
    if (!serverOrigin) {
      return
    }
    const [ownCookie] = await partitionSession.cookies
      .get({ url: serverOrigin, name: signInCookieName })
      .catch(() => [])
    if (shared.cookie) {
      if (ownCookie?.value !== shared.cookie.value) {
        await copyInto({
          target: partitionSession,
          cookie: shared.cookie,
        })
      }
    } else if (ownCookie) {
      // The first window that is already signed in at launch is the one the
      // others copy when they next need a sign-in.
      shared.cookie = ownCookie
    }
  }

  /** Stop watching a removed window's partition. */
  const detach = (partition: string) => {
    watched.delete(partition)
  }

  return { attach, detach }
}
