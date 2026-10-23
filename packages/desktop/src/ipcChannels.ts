/** A page window reports the view it shows (`string`), or that it shows none (`null`). */
export const viewChannel = "castkit-desktop:view"

/** The settings page reads the server origin, the displays, and the windows. */
export const readSettingsChannel =
  "castkit-desktop:read-settings"

/** The settings page reads the pages the server lists. */
export const readPagesChannel = "castkit-desktop:read-pages"

/** The settings page saves a new server origin. */
export const saveServerOriginChannel =
  "castkit-desktop:save-server-origin"

/** The settings page scans the network for CastKit servers. */
export const scanServersChannel =
  "castkit-desktop:scan-servers"

/** The settings page adds a window. */
export const addWindowChannel = "castkit-desktop:add-window"

/** The settings page opens a closed window, or brings an open one forward. */
export const openWindowChannel =
  "castkit-desktop:open-window"

/** The settings page removes a window for good. */
export const removeWindowChannel =
  "castkit-desktop:remove-window"

/** The settings page frames a monitor while the pointer is over its name (`number`), or clears it (`null`). */
export const highlightDisplayChannel =
  "castkit-desktop:highlight-display"

/** The main process tells the settings page that the windows or displays changed. */
export const settingsChangedChannel =
  "castkit-desktop:settings-changed"

/** The settings page reads and changes how this computer's audio is sent. */
export const savePcAudioChannel =
  "castkit-desktop:save-pc-audio"

/** The hidden audio-capture page sends a chunk of 16-bit PCM. */
export const capturePcmChannel =
  "castkit-desktop:capture-pcm"

/** The hidden audio-capture page reports that its capture started or failed. */
export const captureStatusChannel =
  "castkit-desktop:capture-status"
