/**
 * Reloading the panel's page, behind a seam a test can replace.
 *
 * Callers: Home Assistant's Reload button, which arrives as a `reload`
 * message; a snapshot whose bundle id differs from the one this page loaded
 * with; and a platform display whose server answers 409.
 *
 * ⚠️ A reload never goes out blind. It asks for this page's own URL first and
 * reloads only when that answers 2xx, retrying with no deadline. The new-build
 * reload fires during a deploy, which is exactly when the reverse proxy is
 * answering 502 — and a reload that lands on the proxy's error page leaves the
 * panel on a document with no CastKit code in it, so nothing ever tries again.
 * Waiting on the current page instead costs nothing: it keeps working until the
 * server is ready for it to go.
 *
 * It is a module-scope override rather than a stub of `window.location` because
 * these tests run in a real Chromium, where `location` is unforgeable and
 * `Object.defineProperty` on it throws. The pattern is the one
 * `__setPhotoUrlBuilderForStories` already uses.
 */

const RETRY_MILLISECONDS = 2_000

type ReloadWhenPageAnswersDependencies = {
  isPageAnswering: () => Promise<boolean>
  reload: () => void
  wait: (milliseconds: number) => Promise<void>
}

/** Poll until the page answers, then reload. Exported for its tests. */
export const reloadWhenPageAnswers = async ({
  isPageAnswering,
  reload,
  wait,
}: ReloadWhenPageAnswersDependencies) => {
  while (!(await isPageAnswering())) {
    await wait(RETRY_MILLISECONDS)
  }
  reload()
}

const isThisPageAnswering = async () => {
  try {
    const response = await fetch(window.location.href, {
      cache: "no-store",
      credentials: "same-origin",
    })
    return response.ok
  } catch {
    return false
  }
}

const pendingReload: { isPending: boolean } = {
  isPending: false,
}

const reloadTheDocument = () => {
  // Three callers can ask during one deploy; one poll loop answers all of them.
  if (pendingReload.isPending) {
    return
  }
  pendingReload.isPending = true
  void reloadWhenPageAnswers({
    isPageAnswering: isThisPageAnswering,
    reload: () => window.location.reload(),
    wait: (milliseconds) =>
      new Promise((resolve) => {
        window.setTimeout(resolve, milliseconds)
      }),
  })
}

const pageReloader: { reload: () => void } = {
  reload: reloadTheDocument,
}

export const reloadPage = () => {
  pageReloader.reload()
}

/** Observe the reload instead of performing it. Tests only. */
export const __setPageReloaderForTests = (
  reload: (() => void) | null,
) => {
  pageReloader.reload = reload ?? reloadTheDocument
}
