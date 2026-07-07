import { describe, expect, test } from "vitest"
import { parseDeviceCommand } from "./commands.ts"

describe("parseDeviceCommand", () => {
  test("accepts the value-less transport actions", () => {
    expect(
      parseDeviceCommand({ action: "play_pause" }),
    ).toEqual({ action: "play_pause" })
    expect(parseDeviceCommand({ action: "next" })).toEqual({
      action: "next",
    })
    expect(
      parseDeviceCommand({ action: "previous" }),
    ).toEqual({ action: "previous" })
    expect(
      parseDeviceCommand({ action: "volume_mute" }),
    ).toEqual({ action: "volume_mute" })
  })

  test("seek requires a non-negative seconds value", () => {
    expect(
      parseDeviceCommand({ action: "seek", value: 123.5 }),
    ).toEqual({ action: "seek", value: 123.5 })
    expect(
      parseDeviceCommand({ action: "seek" }),
    ).toBeNull()
    expect(
      parseDeviceCommand({ action: "seek", value: -1 }),
    ).toBeNull()
  })

  test("volume_set requires a 0–1 value", () => {
    expect(
      parseDeviceCommand({
        action: "volume_set",
        value: 0.35,
      }),
    ).toEqual({ action: "volume_set", value: 0.35 })
    expect(
      parseDeviceCommand({ action: "volume_set" }),
    ).toBeNull()
    expect(
      parseDeviceCommand({
        action: "volume_set",
        value: 1.5,
      }),
    ).toBeNull()
  })

  test("unknown actions and junk are rejected", () => {
    expect(
      parseDeviceCommand({ action: "self_destruct" }),
    ).toBeNull()
    expect(parseDeviceCommand("play_pause")).toBeNull()
    expect(parseDeviceCommand(null)).toBeNull()
  })
})
