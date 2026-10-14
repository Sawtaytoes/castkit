import { VIEW_NAMES } from "@castkit/shared/views/viewNames"
import * as z from "zod/mini"

/**
 * zod/mini schemas for the HTTP API — the single source of truth for both
 * request validation and the generated OpenAPI document (via zod's native
 * `toJSONSchema`).
 */

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  views: z.array(z.string()),
})

/**
 * What a CastKit server says about itself, so a client scanning the network
 * can tell a CastKit server from any other web server on the same port.
 */
export const IdentityResponseSchema = z.object({
  product: z.literal("castkit"),
  publicUrl: z.nullable(z.string()),
})

export const DeviceSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  width: z.number(),
  height: z.number(),
  colorMode: z.enum(["monochrome", "spectra6"]),
  rotation: z.number(),
  activeView: z.string(),
})

export const DevicesResponseSchema = z.object({
  devices: z.array(DeviceSummarySchema),
})

export const SetViewRequestSchema = z.object({
  view: z.enum(VIEW_NAMES),
})

export const OkResponseSchema = z.object({
  ok: z.literal(true),
  view: z.optional(z.enum(VIEW_NAMES)),
})

export const ErrorResponseSchema = z.object({
  error: z.string(),
})
