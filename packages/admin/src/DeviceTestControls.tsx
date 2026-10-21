import { Button, Card } from "@charcuterie/ui"
import { useEffect, useState } from "react"
import {
  api,
  mutate,
  type Platform,
} from "./platformApi.ts"
import { SettingField } from "./SettingField.tsx"

type TestStatus = {
  test: {
    testId: string
    target: { kind: "view" | "screen"; id: string }
    contrast?: "standard" | "darker" | "high"
    expiresAt: number
  } | null
  isShowing?: boolean
}

/** Temporarily show a screen or view without changing the saved device assignment. */
export const DeviceTestControls = ({
  deviceId,
  platform,
  onChanged,
  savedContrast = "standard",
}: {
  deviceId: string
  savedContrast?: "standard" | "darker" | "high"
  platform: Platform
  onChanged: () => void
}) => {
  const [selection, setSelection] = useState("")
  const [contrast, setContrast] = useState(savedContrast)
  const [duration, setDuration] = useState("300")
  const [status, setStatus] = useState<TestStatus>({
    test: null,
  })
  const [isPending, setIsPending] = useState(false)
  const [message, setMessage] = useState("")
  const [_revision, setRevision] = useState(0)
  const endpoint = `/api/manage/platform/devices/${encodeURIComponent(deviceId)}/test`
  useEffect(() => {
    const lifecycle = { isActive: true }
    const refresh = async () => {
      try {
        const next = await api<TestStatus>(endpoint)
        if (lifecycle.isActive) setStatus(next)
      } catch (error) {
        if (lifecycle.isActive)
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not read display test.",
          )
      }
    }
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, 2000)
    return () => {
      lifecycle.isActive = false
      window.clearInterval(timer)
    }
  }, [endpoint])
  const run = async (isEnding: boolean) => {
    setIsPending(true)
    setMessage("")
    try {
      if (isEnding && status.test) {
        await mutate(
          endpoint,
          { testId: status.test.testId },
          "DELETE",
        )
        setStatus({ test: null })
        setMessage(
          "Test ended. Normal display operation restored.",
        )
      } else {
        const separator = selection.indexOf(":")
        const target = {
          kind: selection.slice(0, separator),
          id: selection.slice(separator + 1),
        }
        const next = await mutate<TestStatus>(endpoint, {
          target,
          durationSeconds: Number(duration),
          contrast,
        })
        setStatus(next)
        setMessage(
          "Test started. Normal operation returns automatically when it ends.",
        )
      }
      setRevision((current) => current + 1)
      onChanged()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not change display test.",
      )
    } finally {
      setIsPending(false)
    }
  }
  const previewContrast = async (
    next: "standard" | "darker" | "high",
  ) => {
    setContrast(next)
    if (!status.test) return
    setIsPending(true)
    try {
      const updated = await mutate<TestStatus>(
        endpoint,
        { testId: status.test.testId, contrast: next },
        "PATCH",
      )
      setStatus(updated)
      setRevision((current) => current + 1)
      setMessage(
        "Contrast applied to this test. The saved setting is unchanged.",
      )
      onChanged()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not preview contrast.",
      )
    } finally {
      setIsPending(false)
    }
  }
  const current = status.test
  const name = current
    ? ((current.target.kind === "screen"
        ? platform.screens
        : platform.views
      ).find((item) => item.id === current.target.id)
        ?.name ?? current.target.id)
    : ""
  return (
    <Card heading="Test on display">
      <p>
        Show a screen or view temporarily. The saved
        assignment stays unchanged; no restart is needed.
      </p>
      <div className="setting-fields">
        <SettingField
          label="Screen or view to test"
          width="wide"
          value={selection}
          onChange={setSelection}
          options={[
            { label: "Choose a screen or view", value: "" },
            ...platform.screens.map((screen) => ({
              label: `Screen: ${screen.name}${screen.access === "pin" ? " (PIN protected)" : ""}`,
              value: `screen:${screen.id}`,
            })),
            ...platform.views.map((view) => ({
              label: `View: ${view.name}${view.access === "pin" ? " (PIN protected)" : ""}`,
              value: `view:${view.id}`,
            })),
          ]}
        />
        <SettingField
          label="Test duration"
          value={duration}
          onChange={setDuration}
          options={[
            { label: "1 minute", value: "60" },
            { label: "5 minutes", value: "300" },
            { label: "15 minutes", value: "900" },
            { label: "1 hour", value: "3600" },
          ]}
        />
        <SettingField
          label="Test contrast"
          value={status.test?.contrast ?? contrast}
          onChange={(value) => {
            if (!isPending)
              void previewContrast(
                value as "standard" | "darker" | "high",
              )
          }}
          options={[
            { label: "Standard", value: "standard" },
            { label: "Darker", value: "darker" },
            { label: "High", value: "high" },
          ]}
          description="Switch during a test to compare on the actual display. The saved contrast setting stays unchanged."
        />
        <Button
          appearance="outline"
          isDisabled={!selection || isPending}
          onClick={() => void run(false)}
        >
          {current ? "Replace test" : "Start test"}
        </Button>
        {current ? (
          <Button
            appearance="outline"
            isDisabled={isPending}
            onClick={() => void run(true)}
          >
            End test
          </Button>
        ) : null}
      </div>
      {current ? (
        <p role="status">
          Testing {name} until{" "}
          {new Date(current.expiresAt).toLocaleTimeString()}
          .
          {status.isShowing === false
            ? " A higher-priority view is currently showing."
            : ""}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </Card>
  )
}
