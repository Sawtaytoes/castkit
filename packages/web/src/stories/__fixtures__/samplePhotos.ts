/**
 * The committed CC0 sample photos, served by Storybook from `staticDirs` at
 * `/sample-photos/`. Provenance and licences are in
 * `assets/sample-photos/CREDITS.md`.
 *
 * The server hands `PhotoFrameView` a `data:` URI, because Chromium renders
 * offline with no origin to fetch from. In a browser a plain URL behaves
 * identically in the `<img src>`, and the rasterizer inlines it before
 * dithering, so the stories use URLs.
 */

export type SamplePhoto = {
  url: string
  label: string
  orientation: "portrait" | "landscape"
}

export const SAMPLE_PHOTOS = {
  portraitFace: {
    url: "/sample-photos/portrait-face.jpg",
    label: "Portrait — single face",
    orientation: "portrait",
  },
  portraitFaceSecond: {
    url: "/sample-photos/portrait-face-second.jpg",
    label: "Portrait — second face (Duo pairing)",
    orientation: "portrait",
  },
  highContrast: {
    url: "/sample-photos/landscape-highcontrast.jpg",
    label: "Hard edges and deep shadow",
    orientation: "landscape",
  },
  gradient: {
    url: "/sample-photos/landscape-gradient.jpg",
    label: "Smooth sky gradient",
    orientation: "landscape",
  },
  colour: {
    url: "/sample-photos/landscape-colour.jpg",
    label: "Saturated colour, dense detail",
    orientation: "landscape",
  },
  neutralText: {
    url: "/sample-photos/landscape-neutral-text.jpg",
    label: "Signage and lettering",
    orientation: "landscape",
  },
} as const satisfies Record<string, SamplePhoto>

export const SAMPLE_PHOTO_LIST: readonly SamplePhoto[] =
  Object.values(SAMPLE_PHOTOS)

/**
 * A photo whose orientation suits the panel — the 540×960 M5Paper wants a
 * portrait, the landscape panels want a landscape — so the matrix does not
 * letterbox every cell just to prove a point.
 */
export const pickPhotoForPanel = ({
  width,
  height,
}: {
  width: number
  height: number
}) =>
  height > width
    ? SAMPLE_PHOTOS.portraitFace
    : SAMPLE_PHOTOS.colour
