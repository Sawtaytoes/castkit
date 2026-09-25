# Management layout review

Manual browser captures use generic fixture data. They are review evidence, not screenshot tests.

The before captures use commit `d7f5d78`; the after captures use this change. Both use Chromium with the application's actual Vite output at 390px and 1440px. The standalone HTML comparison has no external dependencies.

`e2e/admin-layout.spec.ts` supplies the corresponding regression fixtures and geometry checks, including 1024px/2560px widths, 200% page zoom, keyboard selection, and both management URL forms.

Open `index.html` through a static HTTP server to review the captures.
