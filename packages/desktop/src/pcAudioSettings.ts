import { z } from "zod"
import { isValidStreamName } from "./vbanPacket.ts"

/** The audio this app sends: Music Assistant's VBAN Receiver must be set to the same. */
export const pcAudioFormat = {
  sampleRate: 48000,
  channels: 2,
  /** As Music Assistant's VBAN Receiver names it. */
  pcmFormat: "S16LE",
} as const

/** The port VBAN uses unless a receiver says otherwise. */
export const defaultVbanPort = 6980

// A host name, an IPv4 address, or an IPv6 address: no scheme, no port, no path.
const hostPattern = /^[A-Za-z0-9.:-]+$/

// Each field without its default, so a change names only what it changes.
const pcAudioFields = {
  /** Off until the person turns it on; then remembered, like every other setting. */
  isSending: z.boolean(),
  /** The computer running Music Assistant. Empty until the person enters it. */
  host: z
    .string()
    .max(253)
    .refine(
      (host) => host === "" || hostPattern.test(host),
      "Enter a host name or an IP address, without http:// or a port.",
    ),
  port: z.number().int().min(1).max(65535),
  streamName: z
    .string()
    .refine(
      isValidStreamName,
      "A stream name is 1 to 16 letters, digits, spaces, or ASCII symbols.",
    ),
  /**
   * The input device to capture, by the label the system gives it, or
   * `null` for everything this computer plays (Windows only). The label, not
   * the browser's device id: the id is salted per session and changes when a
   * profile is reset, while the label stays what the person chose.
   */
  inputDeviceLabel: z.string().min(1).max(200).nullable(),
}

const pcAudioSettingsSchema = z.object({
  isSending: pcAudioFields.isSending.default(false),
  host: pcAudioFields.host.default(""),
  port: pcAudioFields.port.default(defaultVbanPort),
  streamName: pcAudioFields.streamName.default("CastKit"),
  inputDeviceLabel:
    pcAudioFields.inputDeviceLabel.default(null),
})

const pcAudioChangeSchema = z
  .object(pcAudioFields)
  .partial()
  .strict()

/** How the app sends this computer's audio to a VBAN receiver. */
export type PcAudioSettings = z.infer<
  typeof pcAudioSettingsSchema
>

/** A first launch: not sending, and nowhere to send yet. */
export const defaultPcAudioSettings: PcAudioSettings =
  pcAudioSettingsSchema.parse({})

/**
 * Saved settings as the state file holds them. A file written before this
 * feature, or one whose settings no longer validate, reads as the defaults
 * rather than costing the person their windows.
 */
export const readSavedPcAudioSettings = (
  raw: unknown,
): PcAudioSettings => {
  const parsed = pcAudioSettingsSchema.safeParse(raw ?? {})
  return parsed.success
    ? parsed.data
    : defaultPcAudioSettings
}

/**
 * A change the settings page asks for, applied over the current settings.
 * Every field is checked again here; the page is not trusted to have done it.
 */
export const applyPcAudioChange = ({
  current,
  change,
}: {
  current: PcAudioSettings
  change: unknown
}): { settings: PcAudioSettings } | { error: string } => {
  if (typeof change !== "object" || change === null) {
    return { error: "The request is malformed." }
  }
  const parsed = pcAudioChangeSchema.safeParse(change)
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "The request is malformed.",
    }
  }
  const settings = { ...current, ...parsed.data }
  if (settings.isSending && settings.host === "") {
    return {
      error:
        "Enter the address of the computer that runs Music Assistant first.",
    }
  }
  return { settings }
}

/**
 * Whether the app can capture this computer's whole output. Chromium's
 * system-audio loopback exists only on Windows; elsewhere the person picks
 * an input device, for example a virtual cable.
 */
export const canCaptureSystemAudio = (
  platform: NodeJS.Platform,
) => platform === "win32"

/** What sending this computer's audio is doing now, for the settings page and the tray. */
export type PcAudioStatus =
  | { kind: "off" }
  | { kind: "starting" }
  | {
      kind: "sending"
      sourceLabel: string
      destination: string
    }
  | { kind: "failed"; message: string }

/** One line that says what sending is doing, or `null` while it is off. */
export const describePcAudioStatus = (
  status: PcAudioStatus,
) => {
  switch (status.kind) {
    case "off":
      return null
    case "starting":
      return "Starting the audio capture…"
    case "sending":
      return `Sending ${status.sourceLabel} to ${status.destination}.`
    case "failed":
      return `Not sending: ${status.message} CastKit tries again every 5 seconds.`
  }
}
