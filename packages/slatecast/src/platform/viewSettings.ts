/** Read structured view settings from direct configuration or the admin JSON field. */
export const structuredSetting = ({
  settings,
  key,
}: {
  settings: Record<string, unknown>
  key: string
}): unknown => {
  const value = settings[key] ?? settings[`${key}Json`]
  if (typeof value !== "string") {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/** Invalid gate configuration must never silently remove a control restriction. */
export const hasInvalidControlSettings = (
  settings: Record<string, unknown>,
) =>
  [
    "entityVisibility",
    "actionVisibility",
    "actionButtons",
  ].some((key) => {
    const raw = settings[key] ?? settings[`${key}Json`]
    if (raw === undefined || raw === null || raw === "")
      return false
    const value = structuredSetting({ settings, key })
    return key === "actionButtons"
      ? !Array.isArray(value)
      : !value ||
          typeof value !== "object" ||
          Array.isArray(value)
  })
