# Printer progress fits beside icon controls

Status: Accepted
Date: 2026-10-02
Type: UI
Supersedes: None
Superseded by: None

## Decision

When printer controls use icons beside progress, the entire progress band uses the same 48 px height as the controls. Percentage text scales within 22–30 px and remaining time within 14–18 px. The band has no separate top margin. Camera and readable facts retain priority over progress decoration and controls.

## Context

Moving actions beside progress exposed a mismatch: the full-size percentage and tall band consumed space while squeezing the time remaining. The previous layout retained the large-band styling after moving the controls.

## Why

Matching heights recovers camera space and lets both remaining time and percentage fit in the narrower band. The browser kiosk keeps its existing lightweight Preact component; the shared React ProgressBar's medium size controls a thin track rather than this overlay band.

## Evidence

The owner said: “The percentages are now too large” and “make the whole bar match the height of the buttons.” Chat: `08aa412b-7bd8-47c5-b452-4085fc663efc`.
