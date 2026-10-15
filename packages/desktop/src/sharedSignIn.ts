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
  type CookieListener = (
    event: Electron.Event,
    cookie: Cookie,
    cause: CookieChangeCause,
    isRemoved: boolean,
  ) => void
  const watched = new Map<
    string,
    { partitionSession: Session; onChanged: CookieListener }
  >()
  // A remembered sign-in belongs to one server, never whichever host was
  // selected most recently. Null remembers a sign-out, too.
  const sharedByOrigin = new Map<string, Cookie | null>()

  const copyInto = ({
    target,
    cookie,
    serverOrigin,
  }: {
    target: Session
    cookie: Cookie
    serverOrigin: string
  }) =>
    target.cookies
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

  const removeFrom = ({
    target,
    serverOrigin,
  }: {
    target: Session
    serverOrigin: string
  }) =>
    target.cookies
      .remove(`${serverOrigin}/`, signInCookieName)
      .catch(() => undefined)

  const shareWithOthers = ({
    partition,
    cookie,
    serverOrigin,
  }: {
    partition: string
    cookie: Cookie | null
    serverOrigin: string
  }) =>
    Promise.all(
      [...watched.entries()]
        .filter(
          ([otherPartition]) =>
            otherPartition !== partition,
        )
        .map(([, other]) =>
          cookie
            ? copyInto({
                target: other.partitionSession,
                cookie,
                serverOrigin,
              })
            : removeFrom({
                target: other.partitionSession,
                serverOrigin,
              }),
        ),
    )

  const hydrate = async (partition: string) => {
    const entry = watched.get(partition)
    const serverOrigin = readServerOrigin()
    if (!entry || !serverOrigin) {
      return
    }
    const [ownCookie] = await entry.partitionSession.cookies
      .get({ url: serverOrigin, name: signInCookieName })
      .catch(() => [])
    if (
      watched.get(partition) !== entry ||
      serverOrigin !== readServerOrigin()
    ) {
      return
    }
    if (sharedByOrigin.has(serverOrigin)) {
      const cookie = sharedByOrigin.get(serverOrigin)
      if (cookie && ownCookie?.value !== cookie.value) {
        await copyInto({
          target: entry.partitionSession,
          cookie,
          serverOrigin,
        })
      } else if (!cookie && ownCookie) {
        await removeFrom({
          target: entry.partitionSession,
          serverOrigin,
        })
      }
    } else if (ownCookie) {
      sharedByOrigin.set(serverOrigin, ownCookie)
      // Also reach windows which finished attaching before the signed-in one.
      await shareWithOthers({
        partition,
        cookie: ownCookie,
        serverOrigin,
      })
    }
  }

  /** Watch a window's partition, and start it with the current server's sign-in. */
  const attach = async (partition: string) => {
    if (!watched.has(partition)) {
      const partitionSession =
        session.fromPartition(partition)
      const onChanged: CookieListener = (
        _event,
        cookie,
        cause,
        isRemoved,
      ) => {
        const serverOrigin = readServerOrigin()
        if (!serverOrigin) {
          return
        }
        const decision = decideCookieChange({
          cookie,
          cause,
          isRemoved,
          serverHost: new URL(serverOrigin).hostname,
          sharedValue:
            sharedByOrigin.get(serverOrigin)?.value ?? null,
        })
        if (decision === "ignore") {
          return
        }
        const sharedCookie =
          decision === "share" ? cookie : null
        sharedByOrigin.set(serverOrigin, sharedCookie)
        void shareWithOthers({
          partition,
          cookie: sharedCookie,
          serverOrigin,
        })
      }
      watched.set(partition, {
        partitionSession,
        onChanged,
      })
      partitionSession.cookies.on("changed", onChanged)
    }
    await hydrate(partition)
  }

  /** Stop watching a removed window before its partition is cleared. */
  const detach = (partition: string) => {
    const entry = watched.get(partition)
    entry?.partitionSession.cookies.off(
      "changed",
      entry.onChanged,
    )
    watched.delete(partition)
  }

  /** Load and share the newly selected server's own cookie before its pages open. */
  const refresh = async () => {
    await Promise.all([...watched.keys()].map(hydrate))
  }

  return { attach, detach, refresh }
}
