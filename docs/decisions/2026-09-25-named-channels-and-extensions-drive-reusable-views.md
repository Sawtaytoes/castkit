# Named channels and extensions drive reusable views

- **Status:** Accepted
- **Date:** 2026-09-25
- **Type:** Architecture / Product
- **Supersedes:** the mandatory MQTT-only boundary in [2026-07-04](2026-07-04-inkcast-renders-ha-pushed-data-not-reads-ha.md) and [2026-07-07](2026-07-07-slatecast-pure-mqtt-command-path.md); the Home Assistant-only producer requirement in [2026-09-23](2026-09-23-printer-status-is-a-castkit-view-fed-by-home-assistant.md). Existing MQTT producers remain supported.
- **Superseded by:** [Plugins install from management without redeployment](2026-09-25-plugins-install-from-management-without-redeployment.md), for the build-only installation mechanism.

## Decision

CastKit is a display host with a framework-independent extension SDK. Source adapters normalize MQTT or API data into named, versioned channels. Views subscribe to contracts, not integrations. Saved compositions bind one or more view components to channels. Fixed bookmarks, switchable screens, and physical displays reuse these compositions.

The first installation mechanism uses trusted, pinned npm packages through the Yarn deployment build. A manifest registers source adapters, views, components, and presets. Runtime package upload is not required. Built-in sources and view specifications use the registry. Charcuterie remains the management UI choice, not an SDK dependency.

The native Rip Deck kiosk presentation belongs in CastKit. Rip Deck supplies data and actions. Printer cameras are optional presentation. Home Assistant can remain the integration layer through existing MQTT producers, or a user can select an optional direct API source.

Management requires a PIN. Each private kiosk target has its own optional PIN and session policy. Server authorization covers subscriptions, media, and actions. Individual identities and Authelia remain a later integration. Existing physical URLs and server-controlled selection remain supported.

## Context

The owner reviewed a layered architecture and requested the full implementation with parallel agents. The previous device-bound data and mandatory MQTT boundary prevented reusable browser compositions and independent source extensions.

## Why

Named channels avoid duplicating integration selections across displays. Separating adapters from views makes data reusable by custom renderers. Fixed display URLs preserve remote automation. The SDK permits different UI frameworks and themes without changing the data contracts.

## Evidence

Owner, thread `a377d73f-caf1-4fa9-9e86-5d1399fe6a56`: “Yes, use named channels.” “I wanna build out the whole thing we planned. Use subagents to help and speed it up.” Follow-up: “Require a management PIN.” The reviewed private architecture document is maintained in the household workspace; household configuration does not belong in this public repository.
