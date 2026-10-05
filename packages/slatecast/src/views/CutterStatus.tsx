import type { ContractData } from "@castkit/sdk/contracts"
import { useEffect, useState } from "preact/hooks"
import { useDisplayProperties } from "../platform/displayProperties.ts"
import { safeMediaUrl } from "../platform/protocol.ts"
import { formatClockTime } from "../time.ts"
import {
  type Cutter,
  type CutterJob,
  describeJobProgress,
  describeRecentJob,
  formatAboutDuration,
  formatCutLength,
  getCutterIntent,
  getCutterStateLabel,
  getEstimatedPercent,
  getHeadlineJob,
  getIsActiveJob,
} from "./cutterJob.ts"

type CutPreview = NonNullable<CutterJob["preview"]>

/**
 * The view's own clock, so a countdown moves between polls and a finished
 * job steps down from the headline even when the data has not changed.
 */
const useNowMillis = (intervalMilliseconds: number) => {
  const [nowMillis, setNowMillis] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(
      () => setNowMillis(Date.now()),
      intervalMilliseconds,
    )
    return () => clearInterval(timer)
  }, [intervalMilliseconds])
  return nowMillis
}

/**
 * The cut lines, drawn from path data only. `isCropped` frames the design's
 * own bounds, for a thumbnail; otherwise the whole sheet is drawn, so the
 * headline shows where the design sits on the material.
 */
