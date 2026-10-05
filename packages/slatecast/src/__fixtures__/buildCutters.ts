import type { ContractData } from "@castkit/sdk/contracts"

/**
 * Fixture data for the Cutter Status view, as a `cutters.v1` channel carries
 * it.
 *
 * Every job and design here is INVENTED: a star, a set of gift tags and a
 * row of letters drawn from simple geometry, never a real job's cut lines.
 * A real preview is somebody's own artwork, and a picture is opaque to every
 * search that would catch it before a public repo shipped it.
 *
 * Every time is relative to `nowMillis`, so a story built at render time
 * shows the same countdown on every run under the frozen screenshot clock.
 */

type Cutter = ContractData["cutters.v1"]["cutters"][number]
type CutterJob = NonNullable<Cutter["currentJob"]>
type CutPreview = NonNullable<CutterJob["preview"]>

const SHEET = { widthMm: 304.8, heightMm: 304.8 }

const round = (value: number) =>
  Math.round(value * 100) / 100

/** A closed polygon as path data. */
const polygon = (points: readonly (readonly [number, number])[]) =>
  `${points
    .map(
      ([pointX, pointY], index) =>
        `${index === 0 ? "M" : "L"}${round(pointX)} ${round(pointY)}`,
    )
    .join("")}Z`

const star = ({
  centerX,
  centerY,
  outer,
  inner,
}: {
  centerX: number
  centerY: number
  outer: number
  inner: number
}) =>
  polygon(
    Array.from({ length: 10 }, (_, index) => {
      const radius = index % 2 === 0 ? outer : inner
      const angle = (Math.PI / 5) * index - Math.PI / 2
      return [
        centerX + radius * Math.cos(angle),
        centerY + radius * Math.sin(angle),
      ] as const
    }),
  )

const circle = ({
  centerX,
  centerY,
  radius,
}: {
  centerX: number
  centerY: number
  radius: number
}) =>
  polygon(
    Array.from({ length: 24 }, (_, index) => {
      const angle = ((Math.PI * 2) / 24) * index
      return [
        centerX + radius * Math.cos(angle),
        centerY + radius * Math.sin(angle),
      ] as const
    }),
  )

const rectangle = ({
  x,
  y,
  width,
  height,
}: {
  x: number
  y: number
  width: number
  height: number
}) =>
  polygon([
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ])

/** A gift tag: a rectangle with a clipped end and a hole for the string. */
const tag = ({ x, y }: { x: number; y: number }) => [
  polygon([
    [x + 18, y],
    [x + 110, y],
    [x + 110, y + 60],
    [x + 18, y + 60],
    [x, y + 30],
  ]),
  circle({ centerX: x + 20, centerY: y + 30, radius: 5 }),
]

/** A large star with a smaller star and a ring inside it. */
export const STAR_PREVIEW: CutPreview = {
  sheet: SHEET,
  boundsMm: { x: 32, y: 30, width: 240, height: 230 },
  paths: [
    {
      d: star({
        centerX: 152,
        centerY: 150,
        outer: 120,
        inner: 50,
      }),
      kind: "cut",
    },
    {
      d: star({
        centerX: 152,
        centerY: 155,
        outer: 40,
        inner: 17,
      }),
      kind: "cut",
    },
    {
      d: circle({ centerX: 152, centerY: 155, radius: 58 }),
      kind: "cut",
    },
  ],
}

/** Six gift tags inside a weedbox. */
export const TAGS_PREVIEW: CutPreview = {
  sheet: SHEET,
  boundsMm: { x: 20, y: 20, width: 254, height: 222 },
  paths: [
    ...[0, 1, 2].flatMap((row) =>
      [0, 1].flatMap((column) =>
        tag({ x: 30 + column * 130, y: 30 + row * 72 }),
      ),
    ).map((pathData) => ({
      d: pathData,
      kind: "cut" as const,
    })),
    {
      d: rectangle({ x: 20, y: 20, width: 254, height: 222 }),
      kind: "weedbox",
    },
  ],
}

