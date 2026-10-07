import { expect, test, vi } from "vitest"
import { sourceContext } from "./__fixtures__/sourceContext.ts"
import {
  createCutteroSource,
  normalizeCuttero,
  readPreviewPaths,
} from "./cuttero.ts"

const PREVIEW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 304.8 304.8">' +
  '<rect width="304.8" height="304.8" fill="#f4f4f4"/>' +
  '<g fill="none" stroke="#202020">' +
  '<path d="M10 10L60 10L60 40Z"/>' +
  '<path d="M5 5L70 5L70 50L5 50Z" stroke="#c06000" stroke-dasharray="2 1"/>' +
  "</g></svg>"

const TRACE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 304.8 304.8">' +
  '<g fill="none" stroke="#202020">' +
  '<g stroke="#a0a0a0" stroke-opacity="0.6"><path d="M10 10L60 10"/></g>' +
  '<path d="M5 5L70 5L70 50Z" stroke="#0060c0" stroke-width="0.4" stroke-dasharray="3 2"/>' +
  "</g></svg>"

const preview = ({
  svg = PREVIEW_SVG,
  cutLengthMm = 1200,
}: {
  svg?: string
  cutLengthMm?: number
} = {}) => ({
  sheet: { widthMm: 304.8, heightMm: 304.8 },
  boundsMm: { x: 10, y: 10, width: 50, height: 30 },
  cutLengthMm,
  estimateSeconds: 95,
  previewSvg: svg,
})

const DEVICES = [
  {
    name: "cutter-one",
    isOnline: true,
    isCutterConnected: true,
    firmwareVersion: "V1.0",
    hostName: "a1b2c3",
    hostLabel: "Craft desk",
    model: {
      id: "siser-romeo",
      vendor: "Siser",
      name: "Romeo",
      maxWidthMm: 609.6,
    },
    activeJobId: "job-cutting",
    updatedAt: "2026-01-01T12:00:00Z",
    agentVersion: "0.1.0",
  },
  {
    name: "cutter-two",
    isOnline: false,
    isCutterConnected: true,
    hostName: "d4e5f6",
    updatedAt: "2026-01-01T09:00:00Z",
    agentVersion: "0.1.0",
  },
]

const JOBS = [
  {
    id: "job-cutting",
    name: "Sample decal",
    deviceName: "cutter-one",
    status: "cutting",
    createdAt: "2026-01-01T11:58:00Z",
    writtenAt: "2026-01-01T11:59:00Z",
    expectedDoneAt: "2026-01-01T12:00:35Z",
    preview: preview(),
  },
  {
    id: "job-trace",
    name: "Trace the design's outline",
    deviceName: "cutter-one",
    status: "done",
    createdAt: "2026-01-01T11:57:00Z",
    finishedAt: "2026-01-01T11:57:30Z",
    preview: preview({ svg: TRACE_SVG, cutLengthMm: 0 }),
  },
  {
    id: "job-done",
    name: "Gift tags",
    deviceName: "cutter-one",
    status: "done",
    createdAt: "2026-01-01T11:00:00Z",
    expectedDoneAt: "2026-01-01T11:02:00Z",
    finishedAt: "2026-01-01T11:02:00Z",
    preview: preview(),
  },
  {
    id: "job-failed",
    name: "Window letters",
    deviceName: "cutter-one",
    status: "failed",
    createdAt: "2026-01-01T10:00:00Z",
    finishedAt: "2026-01-01T10:00:05Z",
    error: "The cutter did not answer.",
    preview: preview(),
  },
  {
    id: "job-other",
    name: "Other cutter's job",
    deviceName: "cutter-two",
    status: "done",
    createdAt: "2026-01-01T08:00:00Z",
    /* An older record: no `sheet`, only the SVG's own viewBox. */
    preview: { ...preview(), sheet: undefined },
  },
  { id: "job-broken", status: "nonsense" },
]

