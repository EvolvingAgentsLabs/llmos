/**
 * ESP32-CAM MJPEG WiFi Streamer — V1 Hardware
 *
 * Streams MJPEG video over HTTP for host PC VLM inference.
 * Single endpoint: GET /stream returns multipart/x-mixed-replace JPEG frames.
 *
 * Hardware: ESP32-CAM (AI-Thinker) board
 * Default: QVGA (320x240) at ~10fps
 *
 * Architecture: ESP32-CAM -> WiFi -> Host PC (Qwen3-VL)
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>

// =============================================================================
// WiFi Configuration
// =============================================================================

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// =============================================================================
// AI-Thinker ESP32-CAM Pin Definitions
// =============================================================================

#define PWDN_GPIO_NUM    32
#define RESET_GPIO_NUM   -1
#define XCLK_GPIO_NUM     0
#define SIOD_GPIO_NUM    26
#define SIOC_GPIO_NUM    27

#define Y9_GPIO_NUM      35
#define Y8_GPIO_NUM      34
#define Y7_GPIO_NUM      39
#define Y6_GPIO_NUM      36
#define Y5_GPIO_NUM      21
#define Y4_GPIO_NUM      19
#define Y3_GPIO_NUM      18
#define Y2_GPIO_NUM       5

#define VSYNC_GPIO_NUM   25
#define HREF_GPIO_NUM    23
#define PCLK_GPIO_NUM    22

// Flash LED
#define FLASH_LED_PIN     4

// =============================================================================
// Streaming Configuration
// =============================================================================

#define FRAME_SIZE    FRAMESIZE_QVGA   // 320x240
#define JPEG_QUALITY  12               // 0-63, lower = better quality
#define TARGET_FPS    10

const int FRAME_INTERVAL_MS = 1000 / TARGET_FPS;
const char* STREAM_BOUNDARY = "frame";
const char* STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=frame";

// =============================================================================
// Global Objects
// =============================================================================

WebServer server(80);
bool cameraReady = false;
unsigned long frameCount = 0;
unsigned long streamStartTime = 0;

// =============================================================================
// Camera Initialization
// =============================================================================

bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAME_SIZE;
  config.jpeg_quality = JPEG_QUALITY;
  config.fb_count = 2;  // Double buffer for smooth streaming
  config.grab_mode = CAMERA_GRAB_LATEST;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] Init failed: 0x%x\n", err);
    return false;
  }

  // Adjust sensor settings for indoor robot use
  sensor_t* sensor = esp_camera_sensor_get();
  if (sensor) {
    sensor->set_brightness(sensor, 1);     // Slightly brighter
    sensor->set_contrast(sensor, 1);       // Slightly more contrast
    sensor->set_saturation(sensor, 0);     // Normal saturation
    sensor->set_whitebal(sensor, 1);       // Auto white balance
    sensor->set_awb_gain(sensor, 1);       // AWB gain enabled
    sensor->set_exposure_ctrl(sensor, 1);  // Auto exposure
    sensor->set_aec2(sensor, 1);           // Auto exposure DSP
    sensor->set_gain_ctrl(sensor, 1);      // Auto gain
  }

  Serial.println("[CAM] Camera initialized");
  return true;
}

// =============================================================================
// HTTP Stream Handler
// =============================================================================

void handleStream() {
  WiFiClient client = server.client();

  // Send multipart header
  String response = "HTTP/1.1 200 OK\r\n";
  response += "Content-Type: " + String(STREAM_CONTENT_TYPE) + "\r\n";
  response += "Access-Control-Allow-Origin: *\r\n";
  response += "Cache-Control: no-cache\r\n";
  response += "Connection: keep-alive\r\n\r\n";
  client.print(response);

  streamStartTime = millis();
  frameCount = 0;

  Serial.printf("[CAM] Stream started for %s\n", client.remoteIP().toString().c_str());

  while (client.connected()) {
    unsigned long frameStart = millis();

    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("[CAM] Frame capture failed");
      continue;
    }

    // Send MJPEG frame with boundary
    String header = "--" + String(STREAM_BOUNDARY) + "\r\n";
    header += "Content-Type: image/jpeg\r\n";
    header += "Content-Length: " + String(fb->len) + "\r\n\r\n";

    client.print(header);
    client.write(fb->buf, fb->len);
    client.print("\r\n");

    esp_camera_fb_return(fb);
    frameCount++;

    // Throttle to target FPS
    unsigned long elapsed = millis() - frameStart;
    if (elapsed < FRAME_INTERVAL_MS) {
      delay(FRAME_INTERVAL_MS - elapsed);
    }
  }

  float duration = (millis() - streamStartTime) / 1000.0f;
  Serial.printf("[CAM] Stream ended: %lu frames in %.1fs (%.1f fps)\n",
    frameCount, duration, frameCount / duration);
}

// =============================================================================
// HTTP Status Handler
// =============================================================================

void handleStatus() {
  float uptime = millis() / 1000.0f;
  float fps = (streamStartTime > 0 && millis() > streamStartTime)
    ? (frameCount * 1000.0f / (millis() - streamStartTime))
    : 0.0f;

  String json = "{";
  json += "\"ok\":true,";
  json += "\"camera_ready\":" + String(cameraReady ? "true" : "false") + ",";
  json += "\"resolution\":\"320x240\",";
  json += "\"fps\":" + String(fps, 1) + ",";
  json += "\"frames\":" + String(frameCount) + ",";
  json += "\"uptime\":" + String(uptime, 1) + ",";
  json += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"free_heap\":" + String(ESP.getFreeHeap());
  json += "}";

  server.send(200, "application/json", json);
}

// =============================================================================
// HTTP Root Handler
// =============================================================================

void handleRoot() {
  String html = "<html><head><title>LLMos ESP32-CAM</title></head><body>";
  html += "<h1>LLMos V1 Camera</h1>";
  html += "<p>Stream: <a href='/stream'>/stream</a></p>";
  html += "<p>Status: <a href='/status'>/status</a></p>";
  html += "<img src='/stream' style='max-width:640px'/>";
  html += "</body></html>";

  server.send(200, "text/html", html);
}

// =============================================================================
// Setup
// =============================================================================

void setup() {
  Serial.begin(115200);
  Serial.println("[CAM] ESP32-CAM MJPEG Streamer V1");

  // Flash LED off
  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);

  // Initialize camera
  cameraReady = initCamera();
  if (!cameraReady) {
    Serial.println("[CAM] FATAL: Camera init failed!");
  }

  // Connect to WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[CAM] Connecting to WiFi");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("[CAM] Connected! IP: ");
    Serial.println(WiFi.localIP());
    Serial.printf("[CAM] Stream URL: http://%s/stream\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println();
    Serial.println("[CAM] WiFi connection failed!");
  }

  // Set up HTTP routes
  server.on("/", handleRoot);
  server.on("/stream", HTTP_GET, handleStream);
  server.on("/status", HTTP_GET, handleStatus);
  server.begin();

  Serial.println("[CAM] HTTP server started on port 80");
}

// =============================================================================
// Main Loop
// =============================================================================

void loop() {
  server.handleClient();
}
