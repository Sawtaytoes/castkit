/**
 * Where the Photo Frame fetches its picture.
 *
 * In production this is always `/d/<id>/photo`, an endpoint the CastKit server
 * answers with a fresh face-cropped Immich photo per request. A Storybook
 * story has no server, and the endpoint is an absolute path from the origin
 * root, so nothing static can ever answer it — the view fell back to its
 * "No photos configured" placeholder and every Photo Frame story showed an
 * empty panel.
 *
 * A story therefore overrides the builder and points it at one of the repo's
 * sample photos, which Storybook serves as a static file. The override is the
 * same seam `__resetStateForTests` is: a module-scope value a harness replaces,
 * rather than a prop threaded through a view that has no other reason to take
 * one.
 */

type PhotoUrlBuilder = (options: {
  deviceId: string
  rotationCounter: number
}) => string

const buildServedPhotoUrl: PhotoUrlBuilder = ({
  deviceId,
  rotationCounter,
}) => `/d/${deviceId}/photo?n=${rotationCounter}`

const photoUrlBuilder: { build: PhotoUrlBuilder } = {
  build: buildServedPhotoUrl,
}

export const buildPhotoUrl: PhotoUrlBuilder = (options) =>
  photoUrlBuilder.build(options)

/** Point the Photo Frame at a static file. Stories and tests only. */
export const __setPhotoUrlBuilderForStories = (
  build: PhotoUrlBuilder | null,
) => {
  photoUrlBuilder.build = build ?? buildServedPhotoUrl
}
