# The desktop app sends this computer's audio as VBAN when the person turns it on

Status: Accepted
Date: 2026-10-23
Type: Product
Supersedes: None
Superseded by: None

## Decision

The desktop app can send this computer's audio to Music Assistant. It is a switch in the settings window and the tray menu, off on a first launch and remembered once set. Nothing is captured or sent while it is off.

The audio travels as a VBAN stream (16-bit PCM, 48 kHz, stereo) to Music Assistant's VBAN Receiver plugin. A hidden window captures either everything the computer plays (Chromium's system loopback, Windows only) or one input device chosen by its label, and the main process cuts the PCM into VBAN packets and sends them over UDP. The computer's own output is not muted or rerouted.

## Context

Music Assistant has no way to take a desktop's own audio. Its maintainers point to the VBAN Receiver plugin fed by Voicemeeter, which installs a mixer and its own drivers and takes over the default output device. Music Assistant's Sendspin Source plugin accepts a `source@v1` client, but that role runs only on a paired, Noise-encrypted connection, and `@sendspin/sendspin-js` 5.0 implements no source role.

## Why

- **A choice, not a takeover.** The person turns it on when they want the room to hear this computer, and their normal audio is unchanged either way.
- **VBAN over Sendspin for now.** VBAN is plain UDP that Music Assistant already receives, with no pairing to implement. A Sendspin `source@v1` client is the long-run fit once the JavaScript library has the role.
- **An input device as well as the whole output.** A virtual cable such as VB-CABLE gives Windows a real playback device, so one app can be sent without the rest, and it is the only capture path on Linux and macOS.
- **The input device is saved by label.** The browser's device id is salted per session, so it would not survive a profile reset; the label is what the person chose.

## Evidence

> "It should be something I can choose to do."

Owner conversation `c7860ee1-8571-4d27-9427-61518279e6d6`, answering the proposal to add a "Send PC audio" switch to the desktop app instead of installing Voicemeeter.
