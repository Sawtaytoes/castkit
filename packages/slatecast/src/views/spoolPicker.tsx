import { useState } from "preact/hooks"
import { SpoolFooter } from "./spoolChrome.tsx"
import {
  formatGrams,
  getSpoolProductName,
  type Spool,
} from "./spoolFormat.ts"
import { Swatch } from "./spoolSwatch.tsx"

/**
 * The inventory grid an unknown tag opens. Two modes on one screen: COPY
 * makes a new spool from the tapped one's product and links this tag to it;
 * LINK puts this tag on a spool that has none yet, so the list is only those.
 *
 * The tiles are a grid, not rows: a swatch is a picture the eye anchors on.
 * Three columns at the panel's width, and the grid scrolls — the third row is
 * cut by the panel on purpose, so the cut says there is more.
 */
export const SpoolPicker = ({
  mode,
  tagUid,
  spools,
  onPick,
  onBack,
}: {
  mode: "copy" | "link"
  tagUid: string
  spools: readonly Spool[]
  onPick: (spool: Spool) => void
  onBack: () => void
}) => {
  const [brand, setBrand] = useState<string | null>(null)
  const candidates =
    mode === "link"
      ? spools.filter((spool) => spool.tagUid === undefined)
      : spools
  const brands = candidates
    .map((spool) => spool.brand)
    .filter((name): name is string => name !== undefined)
    .filter(
      (name, index, all) => all.indexOf(name) === index,
    )
  const shown =
    brand === null
      ? candidates
      : candidates.filter((spool) => spool.brand === brand)

  return (
    <>
      <div class="fss-title-row">
        <h1 class="fss-title">
          {mode === "copy"
            ? "Copy which spool?"
            : "Link which spool?"}
        </h1>
        <span class="fss-subtitle">for tag {tagUid}</span>
      </div>
      {brands.length > 1 ? (
        <div class="fss-filters">
          <button
            type="button"
            class={
              brand === null
                ? "fss-chip is-accent"
                : "fss-chip is-neutral"
            }
            onClick={() => setBrand(null)}
          >
            All brands
          </button>
          {brands.map((name) => (
            <button
              key={name}
              type="button"
              class={
                brand === name
                  ? "fss-chip is-accent"
                  : "fss-chip is-neutral"
              }
              onClick={() => setBrand(name)}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <div class="fss-empty">
          <p class="fss-subtitle">
            {mode === "link"
              ? "Every spool in the inventory has a tag."
              : "The inventory is empty."}
          </p>
          <p class="fss-hint">
            Add the product in BambuBuddy on the PC or with
            the AI, then scan again.
          </p>
        </div>
      ) : (
        <div class="fss-spool-grid">
          {shown.map((spool) => (
            <button
              key={spool.id}
              type="button"
              class="fss-tile"
              onClick={() => onPick(spool)}
            >
              <Swatch
                rgba={spool.rgba}
                extraColors={spool.extraColors}
                effectType={spool.effectType}
              />
              <span class="fss-tile-text">
                <span class="fss-tile-name">
                  <span class="fss-line">
                    {getSpoolProductName(spool)}
                  </span>
                  {spool.colorName ? (
                    <span class="fss-line">
                      {spool.colorName}
                    </span>
                  ) : null}
                </span>
                <span class="fss-tile-meta">
                  {[
                    spool.brand,
                    mode === "copy"
                      ? `core ${formatGrams(spool.coreWeightGrams)} g`
                      : `${formatGrams(spool.remainingGrams)} g left`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <SpoolFooter
        left={
          <button
            type="button"
            class="fss-btn is-small"
            onClick={onBack}
          >
            Back
          </button>
        }
        right={
          <span class="fss-hint">
            {mode === "copy"
              ? "Tap a spool to copy it to this tag."
              : "Tap the spool this tag is on."}
          </span>
        }
      />
    </>
  )
}
