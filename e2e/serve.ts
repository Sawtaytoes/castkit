import { startTestServer } from "./testServer.ts"

/**
 * Entry point for Playwright's `webServer`. Boots the harness from
 * `testServer.ts` on PORT and stays up for the run.
 */
const port = Number(process.env.PORT ?? 3100)

await startTestServer({ port })
console.log(`[castkit-e2e] serving on :${port}`)
