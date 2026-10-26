import { navigationFeedback } from "./navigationFeedback.ts"

/** A lightweight overlay acknowledges gestures without intercepting the next one. */
export const NavigationFeedback = () => {
  const feedback = navigationFeedback.value
  if (!feedback) return null
  return (
    <div
      class="navigation-feedback"
      data-phase={feedback.phase}
      // An image-stream worker reads the destination here and sends its
      // pre-rendered frame while the view is still being built.
      data-requested-view={feedback.requestedView}
      role="status"
      aria-live="polite"
    >
      <span
        class="navigation-feedback-spinner"
        aria-hidden="true"
      />
      <span>
        {feedback.phase === "pulling"
          ? `Release for ${feedback.label}`
          : feedback.phase === "loading"
            ? `Opening ${feedback.label}…`
            : feedback.label}
      </span>
      <span
        class="navigation-feedback-progress"
        aria-hidden="true"
        style={{
          transform: `scaleX(${feedback.progress})`,
        }}
      />
    </div>
  )
}
