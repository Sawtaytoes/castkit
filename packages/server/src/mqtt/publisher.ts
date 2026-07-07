/**
 * The MQTT client wrapper moved to `@castkit/shared` (both client modes use
 * it); this shim keeps the server's historical import path working.
 */
export {
  type CommandHandler,
  createMqttPublisher,
  type MqttConnectionConfig,
  type MqttPublisher,
} from "@castkit/shared/mqtt/publisher"
