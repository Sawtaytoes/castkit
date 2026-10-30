# Touch queue scrolling evidence

All images use the local real-server fixture: 46 numbered tracks, with track 22
current, on a 480 × 480 touch panel. No production data appears here.

- `baseline.png`: pre-change master, after a vertical drag; only the seven
  fitted rows exist, the list cannot scroll, and the navigation overlay opens.
- `initial.png`: the fixed queue opens around the current track, with all 46
  rows available below and above the viewport.
- `scrolled.png`: after a native Chromium touch drag, later tracks are visible.
  The real-server test verifies no playback or view command was sent.

The bottom edge still requests another view. The change preserves complete-row
fitting on passive displays. Tests repeat across all four named browser windows;
this fixture explicitly sets the square panel dimensions in each project.
