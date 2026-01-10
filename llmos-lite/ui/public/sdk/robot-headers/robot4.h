/**
 * ROBOT-4 API Header
 *
 * A WASM4-style hardware abstraction layer for programming ESP32-S3 robots.
 * Same code runs in browser simulation and on real hardware.
 *
 * Inspired by WASM-4 fantasy console (https://wasm4.org)
 *
 * Hardware target: ESP32-S3 cube robot with:
 * - 2 DC motors (differential drive)
 * - OV2640 camera (160x120 grayscale)
 * - Distance sensors (ultrasonic/IR)
 * - Line sensor array
 * - Bumper switches
 * - RGB LED
 * - Buzzer
 *
 * Usage:
 *   #include "robot4.h"
 *
 *   void start(void) {
 *       // Called once at startup
 *   }
 *
 *   void update(void) {
 *       // Called 60 times per second
 *       drive(100, 100);  // Move forward
 *   }
 */

#ifndef ROBOT4_H
#define ROBOT4_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// ═══════════════════════════════════════════════════════════════════════════
//                              MEMORY MAP
// ═══════════════════════════════════════════════════════════════════════════
//
// Memory-mapped I/O follows WASM4 pattern. Read sensors by reading memory,
// control actuators by writing to memory.
//
// Address Map:
//   0x0000 - 0x0003: Motors (2x int16_t: left, right PWM)
//   0x0004 - 0x000B: Encoders (2x int32_t: left, right ticks)
//   0x000C - 0x0017: IMU (6x int16_t: ax,ay,az,gx,gy,gz)
//   0x0018 - 0x0018: Battery percentage (uint8_t)
//   0x0019 - 0x001B: LED RGB (3x uint8_t)
//   0x001C - 0x0023: Distance sensors (8x uint8_t, cm)
//   0x0024 - 0x0028: Line sensors (5x uint8_t, 0-255)
//   0x0029 - 0x0029: Buttons/Bumpers (uint8_t bitfield)
//   0x002A - 0x002A: Camera command (uint8_t)
//   0x002B - 0x002B: Camera status (uint8_t)
//   0x002C - 0x002C: System flags (uint8_t)
//   0x0030 - 0x0033: Tick count (uint32_t ms)
//   0x1000 - 0x5B00: Camera framebuffer (160x120 grayscale)

// ─────────────────────────────────────────────────────────────────────────────
// MOTOR CONTROL
// ─────────────────────────────────────────────────────────────────────────────

/** Motor PWM values: -255 (full reverse) to +255 (full forward) */
#define R4_MOTORS        ((volatile int16_t*)0x00)
#define R4_MOTOR_LEFT    (R4_MOTORS[0])
#define R4_MOTOR_RIGHT   (R4_MOTORS[1])

/** Set both motor speeds at once */
#define drive(left, right) do { \
    R4_MOTOR_LEFT = (int16_t)(left); \
    R4_MOTOR_RIGHT = (int16_t)(right); \
} while(0)

/** Stop both motors */
#define stop() drive(0, 0)

/** Turn in place: positive = clockwise, negative = counter-clockwise */
#define spin(speed) drive((speed), -(speed))

// ─────────────────────────────────────────────────────────────────────────────
// ENCODERS (Odometry)
// ─────────────────────────────────────────────────────────────────────────────

/** Wheel encoder tick counts (signed, can wrap) */
#define R4_ENCODERS      ((volatile int32_t*)0x04)
#define R4_ENCODER_LEFT  (R4_ENCODERS[0])
#define R4_ENCODER_RIGHT (R4_ENCODERS[1])

/** Encoder ticks per meter (hardware dependent, typical: 1000) */
#define R4_TICKS_PER_METER 1000

// ─────────────────────────────────────────────────────────────────────────────
// IMU (Inertial Measurement Unit)
// ─────────────────────────────────────────────────────────────────────────────

/** IMU data: accelerometer (mg) and gyroscope (mdps) */
#define R4_IMU           ((volatile int16_t*)0x0C)
#define R4_ACCEL_X       (R4_IMU[0])   // milli-g
#define R4_ACCEL_Y       (R4_IMU[1])
#define R4_ACCEL_Z       (R4_IMU[2])
#define R4_GYRO_X        (R4_IMU[3])   // milli-degrees per second
#define R4_GYRO_Y        (R4_IMU[4])
#define R4_GYRO_Z        (R4_IMU[5])

