# Live view previews use device or browser viewport sizes

Status: Accepted
Date: 2026-10-07
Type: User preference
Supersedes: None
Superseded by: None

## Decision

The Views editor offers an All views gallery with search, tags, and component categories. Live previews can use registered-device dimensions, the current browser window, or custom dimensions. A resize handle changes only the preview. The device overview lists registered devices; saved views and unassigned screen definitions do not become synthetic devices. Previews outside the viewport or in a hidden management tab release their iframe and socket.

## Context

The earlier overview opened every unassigned screen alongside devices. That multiplied live connections and camera players and conflated saved content with output destinations. A transient browser window also needs accurate previews without device registration.

## Why

Keep the content library, output destinations, and local inspection controls understandable and inexpensive to use.

## Evidence

User request, chat `2111a4ce-1a8d-463e-a6a4-51623d26e077`, 2026-10-07:

> “I think having an "All Views" mode is great!” and “There's no easy way for me to resize that iframe.”
