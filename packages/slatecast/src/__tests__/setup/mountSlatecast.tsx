import type { ServerToClientMessage } from "@castkit/shared/protocol/ws"
import { render } from "@testing-library/preact"
import { onTestFinished } from "vitest"
import { buildSnapshot } from "../../__fixtures__/buildSnapshot.ts"
import { App } from "../../App.tsx"
import {
  __resetStateForTests,
  connect,
} from "../../state.ts"
import { createSlatecastServer } from "./slatecastServer.ts"

/**
 * Boots the SPA the way the server does: the page shell carries the snapshot
 * inlined in a `<script id="castkit-state">` tag, the client reads it at module
 * load, then opens the WebSocket.
 *
 * `state.ts` keeps its signals in module scope, and a browser's ESM registry is
 * immutable — `vi.resetModules()` would hand back the same instance — so the
 * shell is written first and `__resetStateForTests()` re-seeds from it.
 */
export const mountSlatecast = async ({
  snapshot = buildSnapshot(),
}: {
  snapshot?: ServerToClientMessage
} = {}) => {
  const server = createSlatecastServer()
  await server.start()

  // Must land before the reset below — that re-reads this tag.
  const shell = document.createElement("script")
  shell.setAttribute("type", "application/json")
  shell.setAttribute("id", "castkit-state")
  shell.textContent = JSON.stringify(snapshot)
  document.body.appendChild(shell)

  __resetStateForTests()

  const disconnect = connect()
  const view = render(<App />)
  await server.waitForConnection()

  onTestFinished(() => {
    disconnect()
    server.stop()
    shell.remove()
  })

  return { server, view }
}
