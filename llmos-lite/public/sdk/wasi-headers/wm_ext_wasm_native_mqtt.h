/**
 * ESP32 WASMachine MQTT Native Extension
 *
 * Native MQTT client API for ESP32 WASMachine
 */

#ifndef WM_EXT_WASM_NATIVE_MQTT_H
#define WM_EXT_WASM_NATIVE_MQTT_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Initialize MQTT client and connect to broker
 *
 * @param broker_uri MQTT broker URL (e.g., "mqtt://broker.hivemq.com:1883")
 * @param client_id Unique client identifier
 * @return MQTT handle (>= 0 on success, < 0 on error)
 */
extern int wasm_mqtt_init(const char *broker_uri, const char *client_id);

/**
 * Publish message to topic
 *
 * @param handle MQTT handle from wasm_mqtt_init
 * @param topic Topic string
 * @param data Payload bytes
 * @param len Payload length
 * @param qos Quality of Service (0, 1, or 2)
 * @return 0 on success, < 0 on error
 */
extern int wasm_mqtt_publish(int handle, const char *topic, const char *data, int len, int qos);

/**
 * Subscribe to topic
 *
 * @param handle MQTT handle
 * @param topic Topic filter (supports wildcards: + and #)
 * @param qos Quality of Service
 * @return 0 on success, < 0 on error
 */
extern int wasm_mqtt_subscribe(int handle, const char *topic, int qos);

/**
 * Read received message (non-blocking)
 *
 * @param handle MQTT handle
 * @param topic_out Buffer to store received topic
 * @param data_out Buffer to store payload
 * @param max_len Maximum bytes to read
 * @return Bytes received (> 0), 0 if no message, < 0 on error
 */
extern int wasm_mqtt_receive(int handle, char *topic_out, char *data_out, int max_len);

/**
 * Disconnect and cleanup
 *
 * @param handle MQTT handle
 */
extern void wasm_mqtt_disconnect(int handle);

#ifdef __cplusplus
}
#endif

#endif /* WM_EXT_WASM_NATIVE_MQTT_H */
