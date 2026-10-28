import type { ContractData } from "@castkit/sdk/contracts"
import type { BrowserClockConfig } from "@castkit/shared/protocol/ws"
import {
  WEATHER_CONDITION_CODES,
  type WeatherConditionCode,
} from "@castkit/shared/viewData/types"
import { useSignalEffect } from "@preact/signals"
import type { ComponentProps } from "preact"
import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
import {
  finishNavigation,
  navigationFeedback,
} from "../navigationFeedback.ts"
import {
  formatClockDate,
  formatClockTimeParts,
  formatEventTime,
} from "../time.ts"
import { ClockReading } from "../views/ClockReading.tsx"
import { CompactMusicPlayer } from "../views/CompactMusicPlayer.tsx"
import { COMPACT_MUSIC_HEIGHT } from "../views/compactMusicLayout.ts"
import { WeatherMark } from "../WeatherMark.tsx"
import { CompositionNavigation } from "./CompositionNavigation.ts"
import { useCompositionVisibility } from "./CompositionVisibility.ts"
import { useDisplayProperties } from "./displayProperties.ts"
import { KidOpenButton } from "./KidOpenButton.tsx"
import { KidTasksToday } from "./KidTasksToday.tsx"

/** A distance-readable clock and agenda, with a live household points strip. */
export const IdleDashboard = ({
  now,
  clock,
  agenda,
  weather,
  points,
  musicPlayer,
}: {
  now: number
  clock: BrowserClockConfig
  agenda?: ContractData["agenda.v1"]
  weather?: ContractData["weather.v1"]
  points?: ContractData["kids-points.v1"]
  musicPlayer?: ComponentProps<typeof CompactMusicPlayer>
}) => {
  const isVisible = useCompositionVisibility()
  const navigation = useContext(CompositionNavigation)
  const { isInteractive } = useDisplayProperties()
  const [selectedKidId, setSelectedKidId] =
    useState<string>()
  const [isMusicExpanded, setMusicExpanded] =
    useState(false)
  const [hasMusicRoom, setMusicRoom] = useState(false)
  const side = useRef<HTMLDivElement>(null)
  const agendaContent = useRef<HTMLDivElement>(null)
  const music = musicPlayer?.data
  const isMusicActive = Boolean(
    music?.current &&
      (music.player?.state === "playing" ||
        music.player?.state === "paused"),
  )
  useLayoutEffect(() => {
    if (!isVisible) setSelectedKidId(undefined)
    if (!isVisible || !isMusicActive)
      setMusicExpanded(false)
  }, [isVisible, isMusicActive])
  useSignalEffect(() => {
    const feedback = navigationFeedback.value
    if (
      isVisible &&
      feedback?.phase === "loading" &&
      ["ambient", "calendar"].includes(
        feedback.requestedView ?? "",
      )
    ) {
      const update = () => {
        setSelectedKidId(undefined)
        setMusicExpanded(false)
      }
      if (selectedKidId && navigation)
        navigation.navigate(update, false)
      else update()
      finishNavigation()
    }
  })
  const selectedKid = isInteractive
    ? points?.kids.find((kid) => kid.id === selectedKidId)
    : undefined
  const selectKid = (id?: string) => {
    const update = () => {
      setSelectedKidId(id)
      setMusicExpanded(false)
    }
    if (navigation)
      navigation.navigate(update, id !== undefined)
    else update()
  }
  useLayoutEffect(() => {
    if (navigation?.isDetailFocused === false) {
      setSelectedKidId(undefined)
    }
  }, [navigation?.isDetailFocused])
  const release = useRef(navigation?.release)
  release.current = navigation?.release
  useLayoutEffect(() => () => release.current?.(), [])
  useLayoutEffect(() => {
    if (!selectedKid) release.current?.()
  }, [selectedKid?.id])
  const events = (agenda?.events ?? [])
    .filter(
      (event) =>
        event.isAllDay || event.startMs >= now - 3600000,
    )
    .slice(0, 3)
  const kids = [...(points?.kids ?? [])].sort(
    (left, right) =>
      (left.displayOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.displayOrder ?? Number.MAX_SAFE_INTEGER),
  )
  useLayoutEffect(() => {
    const column = side.current
    const content = agendaContent.current
    if (
      !column ||
      !content ||
      !isVisible ||
      !isMusicActive ||
      isMusicExpanded ||
      selectedKid
    )
      return
    const measure = () => {
      if (document.fonts.status !== "loaded") return
      const agendaElement = content.parentElement
      if (!agendaElement) return
      // Measure the proposed compact agenda without changing its visible style
      // when music does not fit. Temporary styles never survive to a paint.
      column.dataset.measuringMusic = "true"
      const style = getComputedStyle(agendaElement)
      const padding =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom)
      const gap =
        Number.parseFloat(
          getComputedStyle(column).rowGap,
        ) || 0
      const hasSpaceForMusic =
        column.clientWidth >= 240 &&
        column.clientHeight -
          content.scrollHeight -
          padding -
          gap >=
          COMPACT_MUSIC_HEIGHT + 24
      delete column.dataset.measuringMusic
      setMusicRoom(hasSpaceForMusic)
    }
    const pending = { isDisposed: false, frame: 0 }
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(pending.frame)
      pending.frame = requestAnimationFrame(measure)
    })
    observer.observe(column)
    observer.observe(content)
    measure()
    void document.fonts.ready.then(() => {
      if (!pending.isDisposed) measure()
    })
    document.fonts.addEventListener("loadingdone", measure)
    return () => {
      pending.isDisposed = true
      cancelAnimationFrame(pending.frame)
      observer.disconnect()
      document.fonts.removeEventListener(
        "loadingdone",
        measure,
      )
    }
  }, [
    isVisible,
    isMusicExpanded,
    selectedKid?.id,
    isMusicActive,
    agenda,
  ])
  if (selectedKid)
    return (
      <div class="idle-dashboard-detail">
        <KidTasksToday
          kid={selectedKid}
          now={now}
          onBack={() => selectKid()}
        />
      </div>
    )
  return (
    <div class="idle-dashboard-frame">
      <div
        class="idle-dashboard"
        data-has-points={String(kids.length > 0)}
        data-music-expanded={String(isMusicExpanded)}
      >
        <section
          class="idle-dashboard-clock"
          aria-label="Time and weather"
        >
          <ClockReading
            {...formatClockTimeParts(now, clock)}
            class="idle-dashboard-reading"
            timeClass="idle-dashboard-time"
            meridiemClass="idle-dashboard-meridiem"
          />
          <div class="idle-dashboard-date">
            {formatClockDate(now, clock)}
          </div>
          {weather ? (
            <div class="idle-dashboard-weather">
              {weather.condition &&
              (
                WEATHER_CONDITION_CODES as readonly string[]
              ).includes(weather.condition) ? (
                <WeatherMark
                  condition={
                    weather.condition as WeatherConditionCode
                  }
                />
              ) : null}
              <strong>{weather.temperatureText}</strong>
              <span>{weather.conditionText}</span>
            </div>
          ) : null}
        </section>
        <div
          class="idle-dashboard-side"
          ref={side}
          data-has-music={String(
            isMusicActive && hasMusicRoom,
          )}
        >
          <section
            class="idle-dashboard-agenda"
            aria-label="Today's agenda"
          >
            <div ref={agendaContent}>
              <h2>Today</h2>
              {events.length ? (
                <ul>
                  {events.map((event) => (
                    <li
                      key={`${event.startMs}:${event.summary}`}
                    >
                      <time>
                        {formatEventTime({
                          startMillis: event.startMs,
                          isAllDay: event.isAllDay,
                          clock,
                        })}
                      </time>
                      <span>{event.summary}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p class="idle-dashboard-empty">
                  Nothing else scheduled
                </p>
              )}
            </div>
          </section>
          {musicPlayer &&
          isMusicActive &&
          (hasMusicRoom || isMusicExpanded) ? (
            <section
              class="idle-dashboard-music"
              aria-label="Room music"
            >
              <CompactMusicPlayer
                {...musicPlayer}
                isExpanded={isMusicExpanded}
                onExpandedChange={setMusicExpanded}
              />
            </section>
          ) : null}
        </div>
        {kids.length ? (
          <section
            class="idle-dashboard-points"
            aria-label="Today's points"
          >
            {kids.map((kid) => (
              <article
                key={kid.id}
                aria-label={`${kid.name}'s points`}
                style={{
                  "--kid-color":
                    kid.color ?? "var(--accent)",
                }}
              >
                <KidOpenButton
                  kid={kid}
                  onSelect={
                    isInteractive ? selectKid : undefined
                  }
                />
                <div class="idle-dashboard-kid-header">
                  <h2>{kid.name}</h2>
                  <div class="idle-dashboard-score">
                    <strong>{kid.pointsToday}</strong>
                    {kid.goal ? (
                      <span>/ {kid.goal}</span>
                    ) : null}
                  </div>
                </div>
                {kid.goal ? (
                  <progress
                    aria-label={`${kid.name}'s daily goal`}
                    value={Math.min(
                      kid.goal,
                      Math.max(0, kid.pointsToday),
                    )}
                    max={kid.goal}
                  />
                ) : null}
                {kid.lastTask ? (
                  <p title={kid.lastTask}>{kid.lastTask}</p>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  )
}
