/** @type {import('@castkit/sdk/plugin').CastKitPlugin} */
const plugin = {
  manifest: {
    id: "example.clock",
    name: "Example clock",
    version: "0.1.0",
    apiVersion: 1,
    adapters: [],
    viewSpecs: [
      {
        id: "example-clock",
        name: "Custom clock",
        description:
          "A framework-independent renderer bound to the standard time contract.",
        inputs: [
          {
            key: "time",
            label: "Time",
            type: "time.v1",
            isRequired: true,
          },
        ],
        settings: [],
        renderers: ["browser", "image"],
        valueLifetimeMilliseconds: 60000,
        browserEntry:
          "@castkit/example-clock-plugin/browser",
      },
    ],
  },
}
export default plugin
