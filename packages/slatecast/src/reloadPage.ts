/**
 * Reloading the panel's page, behind a seam a test can replace.
 *
 * Two callers ask for it: Home Assistant's Reload button, which arrives as a
 * `reload` message, and a snapshot whose bundle id differs from the one this
 * page loaded with.
 *
 * It is a module-scope override rather than a stub of `window.location` because
 * these tests run in a real Chromium, where `location` is unforgeable and
 * `Object.defineProperty` on it throws. The pattern is the one
 * `__setPhotoUrlBuilderForStories` already uses.
 */

const reloadTheDocument = () => {
  window.location.reload()
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
