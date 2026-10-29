import type { StoryObj } from "@storybook/preact-vite"
import adaAvatar from "../../../../e2e/__fixtures__/avatars/ada.jpg"
import graceAvatar from "../../../../e2e/__fixtures__/avatars/grace.jpg"
import { QueuePicker } from "./QueuePicker.tsx"
import "../styles.css"
import "./platform.css"

const meta = {
  title: "Views/Queue chooser",
  parameters: { layout: "fullscreen" },
}
export default meta
type Story = StoryObj<typeof meta>
const data = {
  sessionId: "sample",
  revision: "sample",
  isActive: true,
  expiresAt: 200_000,
  people: [
    {
      id: "ada",
      name: "Ada",
      artworkPath: new URL(adaAvatar, window.location.href)
        .pathname,
    },
    {
      id: "grace",
      name: "Grace",
      artworkPath: new URL(
        graceAvatar,
        window.location.href,
      ).pathname,
    },
  ],
  queues: [
    { id: "films", title: "Movies" },
    { id: "series", title: "Shows" },
    { id: "animation", title: "Animation" },
    { id: "films-two", title: "Movies 2" },
  ],
}
/** Two scanned people and independent matching queues on a square touch panel. */
export const PeopleSelected: Story = {
  render: () => {
    document.documentElement.dataset.scheme = "dark"
    return (
      <div
        style={{
          width: 480,
          height: 480,
          background: "var(--bg)",
        }}
      >
        <QueuePicker
          data={data}
          now={100_000}
          isControlEnabled
          onAction={async () => undefined}
        />
      </div>
    )
  },
}
/** An empty match leaves correction and exit available. */
export const NoMatches: Story = {
  render: () => {
    document.documentElement.dataset.scheme = "dark"
    return (
      <div
        style={{
          width: 480,
          height: 480,
          background: "var(--bg)",
        }}
      >
        <QueuePicker
          data={{ ...data, queues: [] }}
          now={100_000}
          isControlEnabled
          onAction={async () => undefined}
        />
      </div>
    )
  },
}
