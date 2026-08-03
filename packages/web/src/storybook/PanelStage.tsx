import type { SafeAreaInset } from "@castkit/core/panels/safeArea"
import { resolveSafeArea } from "@castkit/core/panels/safeArea"
import type { ViewName } from "@castkit/shared/views/viewNames"
import {
  getIsBleedView,
  getIsPhotoView,
} from "@castkit/shared/views/viewNames"
import type { ViewColourMode } from "@castkit/views/viewProps"
import { useEffect, useState } from "react"
import { pickPhotoForPanel } from "../stories/__fixtures__/samplePhotos.ts"
import { coverCropToDataUrl } from "./coverCropPhoto.ts"
import { buildStoryView } from "./storyViewCatalog.tsx"

/**
 * Renders one view exactly as the device receives it.
 *
 * The crop inset is not a CSS clip. The server lays the view out *inside* the
 * safe box — `resolveSafeArea` gives the content size, the element is built at
 * that size so its text reflows and re-fits to what survives the mat, and the
 * result is composited onto a full-size white panel at the inset offset. A
 * naive `overflow: hidden` would show the uncropped layout with its edges
 * chopped off, which is precisely the wrong answer. This calls the same
 * `resolveSafeArea` the server's `renderDeviceImage` does, so the two cannot
 * disagree about the box or the clamping.
 *
 * Bleed views — the photo-frame family — ignore the inset and fill the panel,
 * matching `pushController`'s `isBleedView ? undefined : {…}`.
 *
 * Photos are cover-cropped to the exact content pixels first (see
 * `coverCropToDataUrl`), so a view receives a photo the panel's own size — as
 * the server delivers it — and the dither rasterizer has nothing to mis-scale.
 */
export type PanelStageProps = {
  viewName: ViewName
  width: number
  height: number
  colourMode: ViewColourMode
  cropInset?: SafeAreaInset
  isEmpty?: boolean
  photoUrl?: string
}

export const PanelStage = ({
  viewName,
  width,
  height,
  colourMode,
  cropInset,
  isEmpty,
  photoUrl,
}: PanelStageProps) => {
  const isBleedView = getIsBleedView(viewName)
  const { inset, contentWidth, contentHeight } =
    resolveSafeArea({
      width,
      height,
      safeAreaInset: isBleedView ? undefined : cropInset,
    })

  const sourcePhotoUrl = getIsPhotoView(viewName)
    ? (photoUrl ?? pickPhotoForPanel({ width, height }).url)
    : undefined

  const [croppedPhotoUrl, setCroppedPhotoUrl] = useState<
    string | undefined
  >(undefined)

  useEffect(() => {
    if (!sourcePhotoUrl) {
      setCroppedPhotoUrl(undefined)
      return
    }
    const isCurrent = { value: true }
    coverCropToDataUrl({
      imageUrl: sourcePhotoUrl,
      width: contentWidth,
      height: contentHeight,
    })
      .then((dataUrl) => {
        if (isCurrent.value) {
          setCroppedPhotoUrl(dataUrl)
        }
      })
      .catch(() => {
        // Fall back to the raw URL; PhotoFrameView stretches it, which is worse
        // than a crop but better than an empty panel.
        if (isCurrent.value) {
          setCroppedPhotoUrl(sourcePhotoUrl)
        }
      })
    return () => {
      isCurrent.value = false
    }
  }, [sourcePhotoUrl, contentWidth, contentHeight])

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        backgroundColor: "#ffffff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: inset.left,
          top: inset.top,
          width: contentWidth,
          height: contentHeight,
        }}
      >
        {buildStoryView({
          viewName,
          width: contentWidth,
          height: contentHeight,
          colourMode,
          isEmpty,
          photoUrl: croppedPhotoUrl ?? sourcePhotoUrl,
        })}
      </div>
    </div>
  )
}