// ─────────────────────────────────────────────────────────────────────────────
// BATTERY
// ─────────────────────────────────────────────────────────────────────────────

/** Battery level 0-100% */
#define R4_BATTERY       (*((volatile uint8_t*)0x18))

// ─────────────────────────────────────────────────────────────────────────────
// RGB LED
// ─────────────────────────────────────────────────────────────────────────────

/** LED color values 0-255 */
#define R4_LED           ((volatile uint8_t*)0x19)
#define R4_LED_R         (R4_LED[0])
#define R4_LED_G         (R4_LED[1])
#define R4_LED_B         (R4_LED[2])

/** Set LED color */
#define led(r, g, b) do { \
    R4_LED_R = (uint8_t)(r); \
    R4_LED_G = (uint8_t)(g); \
    R4_LED_B = (uint8_t)(b); \
} while(0)

/** Common LED colors */
#define led_off()     led(0, 0, 0)
#define led_red()     led(255, 0, 0)
#define led_green()   led(0, 255, 0)
#define led_blue()    led(0, 0, 255)
#define led_yellow()  led(255, 255, 0)
#define led_cyan()    led(0, 255, 255)
#define led_magenta() led(255, 0, 255)
#define led_white()   led(255, 255, 255)

// ─────────────────────────────────────────────────────────────────────────────
// DISTANCE SENSORS
// ─────────────────────────────────────────────────────────────────────────────

/** Distance sensor readings in centimeters (0-255, 255 = out of range) */
#define R4_SENSORS       ((volatile uint8_t*)0x1C)

/** Sensor indices (robot-dependent layout) */
#define R4_SENSOR_FRONT       0
#define R4_SENSOR_FRONT_LEFT  1
#define R4_SENSOR_FRONT_RIGHT 2
#define R4_SENSOR_LEFT        3
#define R4_SENSOR_RIGHT       4
#define R4_SENSOR_BACK        5
#define R4_SENSOR_BACK_LEFT   6
#define R4_SENSOR_BACK_RIGHT  7

/** Get distance from sensor by index (0-7) */
#define distance(idx) (R4_SENSORS[(idx)])

/** Common distance queries */
#define distance_front()       distance(R4_SENSOR_FRONT)
#define distance_front_left()  distance(R4_SENSOR_FRONT_LEFT)
#define distance_front_right() distance(R4_SENSOR_FRONT_RIGHT)
#define distance_left()        distance(R4_SENSOR_LEFT)
#define distance_right()       distance(R4_SENSOR_RIGHT)
#define distance_back()        distance(R4_SENSOR_BACK)

// ─────────────────────────────────────────────────────────────────────────────
// LINE SENSORS
// ─────────────────────────────────────────────────────────────────────────────

/** Line sensor array (5 sensors): 0 = white, 255 = black */
#define R4_LINE          ((volatile uint8_t*)0x24)

/** Line sensor indices (left to right) */
#define R4_LINE_FAR_LEFT  0
#define R4_LINE_LEFT      1
#define R4_LINE_CENTER    2
#define R4_LINE_RIGHT     3
#define R4_LINE_FAR_RIGHT 4

/** Get line sensor reading by index */
#define line(idx) (R4_LINE[(idx)])

/** Check if sensor sees line (threshold 128) */
#define on_line(idx) (R4_LINE[(idx)] > 128)

// ─────────────────────────────────────────────────────────────────────────────
// BUTTONS / BUMPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Button/bumper state bitfield */
#define R4_BUTTONS       (*((volatile uint8_t*)0x29))

/** Bumper bit masks */
#define R4_BUMPER_FRONT  0x01
#define R4_BUMPER_LEFT   0x02
#define R4_BUMPER_RIGHT  0x04
#define R4_BUMPER_BACK   0x08
#define R4_BUTTON_USER   0x10   // User button on board

/** Check if bumper/button is pressed */
#define bumper(mask) ((R4_BUTTONS) & (mask))
#define bumper_front()  bumper(R4_BUMPER_FRONT)
#define bumper_left()   bumper(R4_BUMPER_LEFT)
#define bumper_right()  bumper(R4_BUMPER_RIGHT)
#define bumper_back()   bumper(R4_BUMPER_BACK)
#define button_user()   bumper(R4_BUTTON_USER)

// ─────────────────────────────────────────────────────────────────────────────
// CAMERA
// ─────────────────────────────────────────────────────────────────────────────

