import { type ComponentChildren, h } from "preact"

const allowedTags = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "h1",
  "h2",
  "h3",
  "h4",
  "span",
  "div",
  "details",
  "summary",
])
const blockedTags = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "img",
  "svg",
  "math",
  "link",
  "meta",
])
const renderNode = (node: Node): ComponentChildren => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent
  }
  if (!(node instanceof Element)) {
    return null
  }
  const tag = node.tagName.toLowerCase()
  if (blockedTags.has(tag)) {
    return null
  }
  const children = Array.from(node.childNodes).map(
    renderNode,
  )
  if (tag === "a") {
    const href = node.getAttribute("href") ?? ""
    return /^https?:\/\//i.test(href)
      ? h(
          "a",
          {
            href,
            target: "_blank",
            rel: "noopener noreferrer",
          },
          children,
        )
      : children
  }
  return allowedTags.has(tag)
    ? h(tag, {}, children)
    : children
}

/** Reports retain text and table structure; scripts, styles, media, and arbitrary attributes never enter the page. */
export const ReportContent = ({
  content,
}: {
  content: string
}) => {
  const template = document.createElement("template")
  template.innerHTML = content.slice(0, 100_000)
  return (
    <div class="platform-report">
      {Array.from(template.content.childNodes).map(
        renderNode,
      )}
    </div>
  )
}
