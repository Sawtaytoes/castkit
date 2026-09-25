/** State gates and optional viewport conditions form a declarative visibility tree. */
export type VisibilityCondition =
  | {
      entityId: string
      state?: string | string[]
      notState?: string | string[]
    }
  | { any: VisibilityCondition[] }
  | { all: VisibilityCondition[] }
  | { mediaQuery: string }
const readConditions = ({
  value,
  depth = 0,
}: {
  value: unknown
  depth?: number
}): VisibilityCondition[] | null => {
  if (depth > 32) {
    return null
  }
  if (value === undefined || value === "") {
    return []
  }
  if (typeof value === "string") {
    try {
      return readConditions({
        value: JSON.parse(value),
        depth: depth + 1,
      })
    } catch {
      return null
    }
  }
  if (Array.isArray(value)) {
    const results = value.map((entry) =>
      readConditions({ value: entry, depth: depth + 1 }),
    )
    return results.some((result) => result === null)
      ? null
      : results.flatMap((result) => result ?? [])
  }
  if (typeof value !== "object" || value === null) {
    return null
  }
  const condition = value as Record<string, unknown>
  if (
    typeof condition.mediaQuery === "string" &&
    condition.mediaQuery.length > 0
  ) {
    return [{ mediaQuery: condition.mediaQuery }]
  }
  if ("any" in condition || "all" in condition) {
    const key = "any" in condition ? "any" : "all"
    if (!Array.isArray(condition[key])) {
      return null
    }
    const branches = condition[key].map((value) =>
      readConditions({ value, depth: depth + 1 }),
    )
    if (branches.some((branch) => branch === null)) {
      return null
    }
    const children = branches.flatMap((branch) =>
      branch === null
        ? []
        : branch.length === 1
          ? branch
          : [{ all: branch }],
    )
    return [
      key === "any" ? { any: children } : { all: children },
    ]
  }

  const isStateList = (entry: unknown) =>
    entry === undefined ||
    typeof entry === "string" ||
    (Array.isArray(entry) &&
      entry.every((item) => typeof item === "string"))
  if (
    typeof condition.entityId !== "string" ||
    !condition.entityId ||
    !isStateList(condition.state) ||
    !isStateList(condition.notState)
  ) {
    return null
  }
  return [
    {
      entityId: condition.entityId,
      ...(condition.state !== undefined
        ? { state: condition.state as string | string[] }
        : {}),
      ...(condition.notState !== undefined
        ? {
            notState: condition.notState as
              | string
              | string[],
          }
        : {}),
    },
  ]
}
/** Parse persisted JSON or structured conditions; invalid conditions fail closed. */
export const parseCondition = (value: unknown) =>
  readConditions({ value })
/** Shared state gating; viewport clauses are presentation-only when no matcher exists. */
export const isVisible = ({
  condition,
  entities,
  matchMedia,
}: {
  condition: unknown
  entities: readonly { id: string; state: string }[]
  matchMedia?: (query: string) => boolean
}) => {
  const conditions = parseCondition(condition)
  const evaluate = (
    entry: VisibilityCondition,
  ): boolean => {
    if ("any" in entry) {
      return entry.any.some(evaluate)
    }
    if ("all" in entry) {
      return entry.all.every(evaluate)
    }
    if ("mediaQuery" in entry) {
      return matchMedia
        ? matchMedia(entry.mediaQuery)
        : true
    }
    const entity = entities.find(
      (candidate) => candidate.id === entry.entityId,
    )
    if (!entity) {
      return false
    }
    if (
      ["unknown", "unavailable"].includes(entity.state) &&
      !(
        typeof entry.state === "string"
          ? [entry.state]
          : entry.state
      )?.includes(entity.state)
    ) {
      return false
    }
    const expected =
      typeof entry.state === "string"
        ? [entry.state]
        : entry.state
    const excluded =
      typeof entry.notState === "string"
        ? [entry.notState]
        : entry.notState
    return (
      (!expected || expected.includes(entity.state)) &&
      !excluded?.includes(entity.state)
    )
  }
  return conditions?.every(evaluate) ?? false
}
