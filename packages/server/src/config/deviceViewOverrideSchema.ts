import * as z from "zod/mini"

/** Only existing panel inputs and presentation settings can vary by installation. */
export const deviceViewOverrideSchema = z.optional(
  z.record(
    z.string(),
    z.strictObject({
      name: z.optional(
        z.string().check(z.minLength(1), z.maxLength(160)),
      ),
      panels: z.record(
        z.string(),
        z.strictObject({
          bindings: z.optional(
            z.record(z.string(), z.string()),
          ),
          settings: z.optional(
            z.record(z.string(), z.unknown()),
          ),
        }),
      ),
    }),
  ),
)
