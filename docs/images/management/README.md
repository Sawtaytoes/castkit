# Management layout comparison

`before.png` and `after.png` show the same synthetic device definitions at 1920 × 1080,
with the dark color scheme. The original form was built from `4c521bb`; the revised form
is the tabbed management editor in this change. API responses were intercepted with the
fixtures in `e2e/management.spec.ts`, plus four generic device labels to exercise the list.
The preview image is a synthetic SVG clock. Neither screenshot contains live device data.

The review banner in the after image belongs to the isolated review server, not the app.

The current after image includes the integrated platform navigation, screen assignment, and upright preview control. `overview.png` shows the All screens page with synthetic devices and clock output. Both current images use the same 1920 × 1080 viewport.

`views.png` shows the compact selector, saved tags, focused collection tabs, and adjacent
preview at 1600 × 1000. `structured-fields.png` shows the entity label editor after scrolling.
Both use the synthetic definitions from `e2e/__fixtures__/managementPlatform.ts`; neither
contains household configuration. The output uses CastKit's real browser renderer with
synthetic entity data. The review banner is removed from these two public screenshots.
