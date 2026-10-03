import type { ContractData } from "@castkit/sdk/contracts"
import type { RepaintGrade } from "@castkit/shared/panels/repaint"
import type {
  Decorator,
  StoryObj,
} from "@storybook/preact-vite"
import { useState } from "preact/hooks"
import { kidsPointsFixture } from "./fixtures.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import type { DisplaySnapshot } from "./protocol.ts"
import "../styles.css"
import "./platform.css"

/**
 * Stamps `data-repaint="instant"` on `<html>`, where the server stamps it on
 * a real display, so the motion plays. A browser under automation — the `vrt`
 * capture — is left unstamped: the blanket no-animation rule then holds every
 * element at the end of its motion, which is a picture that does not depend
 * on when the shot was taken.
 */
const withInstantRepaint: Decorator = (Story) => {
  if (navigator.webdriver) {
    delete document.documentElement.dataset.repaint
  } else {
    document.documentElement.dataset.repaint = "instant"
  }
  document.documentElement.dataset.scheme = "dark"
  return <Story />
}

const meta = {
  title: "Views/Tally Marks Scan",
  parameters: { layout: "fullscreen" },
  decorators: [withInstantRepaint],
}
export default meta
type Story = StoryObj<typeof meta>

type KidsPointsData = ContractData["kids-points.v1"]

/** The fixture's scan, for one child moving from one total to another. */
const scanSnapshot = ({
  kidId,
  pointsToday,
  points,
  taskName,
  atMs,
  repaint,
}: {
  kidId: string
  pointsToday: number
  points: number
  taskName: string
  atMs: number
  repaint: RepaintGrade
}): DisplaySnapshot => {
  const fixture = kidsPointsFixture({ hasScan: true })
  const channel = fixture.channels.points
  if (!channel) {
    throw new Error(
      "The Tally Marks fixture lost its channel.",
    )
  }
  const data = channel.data as KidsPointsData
  return {
    ...fixture,
    displayProperties: {
      repaint,
      delivery: repaint === "instant" ? "browser" : "image",
    },
    channels: {
      points: {
        ...channel,
        data: {
          kids: data.kids.map((kid) =>
            kid.id === kidId
              ? { ...kid, pointsToday, lastTask: taskName }
              : kid,
          ),
          lastScan: {
            kidId,
            result: "awarded",
            points,
            taskName,
            reader: "Hall Reader",
            atMs,
          },
        },
      },
    },
  }
}

/**
 * One panel of a fixed size, with a button that scans again. The view sizes
 * itself from its own box, so a sized box is the whole panel here.
 */
const ScanStage = ({
  width,
  height,
  kidId,
  pointsToday,
  points,
  taskName,
  repaint = "instant",
}: {
  width: number
  height: number
  kidId: string
  pointsToday: number
  points: number
  taskName: string
  repaint?: RepaintGrade
}) => {
  const [atMs, setAtMs] = useState(() => Date.now() - 500)
  return (
    <main
      style={{
        display: "grid",
        gap: "12px",
        justifyItems: "start",
        padding: "16px",
      }}
    >
      <button
        type="button"
        onClick={() => setAtMs(Date.now())}
      >
        Scan again
      </button>
      <div
        class="platform"
        data-device="true"
        style={{
          inlineSize: `${width}px`,
          blockSize: `${height}px`,
          minBlockSize: 0,
          outline: "1px solid #444",
        }}
      >
        <DisplayComposition
          snapshot={scanSnapshot({
            kidId,
            pointsToday,
            points,
            taskName,
            atMs,
            repaint,
          })}
          isConnected
          onAction={async () => undefined}
        />
      </div>
    </main>
  )
}

/** A scan that earns points: they drop into the old total and merge. */
export const SmallPanelPoints: Story = {
  render: () => (
    <ScanStage
      width={480}
      height={480}
      kidId="robin"
      pointsToday={140}
      points={10}
      taskName="Feed the Cat"
    />
  ),
}

/** The scan that reaches today's goal throws confetti. */
export const SmallPanelGoal: Story = {
  render: () => (
    <ScanStage
      width={480}
      height={480}
      kidId="robin"
      pointsToday={500}
      points={20}
      taskName="Practice Piano"
    />
  ),
}

/** A scan after the goal flips the total inside a ring of stars. */
export const SmallPanelBonus: Story = {
  render: () => (
    <ScanStage
      width={480}
      height={480}
      kidId="sky"
      pointsToday={540}
      points={20}
      taskName="Read a Chapter"
    />
  ),
}

/** The same goal scan on a board: the child's own card celebrates. */
export const BoardGoal: Story = {
  render: () => (
    <ScanStage
      width={1280}
      height={720}
      kidId="robin"
      pointsToday={500}
      points={20}
      taskName="Practice Piano"
    />
  ),
}

/**
 * A slow panel does not animate: it draws the points the scan earned and the
 * new total, and holds them for ten repaints.
 */
export const SlowPanel: Story = {
  render: () => (
    <ScanStage
      width={480}
      height={480}
      kidId="robin"
      pointsToday={500}
      points={20}
      taskName="Practice Piano"
      repaint="slow"
    />
  ),
}

const CountdownStage = ({
  width,
  height,
}: {
  width: number
  height: number
}) => {
  const [startedAtMs] = useState(() => Date.now() - 204_000)
  const base = scanSnapshot({
    kidId: "robin",
    pointsToday: 140,
    points: 0,
    taskName: "Sitting Still",
    atMs: startedAtMs,
    repaint: "instant",
  })
  const points = base.channels.points!
  const data = points.data as KidsPointsData
  const snapshot = {
    ...base,
    channels: {
      points: {
        ...points,
        data: {
          ...data,
          kids: data.kids.map((kid) =>
            kid.id === "robin"
              ? {
                  ...kid,
                  activeTask: {
                    name: "Sitting Still",
                    startedAtMs,
                    goalMinutes: 6,
                    isCountdown: true,
                  },
                }
              : kid,
          ),
          lastScan: {
            ...data.lastScan!,
            result: "started" as const,
          },
        },
      },
    },
  }
  return (
    <div
      class="platform"
      data-device="true"
      style={{
        inlineSize: `${width}px`,
        blockSize: `${height}px`,
        minBlockSize: 0,
      }}
    >
      <DisplayComposition
        snapshot={snapshot}
        isConnected
        onAction={async () => undefined}
      />
    </div>
  )
}

/** The saved timer continuously shows time done and time left between notifications. */
export const Countdown: Story = {
  render: () => <CountdownStage width={480} height={320} />,
}

/** The same timer on a board leaves the other children's cards visible. */
export const CountdownBoard: Story = {
  render: () => (
    <CountdownStage width={1280} height={720} />
  ),
}
