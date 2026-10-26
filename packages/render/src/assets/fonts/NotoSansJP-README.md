# Noto Sans JP fallback

Noto Sans JP supplies Japanese glyphs missing from Atkinson Hyperlegible and
DejaVu Sans. These bundled static TrueType instances work offline in Satori,
Chromium, browser previews, foreignObject rasterization and resvg text masks.
They do not claim universal Unicode coverage. Latin text retains Atkinson.

Source: Google Fonts `ofl/notosansjp/NotoSansJP[wght].ttf` at commit
[`66a36c8c94b1a5d992ee4e7f392fccfe4945767c`](https://github.com/google/fonts/tree/66a36c8c94b1a5d992ee4e7f392fccfe4945767c/ofl/notosansjp).
Upstream source project: [Noto CJK](https://github.com/notofonts/noto-cjk).
License: SIL Open Font License 1.1, included as `NotoSansJP-OFL.txt`.

Reproduce with FontTools 4.67.0 (development tooling only):

```sh
python -m fontTools.varLib.instancer 'NotoSansJP[wght].ttf' wght=400 --output NotoSansJP-Regular.ttf
python -m fontTools.varLib.instancer 'NotoSansJP[wght].ttf' wght=700 --output NotoSansJP-Bold.ttf
```

Static weights are deliberate: Satori renders variable fonts at their default
instance, so passing the variable file twice would not supply real bold glyphs.
The normal server build copies this directory into the production bundle.
