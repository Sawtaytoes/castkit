import {
  Accordion,
  Button,
  Field,
  Picker,
  type PickerOption,
  Switch,
} from "@charcuterie/ui"
import { useEffect, useState } from "react"
import {
  describePcAudioStatus,
  pcAudioFormat,
} from "../pcAudioSettings.ts"
import { readDesktopBridge } from "./desktopBridge.ts"
import type { PcAudioSnapshot } from "./settingsApi.ts"

const systemAudioValue = "system"
const devicePrefix = "device:"

// Input labels stay empty until the page may use a microphone. Electron
// grants that here, so one short request fills them in; the stream is closed
// again at once.
const readInputLabels = async () => {
  const listInputs = async () =>
    (
      await navigator.mediaDevices.enumerateDevices()
    ).filter((device) => device.kind === "audioinput")
  const inputs = await listInputs()
  if (inputs.every((device) => device.label !== "")) {
    return inputs.map((device) => device.label)
  }
  try {
    const stream =
      await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
    stream.getTracks().forEach((track) => {
      track.stop()
    })
  } catch {
    return []
  }
  return (await listInputs())
    .map((device) => device.label)
    .filter((label) => label !== "")
}

/**
 * Sending this computer's audio to Music Assistant: the switch, where it
 * goes, what it captures, and the receiver settings Music Assistant needs to
 * match. Every change takes effect at once.
 */
export const PcAudioPanel = ({
  pcAudio,
}: {
  pcAudio: PcAudioSnapshot
}) => {
  const { settings } = pcAudio
  const [host, setHost] = useState(settings.host)
  const [port, setPort] = useState(String(settings.port))
  const [streamName, setStreamName] = useState(
    settings.streamName,
  )
  const [inputLabels, setInputLabels] = useState<string[]>(
    [],
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void readInputLabels().then(setInputLabels)
  }, [])

  const save = async (
    change: Parameters<
      ReturnType<typeof readDesktopBridge>["savePcAudio"]
    >[0],
  ) => {
    const result =
      await readDesktopBridge().savePcAudio(change)
    setError(result.isDone ? null : result.error)
    return result.isDone
  }

  const captureOptions: PickerOption[] = [
    ...(pcAudio.isSystemAudioCapturable
      ? [
          {
            value: systemAudioValue,
            label: "Everything this computer plays",
          },
        ]
      : []),
    ...inputLabels.map((label) => ({
      value: `${devicePrefix}${label}`,
      label,
    })),
    ...(settings.inputDeviceLabel !== null &&
    !inputLabels.includes(settings.inputDeviceLabel)
      ? [
          {
            value: `${devicePrefix}${settings.inputDeviceLabel}`,
            label: `${settings.inputDeviceLabel} (not connected)`,
            textValue: settings.inputDeviceLabel,
          },
        ]
      : []),
  ]

  const statusText = describePcAudioStatus(pcAudio.status)
  const isUnsaved =
    host !== settings.host ||
    port !== String(settings.port) ||
    streamName !== settings.streamName

  return (
    <div className="settings-stack">
      <p className="settings-muted">
        Plays this computer's audio on Music Assistant
        speakers, through Music Assistant's VBAN Receiver.
        Your speakers here keep playing as before. The room
        plays the audio about 1 to 2 seconds later.
      </p>
      <Switch
        // The switch keeps its own state; a new key follows a change
        // made from the tray menu.
        key={String(settings.isSending)}
        label="Send this computer's audio"
        isChecked={settings.isSending}
        isDisabled={settings.host === ""}
        onChange={(isSending) => void save({ isSending })}
      />
      {settings.host === "" ? (
        <p className="settings-muted">
          To turn this on, open “Where to send, and what to
          capture” and enter the Music Assistant address.
        </p>
      ) : null}
      {statusText ? (
        <p
          role="status"
          className={
            pcAudio.status.kind === "failed"
              ? "settings-error"
              : "settings-muted"
          }
        >
          {statusText}
        </p>
      ) : null}
      {error ? (
        <p className="settings-error" role="alert">
          {error}
        </p>
      ) : null}
      <Accordion
        headingLevel={3}
        items={[
          {
            key: "destination",
            label: "Where to send, and what to capture",
            content: (
              <div className="settings-stack">
                <Field
                  label="Capture from"
                  description={
                    pcAudio.isSystemAudioCapturable
                      ? "Everything this computer plays, or one input device such as a virtual cable."
                      : "An input device, such as a virtual cable. Only Windows can capture everything this computer plays."
                  }
                >
                  <Picker
                    label="Capture from"
                    placeholder="Choose an input device"
                    options={captureOptions}
                    value={
                      settings.inputDeviceLabel === null
                        ? pcAudio.isSystemAudioCapturable
                          ? systemAudioValue
                          : undefined
                        : `${devicePrefix}${settings.inputDeviceLabel}`
                    }
                    onChange={(value) =>
                      void save({
                        inputDeviceLabel:
                          value === systemAudioValue
                            ? null
                            : value.slice(
                                devicePrefix.length,
                              ),
                      })
                    }
                  />
                </Field>
                <form
                  className="settings-stack"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!/^\d{1,5}$/.test(port.trim())) {
                      setError(
                        "Enter a port from 1 to 65535.",
                      )
                      return
                    }
                    void save({
                      host: host.trim(),
                      port: Number(port.trim()),
                      streamName,
                    })
                  }}
                >
                  <Field
                    label="Music Assistant address"
                    description="The host name or IP address of the computer that runs Music Assistant."
                  >
                    <input
                      className="settings-input"
                      value={host}
                      autoComplete="off"
                      onChange={(event) =>
                        setHost(event.target.value)
                      }
                    />
                  </Field>
                  <div className="settings-pair">
                    <Field label="Port">
                      <input
                        className="settings-input"
                        value={port}
                        inputMode="numeric"
                        autoComplete="off"
                        onChange={(event) =>
                          setPort(event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Stream name">
                      <input
                        className="settings-input"
                        value={streamName}
                        maxLength={16}
                        autoComplete="off"
                        onChange={(event) =>
                          setStreamName(event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <div>
                    <Button
                      type="submit"
                      intent="accent"
                      isDisabled={!isUnsaved}
                    >
                      Save
                    </Button>
                  </div>
                </form>
              </div>
            ),
          },
          {
            key: "receiver",
            label: "Set up Music Assistant",
            content: (
              <div className="settings-stack">
                <p>
                  In Music Assistant, open Settings, then
                  Plugins, and add a VBAN Receiver with
                  these values:
                </p>
                <dl className="settings-facts">
                  <dt>UDP port</dt>
                  <dd>{settings.port}</dd>
                  <dt>VBAN stream name</dt>
                  <dd>{settings.streamName}</dd>
                  <dt>Sender address</dt>
                  <dd>
                    {pcAudio.computerAddresses.join(
                      " or ",
                    ) || "this computer's IP address"}
                  </dd>
                  <dt>PCM audio format</dt>
                  <dd>{pcAudioFormat.pcmFormat}</dd>
                  <dt>PCM sample rate</dt>
                  <dd>{pcAudioFormat.sampleRate}</dd>
                  <dt>Channels</dt>
                  <dd>{pcAudioFormat.channels}</dd>
                </dl>
                <p className="settings-muted">
                  Then select a speaker or a group in Music
                  Assistant, open Browse, and play the VBAN
                  Receiver. Do not play it on a group that
                  includes this computer, or the audio loops
                  back to itself.
                </p>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
