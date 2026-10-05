import type { ViewportName } from "@charcuterie/vitest-config/viewports.js"
import type { Page, TestInfo } from "@playwright/test"

/**
 * Which of the four windows this project runs in (`narrow`, `tall`, `wide`,
 * `ultrawide`) — `@charcuterie/playwright-config` names it in each project's
 * metadata.
 */
export const windowOf = (testInfo: TestInfo) =>
  testInfo.project.metadata.viewport as ViewportName

/**
 * Management's sections are a rail beside the page in every window but the
 * Narrow View, where they fold into a menu behind one button. A test that
 * reaches for a section link opens that menu first on the phone — the claim
 * is the same in every window; only where the link lives differs.
 */
export const showManagementNavigation = async (
  page: Page,
  testInfo: TestInfo,
) => {
  if (windowOf(testInfo) === "narrow") {
    await page
      .getByRole("button", { name: "Open navigation" })
      .click()
  }
}

/**
 * The device list sits beside the device editor in every window but the
 * Narrow View, where it is a panel behind the `Devices` button.
 */
export const showDeviceList = async (
  page: Page,
  testInfo: TestInfo,
) => {
  if (windowOf(testInfo) === "narrow") {
    await page
      .getByRole("button", { name: "Devices", exact: true })
      .click()
  }
}
