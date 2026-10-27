# A list scrolls on the Presto over a picture drawn ahead

- **Status:** Accepted
- **Date:** 2026-10-26
- **Type:** Performance and architecture
- **Supersedes:** None
- **Superseded by:** None

## Decision

On a Presto whose firmware has a scroll window (`Sawtaytoes/esphome-presto` #8), a drag
on a list marked `data-castkit-scroll` is scrolled by the board alone. The worker draws
the whole list ahead as one picture (`scroll_window.py`), uploads it into the board's
PSRAM, and asks the board to scan panel rows `[top, bottom)` out of that picture at an
offset. A vertical drag that starts on the window and travels 12 pixels is the board's:
it reports the contact as taken (touch flag 1), moves the scanout's source address with
the finger, glides after a fling, and reports `scroll_at,<picture>,<offset>` when the list
comes to rest. The worker then moves the page's list to the same `scrollTop`, so the page
and the glass agree before the next press.

The worker keeps the window honest:

1. It shows the window only when the panel's rows inside it already are the picture at
   the list's offset, compared in RGB before quantization, and only under the delivery
   lock with nothing in flight.
2. It hides the window before any frame that differs inside it, before a frame drawn
   ahead at a swipe, and before camera frames. The board hides it by itself for a full
   frame, a slot, a drop, the offline marker, and any upload into the picture. While a
   contact that began on the window is down, a differing frame is drawn under the window
   without hiding it, so the press can still become the board's drag; the next capture
   after the release decides.
3. It draws the picture again when the page has been still for half a second and its
   window rows are no longer the picture.

Geometry. The window is the list's padding box snapped inward to the board's 8-row
batches, at the full panel width. At offset `k` it shows the list as it looks at
`scrollTop` `k`, so the picture is the window's height plus every row the list can
scroll, and the board's largest offset is the list's largest `scrollTop`.

The stitch. The list is stepped through bands that overlap by 8 rows, each captured
after two animation frames, and put back where it was. A stitch is refused with a reason
(health JSON `scroll.refusal`) when an element covers the list, something plays inside
it, the document or an image changes while it is drawn, the overlaps disagree (a sticky
header), a column beside the list differs down the window rows, the list is too tall for
the board, or a touch arrives. The stitch and touch handling share a page lock; a touch
stops a stitch at the next band.

Protocol, on firmware that has it (CastKit falls back to the old path otherwise):

- `Display Codecs` adds `scroll=<rows>`, the picture's capacity.
- `scroll_chunk(frame_id, format, offset, final_chunk, image_data)`: the same chunked,
  base64 patch format as `slot_chunk`, zlib or RLE. Base 0 is the whole picture
  (x 0, y 0, 480 wide, `rows` high); a base equal to the board's picture is a patch
  inside it. The board answers `scroll,<frame_id>,<status>` on `Display Slot Events`.
- `scroll_show(frame_id, top, bottom, scroll_y)` and `scroll_hide()`. The board answers
  `scroll_window,<frame_id>,<status>,<top>,<bottom>,<offset>`; a hidden window is
  `scroll_window,0,0,0,0,0`.
- `touch,<seq>,<phase>,<x>,<y>,<flags>,<shown>,<offset>`: flag 1 the board took the
  contact (sent as phase 2; the worker cancels it with no tap and no swipe), flag 2 a
  window is shown at `offset`.
- `scroll_at,<frame_id>,<offset>` when a local scroll rests.

The worker shares one upload lock between slot uploads and picture uploads, because the
board takes one upload at a time and a new one abandons the old.

## Context

The owner found touch scrolling on the Presto "super laggy". Each drag step on a list
was a touch report to the worker, a `touchMove` into the page, a capture, a patch over
the board's Wi-Fi link, and a draw: touch to acknowledgement measured about 1050 ms
during a drag. The link and the board's decode dominate, so no worker-side change could
make a drag follow the finger. The Presto's display core already scans the framebuffer
out of PSRAM in 8-row batches; pointing a batch at another address costs nothing.

## Why

- The board can move a picture it holds at the panel's refresh rate with no PSRAM writes
  at all. Only the picture's upload uses the link, and that happens while the list is
  still.
- Drawing the picture with the page's own browser keeps one source of truth: the stitched
  rows are the pixels a live capture would show at that offset, and a Chromium test
  proves it at several offsets, including the quantized pixels on the 8-row grid.
- Comparing in RGB lets the window show at any offset. On the 8-row grid the quantized
  pixels are identical too; between those offsets only the ordered-dither phase differs.
- Showing only over matching rows, and hiding before any differing frame, means the
  window shows content the page no longer has for at most one capture.
- A refusal is cheap and visible: the list keeps today's path, and the health JSON says
  why.

Known limits:

- The rows of the list above and below the 8-row grid (up to 7 each) stay framebuffer
  rows; during a board drag they keep the last live frame.
- The window is full width, so anything beside the list must be still down its rows.
- The picture is zlib or RLE; there is no JPEG picture.
- Only the first marked list on the glass gets a window. Today that is the Tally Marks
  task list; the audio queue renders only the rows that fit and does not scroll.
- Not yet measured on a panel.

## Evidence

- Parent agent brief for this work: touch to acknowledgement during a drag measured about
  1050 ms; the owner described touch scrolling as "super laggy".
- Firmware: `Sawtaytoes/esphome-presto` #8, with 21 host tests for the window, latch,
  drag, glide, and upload paths (78 in total).
- `device-client/remote-display/test_scroll_window.py`: geometry, quantization, transport
  protocol, and real-Chromium stitch, show, hide, refusal, and touch-sync tests.
