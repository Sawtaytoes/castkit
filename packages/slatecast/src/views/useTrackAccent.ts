import { useEffect, useState } from "preact/hooks"
import {
  extractTrackAccentColor,
  getTrackAccentColor,
} from "../accentColor.ts"
import { safeMediaUrl } from "../platform/protocol.ts"

/** Share artwork-derived color and discard responses for a track that has changed. */
export const useTrackAccent = ({
  trackKey,
  artworkPath,
}: {
  trackKey: string
  artworkPath?: string
}) => {
  const [accent, setAccent] = useState<string>()
  useEffect(() => {
    const imageUrl = safeMediaUrl(artworkPath)
    setAccent(
      (trackKey ? getTrackAccentColor(trackKey) : null) ??
        undefined,
    )
    if (!imageUrl || !trackKey) return
    const pending = { isCurrent: true }
    void extractTrackAccentColor({
      imageUrl,
      trackKey,
    }).then((color) => {
      if (pending.isCurrent) setAccent(color ?? undefined)
    })
    return () => {
      pending.isCurrent = false
    }
  }, [trackKey, artworkPath])
  return accent
}
