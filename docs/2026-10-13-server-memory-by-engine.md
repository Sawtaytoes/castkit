# Server memory by render engine (2026-10-13)

`pnpm bakeoff:server-memory` starts the built server (`packages/server/dist/index.js`) with
fixture panels at the four production image sizes, renders every view on every panel through
`POST /api/devices/:id/view` and `POST /api/devices/:id/render`, and samples the
proportional set size (PSS) of the whole process tree every 200 ms. PSS counts a shared page
once, so node and its Chromium children add up honestly. Run on the agent sandbox under
`build-budget` (two logical CPUs).

## Engines, all four panels, three rounds (120 renders each)

| Engine | Idle | Peak | Settled (10 s after) | Total time |
| --- | ---: | ---: | ---: | ---: |
| Chromium | 206 MiB (6 processes) | 1,954 MiB | 705 MiB | 412 s |
| Satori 0.56.1 | 133 MiB (1 process) | 1,842 MiB | 847 MiB | 357 s |

- The engine is worth about **70 MiB idle** (Chromium's resident browser) and about **13%
  of the time**. Satori runs inside the node process only while a render is in progress.
- The peak is not the engine. Both peak near 1.9 GB.
- Chromium cannot leave production by switching the engine: the Watchy platform screens
  are captured from a live page through `renderPage` about once a minute, and the Satori
  engine has no `renderUrl`.

## Satori, one panel at a time (one round, 10 views)

| Panel | Peak | Time |
| --- | ---: | ---: |
| 250x122 monochrome | 239 MiB | 1.4 s |
| 800x480 Spectra 6 | 759 MiB | 18.8 s |
| 960x540 16-gray | 815 MiB | 12.5 s |
| 1600x1200 Spectra 6 | 1,839 MiB | 81.5 s |

## Where the peak comes from

A CPU profile of the 1600x1200 run (`NODE_OPTIONS=--cpu-prof`) puts the time in palette
dithering, not rendering: image-q's per-pixel `Point` objects (`__defNormalProp` 25.7%,
`_nearestPointFromCache` 19.2%, `fromUint32Array` 2.4%, `Point` 1.1%), the garbage collector
(14.8%), and `quantize` (6.9%). Satori's own render was 3.3%. A Spectra 6 panel quantizes
every frame twice (`quantizeWithNeutralProtection`: full palette, then black and white for
neutral pixels), so a 1600x1200 frame builds about 3.8 million objects.

## After switching production to Satori: the allocator (2026-10-14)

With `INKCAST_RENDER_ENGINE=satori` in production, the server's node process settled near
615 MiB PSS against about 426 MiB on Chromium. An inspector reading showed a 224 MiB V8 heap
and 36 MiB of external buffers, so about 390 MiB was native memory. `/proc/<pid>/smaps` held
at least 17 glibc malloc arenas (64 MiB-aligned anonymous heaps) with at least 228 MiB
resident: with Satori, node itself handles the supersampled rasters in sharp's and resvg's
native threads, and glibc keeps each thread's freed memory.

`pnpm bakeoff:server-memory satori 3 --concurrent` (all four panels at once, as production
renders them) in a throwaway container from the production image, limited to 2 CPUs:

| Allocator | Peak | Settled (10 s after) | Time |
| --- | ---: | ---: | ---: |
| glibc | 532 / 567 MiB | 427 / 433 MiB | 51 / 62 s |
| glibc, `MALLOC_ARENA_MAX=2` | 521 MiB | 351 MiB | 48 s |
| jemalloc, defaults | 833 / 867 MiB | 274 / 363 MiB | 55 / 56 s |
| jemalloc, `background_thread:true,dirty_decay_ms:1000,muzzy_decay_ms:0` | 580 MiB | 193 MiB | 53 s |

The image now preloads jemalloc with the last configuration for the node server only; the
server strips `LD_PRELOAD` and `MALLOC_CONF` from its environment at start, so Chromium and
the Python stream workers keep their normal allocators.