/** Camera command register */
#define R4_CAMERA_CMD    (*((volatile uint8_t*)0x2A))

/** Camera status register */
#define R4_CAMERA_STATUS (*((volatile uint8_t*)0x2B))

/** Camera commands */
#define R4_CAM_STOP      0x00   // Stop capture
#define R4_CAM_CAPTURE   0x01   // Request single frame
#define R4_CAM_STREAM    0x02   // Start continuous capture

/** Camera status values */
#define R4_CAM_IDLE      0x00   // Not capturing
#define R4_CAM_BUSY      0x01   // Capturing frame
#define R4_CAM_READY     0x02   // Frame ready in buffer

/** Camera framebuffer (160x120 grayscale) */
#define R4_FRAMEBUFFER   ((volatile uint8_t*)0x1000)
#define R4_FB_WIDTH      160
#define R4_FB_HEIGHT     120
#define R4_FB_SIZE       (R4_FB_WIDTH * R4_FB_HEIGHT)

/** Get pixel from framebuffer (0-255 grayscale) */
#define pixel(x, y) (R4_FRAMEBUFFER[(y) * R4_FB_WIDTH + (x)])

/** Request a frame capture and wait for completion */
#define capture_frame() do { \
    R4_CAMERA_CMD = R4_CAM_CAPTURE; \
    while (R4_CAMERA_STATUS != R4_CAM_READY) {} \
} while(0)

/** Start continuous camera capture */
#define start_camera() (R4_CAMERA_CMD = R4_CAM_STREAM)

/** Stop camera capture */
#define stop_camera() (R4_CAMERA_CMD = R4_CAM_STOP)

/** Check if frame is ready */
#define frame_ready() (R4_CAMERA_STATUS == R4_CAM_READY)

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

/** System flags (read/write configuration) */
#define R4_SYSTEM_FLAGS  (*((volatile uint8_t*)0x2C))

/** System flag bits */
#define R4_FLAG_CAMERA_ENABLE    0x01   // Enable camera subsystem
#define R4_FLAG_MOTOR_ENABLE     0x02   // Enable motor drivers
#define R4_FLAG_LED_ENABLE       0x04   // Enable status LED
#define R4_FLAG_SENSORS_ENABLE   0x08   // Enable distance sensors
#define R4_FLAG_WIFI_CONNECTED   0x80   // Read-only: WiFi status

/** Milliseconds since boot (wraps at ~49 days) */
#define R4_TICK_COUNT    (*((volatile uint32_t*)0x30))

/** Get current tick count */
#define ticks() (R4_TICK_COUNT)

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTED FUNCTIONS (provided by runtime)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Output debug message (like printf to console)
 * In browser: appears in browser console
 * On device: output via UART or WiFi
 */
extern void trace(const char* message);

/**
 * Delay execution for specified milliseconds
 * WARNING: Blocks the game loop - use sparingly!
 */
extern void delay_ms(uint32_t ms);

/**
 * Get random 32-bit unsigned integer
 * Seeded from hardware RNG on real device
 */
extern uint32_t random(void);

/**
 * Play a tone on the buzzer
 * @param freq      Frequency in Hz (100-10000)
 * @param duration  Duration in milliseconds
 * @param volume    Volume 0-255
 */
extern void tone(uint32_t freq, uint32_t duration, uint8_t volume);

// ─────────────────────────────────────────────────────────────────────────────
// USER-DEFINED CALLBACKS (implement these in your program)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called once at program start
 * Use for initialization: set system flags, initial LED state, etc.
 */
void start(void);

/**
 * Called 60 times per second (16.67ms interval)
 * Main game loop - read sensors, update state, set motors
 * Keep execution fast (<10ms) to maintain frame rate
 */
void update(void);

// ─────────────────────────────────────────────────────────────────────────────
// HELPER MACROS
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp value to range */
#define clamp(val, min, max) \
    ((val) < (min) ? (min) : ((val) > (max) ? (max) : (val)))

/** Absolute value */
#define abs(x) ((x) < 0 ? -(x) : (x))

/** Map value from one range to another */
#define map(x, in_min, in_max, out_min, out_max) \
    (((x) - (in_min)) * ((out_max) - (out_min)) / ((in_max) - (in_min)) + (out_min))

/** Sign of value: -1, 0, or 1 */
#define sign(x) ((x) > 0 ? 1 : ((x) < 0 ? -1 : 0))

#ifdef __cplusplus
}
#endif

#endif // ROBOT4_H
