import { describe, expect, test } from "vitest"
import { parseCastkitTargets } from "./castkitTargets.ts"

describe(parseCastkitTargets.name, () => {
  test("screens come first, then views, each as a page path", () => {
    expect(
      parseCastkitTargets({
        views: [
          { id: "clock", name: "Clock", access: "public" },
          { id: "music now", name: "", access: "public" },
        ],
        screens: [
          {
            id: "hallway",
            name: "Hallway",
            access: "public",
          },
        ],
      }),
    ).toEqual([
      { label: "Screen: Hallway", path: "/screen/hallway" },
      { label: "View: Clock", path: "/view/clock" },
      {
        label: "View: music now",
        path: "/view/music%20now",
      },
    ])
  })

  test("an answer that is not a views list gives no entries", () => {
    expect(parseCastkitTargets({ error: "nope" })).toEqual(
      [],
    )
    expect(parseCastkitTargets("<html>")).toEqual([])
  })
})
