# Native LVGL trial

`native_lvgl.py` is an experimental host renderer for a Presto with the
`native_scene` API action from `esphome-presto/examples/native-scene.yaml`.
It reads CastKit's existing display-view endpoint and converts its
`kids-points.v1` channel into a bounded list scene. The board scrolls the list
locally. Child, task-summary, and entry navigation remain read-only.

Run it with a protected copy of the normal ESPHome stream connection file:

```sh
python native_lvgl.py --config /path/to/stream.yaml \
  --view-url https://castkit.example/api/display/view/sample-points
```

The URL must use the configured manifest origin. This first trial accepts an
already-public view. It does not install credentials or weaken private-view
access. Pause the normal image-stream worker before a manual trial;
one board has one rendering owner. Restore that worker only after restoring
frame-receiver firmware. For an opt-in managed trial, the stream file may use
`transport: esphome-lvgl`, `native_view_url`, and the usual connection/health
fields. The existing worker supervisor then runs the native renderer, without
launching a capture browser. This prototype has no new management UI selector.

The scene carries a protocol version, revision, page identity, header, rows,
colors, row height, padding, gap, and corner radius. Firmware advertises limits
in its `Native Scene Status` entity and acknowledges applied revisions there;
click/scroll events use a separate entity. Stale events are ignored. Layout and
content updates need no firmware upload within these primitives; new primitive
types and font families still need firmware support.

The points panel's CastKit settings may contain `nativeScene` with `rowHeight`,
`gap`, `padding`, `radius`, and the five scene colors (`background`, `surface`,
`foreground`, `muted`, `accent`). The bridge reads these from the view endpoint,
so a normal management API update changes the board's layout without changing
the bridge or firmware. Dimensions and colors are bounded at both ends.

Limits: 32 rows, 6,144 UTF-8 bytes per scene, compiled Outfit fonts, completed
daily task history only, and full scene replacement with preserved scroll
offset on the same page. It does not yet provide running timers, music controls,
the normal swipe policy, automatic reconnection, or all display power policies.
It deliberately refuses an oversized history rather than displaying a silently
truncated total. Do not treat this trial as production feature parity.

`--benchmark --duration 20` opens the first child's task list and runs the local
12-second scroll animation. The log includes firmware-reported timing and
prefetch overruns. Diagnostics remain off the panel during this animation.
Those figures are implementation measurements; a person must still test
dragging, flinging, tapping, and picture stability on the glass.
