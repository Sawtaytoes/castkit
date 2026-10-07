# Enlarged images support pinch zoom and pan

Status: Accepted
Date: 2026-10-07
Type: User preference
Supersedes: None
Superseded by: None

## Decision

Enlarged images and camera lightboxes support two-finger pinch, drag to pan, zoom buttons, and Reset zoom. Magnification is limited to 1–8 times and resets when closed. Normal display views retain their existing gestures. Enlargement and zoom preserve the mounted media player and do not issue device or printer commands.

## Context

Small details in images are hard to read on phones and touch displays. The page's normal display gesture policy must not prevent magnification inside an image lightbox. Single-contact displays can use the zoom buttons.

## Why

Keep the content library, output destinations, and local inspection controls understandable and inexpensive to use.

## Evidence

User request, chat `2111a4ce-1a8d-463e-a6a4-51623d26e077`, 2026-10-07:

> “I understand why we don't want that in the regular view, but when I'm light-boxing an image, that's the time to allow it.”
