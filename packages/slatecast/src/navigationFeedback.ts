import { computed, signal } from "@preact/signals"

type Feedback = {
  label: string
  progress: number
  phase: "pulling" | "loading" | "error"
  requestedView?: string
}
const pull = signal<Feedback | null>(null)
const request = signal<Feedback | null>(null)
const lifetime = { timer: 0 }

/** Local input feedback is independent of the controller's navigation policy. */
export const navigationFeedback = computed(
  () => pull.value ?? request.value,
)

/** A pull previews the next destination while an earlier request can still finish. */
export const showNavigationPull = ({
  label,
  progress,
}: {
  label: string
  progress: number
}) => {
  pull.value =
    progress > 0
      ? {
          label,
          progress: Math.min(1, progress),
          phase: "pulling",
        }
      : null
}

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
  request.value = {
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
}

/** Cancelling a contact restores feedback for any running request. */
export const cancelNavigationPull = () => {
  pull.value = null
}

/** The selected view has painted, or its request has ended. */
export const finishNavigation = () => {
  clearTimeout(lifetime.timer)
  request.value = null
}
