# Retained-view visual comparison

The first PR289 capture reported three changed working-camera fixtures; 294 other
pictures were unchanged. Pixel inspection found differences only in the sample JPEG
areas: maximum RGB-channel deltas were 2/255 at 992×592 and 3/255 at the other sizes.
There was no layout, text or control change.

A detached checkout of unchanged master `07c05c9344f61b41bc50d11b1622da016ed1d8f5`
was captured with the same current browser and dependencies. All three images were
pixel-for-pixel identical to PR289's actual images. The local baseline diagnostic
allowed the shared dependency font directory so it used the same Outfit font.

`expected-*.png` preserves the previously published baseline; `actual-*.png` preserves
the PR capture reproduced by unchanged master. This evidence diagnoses baseline
rendering drift rather than a product change. Refresh the unchanged master's visual
baseline, then compare the PR normally; do not loosen the pixel threshold or approve
an unexamined application difference.
