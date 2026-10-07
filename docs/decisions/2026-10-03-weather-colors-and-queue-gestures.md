# Weather colors and queue gestures

Status: Accepted
Date: 2026-10-03
Type: Display behavior
Supersedes: Color and panel restrictions in the 2026-09-11 weather-mark decision; repeated-gesture behavior in the vertical-swipe decision
Superseded by: —

## Decision

Weather condition marks carry consistent condition colors in every browser face, including the agenda on larger panels. Time gestures use remaining agenda events with the existing one-hour grace; an empty agenda requests Ambient.

Down reveals Now Playing. Repeating down opens Queue; repeating again returns to Now Playing. A rightward swipe, when printer views are offered, reveals Printer Status, then Print Queue, then Printer Status. Left is unassigned. Gestures remain requests to the installation policy and respect the view allow-list.

Print Queue is read-only and receives its own queue.v1 channel. The Bambuddy adapter publishes pending and printing jobs, ordered by scheduler position, with printer/model, manual-start status and estimated duration. This view never starts jobs or clears plates. The channel setting is available in the device editor.

The remote-display bridge recognizes vertical gestures independently of control hitboxes, including inside external views. Contacts must start in the acknowledged frame; guarded taps still require the same control identity. A committed gesture cancels the original touch, preventing a tap from firing after a swipe.

## Context

Agenda marks inherited text color and were omitted from larger Calendar faces. The legacy manual gesture forced Calendar on empty days. Remote touch validation rejected background contacts and cancelled contacts crossing control boundaries.

## Why

One gesture reaches the current time view; repeating a gesture opens and closes its associated queue.

## Evidence

Owner request in the T3 Code display-navigation thread on 2026-10-03: "the agenda view has no colors on the weather icons. It should." and "When on the audio screen, I want the *second* top on any screen to view the queue. Top again can close it."
