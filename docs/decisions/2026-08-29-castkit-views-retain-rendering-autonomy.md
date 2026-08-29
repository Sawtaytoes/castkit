# CastKit views retain rendering autonomy

Status: Accepted

Date: 2026-08-29

Type: Architecture

Supersedes: None

Superseded by: None

## Decision

CastKit is a custom dashboard and display interface. Its views can use a
purpose-built rendering treatment when a target display or small panel needs
it. Charcuterie tokens are an available shared resource, not a required visual
implementation for CastKit views.

## Context

CastKit serves unusual panels, ePaper devices, kiosk browsers, and very small
display surfaces. A shared visual system helps where it fits, but it must not
constrain a dashboard or display view that needs target-specific layout,
palette, or rendering.

## Why

The product is a custom dashboard and display interface. Its value includes the
ability to suit unusual display hardware. That requires freedom to choose the
rendering approach per view and per target.

## Evidence

Owner direction in the current chat: "It's meant to be a custom dashboard/display
interface."
