# Display targets: viewing context, purpose, and presentation

**Status:** Documentation model accepted 2026-10-06. Viewing-context and physical-size
fields described here are design records, not implemented device settings.

Resolution tells a view how many pixels it has. Physical size and viewing distance
help determine whether its text is readable. Attention and purpose determine how
much information belongs there. Responsive scaling addresses fit, but does not by
itself answer those other questions.

Use this reference alongside [display properties](display-properties.md). It extends
the established panel-model-plus-installation distinction with explicit design
records; it does not replace panel capabilities, the freshness rule, or existing
content priorities. [Decision](decisions/2026-10-06-display-targets-document-viewing-context-and-purpose.md).

## How CastKit describes targets today

| Existing piece | What it describes | Where |
| --- | --- | --- |
| Panel properties | Pixel dimensions, shape, color, input, repaint, dithering, delivery and pixel grid | [Display properties](display-properties.md); device and browser profile types |
| Installation settings | Orientation, margins, crop, mask, power and local navigation choices | Device configuration and settings |
| Views and screens | Reusable compositions, selected data, allowed/default/active views, assignments and temporary overrides | [Views, channels, and screens](display-platform.md); SDK `ViewDefinition` and `ScreenDefinition` |
| Layout priorities | Measured available space, required content, component priorities and detail reduction | [Combined kiosk priorities](decisions/2026-10-01-combined-kiosks-share-space-by-nested-priority.md); composition and component layout code |
| Preview and test targets | Pixel geometry and panel capabilities; browser tests also cover four named windows | Both Storybooks and browser test configuration |
| Deployment role | A unit's location, purpose, switching policy and hardware evidence | The deployment's own inventory, outside this public repository |

There are no structured physical-dimension, PPI, viewing-distance or viewing-profile
fields in the current device model. Some views distinguish a short landscape panel
by aspect ratio and pixel height; external application frames offer a configurable
zoom. Those are useful presentation mechanisms, but neither identifies the physical
size or viewing distance. Existing composition priorities already provide part of
the purpose model; a list of permitted views alone is not a purpose order.

## Four parts of a target record

### 1. Panel facts

Record native pixel dimensions and **active display width and height in millimeters**,
plus the source and confidence of each measurement. A specified diagonal is useful
when active dimensions are unavailable; distinguish active glass from chassis size.
Keep the existing color, shape, repaint, input and delivery properties.

Derive PPI from native pixels and physical dimensions rather than entering two
independent values that can disagree:

```text
horizontal PPI = native pixel width / (active width mm / 25.4)
vertical PPI   = native pixel height / (active height mm / 25.4)
```

For square pixels and a rectangular active area, diagonal PPI is
`sqrt(pixelWidth² + pixelHeight²) / diagonalInches`. Do not apply this shortcut to a
round panel without knowing what the specified diagonal means. Approximate advertised
dimensions produce approximate PPI. An unknown dimension produces unknown PPI.

Native pixels, the firmware's layout canvas, browser CSS pixels and device pixel
ratio are distinct. DPR is not PPI. Browser zoom changes the layout mapping; rendering
at higher resolution and downscaling improves sampling without creating more physical
pixels. Preserve [the registry layout-box rule](decisions/2026-09-11-a-panels-registry-size-is-its-layout-box-and-rotation-never-re-lays-out.md).

**Rendering consequence:** the pixel-to-physical mapping informs text and control
sizes and achievable detail. It cannot add detail beyond the native pixel budget.

### 2. Installation and viewing context

Record the usual viewing-distance **range**, where the display is mounted, and whether
the person glances at it or reads it for a sustained period. Record actual input use:
touch, pointer/keyboard, physical buttons, or passive viewing. Capability and use differ:
a touch panel can usually be read from beyond arm's reach.

One installation can have more than one context, such as across-room status and
nearby interaction. Document both; a profile change at runtime would need an explicit
selection or a reliable signal, not an assumption that distance can be inferred from
window size.

**Rendering consequence:** distance and attention inform the readable text floor,
hierarchy, contrast and amount of supporting information. Input use informs control
sizes and whether essential information may depend on interaction.

### 3. Purpose and switching policy

Record **primary, secondary, tertiary and quaternary purposes** in order. These are
human tasks, such as monitoring a machine or checking an agenda; link the corresponding
views rather than treating view names as the whole requirement. Unassigned slots stay
unassigned. Record purpose order separately from component layout priority.

Also record:

- The default/idle view and whether a purpose continues to occupy the display while idle.
- What may interrupt the current view, the precedence of simultaneous requests, and any hold duration.
- How manual selection and dismissal interact with automatic requests.
- What resumes when an interruption ends, and what happens when data is unavailable.

**Purpose order and interruption order can differ.** Machine monitoring can be the
primary purpose while a brief local measurement takes temporary precedence. Content
priorities within a view decide which facts survive a tight layout; interruption
priorities decide which view owns the display. Keep both explicit.

