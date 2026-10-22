const LIVE_FIELDS = new Set([
  "label",
  "contrast",
  "hasViewDrawer",
  "hasTouch",
  "repaint",
  "rotation",
  "views",
  "externalViews",
  "spoolsChannel",
  "printQueueChannel",
  "leftSwipeViewId",
  "power",
  "ditherProfile",
])

/** Routine presentation edits apply live; registry, transport and viewport changes need reinitialization. */
export const hasRestartingDeviceChanges = ({
  previous,
  next,
}: {
  previous: object
  next: object
}) => {
  const before = previous as Record<string, unknown>
  const after = next as Record<string, unknown>
  return [
    ...new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ]),
  ].some(
    (key) =>
      key !== "palette" &&
      !LIVE_FIELDS.has(key) &&
      JSON.stringify(before[key]) !==
        JSON.stringify(after[key]),
  )
}
