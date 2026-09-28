import type {
  ChannelSnapshot,
  ViewDefinition,
} from "@castkit/sdk/contracts"
import { expect, test } from "vitest"
import {
  getPanelActivity,
  isChannelActive,
  isViewActive,
} from "./viewActivity.ts"

const channel = (
  type: string,
  data: unknown,
): ChannelSnapshot => ({
  id: type,
  type,
  data,
  status: "ready",
})
const view = (
  panels: { id: string; channelId?: string }[],
): ViewDefinition => ({
  id: "now",
  name: "Now",
  layout: "grid",
  theme: "dark",
  access: "pin",
  isControlEnabled: true,
  isActiveOnly: true,
  panels: panels.map((panel) => ({
    id: panel.id,
    specId: panel.id,
    bindings: (panel.channelId
      ? { data: panel.channelId }
      : {}) as Record<string, string>,
    settings: {},
  })),
})

test("a printer channel is active while it lists a printer", () => {
  expect(
    isChannelActive(
      channel("printers.v1", { printers: [] }),
    ),
  ).toBe(false)
  expect(
    isChannelActive(
      channel("printers.v1", { printers: [{ id: "1" }] }),
    ),
  ).toBe(true)
})

test("a rip deck is active only when the tower is present with a job", () => {
  const idle = {
    bays: [{ id: "1" }],
    alerts: [],
    isPresent: true,
    activeCount: 0,
    loadedDiscCount: 1,
  }
  expect(
    isChannelActive(channel("rip-deck.v1", idle)),
  ).toBe(false)
  expect(
    isChannelActive(
      channel("rip-deck.v1", { ...idle, activeCount: 1 }),
    ),
  ).toBe(true)
  expect(
    isChannelActive(
      channel("rip-deck.v1", {
        ...idle,
        bays: [{ id: "1", jobId: "job" }],
      }),
    ),
  ).toBe(true)
  expect(
    isChannelActive(
      channel("rip-deck.v1", {
        ...idle,
        isPresent: false,
        activeCount: 1,
      }),
    ),
  ).toBe(false)
})

test("music is active while playing; a contract with no idle state is always active", () => {
  expect(
    isChannelActive(
      channel("now-playing.v1", { isPlaying: false }),
    ),
  ).toBe(false)
  expect(
    isChannelActive(
      channel("now-playing.v1", { isPlaying: true }),
    ),
  ).toBe(true)
  expect(
    isChannelActive(channel("images.v1", { images: [] })),
  ).toBe(true)
  expect(isChannelActive(undefined)).toBe(false)
  expect(
    isChannelActive({
      id: "waiting",
      type: "printers.v1",
      data: null,
      status: "waiting",
    }),
  ).toBe(false)
})

test("a view's activity is keyed by panel, and the view is active when any panel is", () => {
  const channels = {
    rips: channel("rip-deck.v1", {
      bays: [],
      alerts: [],
      isPresent: false,
      activeCount: 0,
      loadedDiscCount: 0,
    }),
    prints: channel("printers.v1", {
      printers: [{ id: "1" }],
    }),
  }
  const composed = view([
    { id: "rip-deck", channelId: "rips" },
    { id: "printer-status", channelId: "prints" },
    { id: "clock" },
  ])
  expect(
    getPanelActivity({ view: composed, channels }),
  ).toEqual({
    "rip-deck": false,
    "printer-status": true,
    clock: true,
  })
  expect(isViewActive({ view: composed, channels })).toBe(
    true,
  )
  expect(
    isViewActive({
      view: view([{ id: "rip-deck", channelId: "rips" }]),
      channels,
    }),
  ).toBe(false)
})
