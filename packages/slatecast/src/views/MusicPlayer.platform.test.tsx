import { render, screen } from "@testing-library/preact"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import { buildMusicPlayer } from "../__fixtures__/buildMusicPlayer.ts"
import { MusicPlayer } from "./MusicPlayer.tsx"
import "../styles.css"
import "../platform/platform.css"

/**
 * The view as the platform shows it: inside `.platform`, whose stylesheet
 * boxes every button and input. The view's own controls must win.
 */
test("inside the platform the controls keep the view's own sizes and the current row is not dimmed", async () => {
  await page.viewport(1024, 600)
  render(
    <main class="platform">
      <div
        style={{
          position: "relative",
          width: "1024px",
          height: "600px",
        }}
      >
        <MusicPlayer
          data={buildMusicPlayer({ nowMs: Date.now() })}
          layout="side-by-side"
          isLyricsTabVisible
          playedRowCount={2}
          isControlEnabled
          onAction={async () => undefined}
        />
      </div>
    </main>,
  )
  const pause = screen.getByRole("button", {
    name: "Pause",
  })
  const next = screen.getByRole("button", {
    name: "Next track",
  })
  expect(pause.getBoundingClientRect().height).toBe(52)
  expect(next.getBoundingClientRect().height).toBe(40)
  expect(getComputedStyle(next).borderTopWidth).toBe("0px")
  const current = screen.getByRole("button", {
    current: true,
  })
  expect(current).toBeDisabled()
  expect(getComputedStyle(current).opacity).toBe("1")
  expect(current.getBoundingClientRect().height).toBe(46)
  const volume = screen.getByRole("slider", {
    name: "Volume",
  })
  expect(getComputedStyle(volume).paddingTop).toBe("0px")
  expect(getComputedStyle(volume).borderTopWidth).toBe(
    "0px",
  )
})
