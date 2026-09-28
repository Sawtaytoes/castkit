import type { SpoolsData } from "@castkit/shared/viewData/types"
import { useEffect, useState } from "preact/hooks"
import {
  assignSpoolToSlot,
  copySpoolToTag,
  linkSpoolTag,
  saveSpoolWeight,
  spools,
} from "../state.ts"
import { AmsOverview } from "./spoolAms.tsx"
import { AssignFlow } from "./spoolAssign.tsx"
import {
  Chip,
  ScaleStatus,
  SpoolFooter,
  ViewToggle,
} from "./spoolChrome.tsx"
import {
  describeLocation,
  describeTagType,
  formatGrams,
  getNetGrams,
  getPercentOfLabel,
  getSpoolBrandLine,
  getSpoolProductName,
  type Spool,
} from "./spoolFormat.ts"
import { SpoolPicker } from "./spoolPicker.tsx"
import {
  resetSpoolScreen,
  spoolScreen,
} from "./spoolScreen.ts"
import { Swatch } from "./spoolSwatch.tsx"

/**
 * Filament Spool Scale: the scale and tag reader beside the printers, on the
 * 1280×720 Pi Touch Display 2 at arm's length.
 *
 * The data decides the reader's screen. Nothing on the reader is `Ready to
 * scan`; a tag the inventory knows is the spool card with a one-tap save; a
 * tag it has never seen offers to copy a spool onto it or link one that has
 * no tag. A toggle in the corner flips to every AMS slot at a glance, and
 * `Assign to an AMS slot` walks a spool to a slot in three taps.
 *
 * Every number on the card is one of two facts the channel keeps apart: what
 * the SCALE reads now, and what the dashboard has ON RECORD. The Save button
 * closes the gap by sending the scale's reading. See
 * docs/filament-spool-scale-view.md.
 */

/** How long `Saved` stays on the button after the record catches up. */
const SAVED_SHOWN_MS = 4_000

/**
 * How long a save may sit unanswered before the button becomes live again.
 * The next `spools` push is what ends it normally; this is the floor for a
 * save the dashboard silently dropped.
 */
const SAVE_PENDING_MS = 15_000

type SaveState = {
  spoolId: string
  previousScaleGrams: number | undefined
  isSaved: boolean
}

