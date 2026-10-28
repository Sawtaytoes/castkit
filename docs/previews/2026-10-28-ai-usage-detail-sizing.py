import base64
import json
import re
import sys
from pathlib import Path

repository = Path(__file__).resolve().parents[2]
destination = (
    Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).with_suffix(".html")
)
destination.parent.mkdir(parents=True, exist_ok=True)


def data_url(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


fonts = repository / "packages/slatecast/node_modules/@charcuterie/tokens/fonts"
font = data_url(fonts / "outfit-1.woff2", "font/woff2")
images = repository / "docs/images/ai-usage-readable-type"
overview = data_url(images / "overview.png", "image/png")
current = data_url(images / "claude-after.png", "image/png")
icon_source = (repository / "packages/slatecast/src/platform/AiUsageProviderIcon.tsx").read_text()
mark = re.search(r'claude:\s*"([^"]+)"', icon_source).group(1)

html = """<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AI Usage proportions</title>
<style>
:root{color-scheme:dark}
@font-face{font-family:Outfit;src:url(FONT_URL) format('woff2');font-weight:100 900;font-display:block}
*{box-sizing:border-box}body{margin:0;font-family:Outfit,system-ui,sans-serif;color:var(--foreground,#e5e7eb)}
nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}button{font:inherit;border:1px solid var(--border,#424a56);border-radius:8px;padding:9px 12px;background:var(--secondary,#252c35);color:inherit;cursor:pointer}button[aria-pressed=true]{background:var(--primary,#6454ed);color:var(--primary-foreground,#fff)}
.caption{font-size:14px;color:var(--muted-foreground,#a9b2c2);margin:0 0 12px}.viewport{position:relative;width:100%;overflow:hidden;border-radius:16px}.canvas{width:1024px;height:600px;transform-origin:top left;position:absolute;top:0;left:0}
.canvas[hidden]{display:none}img.canvas{object-fit:contain}.device{padding:14px;background:#141a23;color:#e8ebf0;font-family:Outfit,sans-serif;line-height:1.2}
.panel{height:572px;border:1px solid #252d38;background:#1e2632;border-radius:16px;padding:10px;overflow:hidden}.content{display:flex;flex-direction:column;gap:18px;padding-bottom:12px}
header{display:flex;align-items:center;gap:12px;height:60px;padding-bottom:12px;flex:none}.back{display:grid;place-items:center;width:48px;height:48px;border:1px solid #252d38;border-radius:8px;flex:none}.back svg{width:32px;height:32px}.brand{display:flex;align-items:center;gap:12px}.brand>svg{width:40px;height:40px}h2{font-size:40px;line-height:1.2;margin:0;font-weight:700}
.notice{font-size:26px;line-height:1.2;margin:0;color:#aab3c2}.row{display:flex;flex-direction:column;justify-content:center;gap:10px;min-height:120px;flex:none}.row-head{display:flex;align-items:baseline;justify-content:space-between;gap:24px}.label{font-size:32px;font-weight:600}.value{font-size:34px;font-weight:700}.track{height:24px;border-radius:12px;background:#0c1118;overflow:hidden;position:relative;flex:none}.fill{position:absolute;inset:0 auto 0 0;background:#6350e9}.reset{font-size:26px;text-align:right;color:#aab3c2}
.stronger .row{min-height:125px}.stronger .label{font-size:36px}.stronger .value{font-size:40px}.stronger .track{height:28px;border-radius:14px}.stronger .reset{font-size:28px}
.explanation{font-size:15px;line-height:1.5;margin:12px 0 0;color:var(--muted-foreground,#a9b2c2)}
</style>
<nav aria-label="Compare detail sizes">
<button type="button" data-view="overview" aria-pressed="false">Overview reference</button>
<button type="button" data-view="current" aria-pressed="false">Baseline details</button>
<button type="button" data-view="matched" aria-pressed="false">A · Match overview</button>
<button type="button" data-view="stronger" aria-pressed="true">B · Larger</button>
</nav>
<p class="caption">Static design options at 1024 × 600, scaled to fit. The application uses shared dynamic sizing.</p>
<div class="viewport">
<img class="canvas" data-screen="overview" src="OVERVIEW_URL" alt="Current overview reference" hidden>
<img class="canvas" data-screen="current" src="CURRENT_URL" alt="Currently deployed subscription details" hidden>
DETAIL_OPTIONS
</div>
<p class="explanation" id="description">B is the chosen visual direction. The application follows the overview’s dynamic metrics rather than these fixed preview sizes.</p>
<script>
const descriptions={overview:'The overview reference from the deployed fixture.',current:'Baseline detail styling: 30px regular quota labels, 34px percentages, 20px bars and 26px resets.',matched:'A matches the overview heading weight, uses 32px quota labels and 24px bars, and keeps the existing percentage/reset sizes.',stronger:'B proposes quota labels to 36px, percentages to 40px, bars to 28px and resets to 28px. All three limits stay visible.'};
document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach(other => {
      other.setAttribute('aria-pressed', String(other === button));
    });
    document.querySelectorAll('[data-screen]').forEach(screen => {
      screen.hidden = screen.dataset.screen !== button.dataset.view;
    });
    document.getElementById('description').textContent = descriptions[button.dataset.view];
  });
});
const viewport = document.querySelector('.viewport');
const resize = () => {
  const scale = viewport.clientWidth / 1024;
  viewport.style.height = `${600 * scale}px`;
  document.querySelectorAll('.canvas').forEach(canvas => {
    canvas.style.transform = `scale(${scale})`;
  });
};
new ResizeObserver(resize).observe(viewport);
resize();
document.fonts.ready.then(() => console.log('Preview fonts ready'));
</script></html>"""

options = []
rows = [
    ("Weekly (all models)", 46, "Mon, Jan 7, 6:00 AM CST"),
    ("5-hour limit", 93, "Tue, Jan 1, 9:00 AM CST"),
    ("Weekly Fable", 88, "Mon, Jan 7, 6:00 AM CST"),
]
for name in ("matched", "stronger"):
    hidden = " hidden" if name == "matched" else ""
    heading = f'<header><div class="back"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m15 4-8 8 8 8"/></svg></div><div class="brand"><svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path d="{mark}"/></svg><h2>Claude</h2></div></header>'
    body = "".join(
        f'<section class="row"><div class="row-head"><span class="label">{label}</span><strong class="value">{percent}%</strong></div><div class="track"><div class="fill" style="width:{100 - percent}%"></div></div><div class="reset">Resets {reset}</div></section>'
        for label, percent, reset in rows
    )
    options.append(
        f'<main class="canvas device {name}" data-screen="{name}"{hidden}><div class="panel"><div class="content">{heading}<p class="notice">Percentages show remaining quota.</p>{body}</div></div></main>'
    )

html = (
    html.replace("FONT_URL", font)
    .replace("OVERVIEW_URL", overview)
    .replace("CURRENT_URL", current)
    .replace("DETAIL_OPTIONS", "".join(options))
)
destination.write_text(html)
print(json.dumps({"preview": str(destination)}))
