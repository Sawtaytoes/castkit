# Linux WPE native range touch handling

The Linux WebKit touch-pointer adapter now includes native range inputs. It keeps
the touch's original target, updates the native value and `input` events during
movement, and emits `change` once on release if the value changed. The native
setter supplies min/max/step sanitization; horizontal RTL reverses the fraction.
A cancelled contact does not emit a commit. Disabled/detached controls are ignored.
Mouse/keyboard and other native form controls keep their normal behavior. The
custom music-volume input retains its existing pointer handling.

A generated Linux direct-touch drag on WPE2.48.3/Cog0.18.4 moved an unmodified
native range from50 to100 but emitted no `change` on release. The identical drag
with the candidate emitted continuous input updates and a final change at100,
including movement below the original slider. This fixture does not operate a
real light. It verifies the event path, not subjective physical touch acceptance.

![Native range: no final change](images/wpe-range-drag/before.png)

![Candidate: final change received](images/wpe-range-drag/after.png)
