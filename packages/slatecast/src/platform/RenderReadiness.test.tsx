import {
  fireEvent,
  render,
  waitFor,
} from "@testing-library/preact"
import { afterEach, expect, test, vi } from "vitest"
import { useRenderReadiness } from "./RenderReadiness.ts"

const Surface = ({
  isOptional,
}: {
  isOptional: boolean
}) => {
  const isReady = useRenderReadiness("composition")
  return (
    <main class="platform" data-ready={String(isReady)}>
      <img
        alt=""
        data-castkit-media-readiness={
          isOptional ? "optional" : undefined
        }
      />
    </main>
  )
}
afterEach(() => vi.restoreAllMocks())

test("optional artwork does not hold a complete composition behind an unfinished image", async () => {
  vi.spyOn(
    HTMLImageElement.prototype,
    "complete",
    "get",
  ).mockReturnValue(false)
  const screen = render(<Surface isOptional />)
  await waitFor(() =>
    expect(
      screen.container.querySelector("main"),
    ).toHaveAttribute("data-ready", "true"),
  )
})

test("required media still holds readiness until loading or failure settles", async () => {
  const complete = vi
    .spyOn(HTMLImageElement.prototype, "complete", "get")
    .mockReturnValue(false)
  const screen = render(<Surface isOptional={false} />)
  await waitFor(() => expect(complete).toHaveBeenCalled())
  expect(
    screen.container.querySelector("main"),
  ).toHaveAttribute("data-ready", "false")
  const image = screen.container.querySelector("img")
  if (!image)
    throw new Error("The media fixture is missing")
  fireEvent.error(image)
  await waitFor(() =>
    expect(
      screen.container.querySelector("main"),
    ).toHaveAttribute("data-ready", "true"),
  )
})
