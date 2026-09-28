import { spools } from "../state.ts"

/**
 * Filament Spool Scale: the scale and tag reader beside the printers.
 *
 * FOUNDATION STUB. The real view (ready / matched / unknown tag / copy picker /
 * AMS / three-step assign) replaces this file; the stub exists so the view id
 * resolves to something on a panel while the pieces land. See
 * docs/filament-spool-scale-view.md.
 */
export const FilamentSpoolScale = () => {
  const data = spools.value
  return (
    <div class="idle">
      <div class="idle-title">Ready to scan</div>
      <div class="idle-label">
        {data
          ? `Scale reads ${Math.round(data.scale.grams)} g`
          : "Waiting for the scale"}
      </div>
    </div>
  )
}
