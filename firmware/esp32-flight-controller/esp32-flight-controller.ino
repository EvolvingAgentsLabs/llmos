/**
 * ESP32-S3 Flight Controller Firmware
 *
 * Implements the LLMos JSON protocol for Hardware-in-the-Loop (HIL) simulation.
 * This firmware enables real ESP32-S3 hardware to communicate with the
 * LLMos Flight Simulator applet.
 *
 * Protocol: Newline-delimited JSON over USB CDC
 * Baud Rate: 115200
 *
 * Commands:
 * - get_info: Get device information
 * - arm/disarm: Enable/disable motor output
 * - set_motors: Set all 4 motor PWM values [0-255]
 * - get_motors: Read current motor states
 * - read_imu: Read IMU sensor data
 * - read_barometer: Read altitude/pressure data
 * - set_gpio/read_gpio: GPIO control
 * - read_adc: Analog input reading
 * - set_pwm: PWM output control
 * - read_sensors: Read all sensor data at once
 *
 * Hardware Requirements:
 * - ESP32-S3 DevKit or compatible board
 * - Optional: MPU6050/ICM20948 IMU on I2C
 * - Optional: BMP280/BME280 barometer on I2C
 * - 4x ESC/Motor connections on GPIO 12-15
 *
 * @version 1.0.0
 * @date 2026-01-06
 */

#include <ArduinoJson.h>
#include <Wire.h>

// ===================== CONFIGURATION =====================

// Motor PWM pins (adjust for your hardware)
const int MOTOR_PINS[4] = {12, 13, 14, 15};

// PWM configuration
const int PWM_FREQ = 50;        // 50Hz for standard servo/ESC
const int PWM_RESOLUTION = 8;   // 8-bit (0-255)

// I2C pins for sensors
const int I2C_SDA = 21;
const int I2C_SCL = 22;

// Built-in LED for status
const int STATUS_LED = 2;

// ===================== STATE =====================

bool armed = false;
int motorValues[4] = {0, 0, 0, 0};
unsigned long startTime = 0;

// Simulated sensor values (replace with real sensor reads)
float imuAccel[3] = {0.0, 0.0, 9.81};
float imuGyro[3] = {0.0, 0.0, 0.0};
float imuOrientation[3] = {0.0, 0.0, 0.0};
float baroAltitude = 0.0;
float baroPressure = 1013.25;
float baroTemperature = 25.0;

// JSON buffer
StaticJsonDocument<512> doc;
String inputBuffer = "";

// ===================== SETUP =====================

void setup() {
  // Initialize serial
  Serial.begin(115200);

  // Wait for serial connection
  while (!Serial && millis() < 5000) {
    delay(100);
  }

  // Record start time
  startTime = millis();

  // Initialize status LED
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  // Initialize motor PWM channels
  for (int i = 0; i < 4; i++) {
    ledcSetup(i, PWM_FREQ, PWM_RESOLUTION);
    ledcAttachPin(MOTOR_PINS[i], i);
    ledcWrite(i, 0);  // Motors off
  }

  // Initialize I2C for sensors
  Wire.begin(I2C_SDA, I2C_SCL);

  // Initialize sensors (if present)
  initSensors();

  // Send ready message
  Serial.println("{\"status\":\"ok\",\"msg\":\"ESP32-S3 Flight Controller ready\"}");
}

// ===================== MAIN LOOP =====================

void loop() {
  // Read serial input
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\n') {
      // Process complete command
      processCommand(inputBuffer);
      inputBuffer = "";
    } else if (c != '\r') {
      inputBuffer += c;
    }
  }

  // Update status LED (blink when armed)
  if (armed) {
    digitalWrite(STATUS_LED, (millis() / 200) % 2);
  } else {
    digitalWrite(STATUS_LED, LOW);
  }

  // Small delay to prevent watchdog issues
  delay(1);
}

// ===================== COMMAND PROCESSING =====================

