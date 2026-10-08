import { prioritySnapshot } from "./priorityComposition.ts"

const printer = prioritySnapshot.channels.prints.data.printers[0]!

/** Two active cameras and three single-row quotas reproduce a monitoring view. */
export const workingCameraSnapshot = {
  ...prioritySnapshot,
  view: {
    ...prioritySnapshot.view,
    layout: "adaptive" as const,
    panels: prioritySnapshot.view.panels.map((panel) => ({
      ...panel,
      settings: {
        ...panel.settings,
        isCompactFacts: true,
        isCompactControls: true,
        isFilamentVisible: false,
      },
    })),
  },
  channels: {
    ...prioritySnapshot.channels,
    prints: {
      ...prioritySnapshot.channels.prints,
      data: {
        printers: [1, 2].map((index) => ({
          ...printer,
          id: `printer-${index}`,
          name: `Printer ${index}`,
          jobName: "Sample desk organizer",
          currentLayer: 21,
          totalLayers: 119,
          filamentText: "PLA",
          thumbnailPath: printer.cameraPath,
        })),
      },
    },
  },
}
