import type { ContractData } from "@castkit/sdk/contracts"
import cameraPicture from "../../../../../assets/sample-photos/printer-camera-chamber.jpg"
import { aiUsageFixture, compositionFixture } from "../fixtures.ts"

/** Public fixtures reproduce the highly scaled printer and narrow subscription rail. */
export const prioritySnapshot = {
  ...compositionFixture,
  view: {
    ...compositionFixture.view,
    layout: "rail" as const,
    panels: [compositionFixture.view.panels[0]!, aiUsageFixture.view.panels[0]!],
  },
  channels: {
    ...compositionFixture.channels,
    ...aiUsageFixture.channels,
    prints: {
      ...compositionFixture.channels.prints!,
      data: {
        printers: [{
          ...(compositionFixture.channels.prints!.data as ContractData["printers.v1"]).printers[0]!,
          name: "Printer One",
          jobName: "Desk stand · Blank tiles x3 · Sample model",
          percent: 31,
          remainingMinutes: 25,
          cameraPath: cameraPicture,
          cameraIsLive: false,
        }],
      },
    },
    usage: {
      ...aiUsageFixture.channels.usage!,
      data: {
        providers: [
          { name: "Claude", percentUsed: 97 },
          { name: "Codex 1", percentUsed: 1 },
          { name: "Codex 2", percentUsed: 64 },
        ].map(({ name, percentUsed }) => ({
          id: name,
          name,
          isOk: true,
          windows: [{ id: "weekly", label: "Weekly", percentUsed, periodHours: 168,
            resetsAtMs: Date.UTC(2026, 9, 4, 12) }],
        })),
      },
    },
  },
}

