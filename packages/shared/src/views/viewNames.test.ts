import { describe, expect, test } from "vitest"
import {
  getIsLossyEncodableView,
  getIsPhotoView,
} from "./viewNames.ts"

describe("photo view classifications", () => {
  test("Photo Frame (Agenda) participates in photo rotation", () => {
    expect(getIsPhotoView("Photo Frame (Agenda)")).toBe(
      true,
    )
  })

  test("Photo Frame (Agenda) stays lossless because it also carries text", () => {
    expect(
      getIsLossyEncodableView("Photo Frame (Agenda)"),
    ).toBe(false)
    expect(
      getIsLossyEncodableView("Photo Frame (Fill)"),
    ).toBe(true)
  })
})
