import {
  completeRecipeLayout,
  paginateRecipe,
  type Recipe,
  type RecipeDisplay,
} from "@castkit/sdk/recipe"
import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"

/** Step dividers cycle through the Spectra 6 panel colors CastKit already uses. */
const stepDividerColors = [
  "#ce2426",
  "#1f1eaf",
  "#1dad23",
  "#e8df24",
]
const layout = completeRecipeLayout
const sectionHeading = {
  margin: "0 0 0.6em",
  fontSize: "0.72em",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 700,
} as const
/**
 * The whole recipe on one white screen. The server picks a font that should
 * fit; this shrinks it further, before paint, if the real text runs longer.
 */
const CompleteRecipe = ({
  display,
}: {
  display: RecipeDisplay
}) => {
  const article = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const element = article.current
    if (!element) return
    const fits = (fontSize: number) => {
      element.style.fontSize = `${fontSize}px`
      return (
        element.scrollHeight <= element.clientHeight + 1 &&
        element.scrollWidth <= element.clientWidth + 1
      )
    }
    // The server estimate is cautious: grow into spare room, then shrink if needed.
    let fontSize = display.fontSize
    while (
      fontSize < layout.largestFont &&
      fits(fontSize + 0.5)
    )
      fontSize += 0.5
    while (fontSize > 10 && !fits(fontSize)) fontSize -= 0.5
    fits(fontSize)
  })
  const { recipe } = display
  const isWide = display.width >= display.height
  const ingredients = recipe.ingredients.length
    ? recipe.ingredients
    : ["No ingredients saved. Check the original recipe."]
  const steps = recipe.instructions.length
    ? recipe.instructions
    : ["No instructions saved. Check the original recipe."]
  return (
    <article
      ref={article}
      aria-label="Recipe page"
      data-recipe-layout="complete"
      style={{
        width: display.width,
        height: display.height,
        boxSizing: "border-box",
        padding: display.padding,
        overflow: "hidden",
        fontFamily: "Arial, Helvetica, sans-serif",
        // A long unbroken word wraps instead of running off the panel.
        overflowWrap: "anywhere",
        fontSize: display.fontSize,
        lineHeight: layout.lineHeight,
        background: "#fff",
        color: "#000",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.8em",
          paddingBottom: "0.4em",
          marginBottom: "0.6em",
          borderBottom: "2px solid #000",
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            minWidth: 0,
            fontSize: `${layout.titleScale}em`,
            lineHeight: 1.15,
            fontWeight: 700,
          }}
        >
          {recipe.name}
        </h1>
        {recipe.yieldText ? (
          <span
            style={{
              maxWidth: `${layout.yieldShare * 100}%`,
              textAlign: "right",
              flexShrink: 0,
              paddingTop: "0.3em",
              fontSize: "0.85em",
            }}
          >
            {recipe.yieldText}
          </span>
        ) : null}
      </header>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isWide
            ? `${layout.ingredientShare * 100}% minmax(0, 1fr)`
            : "minmax(0, 1fr)",
          gap: isWide ? `0 ${layout.columnGap}em` : "0.6em",
          minHeight: 0,
        }}
      >
        <section
          aria-label="Ingredients"
          style={
            isWide
              ? {
                  borderRight: "1px solid #000",
                  paddingRight: `${layout.columnGap}em`,
                }
              : undefined
          }
        >
          <h2 style={sectionHeading}>Ingredients</h2>
          {ingredients.map((item, index) => (
            <p
              // biome-ignore lint/suspicious/noArrayIndexKey: ingredients can repeat and never reorder
              key={index}
              style={{
                margin: `0 0 ${layout.itemGap}em`,
              }}
            >
              {item}
            </p>
          ))}
        </section>
        <section aria-label="Method">
          <h2 style={sectionHeading}>Method</h2>
          {steps.map((step, index) => (
            <p
              // biome-ignore lint/suspicious/noArrayIndexKey: steps never reorder
              key={index}
              data-recipe-step={index + 1}
              style={{
                margin: 0,
                display: "grid",
                gridTemplateColumns: "1.3em minmax(0, 1fr)",
                gap: "0.3em",
                paddingBottom: `${layout.stepGap / 2}em`,
                marginBottom: `${layout.stepGap / 2}em`,
                borderBottom:
                  index + 1 < steps.length
                    ? `3px solid ${stepDividerColors[index % stepDividerColors.length]}`
                    : "none",
              }}
            >
              <span style={{ fontWeight: 700 }}>
                {recipe.instructions.length
                  ? index + 1
                  : ""}
              </span>
              <span>{step}</span>
            </p>
          ))}
          {recipe.notes.length ? (
            <div
              style={{
                borderTop: "1px solid #000",
                paddingTop: "0.5em",
              }}
            >
              <h2 style={sectionHeading}>Notes</h2>
              {recipe.notes.map((note, index) => (
                <p
                  // biome-ignore lint/suspicious/noArrayIndexKey: notes never reorder
                  key={index}
                  style={{
                    margin: `0 0 ${layout.itemGap}em`,
                    fontSize: `${layout.noteScale}em`,
                  }}
                >
                  {note}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </article>
  )
}

/** The panel shows a complete static page. Phone/voice owns navigation, never a scrollbar. */
export const RecipeView = ({
  data,
}: {
  data: RecipeDisplay | { recipe: Recipe }
}) => {
  const element = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({
    width: 800,
    height: 480,
  })
  useLayoutEffect(() => {
    const panel = element.current
    if (!panel) return
    const measure = () =>
      setSize({
        width: panel.clientWidth,
        height: panel.clientHeight,
      })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])
  if (!data?.recipe)
    return (
      <div class="platform-empty">No recipe selected</div>
    )
  const display =
    "page" in data
      ? data
      : (() => {
          const fallback = paginateRecipe(
            data.recipe,
            Math.max(320, size.width),
            Math.max(240, size.height),
          )
          return {
            ...fallback,
            recipe: data.recipe,
            page: fallback.pages[0]!,
            pageIndex: 0,
            pageCount: fallback.pages.length,
          }
        })()
  const scale = Math.min(
    size.width / display.width,
    size.height / display.height,
  )
  return (
    <div
      ref={element}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        background: "#fff",
        color: "#111",
      }}
    >
      {display.page.isComplete ? (
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <CompleteRecipe display={display} />
        </div>
      ) : (
        <article
          aria-label="Recipe page"
          style={{
            width: display.width,
            height: display.height,
            boxSizing: "border-box",
            padding: display.padding,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            fontFamily: "monospace",
            fontSize: display.fontSize,
            lineHeight: `${display.lineHeight}px`,
            display: "flex",
            flexDirection: "column",
            gap: display.fontSize / 2,
          }}
        >
          <header
            style={{
              height: display.lineHeight * 2,
              flexShrink: 0,
              overflow: "hidden",
              fontFamily: "sans-serif",
              fontWeight: 700,
              fontSize: display.fontSize * 1.2,
              lineHeight: `${display.lineHeight}px`,
            }}
          >
            {display.recipe.name}
          </header>
          <div
            style={{
              fontWeight: 700,
              color: "#174b31",
              height: display.lineHeight,
              flexShrink: 0,
            }}
          >
            {display.page.heading}
          </div>
          <div
            style={{
              flex: 1,
              whiteSpace: "pre",
              margin: 0,
            }}
          >
            {display.page.lines.join("\n")}
          </div>
          <footer
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "sans-serif",
              fontSize: display.fontSize * 0.7,
              height: display.lineHeight,
              flexShrink: 0,
            }}
          >
            <span>
              RECIPE ·{" "}
              {display.recipe.yieldText ?? "Mealie"}
            </span>
            <span>
              Page {display.pageIndex + 1} /{" "}
              {display.pageCount}
            </span>
          </footer>
        </article>
      )}
    </div>
  )
}
