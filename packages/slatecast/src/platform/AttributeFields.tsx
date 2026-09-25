import type { ContractData } from "@castkit/sdk/contracts"
import { ReportContent } from "./ReportContent.tsx"

/** Extra source attributes are explicit view bindings; no template language runs in the browser. */
export const AttributeFields = ({
  fields,
  data,
}: {
  fields: unknown
  data: ContractData["entities.v1"]
}) => (
  <>
    {Array.isArray(fields)
      ? fields.flatMap((value: unknown, index) => {
          if (!value || typeof value !== "object") {
            return []
          }
          const field = value as Record<string, unknown>
          const entity = data.entities.find(
            (candidate) => candidate.id === field.entityId,
          )
          const attribute =
            typeof field.attribute === "string"
              ? entity?.attributes[field.attribute]
              : undefined
          if (
            attribute === undefined ||
            attribute === null
          ) {
            return []
          }
          const text =
            typeof attribute === "string"
              ? attribute
              : typeof attribute === "number" ||
                  typeof attribute === "boolean"
                ? String(attribute)
                : JSON.stringify(attribute)
          const date = Date.parse(text)
          return [
            <section class="platform-attribute" key={index}>
              {typeof field.label === "string" ? (
                <h3>{field.label}</h3>
              ) : null}
              {field.format === "report" ? (
                <ReportContent content={text} />
              ) : (
                <p>
                  {field.format === "time" &&
                  Number.isFinite(date)
                    ? new Date(date).toLocaleString([], {
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : text}
                </p>
              )}
            </section>,
          ]
        })
      : null}
  </>
)
