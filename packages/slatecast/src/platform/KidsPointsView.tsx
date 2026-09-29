import type { ContractData } from "@castkit/sdk/contracts"
import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
import { useDisplayProperties } from "./displayProperties.ts"
import {
  formatClockTime,
  getGoalPercent,
  getIsScanShowing,
  getKidsPointsLayout,
  getScanText,
  readScanSeconds,
} from "./kidsPointsLayout.ts"

type KidsPointsData = ContractData["kids-points.v1"]
type KidEntry = KidsPointsData["kids"][number]
type KidScan = NonNullable<KidsPointsData["lastScan"]>

/*
 * The child's identity color is a stripe and a bar fill, never type: the
 * household's colors are chosen to match printed cards, and a pale green or a
 * light gray name is unreadable on a light scheme. A child with no color
 * takes the accent.
 */
const kidStyle = (kid: KidEntry) =>
  kid.color ? { "--kid-color": kid.color } : undefined

const formatPoints = (points: number) =>
  points.toLocaleString("en-US")

const GoalBar = ({ kid }: { kid: KidEntry }) => {
  const percent = getGoalPercent(kid)
  return percent === undefined ? null : (
    <div
      class="kids-points-bar"
      role="progressbar"
      aria-label={`${kid.name} progress toward today's goal`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div
        class="kids-points-bar-fill"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

/** A running timer outranks the last card: it is what the child is doing now. */
const KidFootnote = ({ kid }: { kid: KidEntry }) =>
  kid.activeTask ? (
    <p class="kids-points-footnote">
      {kid.activeTask.name} since{" "}
      {formatClockTime(kid.activeTask.startedAtMs)}
    </p>
  ) : kid.lastTask ? (
    <p class="kids-points-footnote">Last: {kid.lastTask}</p>
  ) : null

const ScanBanner = ({ scan }: { scan: KidScan }) => {
  const text = getScanText(scan)
  return (
    <div
      class="kids-points-scan"
      data-result={scan.result}
      role="status"
    >
      <strong class="kids-points-scan-headline">
        {text.headline}
      </strong>
      {text.detail ? (
        <span class="kids-points-scan-detail">
          {text.detail}
        </span>
      ) : null}
    </div>
  )
}

const KidTotal = ({ kid }: { kid: KidEntry }) => (
  <p class="kids-points-total">
    <strong>{formatPoints(kid.pointsToday)}</strong>
    <span>
      {kid.goal === undefined
        ? "today"
        : `of ${formatPoints(kid.goal)} today`}
    </span>
  </p>
)

const KidCard = ({
  kid,
  scan,
  isDimmed,
}: {
  kid: KidEntry
  scan: KidScan | undefined
  isDimmed: boolean
}) => (
  <article
    class="kids-points-card"
    style={kidStyle(kid)}
    data-scanned={scan ? "true" : "false"}
    data-dimmed={isDimmed ? "true" : "false"}
    data-goal-reached={
      kid.goal !== undefined && kid.pointsToday >= kid.goal
        ? "true"
        : "false"
    }
  >
    <h3>{kid.name}</h3>
    {scan ? <ScanBanner scan={scan} /> : null}
    <KidTotal kid={kid} />
    <GoalBar kid={kid} />
    {kid.goal !== undefined &&
    kid.pointsToday >= kid.goal ? (
      <p class="kids-points-goal-reached">Goal reached</p>
    ) : null}
    <KidFootnote kid={kid} />
  </article>
)

const KidRow = ({ kid }: { kid: KidEntry }) => (
  <article class="kids-points-row" style={kidStyle(kid)}>
    <div class="kids-points-row-head">
      <h3>{kid.name}</h3>
      <span class="kids-points-row-total">
        {formatPoints(kid.pointsToday)}
        {kid.goal === undefined
          ? ""
          : ` / ${formatPoints(kid.goal)}`}
      </span>
    </div>
    <GoalBar kid={kid} />
  </article>
)

/**
 * Each child's points today, from any source that speaks `kids-points.v1`.
 *
 * A panel wide enough for every child side by side is a board, and a card
 * scan marks that child's card and dims the rest, so the room still sees the
 * whole family. A smaller panel is rows; a scan there gives the whole panel to
 * the child who scanned, since one child's result is what the room is waiting
 * to see. A panel too slow to draw a fifteen-second result never shows one.
 */
export const KidsPointsView = ({
  data,
  now,
  settings,
}: {
  data: KidsPointsData
  now: number
  settings?: Record<string, unknown>
}) => {
  const properties = useDisplayProperties()
  const element = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const root = element.current
    if (!root) {
      return
    }
    const measure = () =>
      setSize({
        width: root.clientWidth,
        height: root.clientHeight,
      })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])
  const colorMode =
    properties.properties?.colorMode ?? "full"
  if (data.kids.length === 0) {
    return (
      <div class="platform-empty">
        <h2>No points yet</h2>
        <p>
          Children appear once the points service publishes
          them.
        </p>
      </div>
    )
  }
  const isScanShowing = getIsScanShowing({
    lastScan: data.lastScan,
    now,
    scanSeconds: readScanSeconds(settings),
    isValueFresh: properties.isValueFresh,
  })
  const scan = isScanShowing ? data.lastScan : undefined
  const scannedKid = scan
    ? data.kids.find((kid) => kid.id === scan.kidId)
    : undefined
  const layout = getKidsPointsLayout({
    ...size,
    kidCount: data.kids.length,
  })
  const content = layout.isBoard ? (
    <div
      class="kids-points-board"
      style={{
        gridTemplateColumns: `repeat(${data.kids.length}, minmax(0, 1fr))`,
      }}
    >
      {data.kids.map((kid) => (
        <KidCard
          key={kid.id}
          kid={kid}
          scan={
            scan && kid.id === scan.kidId ? scan : undefined
          }
          isDimmed={
            scannedKid !== undefined &&
            kid.id !== scannedKid.id
          }
        />
      ))}
    </div>
  ) : scan && scannedKid ? (
    <article
      class="kids-points-focus"
      style={kidStyle(scannedKid)}
    >
      <h3>{scannedKid.name}</h3>
      <ScanBanner scan={scan} />
      <KidTotal kid={scannedKid} />
      <GoalBar kid={scannedKid} />
    </article>
  ) : (
    <div class="kids-points-rows">
      {data.kids.slice(0, layout.rowCount).map((kid) => (
        <KidRow key={kid.id} kid={kid} />
      ))}
      {layout.rowCount < data.kids.length ? (
        <p class="kids-points-overflow">
          {data.kids.length - layout.rowCount} more
        </p>
      ) : null}
    </div>
  )
  return (
    <div
      class="kids-points"
      data-color-mode={colorMode}
      ref={element}
    >
      {content}
    </div>
  )
}
