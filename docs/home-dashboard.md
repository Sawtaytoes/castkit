# Home dashboards

Household views opt into content-sized dashboard groups through panel settings. This keeps rooms, related metrics, camera feeds, and controls together on one scrolling surface. Existing working compositions and physical display assignments keep their configured layouts.

All settings are available in Management:

- **Dashboard group:** panels with the same key share one card, in original panel order.
- **Dashboard group title, group color, and group width:** choose the heading, token-based accent, and one-column or full-width treatment.
- **Presentation → Home dashboard:** compact entity cards with visible actions, brightness indicators, temperature controls, and expandable history.
- **Individual controls:** JSON mapping a group entity ID to bound child entity IDs. Children require their own channel permissions and visibility conditions. Individual light controls mount when expanded.
- **Camera labels:** JSON mapping camera IDs to short names. A camera-only dashboard becomes a consistent camera wall. Expand opens the existing media element; Escape closes it and returns focus.

A light at half brightness shows a half-filled indicator. An off light shows zero despite retained brightness. Color, white-temperature, and effect controls follow reported capabilities; unsupported controls are omitted. The producer must provide `supported_color_modes`, temperature limits, and `effect_list` where applicable. Effect commands use the same narrow `turn_on` parameter allowlist as brightness and color.

Numeric history uses Charcuterie's portable chart renderer for summaries and its native Preact interactive chart when **Explore history** opens. Missing observations remain gaps. The chart and household control modules load on demand so existing device kiosks retain a small initial bundle.

Controls still pass through the existing panel, source, session, entity, action, visibility, and confirmation checks. Read-only or disconnected cards keep their controls visible and disabled. Unavailable camera feeds retain their card dimensions and show their status.
