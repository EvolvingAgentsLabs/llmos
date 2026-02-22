/**
 * ESP32-S3 Stepper Motor Controller — V1 Hardware
 *
 * Controls 2x 28BYJ-48 stepper motors via ULN2003 drivers over WiFi UDP.
 * Receives JSON commands from host PC, executes differential drive movements,
 * and tracks pose via dead reckoning.
 *
 * Hardware:
 *   - ESP32-S3-DevKitC-1
 *   - 2x 28BYJ-48 (4096 steps/rev, 64:1 gear ratio)
 *   - 2x ULN2003 driver boards
 *   - 6cm diameter wheels, 10cm wheel base
 *
 * Protocol: JSON over UDP port 4210
 * Commands: move_steps, move_cm, rotate_deg, stop, get_status, set_config
 */

#include <WiFi.h>
#include <WiFiUdp.h>
#include <AccelStepper.h>
#include <ArduinoJson.h>

// =============================================================================
// WiFi Configuration
// =============================================================================

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const int UDP_PORT = 4210;

// =============================================================================
// Pin Definitions — ULN2003 to ESP32-S3
// =============================================================================

// Left motor (ULN2003 #1)
#define LEFT_IN1  4
#define LEFT_IN2  5
#define LEFT_IN3  6
#define LEFT_IN4  7

// Right motor (ULN2003 #2)
#define RIGHT_IN1 15
#define RIGHT_IN2 16
#define RIGHT_IN3 17
#define RIGHT_IN4 18

// Status LED
#define STATUS_LED 2

// =============================================================================
// 28BYJ-48 Motor Constants
// =============================================================================

#define STEPS_PER_REV      4096    // 64:1 gear ratio * 64 steps
#define WHEEL_DIAMETER_CM  6.0f
#define WHEEL_BASE_CM      10.0f
#define MAX_SPEED_STEPS_S  1024    // Safe max for 28BYJ-48
#define DEFAULT_ACCEL      512     // steps/s^2

const float WHEEL_CIRCUMFERENCE_CM = WHEEL_DIAMETER_CM * PI;
const float STEPS_PER_CM = STEPS_PER_REV / WHEEL_CIRCUMFERENCE_CM;

// =============================================================================
// Safety Constants
// =============================================================================

#define HOST_TIMEOUT_MS     2000   // Emergency stop if no command for 2s
#define MAX_CONTINUOUS_STEPS 40960 // Max 10 revolutions per command
#define HEARTBEAT_INTERVAL  500    // Status LED blink interval

// =============================================================================
// Global Objects
// =============================================================================

// AccelStepper in HALF4WIRE mode for smooth operation
AccelStepper leftMotor(AccelStepper::HALF4WIRE, LEFT_IN1, LEFT_IN3, LEFT_IN2, LEFT_IN4);
AccelStepper rightMotor(AccelStepper::HALF4WIRE, RIGHT_IN1, RIGHT_IN3, RIGHT_IN2, RIGHT_IN4);

WiFiUDP udp;
StaticJsonDocument<512> jsonDoc;

// =============================================================================
// Pose Tracking (Differential Drive Dead Reckoning)
// =============================================================================

struct RobotPose {
  float x;         // cm
  float y;         // cm
  float heading;   // radians
};

RobotPose pose = {0.0f, 0.0f, 0.0f};
long prevLeftSteps = 0;
long prevRightSteps = 0;

// =============================================================================
// Runtime State
// =============================================================================

unsigned long lastCommandTime = 0;
unsigned long lastHeartbeat = 0;
bool motorsRunning = false;
bool emergencyStopped = false;

// Configurable parameters (can be updated via set_config)
float wheelDiameterCm = WHEEL_DIAMETER_CM;
float wheelBaseCm = WHEEL_BASE_CM;
int maxSpeedStepsS = MAX_SPEED_STEPS_S;

// UDP response buffer
char udpBuffer[512];
char responseBuffer[512];

// =============================================================================
// Setup
// =============================================================================

