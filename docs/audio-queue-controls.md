# Audio queue controls

Touch-capable device pages offer full-row buttons for the current and next audio
tracks. Select the next row to send the same `next` transport command as an artwork
swipe. Select a stopped current row to resume with `play_pause`; while it is playing,
that row is disabled so selecting it never pauses the music. Buttons work with touch,
pointer and keyboard. A committed view swipe cancels row activation.

The legacy Music Assistant publisher supplies current and next items. This feed has
no stable queue-item identifiers, so additional rows from other publishers remain
passive instead of guessing which transport command would reach them. Arbitrary
queue jumps require a source contract that identifies and plays a specific item.
Touchless device pages and Print Queue remain read-only. Composed platform queue
panels retain their existing source and control behavior.

Now Playing uses its existing artwork-derived, contrast-adjusted accent for seek and
volume fills, both slider knobs, the volume icon and elapsed/total time labels. A new
cover replaces the accent; missing, undecodable or inaccessible artwork falls back
to the current theme. Black-and-white covers derive a readable gray accent rather
than an unrelated theme hue. Monochrome and grayscale profiles keep their theme colors.