void processCommand(String json) {
  // Parse JSON
  DeserializationError error = deserializeJson(doc, json);

  if (error) {
    sendError("JSON parse error");
    return;
  }

  // Get action
  const char* action = doc["action"];
  if (!action) {
    sendError("Missing action");
    return;
  }

  // Route to handler
  if (strcmp(action, "get_info") == 0) {
    handleGetInfo();
  }
  else if (strcmp(action, "arm") == 0) {
    handleArm(true);
  }
  else if (strcmp(action, "disarm") == 0) {
    handleArm(false);
  }
  else if (strcmp(action, "set_motors") == 0) {
    handleSetMotors();
  }
  else if (strcmp(action, "get_motors") == 0) {
    handleGetMotors();
  }
  else if (strcmp(action, "read_imu") == 0) {
    handleReadIMU();
  }
  else if (strcmp(action, "read_barometer") == 0) {
    handleReadBarometer();
  }
  else if (strcmp(action, "set_gpio") == 0) {
    handleSetGPIO();
  }
  else if (strcmp(action, "read_gpio") == 0) {
    handleReadGPIO();
  }
  else if (strcmp(action, "read_adc") == 0) {
    handleReadADC();
  }
  else if (strcmp(action, "set_pwm") == 0) {
    handleSetPWM();
  }
  else if (strcmp(action, "read_sensors") == 0) {
    handleReadSensors();
  }
  else if (strcmp(action, "set_altitude") == 0) {
    handleSetAltitude();
  }
  else {
    sendError("Unknown action");
  }
}

// ===================== COMMAND HANDLERS =====================

void handleGetInfo() {
  doc.clear();
  doc["status"] = "ok";
  doc["device"] = "ESP32-S3-FlightController";
  doc["firmware"] = "1.0.0";
  doc["chip"] = "ESP32-S3";
  doc["uptime_ms"] = millis() - startTime;
  doc["uptime_s"] = (millis() - startTime) / 1000;
  doc["cpu_freq_mhz"] = ESP.getCpuFreqMHz();
  doc["flash_size_mb"] = ESP.getFlashChipSize() / (1024 * 1024);
  doc["free_heap_kb"] = ESP.getFreeHeap() / 1024;
  doc["armed"] = armed;

  serializeJson(doc, Serial);
  Serial.println();
}

void handleArm(bool arm) {
  armed = arm;

  if (!armed) {
    // Disarm - stop all motors
    for (int i = 0; i < 4; i++) {
      motorValues[i] = 0;
      ledcWrite(i, 0);
    }
  }

  doc.clear();
  doc["status"] = "ok";
  doc["msg"] = armed ? "Armed" : "Disarmed";
  doc["armed"] = armed;

  serializeJson(doc, Serial);
  Serial.println();
}

void handleSetMotors() {
  if (!armed) {
    sendError("Flight controller not armed");
    return;
  }

  JsonArray motors = doc["motors"];
  if (motors.size() != 4) {
    sendError("Motors must be array of 4 values");
    return;
  }

  // Set motor values
  for (int i = 0; i < 4; i++) {
    int duty = constrain(motors[i].as<int>(), 0, 255);
    motorValues[i] = duty;
    ledcWrite(i, duty);
  }

  // Send response
  doc.clear();
  doc["status"] = "ok";
  doc["msg"] = "Motors set";
  JsonArray motorsArr = doc.createNestedArray("motors");
  for (int i = 0; i < 4; i++) {
    JsonObject motor = motorsArr.createNestedObject();
    motor["motor"] = i + 1;
    motor["duty"] = motorValues[i];
    motor["throttle_pct"] = (motorValues[i] * 100) / 255;
  }

  serializeJson(doc, Serial);
  Serial.println();
}

void handleGetMotors() {
  doc.clear();
  doc["status"] = "ok";
  doc["armed"] = armed;

  JsonArray motors = doc.createNestedArray("motors");
  for (int i = 0; i < 4; i++) {
    JsonObject motor = motors.createNestedObject();
    motor["motor"] = i + 1;
    motor["duty"] = motorValues[i];
    motor["frequency"] = PWM_FREQ;
    motor["throttle_pct"] = (motorValues[i] * 100) / 255;
  }

  serializeJson(doc, Serial);
  Serial.println();
}

