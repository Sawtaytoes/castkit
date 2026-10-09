import type { StoryObj } from "@storybook/preact-vite"
import { cameraAlertSnapshot } from "./__fixtures__/cameraAlert.ts"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

const meta = {
  title: "Views/Camera Alert",
  parameters: { layout: "fullscreen" },
}
export default meta
type Story = StoryObj<typeof meta>
export const Snapshots: Story = {
  render: () => {
    document.documentElement.dataset.scheme = "dark"
    const snapshot = {
      ...cameraAlertSnapshot,
      channels: {
        camera: {
          ...cameraAlertSnapshot.channels.camera!,
          data: {
            cameras: [
              {
                id: "entrance",
                name: "Entrance",
                isLive: false,
                url: new URL(
                  "sample-photos/landscape-gradient.jpg",
                  document.baseURI,
                ).pathname,
              },
            ],
          },
        },
      },
    }
    return (
      <main class="platform" data-device="true">
        <DisplayComposition
          snapshot={snapshot}
          isConnected
          onAction={async () => undefined}
        />
      </main>
    )
  },
}
