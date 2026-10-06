import type { ContractData } from "@castkit/sdk/contracts"
import { getCountdownKid } from "@castkit/sdk/kidsPointsScan"
import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
import { useDisplayProperties } from "./displayProperties.ts"
import {
  formatClockTime,
  formatPointsDelta,
  getConfettiPieces,
  getGoalPercent,
  getIsScanShowing,
  getKidsPointsLayout,
  getScanKey,
  getScanMotion,
  getScanText,
  getStarBurst,
  readScanSeconds,
  type ScanMotion,
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

/**
 * What a scan did to one child's card: nothing, or a motion from the total
 * before the scan to the total after it. Only an instant panel moves; every
 * other panel draws the result the motion ends on.
 */
type CardMotion = {
  motion: ScanMotion
  key: string
  points: number
}

const getCardMotion = ({
  kid,
  scan,
  isAnimated,
}: {
  kid: KidEntry
  scan: KidScan | undefined
  isAnimated: boolean
}): CardMotion | undefined => {
  if (!scan || !isAnimated) {
    return undefined
  }
  const motion = getScanMotion({ kid, scan })
  return motion === "none"
    ? undefined
    : { motion, key: getScanKey(scan), points: scan.points }
}

const GoalBar = ({
  kid,
  cardMotion,
}: {
  kid: KidEntry
  cardMotion?: CardMotion
}) => {
  const percent = getGoalPercent(kid)
  const before = cardMotion
    ? getGoalPercent({
        ...kid,
        pointsToday: kid.pointsToday - cardMotion.points,
      })
    : undefined
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
        key={cardMotion?.key}
        class="kids-points-bar-fill"
        data-motion={cardMotion ? "grow" : undefined}
        style={{
          width: `${percent}%`,
          ...(before === undefined
            ? {}
            : { "--bar-from": `${before}%` }),
        }}
      />
    </div>
  )
}

const CONFETTI_PIECES = getConfettiPieces(36)
const STAR_BURST = getStarBurst(10)

const Confetti = () => (
  <span class="kids-points-confetti" aria-hidden="true">
    {CONFETTI_PIECES.map((piece) => (
      <i
        key={`${piece.x}:${piece.y}`}
        data-round={piece.isRound ? "true" : "false"}
        style={{
          "--x": `${piece.x}cqmin`,
          "--y": `${piece.y}cqmin`,
          "--fall": `${piece.fall}cqmin`,
          "--spin": `${piece.spin}deg`,
          "--delay": `${piece.delayMilliseconds}ms`,
          "--color": piece.color,
        }}
      />
    ))}
  </span>
)

const Stars = () => (
  <span class="kids-points-stars" aria-hidden="true">
    {STAR_BURST.map((star) => (
      <i
        key={`${star.x}:${star.y}`}
        style={{
          "--x": `${star.x}cqmin`,
          "--y": `${star.y}cqmin`,
          "--delay": `${star.delayMilliseconds}ms`,
        }}
      />
    ))}
  </span>
)

/**
 * The total, and on an instant panel the scan merging into it: the points
 * drop into the old total, the two squash together, and the new total
 * bounces out. Reaching the goal throws confetti; a scan after the goal
 * flips the total inside a ring of stars.
 */
const TotalNumber = ({
  kid,
  cardMotion,
}: {
  kid: KidEntry
  cardMotion?: CardMotion
}) =>
  cardMotion ? (
    <span
      key={cardMotion.key}
      class="kids-points-number"
      data-motion={cardMotion.motion}
    >
      <strong
        class="kids-points-number-before"
        aria-hidden="true"
      >
        {formatPoints(kid.pointsToday - cardMotion.points)}
      </strong>
      <strong class="kids-points-number-after">
        {formatPoints(kid.pointsToday)}
      </strong>
      <span class="kids-points-chip" aria-hidden="true">
        {formatPointsDelta(cardMotion.points)}
      </span>
      {cardMotion.motion === "goal" ? <Confetti /> : null}
      {cardMotion.motion === "bonus" ? <Stars /> : null}
    </span>
  ) : (
    <strong>{formatPoints(kid.pointsToday)}</strong>
  )

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

