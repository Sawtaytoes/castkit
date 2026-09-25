# Collections use search, tags, and structured editors

Status: Accepted
Date: 2026-09-25
Type: UI / preference
Supersedes: None
Superseded by: None

## Decision

Views and Screens use a compact searchable selector with a tag filter and visible tag
captions. Tags are editable metadata stored with the definition. Sources and Channels
use the same collection selector. Do not render a page-length rail of buttons or redundant
access icons. PIN settings and access enforcement remain available in the Access tab.

Extend the focused editor tabs to Views and Screens. Keep the saved preview beside the
active editor on wide screens and stack it below on narrow screens. Add view opens an
explicit new form and focuses its name. The active section and selected item have URLs.

Present structured settings as editable entries, lists, button forms, and nested all/any
conditions. Reuse Charcuterie's Combobox, Accordion, and QueryBuilder. Preserve existing
serialization and unknown properties. Reject incomplete or duplicate entry names before
saving. Do not expose JSON textareas as the management interface.

Use **Normal orientation** and **Device output** as the two preview labels. This refines the
wording of the overview orientation decision without changing its rotation behavior.

## Context

The live collection editor added by the display-platform work still used a long button
list, a large single form, raw JSON textareas, and a preview below the form. The device
management tabs were in a separate review build, so they were absent from the live screen.

## Why

Search and tags keep selection practical as the collection grows. Tabs and an adjacent
preview preserve focus. Structured controls make changes reviewable without hand-authoring
JSON. The new form's focus makes the Add action visible and useful from the keyboard.

## Evidence

Owner, T3 Code chat `f7996252-1b64-4f10-85c8-9feb526f3783`, 2026-09-25:

> "Left side is so long now. Just use a combobox or something. Group them visually, so you can find what you want by assigning tags to each item. Maybe make it a filter instead of a combobox."

> "The lock icon is so stupid. They'd all be unlocked because no PIN, but just remove it. Redundant!"

> "I wanna see the preview window side-by-side to the working area."

> "Can we avoid rendering JSON in fields and instead show form fields with a DSL-like 'add button' form?"

> "Clicking 'Add View' does nothing."

> "What happened to the tabs 'n such you were working on?"

## Related

- [Management uses focused tabs and a display preview](2026-09-24-management-uses-focused-tabs-and-a-display-preview.md)
- [Overview previews are upright](2026-09-25-overview-previews-are-upright.md)
