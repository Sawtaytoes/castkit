# Cutter Status view

Cutter Status is a browser view bound to a `cutters.v1` channel. It shows each
vinyl or paper cutter a Cuttero server drives: whether the cutter is connected and where it is plugged in, the job it
is working through with an estimated finish, that job's cut lines, and the last
few jobs.

The card is the Printer Status card — the same head, state chip, progress band
and metric blocks — so a cutter beside a printer reads as the same kind of
thing. Where the printer card shows a plate picture, this one draws the job's
own cut lines on the sheet they will be cut from.

## The source

Add a **Cuttero** source with the server's URL. Cuttero needs no credential to
read, so the source has no secret. It polls two read-only routes every
`pollSeconds` (default 5):

| Route | Read for |
| --- | --- |
| `GET /api/devices` | Each cutter: `name`, `isOnline`, `isCutterConnected`, `firmwareVersion`, `hostLabel`, `model`, `activeJobId`, `updatedAt` |
| `GET /api/jobs?limit=25` | Every cutter's recent jobs, matched by `deviceName` |
| `GET /api/models/<model id>/image` | The cutter's product picture, through the channel media proxy, only for a model a device reported |

⚠️ **The source never writes to Cuttero.** It advertises no actions, so the
platform refuses every action a panel asks for. No cut, trace, reset, or cancel
is ever sent from CastKit; those belong to Cuttero's own page.

A channel's **Cutters** setting picks cutters by their Cuttero device name.
Leave it empty for every cutter.

### What the contract carries

- `name` is the model (`vendor name`), or the device name for a cutter Cuttero
  does not recognize. `hostLabel` is the computer the cutter is plugged into;
  Cuttero's `hostName` is a container id and is not shown.
- `isOnline` is the computer that drives the cutter. `isCutterConnected` is the
  cutter answering on its USB cable, and is never true through an offline
  computer.
- `currentJob` is the job the cutter is working through: `queued`, `sent` or
  `cutting`. `recentJobs` are up to five finished, failed, or canceled jobs,
  newest first.
- `isTrace` marks a "trace the outline" job: the head moves with the blade up,
  so it cuts nothing (zero tool-down travel). A trace can be the current job;
  it is never listed as a recent job.
- The cut lines are path data, never SVG. The source reads the `d` attribute
  of each `<path>` in Cuttero's preview, keeps only the path-data alphabet
  (`svgPathData` in the contract), and drops the gray reference lines a trace
  draws. A weedbox and a trace route keep their own kind and are drawn dashed.
  A preview over 150,000 characters of path data is dropped whole, never
  truncated. A job recorded before Cuttero added `sheet` to its preview falls
  back to the SVG's `viewBox`, which is in sheet millimeters.

Cuttero serves its model images as SVG. The channel media route accepts
`image/svg+xml` for that, and serves it with
`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`:
inside an `<img>` an SVG runs no script, but opened on its own at the media URL
it would otherwise run in CastKit's origin.

## The countdown is an estimate

⚠️ **The cutter does not report that a job is finished.** It buffers the whole
stream and stops answering about it. Cuttero estimates the cut time from the
travel and the speed, sets `expectedDoneAt`, and marks the job `done` when that
estimate runs out. The view says so everywhere:

| Job | Band | Chip |
| --- | --- | --- |
| `queued` | `Waiting to send` · `Takes about 3 min` | Waiting |
| `sent` | `Sending to the cutter` · `Takes about 3 min` | Sending |
| `cutting` | `Cutting — about 2 min left` · `Done about 1:35p` | Cutting |
| `cutting`, past its estimate | `Should be finished (estimated)` · `Expected about 1:35p` | Cutting |
| `done` | `Finished (estimated)` · `Ended about 1:32p` | Finished |
| `failed` | `Failed` and Cuttero's error text | Failed |
| `canceled` | `Canceled before sending` | Canceled |

A finished, failed, or canceled job stays the card's headline for ten minutes
after it ends, so a person who walks over after the cutter stops still reads
what happened. After that the card goes back to `Ready to cut`. Durations are
rounded up and always say "about". The band's fill is the share of the
estimate that has passed, not a measurement.

By the [freshness rule](display-properties.md), a panel that cannot keep
"about 2 min left" true while it draws gets only the clock time,
`Done about 1:35p`. The view spec's `minimumRepaint` is `fast`, like Printer
Status.

## The other states

- **Ready**: connected, nothing cutting. The card shows the cutter's picture,
  `Ready to cut`, and the recent jobs.
- **Not connected**: the computer is online but the cutter is not answering.
  The card says `The cutter is not answering. Turn it on and check its USB
  cable to <host>.`
- **Offline**: Cuttero has not heard from the computer that drives the cutter.
  The card says when it last did. The recent jobs stay on the card.

The recent jobs are a column that wraps into a clipped second column, so a row
that does not finish on the panel is not drawn at all. See
[panel limits](panel-limits.md) for when the list is left out entirely.

## Activity

A `cutters.v1` channel is **active** while any cutter has a current job. In an
active-only composition the panel steps aside when every cutter is idle, like a
printer channel with no printers.

## Adding it to a display

1. **Manage → Sources → Add source.** Choose **Cuttero** and enter the Cuttero
   server's URL.
2. Add a channel of type `cutters.v1` on that source. Leave **Cutters** empty
   for every cutter.
3. **Manage → Views → Add view.** Add a panel, choose **Cutter Status**, and
   bind its **Data** input to the channel.
4. Assign the view to a display or a screen.

The view has no write controls, so it can be public.

## Previews

`Views/Cutter Status` in the panel-rendered Storybook carries every state
above on fixture data, plus one story per browser panel profile. The designs
are invented geometry (a star, gift tags, block letters), never a real job's
cut lines: a real preview is somebody's own artwork.
