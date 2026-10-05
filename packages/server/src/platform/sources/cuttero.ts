import type { ContractData } from "@castkit/sdk/contracts"
import type { SourceFactory } from "@castkit/sdk/plugin"
import {
  finiteNumber,
  pollingSource,
  record,
  sourceRequest,
  stringList,
  textValue,
} from "./http.ts"

type CutterData = ContractData["cutters.v1"]
type Cutter = CutterData["cutters"][number]
type CutterJob = NonNullable<Cutter["currentJob"]>
type CutterPreview = NonNullable<CutterJob["preview"]>

/** How many finished jobs a cutter carries. The view draws only the rows that fit. */
const RECENT_JOB_LIMIT = 5

/**
 * The jobs requested per poll. Cuttero lists every cutter's jobs together,
 * newest first, so this has to cover a few cutters' recent work.
 */
const JOB_LIST_LIMIT = 25

/**
 * A preview this long is a design too dense to read at panel size anyway,
 * and it would be sent on every poll. It is dropped, never truncated: half
 * a design drawn as if it were the whole one is worse than no picture.
 */
const PREVIEW_CHARACTER_LIMIT = 150_000

const JOB_STATUSES = [
  "queued",
  "sent",
  "cutting",
  "done",
  "failed",
  "canceled",
] as const

const ACTIVE_STATUSES: readonly CutterJob["status"][] = [
  "queued",
  "sent",
  "cutting",
]

const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\s-]*$/

const optionalText = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim()
    : undefined

const parseTimestamp = (value: unknown) => {
  const text = optionalText(value)
  if (!text) {
    return undefined
  }
  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? undefined : parsed
}

const getJobStatus = (value: unknown) =>
  JOB_STATUSES.find((status) => status === value)

/**
 * The cut lines out of Cuttero's preview SVG, as path data only.
 *
 * The SVG is never passed through. Its `<path d>` values are read and checked
 * against the path-data alphabet, so the panel draws them as attributes and no
 * markup from the source reaches the page. Cuttero draws a weedbox dashed and
 * a trace route in its own stroke; both keep their meaning here. A trace's
 * gray "design" paths are reference lines, not cuts, and are left out.
 */
export const readPreviewPaths = (svg: string) => {
  const withoutReference = svg.replace(
    /<g stroke="#a0a0a0"[^>]*>.*?<\/g>/gs,
    "",
  )
  const paths = Array.from(
    withoutReference.matchAll(
      /<path\b([^>]*?)\bd="([^"]*)"([^>]*)\/?>/g,
    ),
  ).flatMap((match) => {
    const attributes = `${match[1] ?? ""} ${match[3] ?? ""}`
    const pathData = (match[2] ?? "").trim()
    if (!pathData || !PATH_DATA.test(pathData)) {
      return []
    }
    const kind: CutterPreview["paths"][number]["kind"] =
      attributes.includes("#0060c0")
        ? "outline"
        : attributes.includes("stroke-dasharray")
          ? "weedbox"
          : "cut"
    return [{ d: pathData, kind }]
  })
  const characterCount = paths.reduce(
    (total, path) => total + path.d.length,
    0,
  )
  return characterCount > PREVIEW_CHARACTER_LIMIT
    ? []
    : paths
}

const readPreview = (
  value: unknown,
): CutterPreview | undefined => {
  const preview = record(value)
  const svg = textValue(preview.previewSvg)
  const sheet = record(preview.sheet)
  const bounds = record(preview.boundsMm)
  /*
   * Jobs recorded before Cuttero added `sheet` to the preview still carry
   * the sheet as the SVG's own viewBox, which is drawn in sheet millimeters.
   */
  const viewBox = svg
    .match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
    ?.slice(1)
    .map(Number)
  const widthMm =
    finiteNumber(sheet.widthMm) ??
    finiteNumber(viewBox?.[0])
  const heightMm =
    finiteNumber(sheet.heightMm) ??
    finiteNumber(viewBox?.[1])
  if (
    widthMm === undefined ||
    heightMm === undefined ||
    widthMm <= 0 ||
    heightMm <= 0
  ) {
    return undefined
  }
  const paths = readPreviewPaths(svg)
  if (paths.length === 0) {
    return undefined
  }
  return {
    sheet: { widthMm, heightMm },
    boundsMm: {
      x: finiteNumber(bounds.x) ?? 0,
      y: finiteNumber(bounds.y) ?? 0,
      width: Math.max(0, finiteNumber(bounds.width) ?? 0),
      height: Math.max(0, finiteNumber(bounds.height) ?? 0),
    },
    paths,
  }
}

