/** The shape a structured settings editor builds for one field. */
export type Schema = {
  kind?: "map" | "list" | "object" | "condition"
  label?: string
  keyLabel?: string
  item?: Schema
  fields?: Record<string, Schema>
  initial?: unknown
}
/** A text value with its label. */
export const text = (label: string): Schema => ({
  label,
  initial: "",
})
const condition: Schema = {
  kind: "condition",
  initial: [],
}
const map = (keyLabel: string, item: Schema): Schema => ({
  kind: "map",
  keyLabel,
  item,
  initial: {},
})
/** An ordered list of one kind of item. */
export const list = (
  item: Schema,
  label = "item",
): Schema => ({
  kind: "list",
  item,
  label,
  initial: [],
})
/** The structured shape of each known JSON setting, by setting name. */
export const schemas: Record<string, Schema> = {
  aliases: map("Entity ID", text("Display label")),
  labelsFromEntities: map(
    "Entity ID",
    text("Label provider entity ID"),
  ),
  entityVisibility: map("Entity ID", condition),
  actionVisibility: map(
    "Entity ID",
    map("Action", condition),
  ),
  visibleWhen: condition,
  scriptFields: map(
    "Script entity ID",
    list(text("Variable name"), "variable"),
  ),
  attributeFields: list(
    {
      kind: "object",
      initial: {
        entityId: "",
        attribute: "",
        label: "",
        format: "text",
      },
      fields: {
        entityId: text("Entity ID"),
        attribute: text("Attribute"),
        label: text("Label"),
        format: text("Format"),
      },
    },
    "attribute",
  ),
  actionButtons: list(
    {
      kind: "object",
      initial: {
        name: "",
        entityId: "",
        action: "",
        payload: {},
        isConfirmationRequired: false,
      },
      fields: {
        name: text("Button name"),
        entityId: text("Entity ID"),
        action: text("Action"),
        payload: map("Parameter", {}),
        visibleWhen: condition,
        isConfirmationRequired: {
          label: "Require confirmation",
          initial: false,
        },
      },
    },
    "button",
  ),
}
/** Names the kind of a JSON value, as the editor offers it. */
export const kindOf = (value: unknown) =>
  value === null
    ? "null"
    : Array.isArray(value)
      ? "list"
      : typeof value === "object"
        ? "object"
        : typeof value
/** An empty value of the chosen kind. */
export const newValue = (kind: string): unknown =>
  ({
    text: "",
    string: "",
    number: 0,
    boolean: false,
    null: null,
    object: {},
    list: [],
  })[kind as "text"]
/** Turns a camelCase key into a sentence-case label. */
export const title = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase())
