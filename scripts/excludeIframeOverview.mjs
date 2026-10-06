import { readFile, writeFile } from "node:fs/promises"

// The browser overview is a lazy iframe grid; every cell is already captured
// separately. Remove this existing excluded shot before enumeration, so its
// network-idle wait cannot fail the job before the old post-capture removal.
const path =
  "packages/slatecast/storybook-static/index.json"
const index = JSON.parse(await readFile(path, "utf8"))
const excluded =
  "overview-all-screens--every-view-every-panel"
if (!index.entries[excluded]) {
  throw new Error(
    "The excluded browser overview story was not found",
  )
}
index.entries = Object.fromEntries(
  Object.entries(index.entries).filter(
    ([id]) => id !== excluded,
  ),
)
await writeFile(path, JSON.stringify(index))
