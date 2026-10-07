import { Field, Picker } from "@charcuterie/ui"
import { useEffect, useState } from "react"
import type { Device } from "./device.ts"
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
  const [devices, setDevices] = useState<Device[]>([])
  const [message, setMessage] = useState("")
  useEffect(() => {
    if (!isEnabled) return
    const update = () =>
      setBrowser({ width: innerWidth, height: innerHeight })
    window.addEventListener("resize", update)
    const controller = new AbortController()
    void fetch("/api/manage/devices", {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Device sizes are unavailable.")
        const result = (await response.json()) as {
          devices: Device[]
        }
        setDevices(result.devices)
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage(
            "Device sizes are unavailable. Browser and custom sizes still work.",
          )
      })
    return () => {
      window.removeEventListener("resize", update)
      controller.abort()
    }
  }, [isEnabled])
  const device = devices.find(
    (item) => `device:${item.id}` === selection,
  )
  const size: PreviewSize =
    selection === "available"
      ? null
      : selection === "browser"
        ? browser
        : device
          ? { width: device.width, height: device.height }
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
    devices,
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
}) => (
  <div className="preview-sizing">
    <Field label="Preview size">
      <Picker
        label="Preview size"
        value={sizing.selection}
        onChange={sizing.setSelection}
        options={[
          { value: "available", label: "Fit preview area" },
          {
            value: "browser",
            label: `Current browser window · ${sizing.browser.width} × ${sizing.browser.height}`,
          },
          ...sizing.devices.map((device) => ({
            value: `device:${device.id}`,
            label: `${device.label} · ${device.width} × ${device.height}`,
          })),
          { value: "custom", label: "Custom size" },
        ]}
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
  </div>
)