/** One Cuttero `JobRecord`, or nothing when it is missing the fields a card needs. */
export const normalizeCutteroJob = (
  value: unknown,
): CutterJob | undefined => {
  const job = record(value)
  const id = optionalText(job.id)
  const status = getJobStatus(job.status)
  const createdAtMs = parseTimestamp(job.createdAt)
  if (!id || !status || createdAtMs === undefined) {
    return undefined
  }
  const preview = record(job.preview)
  const cutLengthMm = finiteNumber(preview.cutLengthMm)
  const estimateSeconds = finiteNumber(
    preview.estimateSeconds,
  )
  const writtenAtMs = parseTimestamp(job.writtenAt)
  const expectedDoneAtMs = parseTimestamp(
    job.expectedDoneAt,
  )
  const finishedAtMs = parseTimestamp(job.finishedAt)
  const problemText = optionalText(job.error)
  const drawing = readPreview(job.preview)
  return {
    id,
    name: optionalText(job.name) ?? "Untitled job",
    status,
    /*
     * A trace moves the head with the blade up, so it cuts nothing. Cuttero
     * stores it as a job like any other; zero tool-down travel is the mark.
     */
    isTrace: cutLengthMm === 0,
    createdAtMs,
    ...(writtenAtMs === undefined ? {} : { writtenAtMs }),
    ...(expectedDoneAtMs === undefined
      ? {}
      : { expectedDoneAtMs }),
    ...(finishedAtMs === undefined ? {} : { finishedAtMs }),
    ...(estimateSeconds === undefined || estimateSeconds < 0
      ? {}
      : { estimateSeconds }),
    ...(cutLengthMm === undefined || cutLengthMm < 0
      ? {}
      : { cutLengthMm }),
    ...(problemText ? { problemText } : {}),
    ...(drawing ? { preview: drawing } : {}),
  }
}

const modelImagePath = ({
  channelId,
  modelId,
}: {
  channelId: string
  modelId: string
}) =>
  `/api/platform/channels/${encodeURIComponent(channelId)}/media/${encodeURIComponent(modelId)}?kind=model`

/**
 * Cuttero's devices and jobs as the `cutters.v1` contract.
 *
 * The current job is the one the cutter is working through, whether it is
 * waiting, streaming, or cutting. Recent jobs are the finished ones, newest
 * first, and leave out blade-up traces, which are not work anyone waits on.
 * `imagePath` is filled in per channel by the source, because the media route
 * is channel-scoped.
 */
