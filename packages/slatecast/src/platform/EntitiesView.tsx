import { isVisible } from "@castkit/sdk/conditions"
import type { ContractData } from "@castkit/sdk/contracts"
import { useEffect, useState } from "preact/hooks"
import { AttributeFields } from "./AttributeFields.tsx"
import { useDisplayProperties } from "./displayProperties.ts"
import { EntityChart } from "./EntityChart.tsx"
import { EntityControls } from "./EntityControls.tsx"
import { LocationMap } from "./LocationMap.tsx"
import {
  hasInvalidControlSettings,
  structuredSetting,
} from "./viewSettings.ts"

type Entity =
  ContractData["entities.v1"]["entities"][number]
const actionLabel = (action: string) =>
  action
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase())
/** Entity controls preserve configured visibility gates and pass actions through the source. */
export const EntitiesView = ({
  data,
  mode,
  now,
  settings = {},
  isControlEnabled,
  onAction,
}: {
  data: ContractData["entities.v1"]
  mode: string
  now: number
  settings?: Record<string, unknown>
  isControlEnabled: boolean
  onAction: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>
}) => {
  const properties = useDisplayProperties()
  const [confirmation, setConfirmation] = useState<{
    entity: Entity
    action: string
    payload?: Record<string, unknown>
    condition?: unknown
  } | null>(null)
  useEffect(() => {
    const timeout = setTimeout(
      () => setConfirmation(null),
      12_000,
    )
    return () => clearTimeout(timeout)
  }, [confirmation])
  const entityIds = structuredSetting({
    settings,
    key: "entityIds",
  })
  const aliases = structuredSetting({
    settings,
    key: "aliases",
  }) as Record<string, string> | undefined
  const labelEntities = structuredSetting({
    settings,
    key: "labelsFromEntities",
  }) as Record<string, string> | undefined
  const conditions = structuredSetting({
    settings,
    key: "entityVisibility",
  }) as Record<string, unknown> | undefined
  const actionVisibility = structuredSetting({
    settings,
    key: "actionVisibility",
  }) as Record<string, Record<string, unknown>> | undefined
  const attributes = structuredSetting({
    settings,
    key: "attributeFields",
  })
  const links = structuredSetting({
    settings,
    key: "links",
  })
  const customActions = structuredSetting({
    settings,
    key: "actionButtons",
  })
  const entities = (
    Array.isArray(entityIds)
      ? entityIds.flatMap((id) =>
          data.entities.filter(
            (entity) => entity.id === id,
          ),
        )
      : data.entities
  ).filter((entity) =>
    isVisible({
      condition: conditions?.[entity.id],
      entities: data.entities,
      matchMedia: (query) =>
        window.matchMedia(query).matches,
    }),
  )
  const request = ({
    entity,
    action,
    payload,
    condition,
    isConfirmationRequired = false,
  }: {
    entity: Entity
    action: string
    payload?: Record<string, unknown>
    condition?: unknown
    isConfirmationRequired?: boolean
  }) => {
    if (
      !isControlEnabled ||
      !entity.actions.includes(action) ||
      !isVisible({
        condition: actionVisibility?.[entity.id]?.[action],
        entities: data.entities,
      }) ||
      !isVisible({ condition, entities: data.entities })
    ) {
      return
    }
    if (
      isConfirmationRequired ||
      ["lock", "cover", "alarm_control_panel"].includes(
        entity.domain,
      )
    ) {
      setConfirmation({
        entity,
        action,
        payload,
        condition: {
          all: [
            condition ?? [],
            actionVisibility?.[entity.id]?.[action] ?? [],
          ],
        },
      })
      return
    }
    void onAction(action, {
      ...payload,
      entityId: entity.id,
    })
  }
  if (hasInvalidControlSettings(settings)) {
    return (
      <p role="alert">
        This view has invalid control conditions. Correct
        its settings to continue.
      </p>
    )
  }
  return (
    <div class="platform-entities">
      {mode === "map" ? (
        <LocationMap entities={entities} />
      ) : null}
      {entities.map((entity) => {
        const finish = Date.parse(
          String(entity.attributes.finishes_at ?? ""),
        )
        const remaining =
          Number.isFinite(finish) &&
          entity.state === "active"
            ? Math.max(0, Math.ceil((finish - now) / 1000))
            : null
        const labelEntity = data.entities.find(
          (candidate) =>
            candidate.id === labelEntities?.[entity.id],
        )
        const name =
          labelEntity?.state ||
          aliases?.[entity.id] ||
          entity.name
        return (
          <article class="platform-entity" key={entity.id}>
            <h2>{name}</h2>
            <p class="platform-entity-value">
              {remaining !== null &&
              !properties.hasClockSeconds
                ? `Ends at ${new Date(finish).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : remaining !== null
                  ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                  : entity.domain === "timer" &&
                      entity.state === "paused"
                    ? String(
                        entity.attributes.remaining ??
                          "Paused",
                      )
                    : entity.state}{" "}
              {typeof entity.attributes
                .unit_of_measurement === "string"
                ? entity.attributes.unit_of_measurement
                : ""}
            </p>
            {mode === "charts" ? (
              <EntityChart
                entity={entity}
                settings={settings}
                now={now}
              />
            ) : null}
            {mode === "map" &&
            typeof entity.attributes.latitude ===
              "number" &&
            typeof entity.attributes.longitude ===
              "number" ? (
              <p>
                {entity.attributes.latitude.toFixed(4)},{" "}
                {entity.attributes.longitude.toFixed(4)}
              </p>
            ) : null}
            {isControlEnabled && entity.actions.length ? (
              <EntityControls
                entity={{
                  ...entity,
                  name,
                  actions: entity.actions.filter((action) =>
                    isVisible({
                      condition:
                        actionVisibility?.[entity.id]?.[
                          action
                        ],
                      entities: data.entities,
                    }),
                  ),
                }}
                request={({ action, payload }) =>
                  request({
                    entity,
                    action,
                    payload,
                    condition: conditions?.[entity.id],
                  })
                }
              />
            ) : null}
          </article>
        )
      })}
      {isControlEnabled && Array.isArray(customActions) ? (
        <div class="platform-actions">
          {customActions.flatMap(
            (value: unknown, index) => {
              if (!value || typeof value !== "object") {
                return []
              }
              const button = value as Record<
                string,
                unknown
              >
              const entity = data.entities.find(
                (candidate) =>
                  candidate.id === button.entityId,
              )
              const action =
                typeof button.action === "string"
                  ? button.action
                  : ""
              if (
                !entity?.actions.includes(action) ||
                !isVisible({
                  condition:
                    actionVisibility?.[entity.id]?.[action],
                  entities: data.entities,
                }) ||
                !isVisible({
                  condition: button.visibleWhen,
                  entities: data.entities,
                  matchMedia: (query) =>
                    window.matchMedia(query).matches,
                })
              ) {
                return []
              }
              return [
                <button
                  key={index}
                  type="button"
                  data-castkit-target={`configured:${entity.id}:${entity.state}:${action}:${index}`}
                  onClick={() =>
                    request({
                      entity,
                      action,
                      payload:
                        typeof button.payload ===
                          "object" &&
                        button.payload !== null
                          ? (button.payload as Record<
                              string,
                              unknown
                            >)
                          : undefined,
                      condition: button.visibleWhen,
                      isConfirmationRequired:
                        button.isConfirmationRequired !==
                        false,
                    })
                  }
                >
                  {typeof button.name === "string"
                    ? button.name
                    : actionLabel(action)}
                </button>,
              ]
            },
          )}
        </div>
      ) : null}
      {Array.isArray(links) ? (
        <nav
          class="platform-actions"
          aria-label="Related views"
        >
          {links.flatMap((value: unknown, index) => {
            if (!value || typeof value !== "object") {
              return []
            }
            const link = value as Record<string, unknown>
            const url =
              typeof link.url === "string" ? link.url : ""
            if (
              !(
                /^https?:\/\//i.test(url) ||
                (url.startsWith("/") &&
                  !url.startsWith("//") &&
                  !url.includes("\\"))
              ) ||
              !isVisible({
                condition: link.visibleWhen,
                entities: data.entities,
                matchMedia: (query) =>
                  window.matchMedia(query).matches,
              })
            ) {
              return []
            }
            return [
              <a
                key={index}
                href={url}
                target={
                  url.startsWith("/") ? undefined : "_blank"
                }
                rel="noopener noreferrer"
              >
                {typeof link.name === "string"
                  ? link.name
                  : url}
              </a>,
            ]
          })}
        </nav>
      ) : null}
      <AttributeFields fields={attributes} data={data} />
      {confirmation ? (
        <div
          class="platform-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirm device action"
        >
          <div>
            <h2>
              {actionLabel(confirmation.action)}{" "}
              {confirmation.entity.name}?
            </h2>
            <div class="platform-actions">
              <button
                type="button"
                data-castkit-target={`entity-back:${confirmation.entity.id}:${confirmation.action}`}
                onClick={() => setConfirmation(null)}
              >
                Go back
              </button>
              <button
                type="button"
                data-castkit-target={`entity-confirm:${confirmation.entity.id}:${confirmation.entity.state}:${confirmation.action}`}
                disabled={
                  !isControlEnabled ||
                  !isVisible({
                    condition: confirmation.condition,
                    entities: data.entities,
                    matchMedia: (query) =>
                      window.matchMedia(query).matches,
                  }) ||
                  !data.entities.some(
                    (entity) =>
                      entity.id ===
                        confirmation.entity.id &&
                      entity.state ===
                        confirmation.entity.state &&
                      entity.actions.includes(
                        confirmation.action,
                      ),
                  )
                }
                onClick={() => {
                  void onAction(confirmation.action, {
                    ...confirmation.payload,
                    entityId: confirmation.entity.id,
                  })
                  setConfirmation(null)
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
