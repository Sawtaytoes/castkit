import type { CastkitPage } from "../castkitTargets.ts"

/** One row of the page list. */
export type PageEntry = {
  page: CastkitPage
  /** What the row says under the name. */
  detail: string
}

/** A heading in the page list and the rows under it. */
export type PageGroup = {
  key: string
  heading: string
  entries: PageEntry[]
}

const namedViewsShown = 3

/** "Overview", "Overview and Lights", "Overview, Lights, and Fans". */
const joinNames = (names: string[]) =>
  names.length <= 2
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`

/** A screen's row says how many views it switches between, and names the first few. */
export const describeScreenViews = (
  viewNames: string[],
) => {
  if (viewNames.length === 0) {
    return "Screen"
  }
  const count =
    viewNames.length === 1
      ? "1 view"
      : `${viewNames.length} views`
  const shown = viewNames.slice(0, namedViewsShown)
  const remaining = viewNames.length - shown.length
  return `${count}: ${joinNames(
    remaining > 0 ? [...shown, `${remaining} more`] : shown,
  )}`
}

const toSearchWords = (query: string) =>
  query.toLowerCase().split(/\s+/).filter(Boolean)

const getIsMatch = ({
  words,
  texts,
}: {
  words: string[]
  texts: string[]
}) => {
  const haystack = texts.join(" ").toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/**
 * Arrange a server's pages for the "Add window" list: the screens first,
 * then each screen's views under that screen's name, then the views no
 * screen shows. A view on two screens is listed under both, because the
 * screen is how a person finds it. The search keeps a row whose name, id,
 * path, or group matches every word typed, in any order.
 */
export const groupPages = ({
  pages,
  query,
}: {
  pages: CastkitPage[]
  query: string
}): PageGroup[] => {
  const words = toSearchWords(query)
  const screens = pages.filter(
    (page) => page.kind === "screen",
  )
  const viewById = new Map(
    pages
      .filter((page) => page.kind === "view")
      .map((page) => [page.id, page]),
  )
  const viewsOf = (screen: CastkitPage) =>
    screen.viewIds
      .map((viewId) => viewById.get(viewId))
      .filter((view) => view !== undefined)
  const viewEntry = (view: CastkitPage): PageEntry => ({
    page: view,
    detail: view.path,
  })
  const screenGroup: PageGroup = {
    key: "screens",
    heading: "Screens",
    entries: screens
      .filter((screen) =>
        getIsMatch({
          words,
          texts: [
            screen.name,
            screen.id,
            screen.path,
            "screen",
            ...viewsOf(screen).map((view) => view.name),
          ],
        }),
      )
      .map((screen) => ({
        page: screen,
        detail: describeScreenViews(
          viewsOf(screen).map((view) => view.name),
        ),
      })),
  }
  const screenViewGroups = screens.map(
    (screen): PageGroup => ({
      key: `screen:${screen.id}`,
      heading: `On the ${screen.name} screen`,
      entries: viewsOf(screen)
        .filter((view) =>
          getIsMatch({
            words,
            texts: [
              view.name,
              view.id,
              view.path,
              screen.name,
            ],
          }),
        )
        .map(viewEntry),
    }),
  )
  const viewIdsOnScreens = new Set(
    screens.flatMap((screen) => screen.viewIds),
  )
  const looseGroup: PageGroup = {
    key: "views",
    heading:
      screens.length > 0 ? "Not on a screen" : "Views",
    entries: [...viewById.values()]
      .filter((view) => !viewIdsOnScreens.has(view.id))
      .filter((view) =>
        getIsMatch({
          words,
          texts: [view.name, view.id, view.path],
        }),
      )
      .map(viewEntry),
  }
  return [
    screenGroup,
    ...screenViewGroups,
    looseGroup,
  ].filter((group) => group.entries.length > 0)
}
