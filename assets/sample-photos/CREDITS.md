# Sample photo credits

Test images for the Storybook photo-frame views and the dithering comparison.
They are **not** decoration: each one is here because it stresses a different
part of the quantizer, and they let the browser preview show what a panel with
no hardware dithering (the M5Paper) will actually paint.

Every file is **CC0 / public-domain dedication** — verified against the
Wikimedia Commons API at retrieval time, not assumed. CastKit is a public OSS
repo, so anything that is merely "free to use" (Unsplash and Pexels have their
own licenses, which are *not* CC0) does not belong here. If you add an image,
verify the license at the source and add its row below in the same commit.

Retrieved 2026-08-03. Each was downscaled to 1280px on the long edge and
re-encoded as JPEG (mozjpeg) to keep the repo light; the originals are larger.

| File | Why it's here | Original | Author | License | Source |
| --- | --- | --- | --- | --- | --- |
| `portrait-face.jpg` | Single face, portrait orientation — face-aware cropping, and a near-neutral sepia that must not pick up color speckle on E Ink Spectra 6. | 1206x1501 | Unknown (Metropolitan Museum of Art) | CC0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Face_detail,_-Portrait_of_a_Youth-_MET_DP274830_(cropped)_(cropped).jpg) |
| `portrait-face-second.jpg` | A second portrait, for the 'Photo Frame (Duo)' side-by-side pairing. | 1647x2057 | Baron Raimund von Stillfried | CC0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:-Portrait_of_an_Old_Chinese_Woman-_MET_DP155400_(cropped).jpg) |
| `landscape-highcontrast.jpg` | Hard edges and deep shadow — where `ordered` and `atkinson` visibly diverge. | 4469x3412 | Fons Heijnsbroek | CC0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Concrete_tunnel_architecture_of_1960s,_for_cyclists_and_pedestrians_under_road;_free_photo_Amsterdam,_Fons_Heijnsbroek_04-2022.jpg) |
| `landscape-gradient.jpg` | Smooth sky gradient — where error-diffusion banding shows up. | 3872x2904 | Siddharthseth20 | CC0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sunset_View_of_Udaipur.jpg) |
| `landscape-color.jpg` | Saturated reds/blues/yellows, dense detail, faces and signage all at once — the Spectra 6 palette's reason to exist, and the hardest case for a mono panel. | 2252x1353 | Bernard Spragg, NZ | CC0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Hong_Kong_street_market._(40434642195).jpg) |
| `landscape-neutral-text.jpg` | Signage and lettering — exercises neutral protection (NEUTRAL_CHROMA_THRESHOLD). | 4415x3311 | Malcolmxl5 | CC0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Oddbins_signage_in_Piccadilly_York_Mar25_01.jpg) |

## Printer pictures — rendered for CastKit

These four are not photographs. They are rendered by
`scripts/printer-fixture-images/` (`yarn tsx scripts/printer-fixture-images/render.ts`)
from invented shapes, so no real print, printer or household detail is in them.
They are dedicated to the public domain under **CC0**, like the rest of this folder.
A real plate render is never a substitute: it can carry a name modeled into the part.

| File | Why it's here |
| --- | --- |
| `printer-plate-stand.png` | A slicer-style plate render: a frame and two stand legs, laid flat. Square, on a dark field, as the slicer exports it. |
| `printer-plate-pods.png` | A second plate render, so three printer cards do not show one picture three times. |
| `printer-plate-canisters.png` | A third plate render: fifteen canisters. |
| `printer-camera-chamber.jpg` | A chamber-camera frame: toolhead, carbon rods, a textured plate and a part in progress, with sensor noise. For views that show a live printer camera. |

`printer-camera-chamber.png` is a lossless decoding of the generated JPG camera fixture, used by the combined printer/usage story to avoid cached scaled JPEG decoding across captures at different panel sizes.
