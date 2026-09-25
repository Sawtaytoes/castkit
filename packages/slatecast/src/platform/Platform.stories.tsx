import type { StoryObj } from "@storybook/preact-vite"
import { compositionFixture } from "./fixtures.ts"
import { PinKeypad } from "./PinKeypad.tsx"
import { DisplayComposition } from "./PlatformApp.tsx"
import "../styles.css"
import "./platform.css"

const meta = {
  title: "Views/Composed Dashboard",
  parameters: { layout: "fullscreen" },
}
export default meta
type Story = StoryObj<typeof meta>
/** Two independent channels share one responsive composition. */
export const PrintersAndRips: Story = {
  render: () => (
    <main class="platform" data-scheme="dark">
      <DisplayComposition
        snapshot={compositionFixture}
        isConnected
        onAction={async () => undefined}
      />
    </main>
  ),
}
/** The keypad works without a hardware keyboard. */
export const Locked: Story = {
  render: () => (
    <PinKeypad
      name="Private display"
      error=""
      isPending={false}
      onUnlock={async () => undefined}
    />
  ),
}
/** Connection loss preserves status but disables actions. */
export const Disconnected: Story = {
  render: () => (
    <main class="platform">
      <p role="status">Connection lost · Retrying</p>
      <DisplayComposition
        snapshot={compositionFixture}
        isConnected={false}
        onAction={async () => undefined}
      />
    </main>
  ),
}