**Rendering consequence:** preserve the primary task and its essential facts before
allocating remaining room to supporting content. Switching policies determine when
another task temporarily deserves attention. Existing automations and overrides remain
the execution mechanisms; documenting a purpose does not install a new policy.

### 4. Presentation requirements

Record preferred density (`sparse`, `balanced`, or `dense` as documentation terms),
the minimum readable text and usable controls, must-show facts, and the order in which
optional content is reduced or omitted. Set these from the intended viewing context
and verify them on the installation. There is no universal pixel font size for all
targets and no numeric floor is established by this document.

**Rendering consequence:** adaptive layouts gain a definition of acceptable fit:
required facts remain readable, controls remain usable, and complete rows fit. Do not
shrink everything indefinitely to keep secondary content. Reduce detail, omit optional
sections, or use explicit navigation where the interaction permits it. Dense presentation
still has a readability floor.

## Starting viewing profiles

Profiles are reusable starting points with per-installation overrides. They do not
replace dimensions or capabilities and are never assigned from resolution alone.
They have no fixed distance thresholds until a deployment establishes its own evidence.

| Profile | Use | Presentation consequences |
| --- | --- | --- |
| **Room glance** | Read from across a room, with brief attention | Prominent primary status, few supporting facts, strong contrast; essential information requires no interaction |
| **Nearby glance** | Briefly check a small desk, appliance or handheld display | Compact summary and clear hierarchy; secondary detail remains subordinate |
| **Task station** | Approach a display to perform a particular task | Task details and usable controls; status is understandable before interaction, with deliberate access to more detail |
| **Desktop workspace** | Sustained reading and comparison in a browser | More simultaneous components and detail, denser presentation where readable; pointer/keyboard or touch use is recorded separately |

A wrist display can use Nearby glance with buttons and a strict battery/repaint budget.
A task station can additionally require Room glance readability for its primary status.
The profile describes use, so a desktop browser in a small window can remain a Desktop
workspace. Conversely, a browser driving a distant TV can be Room glance.

## Why equal resolutions do not imply equal targets

Consider three targets with a 480×320 layout: a physically large display viewed from
a distance, a small machine-side display, and a nearby browser window. They share a
layout pixel budget but can need different text floors, control sizes, visible details
and content priorities. Document whether 480×320 is the native raster or CSS viewport;
a browser viewport does not establish the monitor's PPI or the physical area it occupies.

Physical size alone is also insufficient: a larger display farther away can occupy
the same visual angle as a smaller nearby one. Text's angular size depends on both
its physical height and viewing distance. PPI helps map pixel text size to physical
size; distance then informs perceived size. Contrast, eyesight and lighting still
require validation. Record distance ranges and evidence rather than promising that
one formula guarantees readability.

For browser targets, physical size and distance may be unknown. Allow an explicit
profile/density choice in the design record and document the assumption used for
review. Do not infer inches from CSS `in`/`mm`, DPR or viewport dimensions.

## Target record template

This is a documentation template, **not a JSON device configuration schema**.

| Field | Record |
| --- | --- |
| Identity and state | Inventory reference; installed, test, planned or unassigned |
| Panel / rendering geometry | Native pixels; active mm or advertised diagonal; derived PPI; firmware canvas or browser CSS viewport; rotation/DPR/zoom where relevant |
| Capabilities | Existing shape, color, repaint, input, delivery and power facts, with references |
| Viewing context | Profile(s), distance range, attention, mounting and actual interaction |
| Purpose order | Primary; secondary; tertiary; quaternary; unassigned where unknown |
| Switching | Idle/default; interruptions and precedence; holds; manual dismissal; return and unavailable-data behavior |
| Presentation | Density; readable text/control floors; required facts; detail reduction/omission order |
| Evidence | Source/date for each fact; measured, specified, owner-stated, proposed or unknown; physical review status |

## Authoring and verification

1. Choose the viewing context and purposes before choosing a layout. Keep the source
   data reusable across sparse and dense views.
2. Establish readable text and control requirements. Apply existing freshness,
   delivery, color and power limits independently of the profile.
3. Use the existing measured layouts and nested priorities to allocate space within
   those requirements. Do not add a second layout engine merely to name profiles.
4. Preview representative panel geometries and browser windows. The four browser test
   windows exercise geometry, not real-world physical size or viewing distance.
5. Verify a physical installation at its recorded distances and under its expected
   lighting. Review primary status, supporting text, controls and interruption/return
   behavior. Browser screenshots alone cannot prove physical readability.

## Documentation ownership and implementation boundary

This public repository owns generic vocabulary, profiles, rendering consequences and
fictional examples. A deployment owns its unit identities, rooms, measured dimensions,
viewing distances and actual purpose/switching records in its private inventory.

The accepted work here is documentation. Native dimensions/capabilities, responsive
layouts, per-view settings and screen overrides already exist. Physical dimensions,
viewing profiles, density presets and context-based font/control floors would require
future schema, persistence, admin UI and rendering work. If implemented, user-tunable
values belong in CastKit's admin panel; environment variables remain infrastructure,
and Home Assistant continues to switch views without branching on panel type.
