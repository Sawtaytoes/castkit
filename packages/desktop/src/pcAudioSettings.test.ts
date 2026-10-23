import { describe, expect, test } from "vitest"
import {
  applyPcAudioChange,
  defaultPcAudioSettings,
  describePcAudioStatus,
  readSavedPcAudioSettings,
} from "./pcAudioSettings.ts"

describe(readSavedPcAudioSettings.name, () => {
  test("a state file from before this feature reads as off", () => {
    expect(readSavedPcAudioSettings(undefined)).toEqual({
      isSending: false,
      host: "",
      port: 6980,
      streamName: "CastKit",
      inputDeviceLabel: null,
    })
  })

  test("saved settings come back as they were", () => {
    const saved = {
      isSending: true,
      host: "music.local",
      port: 6981,
      streamName: "Desk PC",
      inputDeviceLabel:
        "CABLE Output (VB-Audio Virtual Cable)",
    }
    expect(readSavedPcAudioSettings(saved)).toEqual(saved)
  })

  test("settings that do not validate read as the defaults", () => {
    expect(
      readSavedPcAudioSettings({ port: 70000 }),
    ).toEqual(defaultPcAudioSettings)
  })
})

describe(applyPcAudioChange.name, () => {
  const current = {
    ...defaultPcAudioSettings,
    host: "music.local",
  }

  test("applies a change over the current settings", () => {
    expect(
      applyPcAudioChange({
        current,
        change: { isSending: true, port: 6990 },
      }),
    ).toEqual({
      settings: { ...current, isSending: true, port: 6990 },
    })
  })

  test("refuses to send with no address", () => {
    expect(
      applyPcAudioChange({
        current: defaultPcAudioSettings,
        change: { isSending: true },
      }),
    ).toHaveProperty("error")
  })

  test("refuses an address with a scheme or a port", () => {
    expect(
      applyPcAudioChange({
        current,
        change: { host: "http://music.local:8095" },
      }),
    ).toEqual({
      error:
        "Enter a host name or an IP address, without http:// or a port.",
    })
  })

  test("refuses a stream name VBAN cannot carry", () => {
    expect(
      applyPcAudioChange({
        current,
        change: {
          streamName: "A name that is far too long",
        },
      }),
    ).toHaveProperty("error")
  })

  test("refuses a field it does not know", () => {
    expect(
      applyPcAudioChange({
        current,
        change: { volume: 2 },
      }),
    ).toHaveProperty("error")
  })
})

describe(describePcAudioStatus.name, () => {
  test("says nothing while sending is off", () => {
    expect(
      describePcAudioStatus({ kind: "off" }),
    ).toBeNull()
  })

  test("names the source and the destination while sending", () => {
    expect(
      describePcAudioStatus({
        kind: "sending",
        sourceLabel: "everything this computer plays",
        destination: "music.local:6980",
      }),
    ).toBe(
      "Sending everything this computer plays to music.local:6980.",
    )
  })
})
