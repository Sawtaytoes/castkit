/**
 * The HA-pushed view-data parsers moved to `@castkit/shared` (both client
 * modes consume the same payload contract); this shim keeps the server's
 * historical import path working. Tests live with the parsers in shared.
 */
export {
  IDLE_NOW_PLAYING,
  parseAgendaPayload,
  parseNowPlayingPayload,
  parseQueuePayload,
  parseWeatherPayload,
  stripDecorativeNotes,
} from "@castkit/shared/viewData/parsers"
