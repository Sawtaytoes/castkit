# Desktop lifecycle audit

The broken Windows login command exposed a gap between helper tests and the
installed app. The login repair shipped in desktop 0.3.1. A broader audit of
window persistence, display placement, shared sign-in, navigation, zoom and
releases found additional defects addressed in desktop 0.3.2.

| Trigger | Previous behavior | Corrected behavior |
| --- | --- | --- |
| Disconnect a monitor while its window is open | OS move/resize events could save the primary monitor over the intended placement; reconnect did not return the window | Missing-monitor detection protects placement and fullscreen before saving native events; display changes return the window |
| Restore onto a monitor whose id changed | Placement matching found it, but menus still used the obsolete id and showed an unknown display | A completed placement updates the saved display identity |
| Navigate to another page, including a query or fragment change | Restart loaded the original URL | Main-frame navigation updates the saved URL |
| Attach an unsigned window before the window holding an existing sign-in | The earlier window missed the recovered sign-in | Recovering a cookie also synchronizes already attached windows |
| Change servers, then add a window | The cached cookie from the previous server could be copied to the newly selected host | The shared cookie cache is scoped by server origin, and copy operations retain their originating URL |
| Remove a signed-in window | Its cookie listener remained attached while its storage was cleared, allowing that removal to sign out other windows | Detach removes the listener before clearing the partition |

The new lifecycle regression tests fail against the previous implementation.
They exercise native event ordering with a controlled Electron boundary so a
monitor removal and a changed monitor id can be reproduced without unplugging
hardware.

The built app smoke script uses actual Electron windows and cookie stores in a
temporary profile. Its 20 checks cover window opening, missing-monitor fallback,
isolated partitions, per-view zoom and native shortcuts, sandboxing, navigation
guarding, recovered and newly entered sign-in, closing and reopening windows,
settings page listing, removing a signed-in window, server separation, sign-out,
fullscreen, Alt menus, saving navigation and restoring it in a fresh process.
It now runs in desktop packaging CI on Windows and on Linux at all four display
sizes: 384×824, 1080×1920, 1920×1080 and 3440×1440. The separate Windows login
check continues to exercise actual Run and StartupApproved registry entries.

## Limits

This is evidence for the listed paths, not a claim that the desktop app has no
other defects. Monitor unplug/reconnect and mixed-DPI placement still need
physical hardware verification; the automated monitor regressions control the
display events. macOS packaging is checked, but the expanded native smoke script
does not run on the macOS runner. An actual Windows sign-out/sign-in remains a
separate acceptance check from starting the registered launcher.

Desktop updates are manual. The release workflow builds and publishes installers;
the app has no automatic update check. Deploying the server changes its web pages
without replacing an installed desktop executable.
