import type { ContractData } from "@castkit/sdk/contracts"
import type {
  Decorator,
  StoryObj,
} from "@storybook/preact-vite"
import type { ComponentChildren } from "preact"
import { useEffect, useMemo, useState } from "preact/hooks"
import {
  type DisplayProperties,
  DisplayPropertiesContext,
} from "./displayProperties.ts"
import { TimersView } from "./TimersView.tsx"
import "../styles.css"
import "./platform.css"

type Entities = ContractData["entities.v1"]
type TimerEntity = Entities["entities"][number]

/**
 * Stamps the dark scheme on `<html>`, where the server stamps it on a real
 * display: the palette variables resolve on `:root`, so a scheme set lower
 * down would leave the cards on the light palette.
 */
const DarkScheme = ({
  children,
}: {
  children: ComponentChildren
}) => {
  document.documentElement.dataset.scheme = "dark"
  // Leaves the next story the unstamped document it expects.
  useEffect(
    () => () => {
      delete document.documentElement.dataset.scheme
    },
    [],
  )
  return <>{children}</>
}
const withDarkScheme: Decorator = (Story) => (
  <DarkScheme>
    <Story />
  </DarkScheme>
)

const meta = {
  title: "Views/Room Timers",
  parameters: { layout: "fullscreen" },
  decorators: [withDarkScheme],
}
export default meta
type Story = StoryObj<typeof meta>

/**
 * A fixture timer, built from the moment its story opened. Each story starts
 * its timers fresh, so a person sees them count down from the same place
 * every time; the `vrt` capture's frozen clock makes that place the same
 * moment in every shot.
 */
type TimerFixture = (start: number) => TimerEntity

/** Ticks once a second; under the frozen capture clock it never moves. */
const useNow = () => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(
      () => setNow(Date.now()),
      1000,
    )
    return () => clearInterval(interval)
  }, [])
  return now
}

/** "H:MM:SS", the form the source sends a duration in. */
const toClock = (seconds: number) =>
  `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`

const ACTIVE_ACTIONS = ["pause", "cancel", "add_5_minutes"]

/** A running timer set for `durationSeconds`, with `leftSeconds` to go. */
const activeTimer =
  ({
    id,
    label,
    room,
    durationSeconds,
    leftSeconds,
  }: {
    id: string
    label: string
    room: string
    durationSeconds: number
    leftSeconds: number
  }): TimerFixture =>
  (start) => ({
    id,
    domain: "timer",
    name: `${label} · ${room}`,
    state: "active",
    attributes: {
      label,
      room: room.toLowerCase(),
      duration: toClock(durationSeconds),
      finishes_at: new Date(
        start + leftSeconds * 1000,
      ).toISOString(),
    },
    actions: ACTIVE_ACTIONS,
  })

const pasta = activeTimer({
  id: "timer.pasta.r1",
  label: "Pasta",
  room: "Kitchen",
  durationSeconds: 600,
  leftSeconds: 252,
})
const tea = activeTimer({
  id: "timer.tea.r1",
  label: "Tea",
  room: "Kitchen",
  durationSeconds: 300,
  leftSeconds: 95,
})
const laundry = activeTimer({
  id: "timer.laundry.r1",
  label: "Laundry",
  room: "Hall",
  durationSeconds: 3600,
  leftSeconds: 2460,
})
const bread = activeTimer({
  id: "timer.bread.r1",
  label: "Bread",
  room: "Kitchen",
  durationSeconds: 2700,
  leftSeconds: 1320,
})
const homework = activeTimer({
  id: "timer.homework.r1",
  label: "Homework break",
  room: "Office",
  durationSeconds: 900,
  leftSeconds: 610,
})
const pausedRice: TimerFixture = () => ({
  id: "timer.rice.r1",
  domain: "timer",
  name: "Rice · Kitchen",
  state: "paused",
  attributes: {
    label: "Rice",
    room: "kitchen",
    duration: "0:20:00",
    remaining: "0:08:00",
  },
  actions: ["start", "add_5_minutes", "cancel"],
})
/** A cancelled timer inside the source's thirty-second undo window. */
const cancelingEggs: TimerFixture = (start) => ({
  id: "timer.eggs.r1",
  domain: "timer",
  name: "Eggs · Kitchen",
  state: "canceling",
  attributes: {
    label: "Eggs",
    room: "kitchen",
    duration: "0:07:00",
    finishes_at: new Date(start + 180 * 1000).toISOString(),
    cancels_at: new Date(start + 22 * 1000).toISOString(),
  },
  actions: ["undo_cancel"],
})

/**
 * One panel of a fixed size. The view measures its own box to choose a
 * layout, so the sized box is the whole panel here.
 */
const TimerStage = ({
  timers,
  width,
  height,
  properties = { repaint: "instant", hasTouch: true },
  isControlEnabled = true,
}: {
  timers: TimerFixture[]
  width: number
  height: number
  properties?: DisplayProperties
  isControlEnabled?: boolean
}) => {
  const [start] = useState(() => Date.now())
  const entities = useMemo(
    () => timers.map((timer) => timer(start)),
    [timers, start],
  )
  const now = useNow()
  return (
    <main
      class="platform"
      style={{ width, height, overflow: "hidden" }}
    >
      <DisplayPropertiesContext.Provider value={properties}>
        <TimersView
          data={{ entities }}
          now={now}
          settings={{ presentation: "priority" }}
          isControlEnabled={isControlEnabled}
          onAction={async () => undefined}
        />
      </DisplayPropertiesContext.Provider>
    </main>
  )
}

/** One timer fills the panel; the color drains as the time runs down. */
export const OneTimer: Story = {
  render: () => (
    <TimerStage timers={[pasta]} width={800} height={480} />
  ),
}

/** Two timers, soonest first: the nearer deadline takes the larger card. */
export const TwoTimers: Story = {
  render: () => (
    <TimerStage
      timers={[pasta, tea]}
      width={800}
      height={480}
    />
  ),
}

/** Five timers on a wide panel: five equal columns, soonest on the left. */
export const FiveTimersWide: Story = {
  render: () => (
    <TimerStage
      timers={[pasta, tea, laundry, bread, homework]}
      width={1280}
      height={720}
    />
  ),
}

/**
 * A paused timer turns amber and says Paused. It sorts after every running
 * timer, since it has no deadline while it waits.
 */
export const Paused: Story = {
  render: () => (
    <TimerStage
      timers={[tea, pausedRice, laundry]}
      width={800}
      height={480}
    />
  ),
}

/**
 * A cancelled timer's card becomes an Undo button with a countdown bar until
 * the undo window closes. That the card keeps its old place after a cancel is
 * covered by `e2e/roomTimers.spec.ts`; a story opens with no earlier order.
 */
export const UndoCancel: Story = {
  render: () => (
    <TimerStage
      timers={[cancelingEggs, tea, pasta]}
      width={800}
      height={480}
    />
  ),
}

/** A small square panel shows only the soonest timer. */
export const SmallSquare: Story = {
  render: () => (
    <TimerStage
      timers={[pasta, tea, laundry]}
      width={240}
      height={240}
    />
  ),
}

/**
 * A slow panel without touch: no buttons, and the absolute end time in place
 * of a countdown that would be stale before the panel finished drawing it.
 */
export const SlowPanelNoTouch: Story = {
  render: () => (
    <TimerStage
      timers={[pasta, tea, laundry]}
      width={800}
      height={480}
      properties={{ repaint: "slow", hasTouch: false }}
    />
  ),
}

/** No running timers. */
export const Empty: Story = {
  render: () => (
    <TimerStage timers={[]} width={800} height={480} />
  ),
}
