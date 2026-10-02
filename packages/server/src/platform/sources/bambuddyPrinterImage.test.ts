import { expect, test } from "vitest"
import { bambuddyPrinterImage } from "./bambuddyPrinterImage.ts"

test("model names resolve only to known image paths", () => {
  expect(bambuddyPrinterImage("H2D Pro")).toBe(
    "/img/printers/h2dpro.png",
  )
  expect(bambuddyPrinterImage("X1 Carbon")).toBe(
    "/img/printers/x1c.png",
  )
  expect(bambuddyPrinterImage("../../secrets")).toBe(
    "/img/printers/default.png",
  )
})
