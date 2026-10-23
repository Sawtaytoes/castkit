# Named printer cameras

The Bambuddy source adapter also reads Hot Plate 3D installations. Enable
**Include Hot Plate 3D named cameras** on a source whose URL points to Hot Plate
3D, then bind a Cameras view to a `cameras.v1` channel from that source. The
channel's printer selection applies to both primary and additional cameras.
Leave the option off for a Bambuddy installation without the named-camera API.
Turn off **Include primary cameras** on the Cameras channel when its view is
beside a Printer Status panel that already shows the primary cameras.

Enabled extra views appear with their printer and camera names. Their identities
come from Hot Plate's metadata API; camera addresses and printer access codes
stay on the upstream server. CastKit requests the existing token-protected
snapshot or stream routes and mediates the response through its display access
boundary. Extra streams request two frames per second and open only while a
viewer requests their media. Printer Status retains its existing primary camera.

Configure the camera and its TLS trust on the Hot Plate server. A PNG-only
snapshot source can be configured there as `snapshot`: Hot Plate converts it to
JPEG and polls it for live playback. No camera password or local certificate
exception is needed in the display browser. Named-camera metadata failures report
the source as unavailable rather than silently presenting a partial list.
