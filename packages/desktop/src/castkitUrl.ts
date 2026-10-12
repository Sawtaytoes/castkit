/**
 * Read a server origin a person typed: `castkit.example:8788` and
 * `http://castkit.example:8788/manage` both become
 * `http://castkit.example:8788`. Returns `null` for anything that is not an
 * http or https address.
 */
export const normalizeServerOrigin = (input: string) => {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return null
  }
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`
  try {
    const url = new URL(withScheme)
    return url.protocol === "http:" ||
      url.protocol === "https:"
      ? url.origin
      : null
  } catch {
    return null
  }
}

/** The CastKit pages a desktop window may show. */
const pagePathPattern = /^\/(screen|view|d)\/[^/]+\/?$/

/** Whether a URL is a CastKit display page on the configured server. */
export const isCastkitPageUrl = ({
  url,
  serverOrigin,
}: {
  url: string
  serverOrigin: string
}) => {
  try {
    const parsed = new URL(url)
    return (
      parsed.origin === serverOrigin &&
      pagePathPattern.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

/**
 * Turn what someone entered in "Add window" into a page URL on the configured
 * server. A bare path (`/screen/kitchen`) is resolved against the server; a
 * full URL must already be on it. Anything else is refused with a reason.
 */
export const resolvePageUrl = ({
  input,
  serverOrigin,
}: {
  input: string
  serverOrigin: string
}): { url: string } | { error: string } => {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return { error: "Enter a CastKit page." }
  }
  const candidate = (() => {
    try {
      return new URL(trimmed, `${serverOrigin}/`)
    } catch {
      return null
    }
  })()
  if (!candidate) {
    return { error: "That is not a URL." }
  }
  if (candidate.origin !== serverOrigin) {
    return {
      error: `The page must be on the CastKit server (${serverOrigin}).`,
    }
  }
  if (!pagePathPattern.test(candidate.pathname)) {
    return {
      error:
        "Use a /screen/<id>, /view/<id>, or /d/<id> page.",
    }
  }
  return { url: candidate.href }
}

/**
 * Whether a window may navigate to a URL. Only the configured CastKit server
 * loads inside the app; every other link opens in the system browser.
 */
export const isAllowedNavigation = ({
  url,
  serverOrigin,
}: {
  url: string
  serverOrigin: string
}) => {
  try {
    return new URL(url).origin === serverOrigin
  } catch {
    return false
  }
}

/** Whether a link is safe to hand to the operating system's browser. */
export const isExternalWebUrl = (url: string) => {
  try {
    const { protocol } = new URL(url)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Move a saved page URL onto a new server origin, keeping its path and query,
 * so changing the server address keeps every window on the same page.
 */
export const rebaseUrl = ({
  url,
  serverOrigin,
}: {
  url: string
  serverOrigin: string
}) => {
  try {
    const parsed = new URL(url)
    return `${serverOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}
