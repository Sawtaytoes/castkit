import { isVisible } from "@castkit/sdk/conditions"
import type { ContractData } from "@castkit/sdk/contracts"
import type { JSX } from "preact"
import { useEffect, useState } from "preact/hooks"
import { formatClockTime } from "../time.ts"
import { AttributeFields } from "./AttributeFields.tsx"
import { useDisplayProperties } from "./displayProperties.ts"
import { EntityChart } from "./EntityChart.tsx"
import { EntityControls } from "./EntityControls.tsx"
import { HomeLightMembers } from "./HomeLightMembers.tsx"
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
  const isHome = settings.presentation === "home"
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
  const relatedEntities = structuredSetting({
    settings,
    key: "relatedEntities",
  }) as Record<string, string[]> | undefined
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
      (["light", "fan", "climate"].includes(
        entity.domain,
      ) &&
        ["unknown", "unavailable"].includes(
          entity.state,
        )) ||
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
  const renderEntity = ({
    entity,
    ancestors,
  }: {
    entity: Entity
    ancestors: string[]
  }): JSX.Element => {
    const finish = Date.parse(
      String(entity.attributes.finishes_at ?? ""),
    )
    const remaining =
      Number.isFinite(finish) && entity.state === "active"
        ? Math.max(0, Math.ceil((finish - now) / 1000))
        : null
    const labelEntity = data.entities.find(
      (candidate) =>
        candidate.id === labelEntities?.[entity.id],
    )
    const name =
      labelEntity?.state ||
      (typeof aliases?.[entity.id] === "string"
        ? aliases[entity.id]
        : undefined) ||
      entity.name
    return (
      <article
        class="platform-entity"
        key={entity.id}
        data-domain={entity.domain}
        data-state={entity.state}
      >
        <h2>{name}</h2>
        {isHome &&
        entity.domain === "light" &&
        (entity.state === "off" ||
          typeof entity.attributes.brightness ===
            "number") ? (
          <progress
            class="home-light-progress"
            aria-label={`${name} brightness`}
            max={100}
            value={
              entity.state === "off"
                ? 0
                : typeof entity.attributes.brightness ===
                    "number"
                  ? Math.round(
                      (entity.attributes.brightness / 255) *
                        100,
                    )
                  : undefined
            }
          />
        ) : null}
        <p class="platform-entity-value">
          {remaining !== null && !properties.hasClockSeconds
            ? `Ends at ${formatClockTime(finish)}`
            : remaining !== null
              ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
              : entity.domain === "timer" &&
                  entity.state === "paused"
                ? String(
                    entity.attributes.remaining ?? "Paused",
                  )
                : isHome && entity.domain === "climate"
                  ? `${entity.attributes.current_temperature ?? "—"}° · ${entity.state}`
                  : isHome &&
                      entity.domain === "light" &&
                      typeof entity.attributes
                        .brightness === "number"
                    ? entity.state === "off"
                      ? "Off"
                      : `${Math.round((entity.attributes.brightness / 255) * 100)}%`
                    : isHome &&
                        [
                          "scene",
                          "script",
                          "button",
                          "input_button",
                        ].includes(entity.domain)
                      ? "Ready"
                      : entity.state}{" "}
          {typeof entity.attributes.unit_of_measurement ===
          "string"
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
        typeof entity.attributes.latitude === "number" &&
        typeof entity.attributes.longitude === "number" ? (
          <p>
            {entity.attributes.latitude.toFixed(4)},{" "}
            {entity.attributes.longitude.toFixed(4)}
          </p>
        ) : null}
        {(isControlEnabled || isHome) &&
        entity.actions.length ? (
          <fieldset
            disabled={!isControlEnabled}
            class="home-control-fieldset"
          >
            <EntityControls
              isHome={isHome}
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
          </fieldset>
        ) : null}
        {isHome &&
        relatedEntities?.[entity.id]?.some(
          (id) => !ancestors.includes(id),
        ) ? (
          <HomeLightMembers
            count={relatedEntities[entity.id]?.length ?? 0}
            render={() =>
              relatedEntities[entity.id]
                ?.filter((id) => !ancestors.includes(id))
                .flatMap((id) =>
                  data.entities.filter(
                    (candidate) =>
                      candidate.id === id &&
                      isVisible({
                        condition: conditions?.[id],
                        entities: data.entities,
                      }),
                  ),
                )
                .map((child) =>
                  renderEntity({
                    entity: child,
                    ancestors: ancestors.concat(entity.id),
                  }),
                )
            }
          />
        ) : null}
      </article>
    )
  }
  return (
    <div
      class="platform-entities"
      data-home={String(isHome)}
    >
      {mode === "map" ? (
        <LocationMap entities={entities} />
      ) : null}
      {entities.map((entity) =>
        renderEntity({ entity, ancestors: [] }),
      )}
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
