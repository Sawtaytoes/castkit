# Noto Sans JP for the live view

These four WOFF2 files are subsets of the Noto Sans JP files in
`packages/render/src/assets/fonts/` (see that folder's README for the upstream
source). The server renderer needs TrueType; a browser panel does better with
small WOFF2 slices, because it downloads only the slices its text uses.

- `*-kana.woff2` — kana, CJK punctuation, enclosed forms, and fullwidth forms
  (about 136 KB each).
- `*-kanji.woff2` — CJK radicals and ideographs, including Extension A and the
  supplementary planes (about 2 MB each).

`japaneseFont.css` repeats these ranges in each face's `unicode-range`. Change
both together.

License: SIL Open Font License 1.1, included as `NotoSansJP-OFL.txt`.

Regenerate with fontTools 4.60.1:

```sh
kana="U+3000-30FF,U+3190-319F,U+31F0-31FF,U+3200-33FF,U+FE30-FE4F,U+FF00-FFEF"
kanji="U+2E80-2FDF,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+20000-2FA1F"
for weight in Regular Bold; do
  for slice in kana kanji; do
    ranges=$([ "$slice" = kana ] && echo "$kana" || echo "$kanji")
    uvx --from 'fonttools[woff]==4.60.1' pyftsubset \
      "../../../../render/src/assets/fonts/NotoSansJP-$weight.ttf" \
      --unicodes="$ranges" --layout-features='*' --flavor=woff2 \
      --output-file="NotoSansJP-$weight-$slice.woff2"
  done
done
```
