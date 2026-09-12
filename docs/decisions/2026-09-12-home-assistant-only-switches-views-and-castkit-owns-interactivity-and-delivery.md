# Home Assistant only switches views; CastKit alone knows interactivity and delivery

- **Status:** Accepted
- **Date:** 2026-09-12
- **Type:** Architecture / Product
- **Supersedes:** —
- **Superseded by:** —

## Decision

Home Assistant's job with a CastKit display is to **switch views**. It names a
view and CastKit renders it. That reaffirms
[2026-07-02-view-switching-via-ha-automations.md](2026-07-02-view-switching-via-ha-automations.md):
policy about *which* view a display shows lives in Home Assistant, and the server
has no idle timer and no fallback of its own.

**CastKit is the only thing that knows two facts about a display:**

1. whether it is interactable or not, and
2. whether it renders live or is sent finished images.

⛔ **Neither fact may leak into Home Assistant.** No automation, script,
template, entity name or dashboard card may branch on "this one is a touch panel"
or "this one is image-streamed". An automation that needs to know is a sign the
view vocabulary is still split — fix the vocabulary
([2026-09-12](2026-09-12-castkit-is-one-app-with-one-view-vocabulary-not-inkcast-plus-slatecast.md)),
not the automation.

Two consequences:

- **A view name is offered or it is not.** CastKit decides per display which
  views its properties allow, and publishes exactly those as the View select's
  options. Home Assistant picks from the list it is given. It does not compute
  eligibility.
- **A command is accepted or ignored.** A touch gesture reaches Home Assistant as
  an ordinary MQTT command. Home Assistant acts on it without knowing what kind
  of glass produced it.

## Context

Four displays are driven by four "Control ... Display" automations. Two are sent
finished images and two render live, and the automations knew it: each hard-coded
the view names its own renderer happened to use, so the same rule had to be
written twice. Wiring one rule — an empty day shows the plain clock and weather —
needed four view names for two views and a shared script parameterised on which
pair a display speaks.

The boundary was never stated, so it drifted. Once it is stated, the parameters
are visibly a temporary bridge rather than a design.

## Why

- **Interactivity and delivery are rendering concerns.** CastKit owns the
  renderers, the WebSocket, the dither pipeline and the image topics. It is the
  only component that can be correct about them.
- **Home Assistant should hold one rule per behaviour, not one per renderer.** A
  rule duplicated per display type is a rule that will be fixed in one place and
  not the other.
- **It keeps Home Assistant optional.** A surface that only names views is a
  surface a self-hoster can leave unused
  ([2026-09-12](2026-09-12-castkit-owns-every-control-and-home-assistant-mqtt-is-only-the-automation-surface.md)).
- **It gives the View select a real job.** The options list is CastKit's answer to
  "what can this panel do", which is exactly the knowledge Home Assistant must
  not duplicate.

## Evidence

> "In Home Assistant, it just switches views. CastKit is the only thing aware of
> 'interactable vs non-interactable' and 'live vs image-streamed'"

> "And in Home Assistant, we should use scripts for how we wanna display things
> like agent/time/weather vs other views. That would ensure they're all handled
> the same."

— maintainer, this chat (2026-09-12)

The second quote is implemented as `script.control_castkit_display_view`, the one
shared chooser every display calls; see the `home-assistant` repo's
[2026-09-12 record](https://mkdocs.octen.dev/workspace/home-assistant/docs/decisions/2026-09-12-an-empty-day-shows-the-plain-clock-and-weather-view/).