/** A row of block letters, cut from straight lines only. */
export const LETTERS_PREVIEW: CutPreview = {
  sheet: SHEET,
  boundsMm: { x: 20, y: 110, width: 262, height: 70 },
  paths: [
    // H
    polygon([
      [20, 110],
      [34, 110],
      [34, 138],
      [56, 138],
      [56, 110],
      [70, 110],
      [70, 180],
      [56, 180],
      [56, 152],
      [34, 152],
      [34, 180],
      [20, 180],
    ]),
    // E
    polygon([
      [84, 110],
      [130, 110],
      [130, 124],
      [98, 124],
      [98, 138],
      [124, 138],
      [124, 152],
      [98, 152],
      [98, 166],
      [130, 166],
      [130, 180],
      [84, 180],
    ]),
    // L
    polygon([
      [144, 110],
      [158, 110],
      [158, 166],
      [190, 166],
      [190, 180],
      [144, 180],
    ]),
    // L
    polygon([
      [200, 110],
      [214, 110],
      [214, 166],
      [246, 166],
      [246, 180],
      [200, 180],
    ]),
    // O
    rectangle({ x: 252, y: 110, width: 30, height: 70 }),
    rectangle({ x: 262, y: 124, width: 10, height: 42 }),
  ].map((pathData) => ({
      d: pathData,
      kind: "cut" as const,
    })),
}

const MINUTE = 60_000

/** The finished jobs a cutter lists, newest first, ending before `nowMillis`. */
export const buildRecentJobs = (
  nowMillis: number,
): CutterJob[] => [
  {
    id: "job-tags",
    name: "Gift tags",
    status: "done",
    isTrace: false,
    createdAtMs: nowMillis - 42 * MINUTE,
    writtenAtMs: nowMillis - 41 * MINUTE,
    expectedDoneAtMs: nowMillis - 38 * MINUTE,
    finishedAtMs: nowMillis - 38 * MINUTE,
    estimateSeconds: 184,
    cutLengthMm: 5_420,
    preview: TAGS_PREVIEW,
  },
  {
    id: "job-letters",
    name: "Window letters",
    status: "failed",
    isTrace: false,
    createdAtMs: nowMillis - 95 * MINUTE,
    finishedAtMs: nowMillis - 95 * MINUTE,
    estimateSeconds: 61,
    cutLengthMm: 1_310,
    problemText: "The cutter did not answer.",
    preview: LETTERS_PREVIEW,
  },
  {
    id: "job-star-test",
    name: "Star test cut",
    status: "done",
    isTrace: false,
    createdAtMs: nowMillis - 180 * MINUTE,
    expectedDoneAtMs: nowMillis - 178 * MINUTE,
    finishedAtMs: nowMillis - 178 * MINUTE,
    estimateSeconds: 96,
    cutLengthMm: 2_140,
    preview: STAR_PREVIEW,
  },
  {
    id: "job-labels",
    name: "Pantry labels",
    status: "canceled",
    isTrace: false,
    createdAtMs: nowMillis - 26 * 60 * MINUTE,
    finishedAtMs: nowMillis - 26 * 60 * MINUTE,
    estimateSeconds: 240,
    cutLengthMm: 6_800,
  },
  {
    id: "job-coasters",
    name: "Coaster rings",
    status: "done",
    isTrace: false,
    createdAtMs: nowMillis - 27 * 60 * MINUTE,
    expectedDoneAtMs: nowMillis - 27 * 60 * MINUTE + 2 * MINUTE,
    finishedAtMs: nowMillis - 27 * 60 * MINUTE + 2 * MINUTE,
    estimateSeconds: 120,
    cutLengthMm: 3_050,
    preview: STAR_PREVIEW,
  },
]

/** A cutting job with `remainingSeconds` left on its estimate. */
export const buildCuttingJob = ({
  nowMillis,
  remainingSeconds = 95,
  estimateSeconds = 160,
}: {
  nowMillis: number
  remainingSeconds?: number
  estimateSeconds?: number
}): CutterJob => ({
  id: "job-star",
  name: "Star wall decal",
  status: "cutting",
  isTrace: false,
  createdAtMs:
    nowMillis -
    (estimateSeconds - remainingSeconds + 10) * 1000,
  writtenAtMs:
    nowMillis - (estimateSeconds - remainingSeconds) * 1000,
  expectedDoneAtMs: nowMillis + remainingSeconds * 1000,
  estimateSeconds,
  cutLengthMm: 3_870,
  preview: STAR_PREVIEW,
})

/** One connected cutter, in whatever state `overrides` describes. */
export const buildCutter = ({
  nowMillis,
  ...overrides
}: Partial<Cutter> & { nowMillis: number }): Cutter => ({
  id: "cutter-1",
  name: "Example Cutter",
  hostLabel: "Craft room PC",
  firmwareVersion: "V1.2",
  isOnline: true,
  isCutterConnected: true,
  updatedAtMs: nowMillis - 5_000,
  imagePath: "/sample-photos/cutter-model.svg",
  recentJobs: buildRecentJobs(nowMillis),
  ...overrides,
})
