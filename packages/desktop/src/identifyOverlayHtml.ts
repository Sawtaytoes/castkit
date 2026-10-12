const htmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/** Escape text for an HTML body; a monitor's label comes from its driver. */
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) => htmlEscapes[character] ?? character,
  )

/**
 * The page an identify overlay shows: the display's number, large, with its
 * label and size underneath, inside a frame around the whole monitor.
 */
export const buildIdentifyOverlayHtml = ({
  number,
  label,
  width,
  height,
}: {
  number: number
  label: string
  width: number
  height: number
}) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
html,body{margin:0;height:100%;overflow:hidden;font-family:system-ui,sans-serif;}
.frame{box-sizing:border-box;height:100vh;width:100vw;border:12px solid rgba(42,111,151,0.9);
background:rgba(42,111,151,0.18);display:flex;align-items:center;justify-content:center;}
.badge{background:rgba(0,0,0,0.75);color:#fff;border-radius:18px;padding:24px 48px;text-align:center;}
.number{font-size:min(40vh,240px);font-weight:700;line-height:1;}
.name{font-size:min(6vh,40px);margin-top:8px;}
.size{font-size:min(4vh,28px);opacity:0.8;margin-top:4px;}
</style></head><body><div class="frame"><div class="badge">
<div class="number">${number}</div>
<div class="name">${escapeHtml(label || "Display")}</div>
<div class="size">${width} x ${height}</div>
</div></div></body></html>`
