import { expect, test } from "@playwright/test"

test("range drafts survive focus and broker updates without starting an action before release", async ({
  page,
  request,
}) => {
  const publish = (brightness: number) =>
    request.post("/__test__/mqtt", {
      data: {
        topic: "castkit/channels/range/fixture/set",
        payload: {
          entities: [
            {
              id: "light.fixture",
              name: "Fixture light",
              domain: "light",
              state: "on",
              attributes: { brightness },
              actions: ["turn_on", "turn_off"],
            },
          ],
        },
      },
    })
  await publish(128)
  const connections = { count: 0 }
  page.on("websocket", () => {
    connections.count += 1
  })
  await page.goto("/view/range-controls")
  const slider = page.getByRole("slider", {
    name: "Brightness",
    exact: true,
  })
  await expect(slider).toBeEnabled()
  const bounds = await slider.boundingBox()
  if (!bounds) {
    throw new Error("Missing range bounds")
  }
  const readCommands = async () => {
    const published = (await (
      await request.get("/__test__/published")
    ).json()) as { topic: string; payload: string }[]
    return published.filter(
      (entry) =>
        entry.topic ===
        "castkit/channels/range/fixture/command",
    )
  }
  const before = (await readCommands()).length
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    bounds.x + bounds.width * 0.75,
    bounds.y + bounds.height / 2,
  )
  await expect(slider).toBeEnabled()
  const draft = await slider.inputValue()
  await page.evaluate(() =>
    window.dispatchEvent(new Event("focus")),
  )
  await publish(100)
  await expect(slider).toHaveValue(draft)
  expect((await readCommands()).length).toBe(before)
  expect(connections.count).toBe(1)
  await page.mouse.up()
  await expect
    .poll(async () => (await readCommands()).length)
    .toBe(before + 1)
  const command = JSON.parse(
    (await readCommands()).at(-1)?.payload ?? "{}",
  )
  expect(command).toMatchObject({
    action: "turn_on",
    entityId: "light.fixture",
    brightness: Number(draft),
  })
  await expect(slider).toBeEnabled()
  await slider.press("ArrowRight")
  await expect
    .poll(async () => (await readCommands()).length)
    .toBe(before + 2)
  expect(
    JSON.parse(
      (await readCommands()).at(-1)?.payload ?? "{}",
    ),
  ).toMatchObject({ brightness: 101 })
})