void setup() {
  Serial.begin(115200);
  Serial.println("[Stepper] ESP32-S3 Stepper Controller V1");

  // Configure status LED
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  // Configure motors
  leftMotor.setMaxSpeed(MAX_SPEED_STEPS_S);
  leftMotor.setAcceleration(DEFAULT_ACCEL);
  rightMotor.setMaxSpeed(MAX_SPEED_STEPS_S);
  rightMotor.setAcceleration(DEFAULT_ACCEL);

  // Connect to WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[Stepper] Connecting to WiFi");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
    digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("[Stepper] Connected! IP: ");
    Serial.println(WiFi.localIP());
    digitalWrite(STATUS_LED, HIGH);
  } else {
    Serial.println();
    Serial.println("[Stepper] WiFi connection failed!");
    digitalWrite(STATUS_LED, LOW);
  }

  // Start UDP listener
  udp.begin(UDP_PORT);
  Serial.printf("[Stepper] UDP listening on port %d\n", UDP_PORT);

  lastCommandTime = millis();
}

// =============================================================================
// Main Loop
// =============================================================================

void loop() {
  // 1. Check for incoming UDP commands
  int packetSize = udp.parsePacket();
  if (packetSize > 0) {
    int len = udp.read(udpBuffer, sizeof(udpBuffer) - 1);
    if (len > 0) {
      udpBuffer[len] = '\0';
      lastCommandTime = millis();
      handleCommand(udpBuffer);
    }
  }

  // 2. Run stepper motors (non-blocking)
  if (!emergencyStopped) {
    leftMotor.run();
    rightMotor.run();

    // Check if motors have completed their moves
    if (motorsRunning && leftMotor.distanceToGo() == 0 && rightMotor.distanceToGo() == 0) {
      motorsRunning = false;
      disableMotorCoils();
    }
  }

  // 3. Update pose from encoder counts
  updatePose();

  // 4. Safety: host timeout check
  if (millis() - lastCommandTime > HOST_TIMEOUT_MS) {
    if (!emergencyStopped) {
      emergencyStop();
      Serial.println("[Stepper] Host timeout — emergency stop!");
    }
  }

  // 5. Status LED heartbeat
  if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    if (emergencyStopped) {
      // Fast blink when emergency stopped
      digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
    } else if (motorsRunning) {
      digitalWrite(STATUS_LED, HIGH);
    } else {
      // Slow blink when idle
      digitalWrite(STATUS_LED, (millis() / 1000) % 2 == 0 ? HIGH : LOW);
    }
  }
}

// =============================================================================
// Command Handler
// =============================================================================

void handleCommand(const char* json) {
  DeserializationError error = deserializeJson(jsonDoc, json);
  if (error) {
    sendResponse("{\"error\":\"invalid_json\"}");
    return;
  }

  const char* cmd = jsonDoc["cmd"];
  if (!cmd) {
    sendResponse("{\"error\":\"missing_cmd\"}");
    return;
  }

  // Reset emergency stop on any valid command
  if (emergencyStopped && strcmp(cmd, "stop") != 0 && strcmp(cmd, "get_status") != 0) {
    emergencyStopped = false;
  }

  if (strcmp(cmd, "move_steps") == 0) {
    cmdMoveSteps();
  } else if (strcmp(cmd, "move_cm") == 0) {
    cmdMoveCm();
  } else if (strcmp(cmd, "rotate_deg") == 0) {
    cmdRotateDeg();
  } else if (strcmp(cmd, "stop") == 0) {
    cmdStop();
  } else if (strcmp(cmd, "get_status") == 0) {
    cmdGetStatus();
  } else if (strcmp(cmd, "set_config") == 0) {
    cmdSetConfig();
  } else {
    sendResponse("{\"error\":\"unknown_cmd\"}");
  }
}

// =============================================================================
// Command Implementations
// =============================================================================

