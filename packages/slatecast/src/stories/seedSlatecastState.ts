import type {
  BrowserDeviceProfile,
  ServerToClientMessage,
  ViewDataState,
} from "@castkit/shared/protocol/ws"
import { buildSnapshot } from "../__fixtures__/buildSnapshot.ts"
import { __resetStateForTests } from "../state.ts"

/**
 * Seed the module-scope signals for a story, the same way the test harness
 * does — write the snapshot into the `<script id="castkit-state">` shell tag
 * and let `__resetStateForTests` re-read it. `connect()` is deliberately never
 * called: a story shows a static panel, not a live socket.
 *
 * `state.ts` holds its signals in module scope and a browser's ESM registry is
 * immutable, so every story must re-seed EVERYTHING on render — a signal left
 * from the previous story would leak in. The Storybook decorator calls this on
 * every render for exactly that reason.
 */
export const seedSlatecastState = ({
  device,
  view,
  data,
}: {
  device: BrowserDeviceProfile
  view: string
  data?: ViewDataState
}) => {
  const snapshot: ServerToClientMessage = buildSnapshot({
    device,
    view,
    data,
  })

  const existing = document.getElementById("castkit-state")
  const shell = existing ?? document.createElement("script")
  shell.setAttribute("type", "application/json")
  shell.setAttribute("id", "castkit-state")
  shell.textContent = JSON.stringify(snapshot)
  if (!existing) {
    document.body.appendChild(shell)
  }

  __resetStateForTests()
}