const CutLines = ({
  preview,
  isCropped,
  label,
}: {
  preview: CutPreview
  isCropped: boolean
  label: string
}) => {
  const bounds = preview.boundsMm
  const hasBounds = bounds.width > 0 && bounds.height > 0
  const margin =
    Math.max(bounds.width, bounds.height) * 0.06
  const viewBox =
    isCropped && hasBounds
      ? [
          bounds.x - margin,
          bounds.y - margin,
          bounds.width + margin * 2,
          bounds.height + margin * 2,
        ]
      : [
          0,
          0,
          preview.sheet.widthMm,
          preview.sheet.heightMm,
        ]
  return (
    <svg
      class="cutter-lines"
      viewBox={viewBox.join(" ")}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
    >
      {isCropped ? null : (
        <rect
          class="cutter-sheet"
          width={preview.sheet.widthMm}
          height={preview.sheet.heightMm}
        />
      )}
      {preview.paths.map((path, index) => (
        <path
          key={index}
          class={`cutter-path is-${path.kind}`}
          d={path.d}
          vector-effect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

const RecentJobs = ({
  jobs,
  nowMillis,
}: {
  jobs: CutterJob[]
  nowMillis: number
}) =>
  jobs.length ? (
    <section class="cutter-recent" aria-label="Recent jobs">
      <h3>Recent jobs</h3>
      {/* A column that wraps into a clipped second column: a row that does
          not finish on the panel is not drawn at all, never cut in half. */}
      <ul class="cutter-recent-list">
        <li
          class="cutter-recent-spacer"
          aria-hidden="true"
        />
        {jobs.map((job) => (
          <li class="cutter-recent-row" key={job.id}>
            <span class="cutter-recent-thumb">
              {job.preview ? (
                <CutLines
                  preview={job.preview}
                  isCropped={true}
                  label=""
                />
              ) : null}
            </span>
            <span class="cutter-recent-text">
              <strong>{job.name}</strong>
              <span data-status={job.status}>
                {describeRecentJob({ job, nowMillis })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  ) : null

const CutterCard = ({
  cutter,
  nowMillis,
}: {
  cutter: Cutter
  nowMillis: number
}) => {
  const properties = useDisplayProperties()
  const job = getHeadlineJob({ cutter, nowMillis })
  const imageUrl = safeMediaUrl(cutter.imagePath)
  const intent = getCutterIntent({ cutter, job })
  const recentJobs = cutter.recentJobs.filter(
    (recent) => recent !== job,
  )
  const progress = job
    ? describeJobProgress({
        job,
        nowMillis,
        hasRelativeTimes: properties.hasRelativeTimes,
      })
    : undefined
  const percent = job
    ? getEstimatedPercent({ job, nowMillis })
    : undefined
  const isAvailable =
    cutter.isOnline && cutter.isCutterConnected
  return (
    <article
      class="printer-card cutter-card"
      aria-label={cutter.name}
      data-intent={intent}
      data-state={
        !cutter.isOnline
          ? "offline"
          : !cutter.isCutterConnected
            ? "disconnected"
            : (job?.status ?? "idle")
      }
    >
      <div class="printer-head">
        {imageUrl ? (
          <img
            class="cutter-model-icon"
            src={imageUrl}
            alt=""
          />
        ) : null}
        <div class="printer-names">
          <h2 class="printer-name">{cutter.name}</h2>
          <div class="printer-meta">
            {[
              cutter.hostLabel
                ? `Plugged into ${cutter.hostLabel}`
                : undefined,
              cutter.firmwareVersion
                ? `Firmware ${cutter.firmwareVersion}`
                : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <span class="printer-state">
          <span
            class="printer-state-dot"
            aria-hidden="true"
          />
          {getCutterStateLabel({ cutter, job })}
        </span>
      </div>
      <div class="cutter-main">
        <div class="cutter-picture">
          {job?.preview ? (
            <CutLines
              preview={job.preview}
              isCropped={false}
              label={`Cut lines for ${job.name}`}
            />
          ) : imageUrl ? (
            <img
              class="cutter-model-image"
              src={imageUrl}
              alt=""
            />
          ) : null}
        </div>
        <div class="cutter-facts">
          {!cutter.isOnline ? (
            <p class="cutter-notice" role="status">
              Cuttero has not heard from this cutter's
              computer
              {cutter.updatedAtMs === undefined
                ? "."
                : ` since ${formatClockTime(cutter.updatedAtMs)}.`}
            </p>
          ) : !cutter.isCutterConnected ? (
            <p class="cutter-notice" role="status">
              The cutter is not answering. Turn it on and
              check its USB cable
              {cutter.hostLabel
                ? ` to ${cutter.hostLabel}.`
                : "."}
            </p>
          ) : null}
          {job ? (
            <>
              <p class="printer-job" title={job.name}>
                {job.name}
              </p>
              {job.problemText ? (
                <p class="printer-problem">
                  {job.problemText}
                </p>
              ) : null}
              <div class="printer-band cutter-band">
                {properties.hasProgress &&
                percent !== undefined ? (
                  <div
                    class="printer-band-fill"
                    style={{ width: `${percent}%` }}
                  />
                ) : null}
                <div class="cutter-band-text">
                  <strong>{progress?.primary}</strong>
                  {progress?.secondary ? (
                    <span>{progress.secondary}</span>
                  ) : null}
                </div>
              </div>
              {getIsActiveJob(job) &&
              (job.cutLengthMm || job.estimateSeconds) ? (
                <dl class="printer-metrics">
                  {job.cutLengthMm ? (
                    <div class="printer-metric">
                      <dt>Cut length</dt>
                      <dd>
                        {formatCutLength(job.cutLengthMm)}
                      </dd>
                    </div>
                  ) : null}
                  {job.estimateSeconds ? (
                    <div class="printer-metric">
                      <dt>Estimate</dt>
                      <dd>
                        {formatAboutDuration(
                          job.estimateSeconds,
                        ).replace(/^about /, "")}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </>
          ) : isAvailable ? (
            <p class="cutter-idle">Ready to cut</p>
          ) : null}
          <RecentJobs
            jobs={recentJobs}
            nowMillis={nowMillis}
          />
        </div>
      </div>
    </article>
  )
}

/**
 * Read-only status for the vinyl and paper cutters a Cuttero server drives:
 * the cutter, the job it is working through with an estimated finish, its
 * cut lines, and the last few jobs. It has no controls; a cut is sent from
 * Cuttero itself.
 */
export const CutterStatus = ({
  data,
}: {
  data: ContractData["cutters.v1"] | null
}) => {
  const properties = useDisplayProperties()
  const cutters = data?.cutters ?? []
  const hasActiveJob = cutters.some(
    (cutter) => cutter.currentJob !== undefined,
  )
  const nowMillis = useNowMillis(
    hasActiveJob && properties.hasRelativeTimes
      ? 1000
      : 30_000,
  )
  return (
    <div class="cutter-status">
      {cutters.length ? (
        <div
          class="cutter-cards"
          style={{ "--cutters": String(cutters.length) }}
        >
          {cutters.map((cutter) => (
            <CutterCard
              key={cutter.id}
              cutter={cutter}
              nowMillis={nowMillis}
            />
          ))}
        </div>
      ) : (
        <p class="cutter-empty" role="status">
          {data
            ? "No cutters yet."
            : "Waiting for cutter data."}
        </p>
      )}
    </div>
  )
}