void cmdMoveSteps() {
  long leftSteps = jsonDoc["left"] | 0L;
  long rightSteps = jsonDoc["right"] | 0L;
  int speed = jsonDoc["speed"] | MAX_SPEED_STEPS_S;

  // Safety clamp
  leftSteps = constrain(leftSteps, -MAX_CONTINUOUS_STEPS, MAX_CONTINUOUS_STEPS);
  rightSteps = constrain(rightSteps, -MAX_CONTINUOUS_STEPS, MAX_CONTINUOUS_STEPS);
  speed = constrain(speed, 1, maxSpeedStepsS);

  leftMotor.setMaxSpeed(speed);
  rightMotor.setMaxSpeed(speed);
  leftMotor.move(leftSteps);
  rightMotor.move(rightSteps);
  motorsRunning = true;

  snprintf(responseBuffer, sizeof(responseBuffer),
    "{\"ok\":true,\"cmd\":\"move_steps\",\"left\":%ld,\"right\":%ld,\"speed\":%d}",
    leftSteps, rightSteps, speed);
  sendResponse(responseBuffer);
}

void cmdMoveCm() {
  float leftCm = jsonDoc["left_cm"] | 0.0f;
  float rightCm = jsonDoc["right_cm"] | 0.0f;
  float speedCmS = jsonDoc["speed"] | (WHEEL_CIRCUMFERENCE_CM * 2.0f);

  float currentStepsPerCm = STEPS_PER_REV / (wheelDiameterCm * PI);
  long leftSteps = (long)(leftCm * currentStepsPerCm);
  long rightSteps = (long)(rightCm * currentStepsPerCm);
  int speedSteps = (int)(speedCmS * currentStepsPerCm);

  // Safety clamp
  leftSteps = constrain(leftSteps, -MAX_CONTINUOUS_STEPS, MAX_CONTINUOUS_STEPS);
  rightSteps = constrain(rightSteps, -MAX_CONTINUOUS_STEPS, MAX_CONTINUOUS_STEPS);
  speedSteps = constrain(speedSteps, 1, maxSpeedStepsS);

  leftMotor.setMaxSpeed(speedSteps);
  rightMotor.setMaxSpeed(speedSteps);
  leftMotor.move(leftSteps);
  rightMotor.move(rightSteps);
  motorsRunning = true;

  snprintf(responseBuffer, sizeof(responseBuffer),
    "{\"ok\":true,\"cmd\":\"move_cm\",\"left_steps\":%ld,\"right_steps\":%ld}",
    leftSteps, rightSteps);
  sendResponse(responseBuffer);
}

void cmdRotateDeg() {
  float degrees = jsonDoc["degrees"] | 0.0f;
  float speedCmS = jsonDoc["speed"] | (WHEEL_CIRCUMFERENCE_CM * 2.0f);

  // Arc length for in-place rotation: arc = (degrees/360) * PI * wheelBase
  float arcCm = (degrees / 360.0f) * PI * wheelBaseCm;
  float currentStepsPerCm = STEPS_PER_REV / (wheelDiameterCm * PI);
  long arcSteps = (long)(arcCm * currentStepsPerCm);
  int speedSteps = (int)(speedCmS * currentStepsPerCm);

  // Differential: left goes forward, right goes backward (or vice versa)
  long leftSteps = constrain(arcSteps, -MAX_CONTINUOUS_STEPS, MAX_CONTINUOUS_STEPS);
  long rightSteps = constrain(-arcSteps, -MAX_CONTINUOUS_STEPS, MAX_CONTINUOUS_STEPS);
  speedSteps = constrain(speedSteps, 1, maxSpeedStepsS);

  leftMotor.setMaxSpeed(speedSteps);
  rightMotor.setMaxSpeed(speedSteps);
  leftMotor.move(leftSteps);
  rightMotor.move(rightSteps);
  motorsRunning = true;

  snprintf(responseBuffer, sizeof(responseBuffer),
    "{\"ok\":true,\"cmd\":\"rotate_deg\",\"degrees\":%.1f,\"arc_steps\":%ld}",
    degrees, arcSteps);
  sendResponse(responseBuffer);
}

void cmdStop() {
  leftMotor.stop();
  rightMotor.stop();
  leftMotor.setCurrentPosition(leftMotor.currentPosition());
  rightMotor.setCurrentPosition(rightMotor.currentPosition());
  motorsRunning = false;
  disableMotorCoils();

  sendResponse("{\"ok\":true,\"cmd\":\"stop\"}");
}