export const normalizeCuttero = ({
  devices,
  jobs,
}: {
  devices: unknown
  jobs: unknown
}): CutterData => {
  if (!Array.isArray(devices) || !Array.isArray(jobs)) {
    throw new Error(
      "Cuttero answered without a device list or a job list.",
    )
  }
  const jobsByDevice = jobs
    .map(record)
    .flatMap((job) => {
      const normalized = normalizeCutteroJob(job)
      return normalized
        ? [
            {
              deviceName: textValue(job.deviceName),
              job: normalized,
            },
          ]
        : []
    })
    .toSorted(
      (left, right) =>
        right.job.createdAtMs - left.job.createdAtMs,
    )
  return {
    cutters: devices.map(record).flatMap((device) => {
      const id = optionalText(device.name)
      if (!id) {
        return []
      }
      const model = record(device.model)
      const modelName = [
        optionalText(model.vendor),
        optionalText(model.name),
      ]
        .filter(Boolean)
        .join(" ")
      const deviceJobs = jobsByDevice
        .filter((entry) => entry.deviceName === id)
        .map((entry) => entry.job)
      const activeJobId = optionalText(device.activeJobId)
      const currentJob =
        deviceJobs.find(
          (job) =>
            job.id === activeJobId &&
            ACTIVE_STATUSES.includes(job.status),
        ) ??
        deviceJobs.find((job) =>
          ACTIVE_STATUSES.includes(job.status),
        )
      const hostLabel = optionalText(device.hostLabel)
      const firmwareVersion = optionalText(
        device.firmwareVersion,
      )
      const updatedAtMs = parseTimestamp(device.updatedAt)
      return [
        {
          id,
          name: modelName || id,
          ...(hostLabel ? { hostLabel } : {}),
          ...(firmwareVersion ? { firmwareVersion } : {}),
          isOnline: device.isOnline === true,
          isCutterConnected:
            device.isOnline === true &&
            device.isCutterConnected === true,
          ...(updatedAtMs === undefined
            ? {}
            : { updatedAtMs }),
          ...(currentJob ? { currentJob } : {}),
          recentJobs: deviceJobs
            .filter(
              (job) =>
                job !== currentJob &&
                !job.isTrace &&
                !ACTIVE_STATUSES.includes(job.status),
            )
            .slice(0, RECENT_JOB_LIMIT),
        },
      ]
    }),
  }
}

/**
 * Read a Cuttero server's cutters and jobs over its read-only HTTP API.
 *
 * Cuttero needs no credential to read. This source never sends anything to
 * it: no cut, no trace, no reset, no cancel. It advertises no actions, and a
 * panel that asks for one is refused.
 */
export const createCutteroSource: SourceFactory = (
  context,
) => {
  const state: { modelIds: Map<string, string> } = {
    modelIds: new Map(),
  }
  const poll = async () => {
    const [devicesResponse, jobsResponse] =
      await Promise.all([
        sourceRequest({ context, path: "/api/devices" }),
        sourceRequest({
          context,
          path: `/api/jobs?limit=${JOB_LIST_LIMIT}`,
        }),
      ])
    const devices: unknown = await devicesResponse.json()
    const snapshot = normalizeCuttero({
      devices,
      jobs: await jobsResponse.json(),
    })
    state.modelIds = new Map(
      (Array.isArray(devices) ? devices : [])
        .map(record)
        .flatMap((device) => {
          const modelId = optionalText(
            record(device.model).id,
          )
          const name = optionalText(device.name)
          return modelId && name
            ? [[name, modelId] as const]
            : []
        }),
    )
    context.channels.forEach((channel) => {
      const cutterIds = stringList(
        channel.settings.cutterIds,
      )
      context.publish({
        channelId: channel.id,
        data: {
          cutters: snapshot.cutters
            .filter(
              (cutter) =>
                cutterIds.length === 0 ||
                cutterIds.includes(cutter.id),
            )
            .map((cutter) => {
              const modelId = state.modelIds.get(cutter.id)
              return modelId
                ? {
                    ...cutter,
                    imagePath: modelImagePath({
                      channelId: channel.id,
                      modelId,
                    }),
                  }
                : cutter
            }),
        } satisfies CutterData,
      })
    })
  }
  const polling = pollingSource({
    context,
    poll,
    intervalSeconds:
      finiteNumber(context.source.settings.pollSeconds) ??
      5,
  })
  return {
    ...polling,
    discover: async () => {
      const response = await sourceRequest({
        context,
        path: "/api/devices",
      })
      const devices: unknown = await response.json()
      return {
        cutters: (Array.isArray(devices) ? devices : [])
          .map(record)
          .flatMap((device) => {
            const name = optionalText(device.name)
            return name ? [{ id: name, name }] : []
          }),
      }
    },
    getMedia: async ({ channelId, assetId, kind }) => {
      const isKnownModel = Array.from(
        state.modelIds.values(),
      ).includes(assetId)
      if (
        kind !== "model" ||
        !isKnownModel ||
        !context.channels.some(
          (channel) => channel.id === channelId,
        )
      ) {
        throw new Error(
          "This media is not part of the selected cutters.",
        )
      }
      return sourceRequest({
        context,
        path: `/api/models/${encodeURIComponent(assetId)}/image`,
      })
    },
  }
}
