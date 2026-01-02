/**
 * ESP32 WASMachine Native Extension Headers
 *
 * This file provides function declarations for native extensions
 * available in the ESP32 WASMachine firmware.
 *
 * These functions are implemented in the firmware and callable from WASM.
 */

#ifndef WM_EXT_WASM_NATIVE_H
#define WM_EXT_WASM_NATIVE_H

#ifdef __cplusplus
extern "C" {
#endif

/* GPIO Control */
#define GPIO_CMD_SET_DIRECTION  0x1001
#define GPIO_CMD_SET_LEVEL      0x1002
#define GPIO_CMD_GET_LEVEL      0x1003

/* I2C Control */
#define I2C_CMD_WRITE  0x2001
#define I2C_CMD_READ   0x2002

/* SPI Control */
#define SPI_CMD_TRANSFER  0x3001

/* WiFi Management */
#define WIFI_CONNECTED 3

/**
 * WiFi Functions
 */
extern int wifi_connect(const char *ssid, const char *password);
extern int wifi_disconnect(void);
extern int wifi_get_status(void);
extern int wifi_get_ip(char *ip_out, int max_len);

/**
 * HTTP Client Functions
 */
extern int http_get(const char *url, char *response_out, int max_len);
extern int http_post(const char *url, const char *data, int data_len, char *response_out, int max_len);

#ifdef __cplusplus
}
#endif

#endif /* WM_EXT_WASM_NATIVE_H */