void cmdGetStatus() {
  snprintf(responseBuffer, sizeof(responseBuffer),
    "{\"ok\":true,\"cmd\":\"get_status\","
    "\"pose\":{\"x\":%.2f,\"y\":%.2f,\"heading\":%.4f},"
    "\"steps\":{\"left\":%ld,\"right\":%ld},"
    "\"running\":%s,"
    "\"emergency\":%s,"
    "\"wifi_rssi\":%d}",
    pose.x, pose.y, pose.heading,
    leftMotor.currentPosition(), rightMotor.currentPosition(),
    motorsRunning ? "true" : "false",
    emergencyStopped ? "true" : "false",
    WiFi.RSSI());
  sendResponse(responseBuffer);
}

void cmdSetConfig() {
  if (jsonDoc.containsKey("wheel_diameter_cm")) {
    wheelDiameterCm = jsonDoc["wheel_diameter_cm"];
  }
  if (jsonDoc.containsKey("wheel_base_cm")) {
    wheelBaseCm = jsonDoc["wheel_base_cm"];
  }
  if (jsonDoc.containsKey("max_speed")) {
    maxSpeedStepsS = constrain((int)jsonDoc["max_speed"], 1, 1024);
    leftMotor.setMaxSpeed(maxSpeedStepsS);
    rightMotor.setMaxSpeed(maxSpeedStepsS);
  }
  if (jsonDoc.containsKey("acceleration")) {
    int accel = constrain((int)jsonDoc["acceleration"], 1, 2048);
    leftMotor.setAcceleration(accel);
    rightMotor.setAcceleration(accel);
  }

  sendResponse("{\"ok\":true,\"cmd\":\"set_config\"}");
}

// =============================================================================
// Pose Tracking (Differential Drive Odometry)
// =============================================================================

void updatePose() {
  long currentLeft = leftMotor.currentPosition();
  long currentRight = rightMotor.currentPosition();

  long deltaLeft = currentLeft - prevLeftSteps;
  long deltaRight = currentRight - prevRightSteps;

  if (deltaLeft == 0 && deltaRight == 0) return;

  float currentStepsPerCm = STEPS_PER_REV / (wheelDiameterCm * PI);
  float leftDistCm = deltaLeft / currentStepsPerCm;
  float rightDistCm = deltaRight / currentStepsPerCm;

  float linearCm = (leftDistCm + rightDistCm) / 2.0f;
  float angularRad = (rightDistCm - leftDistCm) / wheelBaseCm;

  pose.heading += angularRad;
  // Normalize heading to [-PI, PI]
  while (pose.heading > PI) pose.heading -= 2.0f * PI;
  while (pose.heading < -PI) pose.heading += 2.0f * PI;

  pose.x += linearCm * cos(pose.heading);
  pose.y += linearCm * sin(pose.heading);

  prevLeftSteps = currentLeft;
  prevRightSteps = currentRight;
}

// =============================================================================
// Helpers
// =============================================================================

void emergencyStop() {
  leftMotor.stop();
  rightMotor.stop();
  leftMotor.setCurrentPosition(leftMotor.currentPosition());
  rightMotor.setCurrentPosition(rightMotor.currentPosition());
  motorsRunning = false;
  emergencyStopped = true;
  disableMotorCoils();
}

void disableMotorCoils() {
  // Turn off all coils to save power (28BYJ-48 draws ~240mA when energized)
  digitalWrite(LEFT_IN1, LOW);
  digitalWrite(LEFT_IN2, LOW);
  digitalWrite(LEFT_IN3, LOW);
  digitalWrite(LEFT_IN4, LOW);
  digitalWrite(RIGHT_IN1, LOW);
  digitalWrite(RIGHT_IN2, LOW);
  digitalWrite(RIGHT_IN3, LOW);
  digitalWrite(RIGHT_IN4, LOW);
}

void sendResponse(const char* response) {
  udp.beginPacket(udp.remoteIP(), udp.remotePort());
  udp.write((const uint8_t*)response, strlen(response));
  udp.endPacket();
}
