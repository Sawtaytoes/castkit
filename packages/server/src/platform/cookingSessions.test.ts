import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { createCookingSessions } from "./cookingSessions.ts"

const recipe = {
  slug: "skillet",
  name: "Lemon chickpea skillet",
  url: "https://recipes.example/g/home/r/skillet",
  ingredients: ["2 cans chickpeas", "1 lemon"],
  instructions: [
    "Warm chickpeas. ".repeat(60),
    "Add lemon. Serve warm.",
  ],
  notes: [],
}
const input = {
  sourceId: "recipes",
  deviceId: "kitchen-panel",
  recipe,
  width: 800,
  height: 480,
}
test("restart restores recipe, exact page, control key, and non-expiring selection", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-cooking-"),
  )
  try {
    const file = join(directory, "sessions.json")
    const first = createCookingSessions({
      file,
      onChanged: vi.fn(),
    })
    const session = first.start(input)
    first.command(session.id, "instructions")
    const active = first.command(session.id, "next")!
    const restored = createCookingSessions({
      file,
      onChanged: vi.fn(),
    })
    expect(restored.get(session.id)).toEqual(active)
    expect(
      restored.authorize(session.id, session.key),
    ).toBe(true)
    expect(
      restored.authorize(session.id, "界".repeat(64)),
    ).toBe(false)
    expect(restored.display(active).pageIndex).toBe(
      active.pageIndex,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
test("duplicate shares retain progress and Ingredients preserves the instruction cursor", () => {
  const cooking = createCookingSessions({
    onChanged: vi.fn(),
  })
  const session = cooking.start(input)
  cooking.command(session.id, "instructions")
  const step = cooking.command(session.id, "next")!
  cooking.command(session.id, "ingredients")
  const resumed = cooking.command(
    session.id,
    "instructions",
  )!
  expect(resumed.pageIndex).toBe(step.pageIndex)
  expect(cooking.start(input).id).toBe(session.id)
  expect(() =>
    cooking.start({
      ...input,
      recipe: { ...recipe, slug: "other" },
    }),
  ).toThrow("already has")
})
test("Done revokes the old link, and a stale Done cannot affect the next session", () => {
  const cooking = createCookingSessions({
    onChanged: vi.fn(),
  })
  const session = cooking.start(input)
  const firstTarget = cooking.targetId(session)
  const next = cooking.command(session.id, "next")!
  expect(cooking.targetId(next)).not.toBe(firstTarget)
  expect(cooking.view(firstTarget)).toBeNull()
  cooking.command(session.id, "done")
  const newer = cooking.start(input)
  expect(cooking.authorize(session.id, session.key)).toBe(
    false,
  )
  expect(() => cooking.command(session.id, "done")).toThrow(
    "ended",
  )
  expect(cooking.getForDevice(input.deviceId)?.id).toBe(
    newer.id,
  )
})

test("visiting notes does not replace the saved instruction position", () => {
  const cooking = createCookingSessions({
    onChanged: vi.fn(),
  })
  const session = cooking.start({
    ...input,
    recipe: {
      ...recipe,
      instructions: ["Warm the pan.", "Serve warm."],
      notes: ["Store leftovers chilled."],
    },
  })
  cooking.command(session.id, "instructions")
  const second = cooking.command(session.id, "next")!
  const note = cooking.command(session.id, "next")!
  expect(cooking.display(note).page.heading).toBe("Note 1")
  cooking.command(session.id, "ingredients")
  const restored = cooking.command(
    session.id,
    "instructions",
  )!
  expect(restored.pageIndex).toBe(second.pageIndex)
  expect(cooking.display(restored).page.heading).toBe(
    "Step 2 of 2",
  )
})
