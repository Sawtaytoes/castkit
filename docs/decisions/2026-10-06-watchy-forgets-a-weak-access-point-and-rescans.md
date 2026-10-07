# Watchy forgets a weak access point and rescans

**Status:** Accepted
**Date:** 2026-10-06
**Type:** Device behavior / owner request
**Supersedes:** None
**Superseded by:** None

## Decision

The Watchy v3 package lets a watch change access points. After an MQTT connection
below -75 dBm it forgets the saved fast-connect access point, at most once every
30 minutes, so the next sync scans every channel and joins the strongest access
point of the first configured network, then tries the remaining configured networks
in order. Fast-connect data moves from RTC memory to flash so the package can
invalidate it by key; ESPHome writes it only when the access point changes. Each
MQTT connection publishes the joined SSID, BSSID, channel and RSSI, retained, on
`castkit/<device_id>/wifi`.

## Context

ESPHome 2026.9.1 fast connect reconnects to the saved BSSID and channel, and only
cycles to other networks when that access point fails. Its post-connect roaming scan
needs five minutes connected, which a watch awake for seconds never reaches. Both
watches measured -76 to -90 dBm at home. A watch that left home recovered only
after its retry backoff, so points looked stale until Back requested a sync.

## Why

A rescan costs about one extra all-channel scan. Bounding it to once per 30
minutes caps that cost and the flash writes, while a weak link is replaced within
one sync once a stronger access point is in range.

## Evidence

Owner, 2026-10-06: "We need to do the access point changing. I setup my phone as
an access point, but it didn't connect".
UniFi last saw the ten-minute watch on home Wi-Fi at 17:10; MQTT saw it at 17:17
and 18:01 from elsewhere, and a Back press at 19:12 synced current points.
