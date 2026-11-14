/**
 * `value`, or a thrown error when it is `null` or `undefined`.
 *
 * For a value the code knows is there but the type cannot show: the first
 * page of a paginated recipe, the regex group a match always fills, the
 * fixture a test just built. Unlike a `!` assertion, a wrong assumption fails
 * here, with a message, instead of somewhere later.
 */
export const defined = <Value>(
  value: Value | null | undefined,
) => {
  if (value === null || value === undefined) {
    throw new Error(`Expected a value, but it was ${value}`)
  }
  return value
}