test("Cuttero names each cutter by model and splits its current job from recent ones", () => {
  const snapshot = normalizeCuttero({
    devices: DEVICES,
    jobs: JOBS,
  })
  expect(snapshot.cutters).toHaveLength(2)
  const [first, second] = snapshot.cutters
  expect(first).toMatchObject({
    id: "cutter-one",
    name: "Siser Romeo",
    hostLabel: "Craft desk",
    firmwareVersion: "V1.0",
    isOnline: true,
    isCutterConnected: true,
    updatedAtMs: Date.parse("2026-01-01T12:00:00Z"),
  })
  expect(first?.currentJob).toMatchObject({
    id: "job-cutting",
    status: "cutting",
    isTrace: false,
    expectedDoneAtMs: Date.parse("2026-01-01T12:00:35Z"),
    estimateSeconds: 95,
    cutLengthMm: 1200,
  })
  /* The trace cut nothing, so it is not "a recent job". */
  expect(first?.recentJobs.map((job) => job.id)).toEqual([
    "job-done",
    "job-failed",
  ])
  expect(first?.recentJobs[1]?.problemText).toBe(
    "The cutter did not answer.",
  )
  /* An unknown model falls back to the device's own name. */
  expect(second).toMatchObject({
    id: "cutter-two",
    name: "cutter-two",
    isOnline: false,
    /* A cutter is never "connected" through a host that is offline. */
    isCutterConnected: false,
  })
  expect(second?.currentJob).toBeUndefined()
  expect(second?.recentJobs.map((job) => job.id)).toEqual([
    "job-other",
  ])
  expect(second?.recentJobs[0]?.preview?.sheet).toEqual({
    widthMm: 304.8,
    heightMm: 304.8,
  })
})

test("Cuttero keeps cut lines as path data and drops reference lines", () => {
  expect(readPreviewPaths(PREVIEW_SVG)).toEqual([
    { d: "M10 10L60 10L60 40Z", kind: "cut" },
    { d: "M5 5L70 5L70 50L5 50Z", kind: "weedbox" },
  ])
  expect(readPreviewPaths(TRACE_SVG)).toEqual([
    { d: "M5 5L70 5L70 50Z", kind: "outline" },
  ])
})

test("Cuttero refuses a path that is not path data", () => {
  expect(
    readPreviewPaths(
      '<svg><path d="M0 0L1 1"/><path d="javascript:alert(1)"/></svg>',
    ),
  ).toEqual([{ d: "M0 0L1 1", kind: "cut" }])
})

test("Cuttero reads devices and jobs, filters cutters per channel, and only ever GETs", async () => {
  const fetchRequest = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes("/api/devices")
              ? DEVICES
              : JOBS,
          ),
        ),
    )
  const context = sourceContext({
    fetch: fetchRequest,
    source: {
      id: "cuttero",
      name: "Cuttero",
      adapter: "cuttero",
      settings: { url: "https://cutter.example" },
      isEnabled: true,
    },
    channels: [
      {
        id: "cutters",
        name: "Cutters",
        sourceId: "cuttero",
        type: "cutters.v1",
        settings: { cutterIds: ["cutter-one"] },
      },
    ],
  })
  const source = createCutteroSource(context)
  await source.start?.()
  source.dispose()
  expect(
    fetchRequest.mock.calls.map(([url, options]) => [
      String(url),
      options?.method,
    ]),
  ).toEqual([
    ["https://cutter.example/api/devices", "GET"],
    ["https://cutter.example/api/jobs?limit=25", "GET"],
  ])
  const published = vi.mocked(context.publish).mock
    .calls[0]?.[0]
  expect(published?.channelId).toBe("cutters")
  const data = published?.data as ReturnType<
    typeof normalizeCuttero
  >
  expect(data.cutters.map((cutter) => cutter.id)).toEqual([
    "cutter-one",
  ])
  expect(data.cutters[0]?.imagePath).toBe(
    "/api/platform/channels/cutters/media/siser-romeo?kind=model",
  )
  expect(source.executeAction).toBeUndefined()
  await expect(
    source.getMedia?.({
      channelId: "cutters",
      assetId: "../jobs",
      kind: "model",
    }),
  ).rejects.toThrow("not part of the selected cutters")
  await source.getMedia?.({
    channelId: "cutters",
    assetId: "siser-romeo",
    kind: "model",
  })
  expect(String(fetchRequest.mock.calls.at(-1)?.[0])).toBe(
    "https://cutter.example/api/models/siser-romeo/image",
  )
})
