import { describe, expect, test } from "vitest"
import { parseCastkitPages } from "./castkitTargets.ts"

describe(parseCastkitPages.name, () => {
  test("screens come first, then views, each with its page path, lock, and views", () => {
    expect(
      parseCastkitPages({
        views: [
          { id: "clock", name: "Clock", access: "public" },
          { id: "music now", name: "", access: "pin" },
        ],
        screens: [
          {
            id: "hallway",
            name: "Hallway",
            access: "pin",
            viewIds: ["clock", "music now"],
          },
        ],
      }),
    ).toEqual([
      {
        kind: "screen",
        id: "hallway",
        name: "Hallway",
        path: "/screen/hallway",
        isPinProtected: true,
        viewIds: ["clock", "music now"],
      },
      {
        kind: "view",
        id: "clock",
        name: "Clock",
        path: "/view/clock",
        isPinProtected: false,
        viewIds: [],
      },
      {
        kind: "view",
        id: "music now",
        name: "music now",
        path: "/view/music%20now",
        isPinProtected: true,
        viewIds: [],
      },
    ])
  })

  test("a server that sends no view ids still lists its screens", () => {
    expect(
      parseCastkitPages({
        views: [],
        screens: [{ id: "hallway", name: "Hallway" }],
      }),
    ).toEqual([
      {
        kind: "screen",
        id: "hallway",
        name: "Hallway",
        path: "/screen/hallway",
        isPinProtected: false,
        viewIds: [],
      },
    ])
  })

  test("an answer that is not a views list gives no pages", () => {
    expect(parseCastkitPages({ error: "nope" })).toEqual([])
    expect(parseCastkitPages("<html>")).toEqual([])
  })
})
