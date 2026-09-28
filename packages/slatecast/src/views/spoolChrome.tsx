import type { SpoolsData } from "@castkit/shared/viewData/types"
import type { ComponentChildren } from "preact"
import { formatGrams } from "./spoolFormat.ts"

/**
 * The chrome every screen of the Filament Spool Scale view shares: the footer
 * row, the scale-and-reader status in its left corner, and the Spool/AMS
 * toggle in its right.
 */

/** The footer: whatever sits at the left, whatever sits at the right. */
export const SpoolFooter = ({
  left,
  right,
}: {
  left: ComponentChildren
  right: ComponentChildren
}) => (
  <footer class="fss-foot">
    <div class="fss-foot-left">{left}</div>
    <div class="fss-foot-right">{right}</div>
  </footer>
)

/**
 * The scale and the reader, each with a dot. The scale's dot goes red when
 * the reader reports it offline, and the reading is replaced by the word:
 * a stale number beside a red dot would still be read as a weight.
 */
export const ScaleStatus = ({
  scale,
}: {
  scale: SpoolsData["scale"]
}) => (
  <div class="fss-status" role="status">
    <span class="fss-status-item">
      <i
        class={
          scale.isOnline ? "fss-dot" : "fss-dot is-danger"
        }
        aria-hidden="true"
      />
      {scale.isOnline
        ? `Scale ${formatGrams(scale.grams)} g`
        : "Scale offline"}
    </span>
    <span class="fss-status-item">
      <i class="fss-dot" aria-hidden="true" />
      Reader
    </span>
  </div>
)

/** An AMS box: a lid with three dividers. */
const AmsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M7 6v13M12 6v13M17 6v13M3 11h18" />
  </svg>
)

/** A spool seen end-on: a rim and a hub. */
const SpoolIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

/**
 * The pill that flips the view between the reader's screen and the AMS
 * overview. It names the OTHER side, the one a tap opens.
 */
export const ViewToggle = ({
  target,
  onTap,
}: {
  target: "ams" | "spool"
  onTap: () => void
}) => (
  <button type="button" class="fss-toggle" onClick={onTap}>
    {target === "ams" ? <AmsIcon /> : <SpoolIcon />}
    {target === "ams" ? "AMS" : "Spool"}
  </button>
)

/** The chip beside a title. */
export const Chip = ({
  intent = "neutral",
  hasDot = false,
  children,
}: {
  intent?: "neutral" | "accent" | "success" | "warning"
  hasDot?: boolean
  children: ComponentChildren
}) => (
  <span class={`fss-chip is-${intent}`}>
    {hasDot ? (
      <i class="fss-dot" aria-hidden="true" />
    ) : null}
    {children}
  </span>
)
