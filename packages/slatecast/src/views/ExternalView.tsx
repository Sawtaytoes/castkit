import { activeView, device } from "../state.ts"

const externalViewIndex = () => {
  const match = /^external-view:(\d+)$/.exec(
    activeView.value,
  )
  return match ? Number.parseInt(match[1] ?? "", 10) : -1
}

/** A deployment-configured application presented as a normal CastKit view. */
export const ExternalView = () => {
  const view =
    device.value?.externalViews[externalViewIndex()]
  if (!view) {
    return (
      <div class="idle">
        <div class="idle-title">View unavailable</div>
      </div>
    )
  }

  // Only an explicit `false` hides the frame: a view with no health URL
  // carries no answer and is always framed, as it was before probes existed.
  // Swapping the frame out, rather than hiding it, means the frame that comes
  // back loads the working page instead of keeping the proxy's error page.
  if (view.isAvailable === false) {
    return (
      <div class="idle">
        <div class="idle-title">{`${view.name} is not available`}</div>
        <div class="idle-label">
          {`This view opens by itself when ${view.name} answers.`}
        </div>
      </div>
    )
  }

  return (
    <iframe
      class="external-view"
      src={view.url}
      title={view.name}
      data-castkit-target={`external-view:${view.name}`}
      // CSS zoom on a frame reaches the framed document as its device
      // pixel ratio, so the application lays out at the larger size and
      // stays sharp — a transform would scale a finished bitmap instead.
      style={view.zoom ? { zoom: view.zoom } : undefined}
    />
  )
}