void handleReadIMU() {
  // Read from real IMU sensor here
  // For now, return simulated/placeholder values
  readIMUSensor();

  doc.clear();
  doc["status"] = "ok";
  doc["sensor"] = "imu";

  JsonObject data = doc.createNestedObject("data");

  JsonObject accel = data.createNestedObject("accel");
  accel["x"] = imuAccel[0];
  accel["y"] = imuAccel[1];
  accel["z"] = imuAccel[2];

  JsonObject gyro = data.createNestedObject("gyro");
  gyro["x"] = imuGyro[0];
  gyro["y"] = imuGyro[1];
  gyro["z"] = imuGyro[2];

  JsonObject orientation = data.createNestedObject("orientation");
  orientation["roll"] = imuOrientation[0];
  orientation["pitch"] = imuOrientation[1];
  orientation["yaw"] = imuOrientation[2];

  doc["timestamp_ms"] = millis();

  serializeJson(doc, Serial);
  Serial.println();
}

void handleReadBarometer() {
  // Read from real barometer sensor here
  readBaroSensor();

  doc.clear();
  doc["status"] = "ok";
  doc["sensor"] = "barometer";

  JsonObject data = doc.createNestedObject("data");
  data["pressure_hpa"] = baroPressure;
  data["temperature_c"] = baroTemperature;
  data["altitude_m"] = baroAltitude;

  doc["timestamp_ms"] = millis();

  serializeJson(doc, Serial);
  Serial.println();
}

void handleSetGPIO() {
  int pin = doc["pin"] | -1;
  int state = doc["state"] | -1;

  if (pin < 0 || pin > 47) {
    sendError("Invalid pin number (0-47)");
    return;
  }

  if (state != 0 && state != 1) {
    sendError("State must be 0 or 1");
    return;
  }

  pinMode(pin, OUTPUT);
  digitalWrite(pin, state);

  doc.clear();
  doc["status"] = "ok";
  doc["msg"] = "GPIO set";
  doc["pin"] = pin;
  doc["state"] = state;

  serializeJson(doc, Serial);
  Serial.println();
}

void handleReadGPIO() {
  int pin = doc["pin"] | -1;

  if (pin < 0 || pin > 47) {
    sendError("Invalid pin number (0-47)");
    return;
  }

  int state = digitalRead(pin);

  doc.clear();
  doc["status"] = "ok";
  doc["pin"] = pin;
  doc["state"] = state;

  serializeJson(doc, Serial);
  Serial.println();
}

void handleReadADC() {
  int pin = doc["pin"] | -1;

  if (pin < 0) {
    sendError("Pin number required");
    return;
  }

  int value = analogRead(pin);
  float voltage = value * (3.3 / 4095.0);

  doc.clear();
  doc["status"] = "ok";
  doc["pin"] = pin;
  doc["value"] = value;
  doc["voltage"] = voltage;

  serializeJson(doc, Serial);
  Serial.println();
}

void handleSetPWM() {
  int pin = doc["pin"] | -1;
  int dutyCycle = doc["duty_cycle"] | -1;
  int frequency = doc["frequency"] | 5000;

  if (pin < 0 || pin > 47) {
    sendError("Invalid pin number (0-47)");
    return;
  }

  if (dutyCycle < 0 || dutyCycle > 255) {
    sendError("Duty cycle must be 0-255");
    return;
  }

  // Use channel 4-7 for generic PWM (0-3 reserved for motors)
  int channel = 4 + (pin % 4);
  ledcSetup(channel, frequency, PWM_RESOLUTION);
  ledcAttachPin(pin, channel);
  ledcWrite(channel, dutyCycle);

  doc.clear();
  doc["status"] = "ok";
  doc["msg"] = "PWM set";
  doc["pin"] = pin;
  doc["duty_cycle"] = dutyCycle;
  doc["frequency"] = frequency;

  serializeJson(doc, Serial);
  Serial.println();
}