const Fact = ({
  label,
  value,
  unit,
  isMuted = false,
  isSmall = false,
}: {
  label: string
  value: string
  unit?: string
  isMuted?: boolean
  isSmall?: boolean
}) => (
  <div class="fss-fact">
    <div class="fss-label">{label}</div>
    <div
      class={[
        "fss-value",
        isMuted ? "is-muted" : "",
        isSmall ? "is-small" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {value}
      {unit ? <small>{unit}</small> : null}
    </div>
  </div>
)

/** The idle stage: the ring and the copy beside it. */
const Stage = ({
  title,
  subtitle,
  hint,
}: {
  title: string
  subtitle: string
  hint?: string
}) => (
  <div class="fss-stage">
    <div class="fss-ring" aria-hidden="true" />
    <div class="fss-stage-copy">
      <h1 class="fss-big">{title}</h1>
      <p class="fss-subtitle">{subtitle}</p>
      {hint ? <p class="fss-hint">{hint}</p> : null}
    </div>
  </div>
)

const MatchedSpool = ({
  data,
  spool,
  saveState,
  onSave,
  onAssign,
}: {
  data: SpoolsData
  spool: Spool
  saveState: SaveState | null
  onSave: () => void
  onAssign: () => void
}) => {
  const netGrams = getNetGrams({
    scaleGrams: data.scale.grams,
    coreWeightGrams: spool.coreWeightGrams,
  })
  const isPending =
    saveState !== null &&
    saveState.spoolId === spool.id &&
    !saveState.isSaved
  const isSaved =
    saveState !== null &&
    saveState.spoolId === spool.id &&
    saveState.isSaved
  return (
    <>
      <div class="fss-title-row">
        <h1 class="fss-title">Spool</h1>
        <Chip intent="success" hasDot>
          {describeTagType(data.tag.tagType)} matched
        </Chip>
      </div>
      <div class="fss-two-col">
        <div class="fss-stack">
          <div class="fss-card fss-hero">
            <Swatch
              size="big"
              rgba={spool.rgba}
              extraColors={spool.extraColors}
              effectType={spool.effectType}
            />
            <div class="fss-hero-text">
              <div class="fss-spool-name">
                <span class="fss-line">
                  {getSpoolProductName(spool)}
                </span>
                {spool.colorName ? (
                  <span class="fss-line">
                    {spool.colorName}
                  </span>
                ) : null}
              </div>
              <div class="fss-spool-sub">
                {getSpoolBrandLine(spool)}
              </div>
              {spool.location ? (
                <div class="fss-chips">
                  <Chip intent="accent">
                    {describeLocation({
                      location: spool.location,
                      printers: data.printers,
                    })}
                  </Chip>
                </div>
              ) : null}
            </div>
          </div>
          <div class="fss-facts">
            <Fact
              label="Scale"
              value={
                data.scale.isOnline
                  ? formatGrams(data.scale.grams)
                  : "—"
              }
              unit={data.scale.isOnline ? "g" : undefined}
              isMuted={!data.scale.isOnline}
            />
            <Fact
              label="Remaining"
              value={
                data.scale.isOnline
                  ? formatGrams(netGrams)
                  : "—"
              }
              unit={
                data.scale.isOnline
                  ? `g · ${getPercentOfLabel({ grams: netGrams, labelWeightGrams: spool.labelWeightGrams })}%`
                  : undefined
              }
              isMuted={!data.scale.isOnline}
            />
            <Fact
              label="BambuBuddy"
              value={formatGrams(spool.remainingGrams)}
              unit={`g · ${getPercentOfLabel({ grams: spool.remainingGrams, labelWeightGrams: spool.labelWeightGrams })}%`}
            />
          </div>
        </div>
        <div class="fss-actions">
          <button
            type="button"
            class={
              isSaved
                ? "fss-btn is-success"
                : "fss-btn is-primary"
            }
            disabled={isPending || !data.scale.isOnline}
            onClick={onSave}
          >
            {isSaved
              ? `Saved ${formatGrams(netGrams)} g remaining`
              : isPending
                ? "Saving…"
                : data.scale.isOnline
                  ? `Save ${formatGrams(netGrams)} g remaining`
                  : "Scale offline"}
          </button>
          <button
            type="button"
            class="fss-btn"
            onClick={onAssign}
          >
            Assign to an AMS slot
          </button>
        </div>
      </div>
    </>
  )
}

const UnknownTag = ({
  data,
  onCopy,
  onLink,
}: {
  data: SpoolsData
  onCopy: () => void
  onLink: () => void
}) => (
  <>
    <div class="fss-title-row">
      <h1 class="fss-title">Spool</h1>
      <Chip intent="warning">
        {["Unknown tag", data.tag.tagType]
          .filter(Boolean)
          .join(" · ")}
      </Chip>
    </div>
    <div class="fss-two-col">
      <div class="fss-stack">
        <div class="fss-card fss-hero">
          <Swatch size="big" isHatched />
          <div class="fss-hero-text">
            <div class="fss-spool-name">
              <span class="fss-line">Not in the</span>
              <span class="fss-line">inventory</span>
            </div>
            <div class="fss-spool-sub">
              This tag is not linked to a spool yet.
            </div>
          </div>
        </div>
        <div class="fss-facts">
          <Fact
            label="Scale"
            value={
              data.scale.isOnline
                ? formatGrams(data.scale.grams)
                : "—"
            }
            unit={data.scale.isOnline ? "g" : undefined}
            isMuted={!data.scale.isOnline}
          />
          <Fact label="Remaining" value="—" isMuted />
          <Fact
            label="Tag"
            value={data.tag.uid ?? "—"}
            isSmall
          />
        </div>
      </div>
      <div class="fss-actions">
        <button
          type="button"
          class="fss-btn is-primary"
          onClick={onCopy}
        >
          Copy an existing spool
        </button>
        <button
          type="button"
          class="fss-btn"
          onClick={onLink}
        >
          Link to a spool without a tag
        </button>
        <p class="fss-note">
          <b>New product?</b> Add it in BambuBuddy on the PC
          or with the AI, then scan again.
        </p>
      </div>
    </div>
  </>
)

export const FilamentSpoolScale = () => {
  const data = spools.value
  const screen = spoolScreen.value
  const [saveState, setSaveState] =
    useState<SaveState | null>(null)

  const tagState = data?.tag.state ?? "none"
  const tagUid = data?.tag.uid
  const matchedSpool =
    data && tagState === "matched"
      ? data.spools.find(
          (candidate) => candidate.id === data.tag.spoolId,
        )
      : undefined
  const isTagUnknown =
    tagState === "unknown" ||
    (tagState === "matched" && matchedSpool === undefined)
  const assignedSpool =
    data && screen.kind === "assign"
      ? data.spools.find(
          (candidate) => candidate.id === screen.spoolId,
        )
      : undefined

  /*
   * A screen that was opened FOR a tag closes when that tag leaves. The
   * picker has nothing to copy onto once the sticker is off the reader, and
   * the assign flow's spool is gone if the inventory no longer lists it.
   */
  useEffect(() => {
    if (screen.kind === "pick" && !isTagUnknown) {
      resetSpoolScreen()
    }
    if (
      screen.kind === "assign" &&
      assignedSpool === undefined
    ) {
      resetSpoolScreen()
    }
  }, [screen.kind, isTagUnknown, assignedSpool])

  /*
   * The dashboard's own record is what confirms a save: the next push
   * carries a new `lastScaleGrams` for the spool, and the button says
   * `Saved` for a moment. Until then it is pending; after too long with no
   * answer it becomes live again rather than staying stuck.
   */
  const lastScaleGrams = matchedSpool?.lastScaleGrams
  useEffect(() => {
    if (
      !saveState ||
      saveState.isSaved ||
      matchedSpool?.id !== saveState.spoolId ||
      lastScaleGrams === saveState.previousScaleGrams
    ) {
      return undefined
    }
    setSaveState({ ...saveState, isSaved: true })
    return undefined
  }, [saveState, matchedSpool?.id, lastScaleGrams])

  useEffect(() => {
    if (!saveState) {
      return undefined
    }
    const timerId = window.setTimeout(
      () => {
        setSaveState(null)
      },
      saveState.isSaved ? SAVED_SHOWN_MS : SAVE_PENDING_MS,
    )
    return () => {
      window.clearTimeout(timerId)
    }
  }, [saveState])

  if (!data) {
    return (
      <div class="fss" data-screen="waiting">
        <Stage
          title="Waiting for the scale"
          subtitle="CastKit has not heard from the reader yet."
        />
      </div>
    )
  }

  const assign = ({
    spoolId,
    printerId,
    amsId,
    trayId,
  }: {
    spoolId: string
    printerId: string
    amsId: number
    trayId: number
  }) => {
    assignSpoolToSlot({ spoolId, printerId, amsId, trayId })
    resetSpoolScreen()
  }

  if (screen.kind === "ams") {
    return (
      <div class="fss" data-screen="ams">
        <AmsOverview
          printers={data.printers}
          printerId={screen.printerId}
          scale={data.scale}
          matchedSpool={matchedSpool}
          onChoosePrinter={(printerId) => {
            spoolScreen.value = { kind: "ams", printerId }
          }}
          onAssign={(target) => {
            if (matchedSpool) {
              assign({
                spoolId: matchedSpool.id,
                ...target,
              })
            }
          }}
          onToggle={resetSpoolScreen}
        />
      </div>
    )
  }

  if (screen.kind === "pick" && tagUid !== undefined) {
    const pick = (spool: Spool) => {
      const tagFacts = {
        spoolId: spool.id,
        tagUid,
        tagType: data.tag.tagType,
        trayUuid: data.tag.trayUuid,
      }
      if (screen.mode === "copy") {
        copySpoolToTag(tagFacts)
      } else {
        linkSpoolTag(tagFacts)
      }
      resetSpoolScreen()
    }
    return (
      <div class="fss" data-screen="pick">
        <SpoolPicker
          mode={screen.mode}
          tagUid={tagUid}
          spools={data.spools}
          onPick={pick}
          onBack={resetSpoolScreen}
        />
      </div>
    )
  }

  if (screen.kind === "assign" && assignedSpool) {
    return (
      <div class="fss" data-screen="assign">
        <AssignFlow
          spool={assignedSpool}
          printers={data.printers}
          printerId={screen.printerId}
          amsId={screen.amsId}
          onChoosePrinter={(printerId) => {
            spoolScreen.value = { ...screen, printerId }
          }}
          onChooseAms={(amsId) => {
            spoolScreen.value = { ...screen, amsId }
          }}
          onChooseSlot={(trayId) => {
            if (
              screen.printerId !== undefined &&
              screen.amsId !== undefined
            ) {
              assign({
                spoolId: assignedSpool.id,
                printerId: screen.printerId,
                amsId: screen.amsId,
                trayId,
              })
            }
          }}
          onBack={() => {
            spoolScreen.value =
              screen.amsId !== undefined
                ? { ...screen, amsId: undefined }
                : screen.printerId !== undefined
                  ? { ...screen, printerId: undefined }
                  : { kind: "spool" }
          }}
        />
      </div>
    )
  }

  const footer = (
    <SpoolFooter
      left={<ScaleStatus scale={data.scale} />}
      right={
        <ViewToggle
          target="ams"
          onTap={() => {
            spoolScreen.value = { kind: "ams" }
          }}
        />
      }
    />
  )

  if (matchedSpool) {
    return (
      <div class="fss" data-screen="matched">
        <MatchedSpool
          data={data}
          spool={matchedSpool}
          saveState={saveState}
          onSave={() => {
            saveSpoolWeight({
              spoolId: matchedSpool.id,
              grams: data.scale.grams,
            })
            setSaveState({
              spoolId: matchedSpool.id,
              previousScaleGrams:
                matchedSpool.lastScaleGrams,
              isSaved: false,
            })
          }}
          onAssign={() => {
            spoolScreen.value = {
              kind: "assign",
              spoolId: matchedSpool.id,
            }
          }}
        />
        {footer}
      </div>
    )
  }

  if (isTagUnknown) {
    return (
      <div class="fss" data-screen="unknown">
        <UnknownTag
          data={data}
          onCopy={() => {
            spoolScreen.value = {
              kind: "pick",
              mode: "copy",
            }
          }}
          onLink={() => {
            spoolScreen.value = {
              kind: "pick",
              mode: "link",
            }
          }}
        />
        {footer}
      </div>
    )
  }

  return (
    <div class="fss" data-screen="ready">
      <Stage
        title="Ready to scan"
        subtitle="Put a spool on the scale."
        hint="A Bambu tag or an NTAG sticker is read by itself."
      />
      {footer}
    </div>
  )
}
