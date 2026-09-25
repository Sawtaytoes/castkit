import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"
import type { Context } from "hono"
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "hono/cookie"
import {
  hashPin,
  type PlatformStore,
  verifyPin,
} from "./platformStore.ts"

const cookieName = "castkit-session"
const sessionDigest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const isEqual = (left: string, right: string) =>
  Buffer.byteLength(left) === Buffer.byteLength(right) &&
  timingSafeEqual(Buffer.from(left), Buffer.from(right))
/** Server-checked kiosk sessions and administrative access, independent of any identity provider. */
export const createPlatformAccess = ({
  store,
  apiToken = "",
  renderKey = "",
  now = Date.now,
}: {
  store: PlatformStore
  apiToken?: string
  renderKey?: string
  now?: () => number
}) => {
  const attempts = new Map<
    string,
    { count: number; expiresAt: number }
  >()
  const getSession = (context: Context) => {
    const token = getCookie(context, cookieName)
    if (!token) return undefined
    return store
      .get()
      .sessions.find(
        (session) =>
          session.id === sessionDigest(token) &&
          (session.expiresAt === null ||
            session.expiresAt > now()),
      )
  }
  const isMachine = (context: Context) =>
    Boolean(
      apiToken &&
        isEqual(
          context.req.header("authorization") ?? "",
          `Bearer ${apiToken}`,
        ),
    )
  const isAdmin = (context: Context) =>
    Boolean(
      renderKey &&
        isEqual(
          context.req.header("x-castkit-render-key") ?? "",
          renderKey,
        ),
    ) ||
    isMachine(context) ||
    Boolean(getSession(context)?.isAdmin)
  const canAccess = ({
    context,
    kind,
    id,
  }: {
    context: Context
    kind: "view" | "screen"
    id: string
  }) =>
    isAdmin(context) ||
    Boolean(
      getSession(context)?.grants.some(
        (grant) =>
          grant.kind === kind &&
          grant.id === id &&
          (grant.expiresAt === null ||
            grant.expiresAt > now()),
      ),
    )
  const issue = ({
    context,
    isAdminSession = false,
    grant,
  }: {
    context: Context
    isAdminSession?: boolean
    grant?: {
      kind: "view" | "screen"
      id: string
      minutes?: number
    }
  }) => {
    const oldSession = getSession(context)
    const token =
      grant && oldSession
        ? (getCookie(context, cookieName) ??
          randomBytes(32).toString("base64url"))
        : randomBytes(32).toString("base64url")
    const isAdminValue =
      isAdminSession || Boolean(oldSession?.isAdmin)
    const expiresAt = isAdminValue
      ? now() + 12 * 60 * 60 * 1000
      : null
    const grants = [
      ...(oldSession?.grants ?? []).filter(
        (item) =>
          !(
            item.kind === grant?.kind &&
            item.id === grant.id
          ),
      ),
      ...(grant
        ? [
            {
              kind: grant.kind,
              id: grant.id,
              expiresAt: grant.minutes
                ? now() + grant.minutes * 60000
                : null,
            },
          ]
        : []),
    ]
    store.update((previous) => ({
      ...previous,
      sessions: [
        ...previous.sessions
          .filter(
            (session) =>
              session.id !== oldSession?.id &&
              (session.expiresAt === null ||
                session.expiresAt > now()),
          )
          .slice(-999),
        {
          id: sessionDigest(token),
          isAdmin: isAdminValue,
          expiresAt,
          grants,
        },
      ],
    }))
    setCookie(context, cookieName, token, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      secure:
        context.req.url.startsWith("https://") ||
        context.req.header("x-forwarded-proto") === "https",
      maxAge: isAdminValue ? 43200 : 60 * 60 * 24 * 365,
    })
  }
  const checkAttempt = (key: string) => {
    const attempt = attempts.get(key)
    if (
      attempt &&
      attempt.expiresAt > now() &&
      attempt.count >= 5
    )
      return false
    if (!attempt || attempt.expiresAt <= now())
      attempts.set(key, {
        count: 1,
        expiresAt: now() + 60000,
      })
    else
      attempts.set(key, {
        ...attempt,
        count: attempt.count + 1,
      })
    return true
  }
  const isSameOrigin = (context: Context) => {
    const origin = context.req.header("origin")
    if (!origin) return true
    const host =
      context.req.header("host") ??
      new URL(context.req.url).host
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  return {
    getSession,
    isAdmin,
    isMachine,
    canAccess,
    issue,
    checkAttempt,
    isSameOrigin,
    setup: ({
      pin,
      setupToken,
    }: {
      pin: string
      setupToken: string
    }) => {
      if (
        store.get().adminHash ||
        !isEqual(setupToken, store.get().setupToken)
      )
        return false
      store.update((previous) => ({
        ...previous,
        adminHash: hashPin(pin),
        setupToken: "",
      }))
      return true
    },
    verifyAdmin: (pin: string) =>
      verifyPin({ pin, hash: store.get().adminHash }),
    lock: ({
      context,
      kind,
      id,
    }: {
      context: Context
      kind: "view" | "screen"
      id: string
    }) => {
      const session = getSession(context)
      if (session)
        store.update((previous) => ({
          ...previous,
          sessions: previous.sessions.map((item) =>
            item.id === session.id
              ? {
                  ...item,
                  isAdmin: false,
                  grants: item.grants.filter(
                    (grant) =>
                      !(
                        grant.kind === kind &&
                        grant.id === id
                      ),
                  ),
                }
              : item,
          ),
        }))
    },
    logout: (context: Context) => {
      const session = getSession(context)
      store.update((previous) => ({
        ...previous,
        sessions: previous.sessions.filter(
          (item) => item.id !== session?.id,
        ),
      }))
      deleteCookie(context, cookieName, { path: "/" })
    },
  }
}
/** Access service shared by HTTP and socket authorization. */
export type PlatformAccess = ReturnType<
  typeof createPlatformAccess
>
