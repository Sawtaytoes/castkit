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

  return (
    <iframe
      class="external-view"
      src={view.url}
      title={view.name}
      data-castkit-target={`external-view:${view.name}`}
    />
  )
}
