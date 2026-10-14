import { describe, expect, test } from "vitest"
import type { CastkitPage } from "../castkitTargets.ts"
import {
  describeScreenViews,
  groupPages,
} from "./pageGroups.ts"

const view = (id: string, name: string): CastkitPage => ({
  kind: "view",
  id,
  name,
  path: `/view/${id}`,
  isPinProtected: false,
  viewIds: [],
})

const screen = (
  id: string,
  name: string,
  viewIds: string[],
): CastkitPage => ({
  kind: "screen",
  id,
  name,
  path: `/screen/${id}`,
  isPinProtected: true,
  viewIds,
})

const pages = [
  screen("house", "House", ["lights", "rip-deck"]),
  screen("working", "Activity", [
    "rip-deck",
    "now-playing",
  ]),
  view("lights", "Lights"),
  view("rip-deck", "Rip-Deck"),
  view("now-playing", "Now Playing"),
  view("kiosk-now-playing", "Now Playing"),
]

const summarize = (query: string) =>
  groupPages({ pages, query }).map((group) => [
    group.heading,
    group.entries.map(
      (entry) => `${entry.page.name} | ${entry.detail}`,
    ),
  ])

describe(groupPages.name, () => {
  test("screens come first, then each screen's views, then the views on no screen", () => {
    expect(summarize("")).toEqual([
      [
        "Screens",
        [
          "House | 2 views: Lights and Rip-Deck",
          "Activity | 2 views: Rip-Deck and Now Playing",
        ],
      ],
      [
        "On the House screen",
        [
          "Lights | /view/lights",
          "Rip-Deck | /view/rip-deck",
        ],
      ],
      [
        "On the Activity screen",
        [
          "Rip-Deck | /view/rip-deck",
          "Now Playing | /view/now-playing",
        ],
      ],
      [
        "Not on a screen",
        ["Now Playing | /view/kiosk-now-playing"],
      ],
    ])
  })

  test("the search matches every word, in names, ids, paths, and the screen a view is on", () => {
    expect(summarize("now activity")).toEqual([
      [
        "Screens",
        ["Activity | 2 views: Rip-Deck and Now Playing"],
      ],
      [
        "On the Activity screen",
        ["Now Playing | /view/now-playing"],
      ],
    ])
    expect(summarize("KIOSK")).toEqual([
      [
        "Not on a screen",
        ["Now Playing | /view/kiosk-now-playing"],
      ],
    ])
    expect(summarize("nothing like this")).toEqual([])
  })

  test("a server with no screens lists its views under one heading", () => {
    expect(
      groupPages({
        pages: [view("clock", "Clock")],
        query: "",
      }).map((group) => group.heading),
    ).toEqual(["Views"])
  })
})

describe(describeScreenViews.name, () => {
  test("names up to three views and counts the rest", () => {
    expect(describeScreenViews([])).toBe("Screen")
    expect(describeScreenViews(["Clock"])).toBe(
      "1 view: Clock",
    )
    expect(describeScreenViews(["A", "B", "C"])).toBe(
      "3 views: A, B, and C",
    )
    expect(
      describeScreenViews(["A", "B", "C", "D", "E"]),
    ).toBe("5 views: A, B, C, and 2 more")
  })
})
