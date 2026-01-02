/**
 * ESP32 WASMachine RainMaker Native Extension
 *
 * ESP RainMaker cloud platform integration
 */

#ifndef WM_EXT_WASM_NATIVE_RAINMAKER_H
#define WM_EXT_WASM_NATIVE_RAINMAKER_H

#ifdef __cplusplus
extern "C" {
#endif

/* Property flags */
#define PROP_FLAG_READ   0x01
#define PROP_FLAG_WRITE  0x02

/**
 * Initialize RainMaker node
 *
 * @param node_name Human-readable node name
 * @param node_type Node type identifier (e.g., "esp.node.light")
 * @return Node handle
 */
extern int rmaker_node_init(const char *node_name, const char *node_type);

/**
 * Create device within node
 *
 * @param node Node handle
 * @param device_name Device name
 * @param device_type Device type (e.g., "esp.device.light")
 * @return Device handle
 */
extern int rmaker_device_create(int node, const char *device_name, const char *device_type);

/**
 * Create controllable parameter
 *
 * @param device Device handle
 * @param param_name Parameter name (e.g., "Power", "Brightness")
 * @param param_type Parameter type (e.g., "esp.param.power")
 * @param data_type Data type ("bool", "int", "float", "string")
 * @param value Initial value
 * @param properties Flags (e.g., PROP_FLAG_READ | PROP_FLAG_WRITE)
 * @return 0 on success
 */
extern int rmaker_param_create(int device, const char *param_name, const char *param_type,
                                const char *data_type, int value, int properties);

/**
 * Update parameter value (triggers cloud sync)
 *
 * @param device Device handle
 * @param param_name Parameter name
 * @param value New value
 * @return 0 on success
 */
extern int rmaker_param_update(int device, const char *param_name, int value);

/**
 * Start RainMaker agent (cloud connection)
 *
 * @param node Node handle
 * @return 0 on success
 */
extern int rmaker_start(int node);

#ifdef __cplusplus
}
#endif

#endif /* WM_EXT_WASM_NATIVE_RAINMAKER_H */