void handleReadSensors() {
  // Read all sensors
  readIMUSensor();
  readBaroSensor();

  doc.clear();
  doc["status"] = "ok";

  JsonObject sensors = doc.createNestedObject("sensors");

  // IMU data
  JsonObject imu = sensors.createNestedObject("imu");
  JsonObject accel = imu.createNestedObject("accel");
  accel["x"] = imuAccel[0];
  accel["y"] = imuAccel[1];
  accel["z"] = imuAccel[2];
  JsonObject gyro = imu.createNestedObject("gyro");
  gyro["x"] = imuGyro[0];
  gyro["y"] = imuGyro[1];
  gyro["z"] = imuGyro[2];

  // Barometer data
  JsonObject baro = sensors.createNestedObject("barometer");
  baro["pressure_hpa"] = baroPressure;
  baro["temperature_c"] = baroTemperature;
  baro["altitude_m"] = baroAltitude;

  // Motor states
  JsonArray motors = sensors.createNestedArray("motors");
  for (int i = 0; i < 4; i++) {
    JsonObject motor = motors.createNestedObject();
    motor["motor"] = i + 1;
    motor["duty"] = motorValues[i];
    motor["throttle_pct"] = (motorValues[i] * 100) / 255;
  }

  // System info
  JsonObject sys = sensors.createNestedObject("system");
  sys["uptime_s"] = (millis() - startTime) / 1000;
  sys["free_heap_kb"] = ESP.getFreeHeap() / 1024;
  sys["cpu_temp_c"] = temperatureRead();  // ESP32-S3 internal temp
  sys["armed"] = armed;

  serializeJson(doc, Serial);
  Serial.println();
}

void handleSetAltitude() {
  float altitude = doc["altitude"] | -999.0;

  if (altitude < -500) {
    sendError("Altitude must be a number");
    return;
  }

  // Update simulated altitude (for HIL testing)
  baroAltitude = altitude;

  // Calculate corresponding pressure
  // Using barometric formula: P = P0 * (1 - h/44330)^5.255
  float seaLevelPressure = 1013.25;
  baroPressure = seaLevelPressure * pow(1.0 - (altitude / 44330.0), 5.255);

  doc.clear();
  doc["status"] = "ok";
  doc["msg"] = "Altitude updated";
  doc["altitude_m"] = baroAltitude;
  doc["pressure_hpa"] = baroPressure;

  serializeJson(doc, Serial);
  Serial.println();
}

// ===================== SENSOR FUNCTIONS =====================

void initSensors() {
  // Initialize IMU (MPU6050, ICM20948, etc.)
  // TODO: Add your specific sensor initialization here

  // Initialize Barometer (BMP280, BME280, etc.)
  // TODO: Add your specific sensor initialization here

  Serial.println("{\"status\":\"ok\",\"msg\":\"Sensors initialized\"}");
}

void readIMUSensor() {
  // TODO: Read from real IMU sensor
  // For now, add slight noise to simulate sensor

  imuAccel[0] += (random(-100, 100) / 1000.0);
  imuAccel[1] += (random(-100, 100) / 1000.0);
  imuAccel[2] = 9.81 + (random(-100, 100) / 1000.0);

  imuGyro[0] = random(-50, 50) / 100.0;
  imuGyro[1] = random(-50, 50) / 100.0;
  imuGyro[2] = random(-50, 50) / 100.0;

  // Clamp values
  for (int i = 0; i < 3; i++) {
    imuAccel[i] = constrain(imuAccel[i], -20.0, 20.0);
    imuGyro[i] = constrain(imuGyro[i], -500.0, 500.0);
  }
}

void readBaroSensor() {
  // TODO: Read from real barometer sensor
  // For now, add slight noise

  baroPressure += (random(-50, 50) / 100.0);
  baroTemperature += (random(-20, 20) / 100.0);

  // Clamp values
  baroPressure = constrain(baroPressure, 300.0, 1100.0);
  baroTemperature = constrain(baroTemperature, -40.0, 85.0);
}

// ===================== UTILITY FUNCTIONS =====================

void sendError(const char* message) {
  doc.clear();
  doc["status"] = "error";
  doc["msg"] = message;

  serializeJson(doc, Serial);
  Serial.println();
}

void sendOk(const char* message) {
  doc.clear();
  doc["status"] = "ok";
  doc["msg"] = message;

  serializeJson(doc, Serial);
  Serial.println();
}
