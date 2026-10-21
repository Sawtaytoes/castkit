# Displays have temporary tests and installation contrast

Status: Accepted
Date: 2026-10-20
Type: Display management
Supersedes: None
Superseded by: None

## Decision

The device editor offers a temporary screen or view test alongside permanent screen
assignment. A test has a finite duration, an explicit End test action, and server-owned
expiry so closing or reloading the editor cannot leave a permanent assignment. No
configuration save or server restart is needed. A test also has a live Standard/High
contrast selector; switching it preserves the test deadline and saved contrast. Its priority is 60, below higher-priority
automation alerts; ending it removes only that test. A replaced test has a new identifier,
so an older editor cannot accidentally end the replacement. Existing access and display
compatibility rules still apply, including repaint-based minimum durations and refusing
temporary content on super-slow displays.

Browser-rendered displays also have an installation-specific Standard/High contrast
setting in the device editor. High contrast changes semantic surfaces and text, not
artwork, panel brightness, or other installations. The default remains Standard.

## Context

Testing a clock alone should not require replacing the normal assigned screen or changing
room automation. Some LCD installations benefit from stronger foreground/background
contrast even though other displays already have acceptable nighttime appearance.

## Why

Temporary tests preserve normal operation and remain recoverable from any management
session. Contrast belongs to the installation preference model, not a hardcoded device
identity or an assumption about panel technology.

## Evidence

Owner: “We should add something to CastKit assign a screen here ... Not permanently,
just for testing.” Owner: “I wonder if we can also add a higher contrast mode for certain
screens.” CastKit display review, 2026-10-20; chat `t3-dfa7c37f`.
