import type { PreviewProfile } from "@castkit/shared/panels/previewProfile"
import { Button, Combobox, Field } from "@charcuterie/ui"
import { useEffect, useState } from "react"
import { inputClass } from "./platformApi.ts"

export type PreviewSize = {
  width: number
  height: number
} | null

const DimensionField = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) => {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <Field label={label}>
      <input
        className={inputClass}
        type="number"
        min={120}
        max={7680}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (
            draft.trim() &&
            Number.isFinite(Number(draft))
          )
            onChange(Number(draft))
          else setDraft(String(value))
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
      />
    </Field>
  )
}

/** A viewport choice never creates a device or changes its assignment. */
export const usePreviewSizing = (isEnabled = true) => {
  const [selection, setSelection] = useState("available")
  const [custom, setCustom] = useState({
    width: 1024,
    height: 600,
  })
  const [browser, setBrowser] = useState({
    width: innerWidth,
    height: innerHeight,
  })
  const [profiles, setProfiles] = useState<
    PreviewProfile[]
  >([])
  const [message, setMessage] = useState("")
  useEffect(() => {
    if (!isEnabled) return
    const update = () =>
      setBrowser({ width: innerWidth, height: innerHeight })
    window.addEventListener("resize", update)
    const controller = new AbortController()
    void fetch("/api/manage/preview-profiles", {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Display profiles are unavailable.",
          )
        const result = (await response.json()) as {
          profiles: PreviewProfile[]
        }
        setProfiles(result.profiles)
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage(
            "Display profiles are unavailable. Browser and custom sizes still work.",
          )
      })
    return () => {
      window.removeEventListener("resize", update)
      controller.abort()
    }
  }, [isEnabled])
  const profile = profiles.find(
    (item) => `profile:${item.id}` === selection,
  )
  const size: PreviewSize =
    selection === "available"
      ? null
      : selection === "browser"
        ? browser
        : profile
          ? { width: profile.width, height: profile.height }
          : custom
  const resize = (next: Exclude<PreviewSize, null>) => {
    setSelection("custom")
    setCustom({
      width: Math.max(
        120,
        Math.min(7680, Math.round(next.width)),
      ),
      height: Math.max(
        120,
        Math.min(7680, Math.round(next.height)),
      ),
    })
  }
  return {
    selection,
    setSelection,
    custom,
    browser,
    profiles,
    profile,
    size,
    resize,
    message,
  }
}

/** Select a real device size, the changing browser window, or a custom viewport. */
export const PreviewSizing = ({
  sizing,
}: {
  sizing: ReturnType<typeof usePreviewSizing>
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const options = [
    { value: "available", label: "Fit preview area" },
    {
      value: "browser",
      label: `Current browser window · ${sizing.browser.width} × ${sizing.browser.height}`,
    },
    ...sizing.profiles.map((profile) => ({
      value: `profile:${profile.id}`,
      label: profile.label,
      textValue: `${profile.label} ${profile.deviceLabels.join(" ")} ${profile.deviceIds.join(" ")}`,
    })),
    { value: "custom", label: "Custom size" },
  ]
  const selected = options.find(
    (option) => option.value === sizing.selection,
  )
  return (
    <div className="preview-sizing">
      <Field label="Preview size">
        <Combobox
          isVisible={isOpen}
          onDismiss={() => setIsOpen(false)}
          selectedValue={sizing.selection}
          onSelect={(value) => {
            sizing.setSelection(value)
            setIsOpen(false)
          }}
          options={options}
          placeholder="Search sizes, capabilities, or device names"
          trigger={
            <Button
              appearance="outline"
              className="w-full min-w-0"
              onClick={() => setIsOpen(true)}
            >
              <span className="truncate">
                Preview size:{" "}
                {selected?.label ?? "Fit preview area"}
              </span>
            </Button>
          }
        />
      </Field>
      {sizing.selection === "custom" ? (
        <>
          <DimensionField
            label="Preview width"
            value={sizing.custom.width}
            onChange={(width) =>
              sizing.resize({ ...sizing.custom, width })
            }
          />
          <DimensionField
            label="Preview height"
            value={sizing.custom.height}
            onChange={(height) =>
              sizing.resize({ ...sizing.custom, height })
            }
          />
        </>
      ) : null}
      {sizing.message ? (
        <p role="status">{sizing.message}</p>
      ) : null}
      {sizing.profile ? (
        <p className="preview-profile-description text-content-secondary text-sm">
          {sizing.profile.deviceIds.length > 1
            ? `Shared by ${sizing.profile.deviceIds.length} devices. `
            : ""}
          {sizing.profile.delivery === "image"
            ? sizing.profile.isPaletteSimulation
              ? "Display palette simulation; the panel’s own dithering pattern may differ. Refresh to update. Firmware-drawn pages are separate."
              : "Panel-ready CastKit image, including saved color and dithering settings. Refresh to update. Firmware-drawn pages are separate."
            : "Live view with this display's capabilities."}
        </p>
      ) : null}
    </div>
  )
}
