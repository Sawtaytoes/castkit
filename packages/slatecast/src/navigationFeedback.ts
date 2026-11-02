import { computed, signal } from "@preact/signals"

type Feedback = {
  label: string
  progress: number
  phase: "loading" | "error"
  requestedView?: string
  navigationId?: string
}
declare global {
  interface Window {
    /**
     * The last view this page asked for, written in the same task as the
     * request. An image-stream worker reads it right after it releases a
     * contact (`NAVIGATION_SCRIPT` in `device-client/remote-display/worker.py`)
     * and shows the destination it holds ready. The feedback element cannot
     * carry this: it renders a microtask later, and on loopback the server's
     * answer can replace it before the worker looks.
     */
    __castkitNavigation?: { id: string; view: string }
  }
}

const request = signal<Feedback | null>(null)
const lifetime = { timer: 0 }

/**
 * Feedback for a released request, independent of the controller's navigation
 * policy. A pull in progress shows no hint: the owner removed the "Release for …"
 * label (docs/decisions/2026-11-02-a-pull-shows-no-release-hint.md).
 */
export const navigationFeedback = computed(
  () => request.value,
)

/** The outstanding local request. */
export const navigationRequestId = computed(() =>
  request.value?.phase === "loading"
    ? (request.value.navigationId ?? null)
    : null,
)

/** Only an expired controller wait may restore a deferred response. */
export const hasNavigationTimedOut = computed(
  () => request.value?.phase === "error",
)

/** Repeating an unanswered gesture must not enqueue the same navigation again. */
export const hasNavigationRequest = (
  requestedView: string,
) =>
  request.peek()?.phase === "loading" &&
  request.peek()?.requestedView === requestedView

/** Keep acknowledgement visible through the controller round trip and composition load. */
export const showNavigationLoading = ({
  label,
  requestedView,
}: {
  label: string
  requestedView: string
}) => {
  clearTimeout(lifetime.timer)
  // getRandomValues also works on LAN HTTP origins where randomUUID is unavailable.
  const navigationId = Array.from(
    crypto.getRandomValues(new Uint32Array(4)),
    (value) => value.toString(16),
  ).join("-")
  window.__castkitNavigation = {
    id: navigationId,
    view: requestedView,
  }
  request.value = {
    navigationId,
    label,
    requestedView,
    progress: 1,
    phase: "loading",
  }
  lifetime.timer = window.setTimeout(() => {
    request.value = {
      label:
        "Still waiting for the display · Swipe to retry",
      progress: 1,
      phase: "error",
    }
  }, 8000)
  return navigationId
}

/** The selected view has painted, or its request has ended. */
export const finishNavigation = () => {
  clearTimeout(lifetime.timer)
  request.value = null
}
