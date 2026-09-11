import userEvent from "@testing-library/user-event"

/**
 * Drag the Now Playing artwork through `offsets` pixels from where the finger
 * landed, then release unless `isReleased` is false.
 *
 * The artwork is the transport: a release inside the slop band is play/pause,
 * a release past a third of the frame's width is next (left) or previous
 * (right). Tests that used to click a transport button drive this instead.
 *
 * The frame is given real layout first: most test files load no stylesheet,
 * so without it `clientWidth` is zero and the handler has no width to measure
 * the commit distance against — the same reason the seek-bar test sizes its
 * track.
 */
export const dragArtwork = async ({
  offsets,
  isReleased = true,
}: {
  offsets: readonly number[]
  isReleased?: boolean
}) => {
  const frame = document.querySelector(
    ".artwork-frame",
  ) as HTMLElement
  frame.style.width = "200px"
  frame.style.height = "200px"
  const rect = frame.getBoundingClientRect()
  const pointAt = (offsetX: number) => ({
    target: frame,
    coords: {
      clientX: rect.left + 100 + offsetX,
      clientY: rect.top + 100,
    },
  })
  const user = userEvent.setup()
  await user.pointer([
    { ...pointAt(0), keys: "[MouseLeft>]" },
    ...offsets.map(pointAt),
    ...(isReleased
      ? [
          {
            ...pointAt(offsets.at(-1) ?? 0),
            keys: "[/MouseLeft]",
          },
        ]
      : []),
  ])
}

/** A swipe far enough left to change to the next track. */
export const swipeToNextTrack = () =>
  dragArtwork({ offsets: [-30, -90] })
