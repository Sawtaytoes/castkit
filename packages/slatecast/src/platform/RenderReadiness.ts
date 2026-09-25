import { useLayoutEffect, useState } from "preact/hooks"

/** A captured frame becomes ready after its fonts and current images settle. */
export const useRenderReadiness = (revision: unknown) => {
  const [isReady, setIsReady] = useState(false)
  useLayoutEffect(() => {
    const lifecycle = { isDisposed: false }
    setIsReady(false)
    const stampControls = () =>
      document
        .querySelectorAll<HTMLElement>(
          ".platform button, .platform input, .platform select, .platform a, .platform-lock button",
        )
        .forEach((control, index) => {
          if (
            control.dataset.castkitTarget &&
            control.dataset.castkitGenerated !== "true"
          ) {
            return
          }
          const panel =
            control
              .closest("[data-spec]")
              ?.getAttribute("data-spec") ?? "page"
          const dialog =
            control.closest('[role="alertdialog"]')
              ?.textContent ?? ""
          control.dataset.castkitTarget = `${panel}:${index}:${control.getAttribute("aria-label") ?? control.textContent ?? control.tagName}:${dialog}`
          control.dataset.castkitGenerated = "true"
        })
    stampControls()
    const controlObserver = new MutationObserver(
      stampControls,
    )
    controlObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    })
    const deadline = Date.now() + 8000
    const waitForPlugins = new Promise<void>((resolve) => {
      const done = () => {
        observer.disconnect()
        clearTimeout(timeout)
        resolve()
      }
      const check = () => {
        if (
          !document.querySelector(
            '[data-castkit-plugin-ready="false"]',
          )
        )
          done()
      }
      const observer = new MutationObserver(check)
      const timeout = setTimeout(done, 8000)
      observer.observe(document.body, {
        subtree: true,
        attributes: true,
        childList: true,
        attributeFilter: ["data-castkit-plugin-ready"],
      })
      check()
    })
    void waitForPlugins.then(async () => {
      // Mount/update callbacks can add media after the host's layout effect.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      )
      const images = Array.from(
        document.querySelectorAll<HTMLImageElement>(
          ".platform img",
        ),
      )
      await Promise.allSettled([
        document.fonts.ready,
        ...images.map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                const done = () => {
                  image.removeEventListener("load", done)
                  image.removeEventListener("error", done)
                  clearTimeout(timeout)
                  resolve()
                }
                const timeout = setTimeout(
                  done,
                  Math.max(0, deadline - Date.now()),
                )
                image.addEventListener("load", done, {
                  once: true,
                })
                image.addEventListener("error", done, {
                  once: true,
                })
              }),
        ),
      ])
      if (!lifecycle.isDisposed) setIsReady(true)
    })
    return () => {
      lifecycle.isDisposed = true
      controlObserver.disconnect()
    }
  }, [revision])
  return isReady
}
