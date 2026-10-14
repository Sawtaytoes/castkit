import { useEffect, useState } from "preact/hooks"

const PATTERNS = [
  { name: "Full black", background: "#000000" },
  { name: "Full white", background: "#ffffff" },
  { name: "Near black · RGB 8", background: "#080808" },
  { name: "Dark gray · RGB 32", background: "#202020" },
  { name: "Mid gray · RGB 128", background: "#808080" },
  { name: "Red", background: "#ff0000" },
  { name: "Green", background: "#00ff00" },
  { name: "Blue", background: "#0000ff" },
  {
    name: "Grayscale ramp",
    background:
      "linear-gradient(to right, #000000, #ffffff)",
  },
  {
    name: "Black level steps",
    background:
      "linear-gradient(to right, #000 0% 12.5%, #040404 12.5% 25%, #080808 25% 37.5%, #101010 37.5% 50%, #181818 50% 62.5%, #202020 62.5% 75%, #303030 75% 87.5%, #404040 87.5% 100%)",
  },
  {
    name: "Checkerboard",
    background:
      "repeating-conic-gradient(#000000 0% 25%, #ffffff 0% 50%) 0 0 / 20vmin 20vmin",
  },
] as const

const buttonStyle = {
  color: "#ffffff",
  background: "#262626",
  border: "1px solid #888888",
  borderRadius: "0.5rem",
  padding: "0.7rem 1rem",
  font: "inherit",
  minHeight: "44px",
}

/** Full-field patterns expose black level, uniformity and color without a theme tint. */
export const DisplayTest = () => {
  const [patternIndex, setPatternIndex] = useState(0)
  const [isControlsVisible, setIsControlsVisible] =
    useState(true)
  const pattern = PATTERNS[patternIndex]!

  const advancePattern = (direction: number) => {
    setPatternIndex(
      (current) =>
        (current + direction + PATTERNS.length) %
        PATTERNS.length,
    )
    setIsControlsVisible(true)
  }

  useEffect(() => {
    if (!isControlsVisible) {
      return
    }
    const timeout = window.setTimeout(
      () => setIsControlsVisible(false),
      4_000,
    )
    return () => window.clearTimeout(timeout)
  }, [isControlsVisible, patternIndex])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLButtonElement
      ) {
        return
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        advancePattern(1)
      } else if (event.key === "ArrowLeft") {
        event.preventDefault()
        advancePattern(-1)
      } else if (event.key === "Escape") {
        setIsControlsVisible(false)
      } else if (event.key === "Enter") {
        setIsControlsVisible(true)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () =>
      window.removeEventListener("keydown", handleKey)
  }, [])

  return (
    <div
      class="display-test"
      data-pattern={pattern.name}
      style={{
        position: "absolute",
        inset: 0,
        background: pattern.background,
        touchAction: "none",
      }}
      onPointerDown={() =>
        setIsControlsVisible((isVisible) => !isVisible)
      }
    >
      {isControlsVisible ? (
        <section
          aria-label="Display test controls"
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(88%, 38rem)",
            boxSizing: "border-box",
            padding: "clamp(12px, 3vmin, 24px)",
            borderRadius: "1rem",
            color: "#ffffff",
            background: "#101010",
            fontSize: "clamp(14px, 2.8vmin, 24px)",
          }}
        >
          <h1
            style={{
              margin: "0 0 0.6rem",
              fontSize: "1.3em",
            }}
          >
            Display test
          </h1>
          <select
            aria-label="Test pattern"
            value={patternIndex}
            onChange={(event) =>
              setPatternIndex(
                Number(event.currentTarget.value),
              )
            }
            style={{ ...buttonStyle, width: "100%" }}
          >
            {PATTERNS.map((choice, index) => (
              <option key={choice.name} value={index}>
                {choice.name}
              </option>
            ))}
          </select>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginTop: "0.7rem",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              style={buttonStyle}
              onClick={() => advancePattern(-1)}
            >
              Previous
            </button>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => advancePattern(1)}
            >
              Next
            </button>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setIsControlsVisible(false)}
            >
              Hide controls
            </button>
          </div>
          <p
            style={{
              margin: "0.8rem 0 0",
              lineHeight: 1.4,
            }}
          >
            Controls hide after 4 seconds. Tap the center to
            show them again. Drag from the side to change
            views.
          </p>
          <p
            style={{
              margin: "0.6rem 0 0",
              lineHeight: 1.4,
            }}
          >
            These patterns leave your backlight brightness
            unchanged.
          </p>
        </section>
      ) : null}
    </div>
  )
}
