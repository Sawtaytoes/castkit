import { z } from "zod"
import { platformSchemas } from "./platformStore.ts"

const json = (schema: unknown) => ({
  "application/json": { schema },
})
const response = {
  description: "Successful request",
  content: json({ type: "object" }),
}
const management = [
  { sessionCookie: [] },
  { bearerAuth: [] },
]
const pathId = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
}
const targetParameters = [
  {
    name: "kind",
    in: "path",
    required: true,
    schema: { type: "string", enum: ["view", "screen"] },
  },
  pathId,
]
const post = (
  summary: string,
  properties: Record<string, unknown>,
  required: string[] = [],
  security: unknown[] = [],
) => ({
  summary,
  security,
  requestBody: {
    required: true,
    content: json({ type: "object", properties, required }),
  },
  responses: {
    "200": response,
    "400": { description: "Invalid request" },
    "401": { description: "Unlock required" },
    "403": { description: "Access denied" },
    "429": { description: "Too many PIN attempts" },
  },
})
/** OpenAPI descriptions for named channels, saved views, kiosk access, and screen automation. */
export const buildPlatformOpenApi = () => {
  const collections = Object.entries(
    platformSchemas,
  ).flatMap(([collection, schema]) => {
    const { $schema, ...definition } =
      z.toJSONSchema(schema)
    const input = {
      ...definition,
      properties: {
        ...definition.properties,
        ...(collection === "sources"
          ? {
              secrets: {
                type: "object",
                additionalProperties: {
                  type: "string",
                  writeOnly: true,
                },
              },
            }
          : collection === "views" ||
              collection === "screens"
            ? {
                pin: {
                  type: "string",
                  minLength: 4,
                  writeOnly: true,
                },
              }
            : {}),
      },
    }
    const write = {
      summary: `Save ${collection}`,
      security: management,
      requestBody: { required: true, content: json(input) },
      responses: {
        "200": response,
        "201": response,
        "400": {
          description:
            "Invalid settings or incompatible binding",
        },
        "401": { description: "Management PIN required" },
      },
    }
    return [
      [
        `/api/manage/platform/${collection}`,
        { post: write },
      ],
      [
        `/api/manage/platform/${collection}/{id}`,
        {
          parameters: [pathId],
          put: write,
          delete: {
            summary: `Delete an unused ${collection} item`,
            security: management,
            responses: {
              "200": response,
              "409": {
                description:
                  "This item still has assignments",
              },
            },
          },
        },
      ],
    ]
  })
  return {
    ...Object.fromEntries(collections),
    "/api/manage/platform": {
      get: {
        summary:
          "List source, channel, view, screen, and plugin configuration",
        security: management,
        responses: {
          "200": response,
          "401": { description: "Management PIN required" },
        },
      },
    },
    "/api/views": {
      get: {
        summary:
          "List public and PIN-protected bookmark names",
        security: [],
        responses: { "200": response },
      },
    },
    "/api/access/session": {
      get: {
        summary:
          "Check management session and first setup status",
        security: [],
        responses: { "200": response },
      },
    },
    "/api/access/setup": {
      post: post(
        "Set the first management PIN using the private setup token",
        {
          pin: {
            type: "string",
            minLength: 4,
            writeOnly: true,
          },
          setupToken: { type: "string", writeOnly: true },
        },
        ["pin", "setupToken"],
      ),
    },
    "/api/access/login": {
      post: post(
        "Open a management session",
        { pin: { type: "string", writeOnly: true } },
        ["pin"],
      ),
    },
    "/api/access/change-pin": {
      post: post(
        "Change the management PIN and revoke existing sessions",
        {
          currentPin: { type: "string", writeOnly: true },
          newPin: {
            type: "string",
            minLength: 4,
            writeOnly: true,
          },
        },
        ["currentPin", "newPin"],
        management,
      ),
    },
    "/api/manage/platform/plugins/{id}": {
      parameters: [pathId],
      put: post(
        "Enable or disable an unused installed plugin",
        { isEnabled: { type: "boolean" } },
        ["isEnabled"],
        management,
      ),
    },
    "/api/access/logout": {
      post: {
        summary: "Revoke the current session",
        security: [],
        responses: { "200": response },
      },
    },
    "/api/access/unlock": {
      post: post(
        "Unlock one view or screen",
        {
          kind: {
            type: "string",
            enum: ["view", "screen"],
          },
          id: { type: "string" },
          pin: { type: "string", writeOnly: true },
        },
        ["kind", "id", "pin"],
      ),
    },
    "/api/access/lock": {
      post: post(
        "Lock a view or screen again",
        {
          kind: {
            type: "string",
            enum: ["view", "screen"],
          },
          id: { type: "string" },
        },
        ["kind", "id"],
      ),
    },
    "/api/display/{kind}/{id}": {
      parameters: targetParameters,
      get: {
        summary:
          "Get the active composition and authorized channel data",
        security: [],
        responses: {
          "200": response,
          "401": {
            description:
              "This target requires its PIN session",
          },
        },
      },
    },
    "/api/display/{kind}/{id}/actions": {
      parameters: targetParameters,
      post: post(
        "Run a permitted action through a bound source",
        {
          panelId: { type: "string" },
          input: { type: "string" },
          action: { type: "string" },
          payload: { type: "object" },
        },
        ["panelId", "action"],
      ),
    },
    "/api/manage/platform/screens/{id}/select": {
      parameters: [pathId],
      post: post(
        "Select a view, optionally with a temporary priority override",
        {
          viewId: { type: "string" },
          durationSeconds: {
            type: "number",
            minimum: 0,
            maximum: 86400,
          },
          priority: {
            type: "number",
            minimum: 0,
            maximum: 1000,
          },
        },
        ["viewId"],
        management,
      ),
    },
    "/api/manage/platform/sources/{id}/discover": {
      parameters: [pathId],
      post: {
        summary:
          "Discover selectable entities, albums, people, or printers",
        security: management,
        responses: { "200": response },
      },
    },
    "/api/manage/platform/device-screens/{id}": {
      parameters: [pathId],
      put: post(
        "Assign a named screen without changing the device URL",
        { screenId: { type: ["string", "null"] } },
        ["screenId"],
        management,
      ),
    },
  }
}
