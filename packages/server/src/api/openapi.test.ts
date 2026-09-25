import { describe, expect, test } from "vitest"
import { loadConfig } from "../config/env.ts"
import { buildOpenApiDocument } from "./openapi.ts"

describe("buildOpenApiDocument", () => {
  const document = buildOpenApiDocument({
    config: loadConfig({}),
  })

  test("is an OpenAPI 3.1 document", () => {
    expect(document.openapi).toBe("3.1.0")
  })

  test("documents the device and display platform surfaces", () => {
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/health",
        "/api/devices",
        "/api/devices/{id}/image",
        "/api/devices/{id}/refresh",
        "/api/devices/{id}/view",
        "/api/manage/platform",
        "/api/display/{kind}/{id}",
        "/api/display/{kind}/{id}/actions",
        "/api/access/unlock",
      ]),
    )
  })

  test("the SetViewRequest schema lists the valid views", () => {
    const schema = document.components.schemas
      .SetViewRequest as {
      properties: { view: { enum: string[] } }
    }
    expect(schema.properties.view.enum).toEqual([
      "Now Playing (Dashboard)",
      "Now Playing (Poster)",
      "Photo Frame",
      "Photo Frame (Fill)",
      "Photo Frame (Duo)",
      "Photo Frame (Agenda)",
      "Clock",
      "Clock (Weather)",
      "Clock (Agenda)",
      "Agenda",
    ])
  })

  test("keeps public endpoints open while documenting the management session", () => {
    expect(document.security).toBeUndefined()
    expect(
      document.components.securitySchemes.sessionCookie,
    ).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "castkit-session",
    })
  })
})
