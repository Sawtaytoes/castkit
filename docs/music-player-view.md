# Music Player view

Music Player is a browser view bound to a `music-player.v1` channel. It is a
compact Music Assistant controller for a small desk display — drawn at
1024 x 600 and usable with a mouse — that shows the player, the queue, and the
track's lyrics together.

The view is not a Sendspin player. It controls players that Music Assistant
already has; it plays no audio itself.

## Layouts

The view's **Layout** setting picks one of two faces. Both share the same
controls, queue, and lyrics.

| Layout | Shape |
| --- | --- |
| **Side by side** (default) | The player on the left — artwork, title, waveform seek bar, transport, volume, and the player menu. The queue or lyrics fill the right. |
| **Wide waveform** | One strip across the top — small artwork, title, and a full-width waveform — with the transport under it, and the queue or lyrics at full width below. |

Below 720 px wide the side panel is hidden and the player stands alone. Below
480 px tall the artwork is hidden.

## The queue

The queue is one list in three parts: **Played** (the last **Played tracks to
show** rows, default 2), **Now playing**, and **Up next** with the queue's total
count. The view draws only the rows that fit whole in the list; it never
scrolls, so the row at the bottom edge is never cut in half. Selecting an
upcoming or played row plays it. The current row is not a button.

There is no autoplay switch on the queue face. Shuffle and repeat sit in the
transport row; repeat steps off → all → one.

## Lyrics

The **Lyrics** tab shows the track's lyrics when Music Assistant has them.
Synced (LRC) lyrics follow the position: the line being sung is brightest and
stays centered, and selecting a line seeks to its time. Plain lyrics are shown
as text and do not seek. The tab is disabled for a track without lyrics, and
turning off the view's **Offer a Lyrics tab** setting hides it entirely.

## The player menu

The chip at the bottom of the player opens a menu with two parts:

- **Control** — which configured player the view drives. **Whichever is
  playing** (the default) follows the first configured player that is playing,
  then paused, then available. A manual pick holds until it is changed back.
- **Sync speakers** — every player Music Assistant allows to join this one,
  with a check for each member. Selecting a speaker adds or removes it. The
  list is read-only (**Speakers in this group**) for a fixed sync group, which
  Music Assistant does not let a client change, and an offline speaker cannot be
  selected.

## The source

Add a **Music Assistant** source with the server's URL and a long-lived token.
Give CastKit its own token, so it can be revoked alone; Music Assistant's
`auth/token/create` command makes one. The token stays on the CastKit server; the
view never sees it.

The source holds one WebSocket open to `<url>/ws`, authenticates with the
token, and reconnects with a backoff of 1 to 30 seconds. It reads:

| Command or event | Read for |
| --- | --- |
| `players/all`, `player_updated`, `player_added`, `player_removed` | Each configured player: name, state, volume, group members, and which speakers can join it |
| `player_queues/get_active_queue` | The queue a player is playing from — its own, or a group's |
| `player_queues/items`, `queue_updated`, `queue_items_updated` | A window of 3 played and 40 upcoming rows around the current row, plus shuffle and repeat |
| `queue_time_updated` | The position, republished only when it jumps 2 seconds or more; the view runs the clock between updates |
| `audio_analysis/wave_form` | The track's loudness, sampled to 300 peaks |
| `metadata/get_track_lyrics` | Synced or plain lyrics |
| `/imageproxy/<id>` | Artwork, through the channel media proxy |

A channel's **Players** setting lists the Music Assistant player ids the view
may control. The management form discovers them from the server.

### Actions

Every action is checked on the server before it is sent to Music Assistant.

| Action | Payload | Music Assistant command |
| --- | --- | --- |
| `play_pause`, `next`, `previous` | — | `player_queues/<action>` |
| `seek` | `positionSeconds` inside the track | `player_queues/seek` |
| `play_item` | `queueItemId` from the rows the view was sent | `player_queues/play_index` |
| `set_volume` | `volume` 0–100 | `players/cmd/volume_set`, or `group_volume` for a group |
| `shuffle` | `isEnabled` | `player_queues/shuffle` |
| `repeat` | `mode` off, one, or all | `player_queues/repeat` |
| `favorite` | `isFavorite` | `music/favorites/add_item` or `remove_item` |
| `set_member` | `playerId`, `isMember` | `players/cmd/set_members`, only when the player allows it and lists that speaker |
| `select_player` | `playerId` from the channel, or `automatic` | none; it changes which player the channel follows |

## The contract

`music-player.v1` carries the selected `player` (with its `members`), the
`players` the view may pick from, `isAutomaticSelection`, the `queue` window,
the `current` item with `isFavorite`, `positionSeconds` with the
`positionUpdatedAtMs` it was read at, a `waveform` of values from 0 to 1, and
`lyrics` with `isSynced` and timed `lines`. The schema is in
`packages/sdk/src/contracts.ts`.

The view counts as active while the selected player is playing.
