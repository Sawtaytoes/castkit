# Preview profiles group rendering facts

Status: Accepted
Date: 2026-10-07
Type: Owner preference / live previews
Supersedes: -
Superseded by: -

## Decision

Make the preview-size control a searchable combobox. Group displays whose effective rendering settings and capabilities match, regardless of label, identity, room or assigned content. Keep device labels as search aliases. Profile labels describe dimensions, color, delivery, repaint and effective installation settings.

A selected image-delivery profile uses the same render, palette, dither, margins, adjustments and rotation path as CastKit delivery. It shows a static image, with manual refresh and cached results. A browser-delivery profile uses live data and the selected display's property stamp. Explain incompatible views instead of presenting an unsupported layout as a valid preview. Never assign, switch or publish to a device merely by previewing it.

Native firmware pages are separate from CastKit images; a generic saved view is not a pixel-accurate preview of a locally drawn firmware page.

Keep management inputs at readable widths even on large windows. The preview grid may use the available space. Reserve thumbnail geometry before previews load so recycling them cannot pull the page back while the user scrolls.

## Context

Equivalent displays appeared as duplicate size choices, and the old size selector changed only the iframe's CSS dimensions. A generic browser composition could therefore be mistaken for panel-ready output. Full-width controls were difficult to scan, and thumbnail loading changed virtual row heights during scrolling.

## Why

Users compare how content renders, rather than where identical hardware is installed. Correct renderer previews make capability limitations visible. Stable thumbnails and compact controls make the gallery usable at both phone and desktop widths.

## Evidence

Owner in T3 Code thread `2111a4ce-1a8d-463e-a6a4-51623d26e077`: "Make this a combobox, so I can use typeahead."

"if the settings all match other than the name" and "More than just hte resolution/scaling, we should also show how it would actually render those views on that device."

"These inputs are way too wide. I know I like to use the space, but this makes them hard to read and use."
