import {
  parseCondition,
  type VisibilityCondition,
} from "@castkit/sdk/conditions"
import {
  type SerializedNode,
  type TreeState,
  useTree,
} from "@charcuterie/logic"
import {
  Field,
  Picker,
  QueryBuilder,
} from "@charcuterie/ui"
import { useState } from "react"
import { inputClass } from "./platformApi.ts"

type Match = "all" | "any"
type Leaf = Exclude<
  VisibilityCondition,
  { all: unknown } | { any: unknown }
>
const toNode = (
  value: VisibilityCondition,
): SerializedNode<Match, Leaf> =>
  "all" in value
    ? {
        kind: "group",
        combinator: "all",
        children: value.all.map(toNode),
      }
    : "any" in value
      ? {
          kind: "group",
          combinator: "any",
          children: value.any.map(toNode),
        }
      : { kind: "leaf", value }
const fromState = (
  state: TreeState<Match, Leaf>,
  id = state.rootId,
): VisibilityCondition => {
  const node = state.nodesById.get(id)
  if (!node) return { all: [] }
  return node.kind === "leaf"
    ? node.value
    : ({
        [node.combinator]: node.childIds.map((child) =>
          fromState(state, child),
        ),
      } as VisibilityCondition)
}
export const ConditionField = ({
  value,
  onChange,
}: {
  value: unknown
  onChange: (value: unknown) => void
}) => {
  const [conditions] = useState(() => parseCondition(value))
  const tree = useTree<Match, Leaf>({
    defaultCombinator: "all",
    initialTree: {
      kind: "group",
      combinator: "all",
      children: (conditions ?? []).map(toNode),
    },
    onChange: (state) => onChange(fromState(state)),
  })
  // Invalid legacy data stays intact and editable through the generic form fallback.
  if (conditions === null)
    return (
      <p role="alert">
        This condition is not supported. Use the fields
        below to correct it.
      </p>
    )
  return (
    <QueryBuilder
      tree={tree}
      combinatorOptions={[
        { label: "All conditions", value: "all" },
        { label: "Any condition", value: "any" },
      ]}
      createLeafValue={() => ({
        entityId: "",
        state: "on",
      })}
      renderLeaf={({ value: leaf, onChange: update }) => (
        <div className="grid gap-3">
          <Field label="Condition type">
            <Picker
              label="Condition type"
              value={
                "mediaQuery" in leaf ? "viewport" : "entity"
              }
              options={[
                { label: "Entity state", value: "entity" },
                { label: "Viewport", value: "viewport" },
              ]}
              onChange={(type) =>
                update(
                  type === "viewport"
                    ? { mediaQuery: "(min-width: 600px)" }
                    : { entityId: "", state: "on" },
                )
              }
            />
          </Field>
          {"mediaQuery" in leaf ? (
            <Field label="Viewport query">
              <input
                required
                className={inputClass}
                value={leaf.mediaQuery}
                onChange={(event) =>
                  update({ mediaQuery: event.target.value })
                }
              />
            </Field>
          ) : (
            <>
              <Field label="Entity ID">
                <input
                  required
                  className={inputClass}
                  value={leaf.entityId}
                  placeholder="sensor.example"
                  onChange={(event) =>
                    update({
                      ...leaf,
                      entityId: event.target.value,
                    })
                  }
                />
              </Field>
              {(
                [
                  ["State is", "state"],
                  ["State is not", "notState"],
                ] as const
              ).map(([label, key]) => (
                <Field
                  key={key}
                  label={label}
                  description="Separate multiple states with a comma. Leave blank for no restriction."
                >
                  <input
                    className={inputClass}
                    value={
                      Array.isArray(leaf[key])
                        ? leaf[key].join(", ")
                        : (leaf[key] ?? "")
                    }
                    onChange={(event) => {
                      const text = event.target.value
                      update({
                        ...leaf,
                        [key]: text
                          ? text.includes(",")
                            ? text
                                .split(",")
                                .map((part) => part.trim())
                            : text
                          : undefined,
                      })
                    }}
                  />
                </Field>
              ))}
            </>
          )}
        </div>
      )}
    />
  )
}
