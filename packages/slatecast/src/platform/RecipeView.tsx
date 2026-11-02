import {
  paginateRecipe,
  type Recipe,
  type RecipeDisplay,
} from "@castkit/sdk/recipe"
import {
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"

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
          style={{ flex: 1, whiteSpace: "pre", margin: 0 }}
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
            RECIPE · {display.recipe.yieldText ?? "Mealie"}
          </span>
          <span>
            Page {display.pageIndex + 1} /{" "}
            {display.pageCount}
          </span>
        </footer>
      </article>
    </div>
  )
}