/** A live countdown uses its saved start and target, never the minute announcement. */
const CountdownProgress = ({
  kid,
  now,
  isLive,
}: {
  kid: KidEntry
  now: number
  isLive: boolean
}) => {
  const task = kid.activeTask
  if (
    !task?.isCountdown ||
    task.goalMinutes === undefined
  ) {
    return null
  }
  const totalSeconds = task.goalMinutes * 60
  const elapsedSeconds = Math.min(
    totalSeconds,
    Math.max(0, (now - task.startedAtMs) / 1000),
  )
  const remainingSeconds = Math.max(
    0,
    totalSeconds - elapsedSeconds,
  )
  const formatDuration = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
  return (
    <div class="kids-points-countdown">
      <p class="kids-points-countdown-name">{task.name}</p>
      {isLive ? (
        <>
          <div class="kids-points-countdown-times">
            <p>
              <strong>
                {formatDuration(
                  Math.ceil(remainingSeconds),
                )}
              </strong>
              <span>left</span>
            </p>
          </div>
          <div
            class="kids-points-bar"
            role="progressbar"
            aria-label={`${kid.name} ${task.name} timed progress`}
            aria-valuemin={0}
            aria-valuemax={totalSeconds}
            aria-valuenow={Math.floor(elapsedSeconds)}
            aria-valuetext={`${formatDuration(Math.ceil(remainingSeconds))} left`}
          >
            <div
              class="kids-points-bar-fill"
              style={{
                width: `${(elapsedSeconds / totalSeconds) * 100}%`,
              }}
            />
          </div>
        </>
      ) : (
        <p class="kids-points-footnote">
          {task.goalMinutes} min · ends{" "}
          {formatClockTime(
            task.startedAtMs + totalSeconds * 1000,
          )}
        </p>
      )}
    </div>
  )
}

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

const KidTotal = ({
  kid,
  cardMotion,
  isInline = false,
}: {
  kid: KidEntry
  cardMotion?: CardMotion
  isInline?: boolean
}) => (
  <p class="kids-points-total">
    <TotalNumber kid={kid} cardMotion={cardMotion} />
    <span class="kids-points-total-label">
      {kid.goal === undefined
        ? "today"
        : isInline
          ? `/ ${formatPoints(kid.goal)}`
          : `of ${formatPoints(kid.goal)} today`}
    </span>
  </p>
)

const GoalReached = ({
  kid,
  cardMotion,
}: {
  kid: KidEntry
  cardMotion?: CardMotion
}) =>
  kid.goal !== undefined && kid.pointsToday >= kid.goal ? (
    <p
      key={cardMotion?.key}
      class="kids-points-goal-reached"
      data-motion={cardMotion?.motion}
    >
      Goal reached
    </p>
  ) : null

const KidCard = ({
  kid,
  scan,
  isDimmed,
  isAnimated,
  now,
  isLive,
  isStacked,
}: {
  now: number
  isLive: boolean
  isStacked: boolean
  kid: KidEntry
  scan: KidScan | undefined
  isDimmed: boolean
  isAnimated: boolean
}) => {
  const cardMotion = getCardMotion({
    kid,
    scan,
    isAnimated,
  })
  return (
    <article
      class="kids-points-card"
      style={kidStyle(kid)}
      data-scanned={scan ? "true" : "false"}
      data-dimmed={isDimmed ? "true" : "false"}
      data-goal-reached={
        kid.goal !== undefined &&
        kid.pointsToday >= kid.goal
          ? "true"
          : "false"
      }
    >
      {isStacked ? (
        <div class="kids-points-card-head">
          <h3>{kid.name}</h3>
          <KidTotal
            kid={kid}
            cardMotion={cardMotion}
            isInline
          />
        </div>
      ) : (
        <h3>{kid.name}</h3>
      )}
      {kid.activeTask?.isCountdown &&
      (!scan ||
        scan.result === "started" ||
        scan.result === "progress") ? (
        <CountdownProgress
          kid={kid}
          now={now}
          isLive={isLive}
        />
      ) : (
        <>
          {scan ? <ScanBanner scan={scan} /> : null}
          {isStacked ? null : (
            <KidTotal kid={kid} cardMotion={cardMotion} />
          )}
          <GoalBar kid={kid} cardMotion={cardMotion} />
          <GoalReached kid={kid} cardMotion={cardMotion} />
          <KidFootnote kid={kid} />
        </>
      )}
    </article>
  )
}

