import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
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
    // Long enough that the recipe cannot fit one screen and must page.
    "Warm chickpeas. ".repeat(200),
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
      notes: ["Store leftovers chilled. ".repeat(200)],
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

test("a recipe that fits shows whole on one screen, and every control stays on it", () => {
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
  const display = cooking.display(session)
  expect(display.pageCount).toBe(1)
  expect(display.page.isComplete).toBe(true)
  for (const action of [
    "next",
    "previous",
    "ingredients",
    "instructions",
  ] as const)
    expect(
      cooking.command(session.id, action)?.pageIndex,
    ).toBe(0)
})

test("a saved position follows its heading when a wrapping change moves the page numbers", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-cooking-"),
  )
  try {
    const file = join(directory, "sessions.json")
    const recipe = {
      slug: "chef",
      name: "Chef test",
      url: "https://recipes.example/g/home/r/chef",
      ingredients: ["👩‍🍳 ".repeat(100)],
      instructions: ["Mix.", "Bake.", "Cool.", "Serve."],
      notes: [],
    }
    const step1 = {
      heading: "Step 1 of 4",
      occurrence: 0,
    }
    // Index 0 is the ingredients page; the anchor names Step 1.
    writeFileSync(
      file,
      JSON.stringify({
        sessions: [
          {
            id: "6f1c1f3e-5a43-4f43-9a3e-6d6b2d1f9a10",
            key: "a".repeat(64),
            sourceId: "recipes",
            deviceId: "kitchen-panel",
            recipe,
            width: 320,
            height: 240,
            pageIndex: 0,
            instructionPage: 0,
            pageAnchor: step1,
            instructionAnchor: step1,
            revision: 3,
            createdAt: new Date().toISOString(),
          },
        ],
        requests: [],
      }),
    )
    const cooking = createCookingSessions({
      file,
      onChanged: vi.fn(),
    })
    const id = "6f1c1f3e-5a43-4f43-9a3e-6d6b2d1f9a10"
    const session = cooking.get(id)!
    const display = cooking.display(session)
    expect(display.pageIndex).not.toBe(0)
    expect(display.page.heading).toBe("Step 1 of 4")
    const previous = cooking.command(id, "previous")!
    expect(cooking.display(previous).page.heading).toMatch(
      /^Ingredients/,
    )
    const back = cooking.command(id, "instructions")!
    expect(cooking.display(back).page.heading).toBe(
      "Step 1 of 4",
    )
    expect(back.pageIndex).toBe(display.pageIndex)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("a session saved before anchors gets them on load and keeps its step", () => {
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
    const heading = first.display(active).page.heading
    // Rewrite the file the way the earlier version saved it: no anchors.
    const {
      pageAnchor: _page,
      instructionAnchor: _instruction,
      ...legacy
    } = active
    writeFileSync(
      file,
      JSON.stringify({ sessions: [legacy], requests: [] }),
    )
    const onChanged = vi.fn()
    const restored = createCookingSessions({
      file,
      onChanged,
    })
    expect(onChanged).not.toHaveBeenCalled()
    const upgraded = restored.get(session.id)!
    expect(upgraded.pageAnchor?.heading).toBe(heading)
    expect(upgraded.revision).toBe(active.revision)
    expect(
      JSON.parse(readFileSync(file, "utf8")).sessions[0]
        .pageAnchor.heading,
    ).toBe(heading)
    expect(restored.display(upgraded).page.heading).toBe(
      heading,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

const legacySession = (
  overrides: Record<string, unknown>,
) => ({
  id: "0b6f3c55-8a0e-4d8b-9a44-2f7a1c3e5d21",
  key: "b".repeat(64),
  sourceId: "recipes",
  deviceId: "kitchen-panel",
  recipe,
  width: 800,
  height: 480,
  pageIndex: 0,
  instructionPage: 0,
  revision: 3,
  createdAt: new Date().toISOString(),
  ...overrides,
})
const loadLegacy = (
  session: Record<string, unknown>,
  test: (
    cooking: ReturnType<typeof createCookingSessions>,
  ) => void,
) => {
  const directory = mkdtempSync(
    join(tmpdir(), "castkit-cooking-"),
  )
  try {
    const file = join(directory, "sessions.json")
    writeFileSync(
      file,
      JSON.stringify({ sessions: [session], requests: [] }),
    )
    test(
      createCookingSessions({ file, onChanged: vi.fn() }),
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
test("a saved page past the end still normalizes on Next, with a new revision", () => {
  loadLegacy(
    legacySession({
      recipe: {
        ...recipe,
        instructions: ["Warm the pan.", "Serve warm."],
      },
      pageIndex: 4,
    }),
    (cooking) => {
      const id = "0b6f3c55-8a0e-4d8b-9a44-2f7a1c3e5d21"
      expect(cooking.get(id)?.pageAnchor).toBeUndefined()
      expect(
        cooking.display(cooking.get(id)!).pageIndex,
      ).toBe(0)
      const next = cooking.command(id, "next")!
      expect(next.pageIndex).toBe(0)
      expect(next.revision).toBe(4)
    },
  )
})
test("a saved instruction position past the end returns Instructions to Step 1", () => {
  loadLegacy(
    legacySession({ pageIndex: 0, instructionPage: 99 }),
    (cooking) => {
      const id = "0b6f3c55-8a0e-4d8b-9a44-2f7a1c3e5d21"
      expect(
        cooking.get(id)?.instructionAnchor,
      ).toBeUndefined()
      const instructions = cooking.command(
        id,
        "instructions",
      )!
      expect(
        cooking.display(instructions).page.heading,
      ).toBe("Step 1 of 2")
    },
  )
})
test.skipIf(process.getuid?.() === 0)(
  "a session file in a read-only folder still loads when anchors cannot be saved",
  () => {
    const directory = mkdtempSync(
      join(tmpdir(), "castkit-cooking-"),
    )
    const file = join(directory, "sessions.json")
    const warn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {})
    try {
      writeFileSync(
        file,
        JSON.stringify({
          sessions: [legacySession({})],
          requests: [],
        }),
      )
      chmodSync(directory, 0o500)
      const cooking = createCookingSessions({
        file,
        onChanged: vi.fn(),
      })
      const session = cooking.get(
        "0b6f3c55-8a0e-4d8b-9a44-2f7a1c3e5d21",
      )!
      expect(session.pageAnchor?.heading).toBe(
        "Ingredients",
      )
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      chmodSync(directory, 0o700)
      rmSync(directory, { recursive: true, force: true })
    }
  },
)

test("a session saved on Step 1 under the earlier wrapping still shows Step 1", () => {
  // Under per-code-point wrapping this recipe put Step 1 at index 9 on a
  // 320 × 240 panel. Grapheme wrapping packs the chef emoji differently.
  const chef = {
    ...recipe,
    ingredients: ["👩‍🍳 ".repeat(100)],
    instructions: ["Mix.", "Bake.", "Cool.", "Serve."],
  }
  const step1 = { heading: "Step 1 of 4", occurrence: 0 }
  loadLegacy(
    legacySession({
      recipe: chef,
      width: 320,
      height: 240,
      pageIndex: 9,
      instructionPage: 9,
      pageAnchor: step1,
      instructionAnchor: step1,
    }),
    (cooking) => {
      const id = "0b6f3c55-8a0e-4d8b-9a44-2f7a1c3e5d21"
      const display = cooking.display(cooking.get(id)!)
      expect(display.pageIndex).not.toBe(9)
      expect(display.page.heading).toBe("Step 1 of 4")
      cooking.command(id, "ingredients")
      const back = cooking.command(id, "instructions")!
      expect(cooking.display(back).page.heading).toBe(
        "Step 1 of 4",
      )
    },
  )
})
