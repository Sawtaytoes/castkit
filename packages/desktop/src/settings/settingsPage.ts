import type {
  CastkitDesktopApi,
  SettingsResult,
  SettingsSnapshot,
} from "./settingsApi.ts"

declare global {
  interface Window {
    castkitDesktop: CastkitDesktopApi
  }
}

const requireElement = <ElementType extends HTMLElement>(
  id: string,
  type: { new (): ElementType },
) => {
  const element = document.getElementById(id)
  if (!(element instanceof type)) {
    throw new Error(`The settings page has no #${id}.`)
  }
  return element
}

const serverForm = requireElement(
  "server-form",
  HTMLFormElement,
)
const serverOriginInput = requireElement(
  "server-origin",
  HTMLInputElement,
)
const serverStatus = requireElement(
  "server-status",
  HTMLParagraphElement,
)
const windowForm = requireElement(
  "window-form",
  HTMLFormElement,
)
const windowPageInput = requireElement(
  "window-page",
  HTMLInputElement,
)
const windowTargets = requireElement(
  "window-targets",
  HTMLFieldSetElement,
)
const windowDisplay = requireElement(
  "window-display",
  HTMLFieldSetElement,
)
const windowFullScreen = requireElement(
  "window-fullscreen",
  HTMLInputElement,
)
const windowStatus = requireElement(
  "window-status",
  HTMLParagraphElement,
)

const showResult = ({
  element,
  result,
  successText,
}: {
  element: HTMLElement
  result: SettingsResult
  successText: string
}) => {
  element.textContent = result.isDone
    ? successText
    : result.error
  element.dataset.tone = result.isDone ? "success" : "error"
}

const renderDisplays = (
  displays: SettingsSnapshot["displays"],
) => {
  const options = displays.map((display) => {
    const label = document.createElement("label")
    label.className = "checkbox"
    const radio = document.createElement("input")
    radio.type = "radio"
    radio.name = "displayId"
    radio.value = String(display.id)
    radio.checked = display.isPrimary
    label.append(
      radio,
      display.isPrimary
        ? `${display.name}, primary`
        : display.name,
    )
    return label
  })
  windowDisplay.replaceChildren(
    windowDisplay.querySelector("legend") ?? "",
    ...options,
  )
}

const renderTargets = (
  targets: SettingsSnapshot["targets"],
) => {
  windowTargets.hidden = targets.length === 0
  windowTargets.replaceChildren(
    windowTargets.querySelector("legend") ?? "",
    ...targets.map((target) => {
      const button = document.createElement("button")
      button.type = "button"
      button.textContent = target.label
      button.title = target.path
      button.addEventListener("click", () => {
        windowPageInput.value = target.path
      })
      return button
    }),
  )
}

const render = (snapshot: SettingsSnapshot) => {
  serverOriginInput.value = snapshot.serverOrigin ?? ""
  windowForm.hidden = snapshot.serverOrigin === null
  renderDisplays(snapshot.displays)
  renderTargets(snapshot.targets)
}

const refresh = async () => {
  render(await window.castkitDesktop.readSettings())
}

serverForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  const result =
    await window.castkitDesktop.saveServerOrigin(
      serverOriginInput.value,
    )
  showResult({
    element: serverStatus,
    result,
    successText: "Saved.",
  })
  if (result.isDone) {
    await refresh()
  }
})

windowForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  const selectedDisplay = windowDisplay.querySelector(
    "input[name=displayId]:checked",
  )
  const result = await window.castkitDesktop.addWindow({
    page: windowPageInput.value,
    displayId:
      selectedDisplay instanceof HTMLInputElement
        ? Number(selectedDisplay.value)
        : Number.NaN,
    isFullScreen: windowFullScreen.checked,
  })
  showResult({
    element: windowStatus,
    result,
    successText: "Window added.",
  })
  if (result.isDone) {
    windowPageInput.value = ""
  }
})

void refresh()