/**
 * The whole panel for the child who just scanned. On an instant panel that
 * earned points the total is the hero, because the motion happens there;
 * everywhere else the scan's own line leads, as the result a slow panel can
 * hold.
 */
const KidFocus = ({
  kid,
  scan,
  isAnimated,
}: {
  kid: KidEntry
  scan: KidScan
  isAnimated: boolean
}) => {
  const cardMotion = getCardMotion({
    kid,
    scan,
    isAnimated,
  })
  return (
    <article
      class="kids-points-focus"
      style={kidStyle(kid)}
      data-motion={cardMotion?.motion}
    >
      <h3>{kid.name}</h3>
      {cardMotion ? null : <ScanBanner scan={scan} />}
      <KidTotal kid={kid} cardMotion={cardMotion} />
      <GoalBar kid={kid} cardMotion={cardMotion} />
      {cardMotion ? (
        <>
          <GoalReached kid={kid} cardMotion={cardMotion} />
          <ScanBanner scan={scan} />
        </>
      ) : null}
    </article>
  )
}

const KidRow = ({ kid }: { kid: KidEntry }) => (
  <article class="kids-points-row" style={kidStyle(kid)}>
    <div class="kids-points-row-head">
      <h3>{kid.name}</h3>
      <span class="kids-points-row-total">
        <strong>{formatPoints(kid.pointsToday)}</strong>
        {kid.goal === undefined ? null : (
          <span>{` / ${formatPoints(kid.goal)}`}</span>
        )}
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
 * to see. An instant panel animates the points into the total; a fast or slow
 * panel draws the points and the new total; a super-slow panel, too slow to
 * draw a short result, never shows one.
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
    repaint: properties.repaint,
  })
  const isAnimated = properties.repaint === "instant"
  const isLive = properties.repaint === "instant"
  const countdownKid = getCountdownKid({ data, now })
  const scan =
    isScanShowing || countdownKid
      ? data.lastScan
      : undefined
  const scannedKid = scan
    ? data.kids.find((kid) => kid.id === scan.kidId)
    : undefined
  const layout = getKidsPointsLayout({
    ...size,
    kidCount: data.kids.length,
  })
  const content =
    settings?.isTotalsOnly === true ? (
      <div class="kids-points-simple-totals">
        {data.kids.map((kid) => (
          <article
            key={kid.id}
            class="kids-points-simple-row"
          >
            <h3 title={kid.name}>
              {settings.nameStyle === "initial"
                ? Array.from(kid.name)[0]
                : kid.name}
            </h3>
            <strong>{formatPoints(kid.pointsToday)}</strong>
          </article>
        ))}
      </div>
    ) : layout.isBoard ? (
      <div
        class="kids-points-board"
        data-stacked={
          layout.columnCount < data.kids.length
            ? "true"
            : "false"
        }
        style={{
          gridTemplateColumns: `repeat(${layout.columnCount}, minmax(0, 1fr))`,
        }}
      >
        {data.kids.map((kid) => (
          <KidCard
            key={kid.id}
            kid={kid}
            scan={
              scan && kid.id === scan.kidId
                ? scan
                : undefined
            }
            isDimmed={
              scannedKid !== undefined &&
              kid.id !== scannedKid.id
            }
            isAnimated={isAnimated}
            now={now}
            isLive={isLive}
            isStacked={
              layout.columnCount < data.kids.length
            }
          />
        ))}
      </div>
    ) : countdownKid ? (
      <article
        class="kids-points-focus"
        style={kidStyle(countdownKid)}
      >
        <h3>{countdownKid.name}</h3>
        <CountdownProgress
          kid={countdownKid}
          now={now}
          isLive={isLive}
        />
      </article>
    ) : scan && scannedKid ? (
      <KidFocus
        kid={scannedKid}
        scan={scan}
        isAnimated={isAnimated}
      />
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
