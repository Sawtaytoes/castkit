# Composed printer state colors the padded panel

Status: Accepted
Date: 2026-10-01
Type: Presentation
Supersedes: None
Superseded by: None

## Decision

In a combined composition, each printer's outer panel owns its warning, danger or success surface and border. Its inner card stays transparent and retains the existing layout. State changes preserve the panel's padding, camera spacing and mounted media. Grouped printer views retain their individually padded card surfaces.

## Context

Combined compositions remove duplicate inner card padding because each printer already has a padded outer panel. Coloring that inner card on an error made its facts appear against the tinted edge while the surrounding frame stayed neutral.

## Why

Apply status to the surface that owns the spacing, so the whole printer region communicates the state without adding padding or spending more camera space.

## Evidence

The owner requested: “The whole container should be red, not the inside piece. That way, it retains the padding.” Chat: 08aa412b-7bd8-47c5-b452-4085fc663efc.
