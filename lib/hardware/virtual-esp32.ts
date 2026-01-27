/**
 * Virtual ESP32-S3 Device Emulator
 *
 * Simulates ESP32-S3 JSON protocol for development/testing without physical hardware.
 * Provides realistic responses, timing, and state management.
 *
 * Extended Features:
 * - Flight controller motor control
 * - IMU sensor simulation
 * - Barometer/altitude sensor
 * - GPS simulation (optional)
 */

import type { DeviceCommand, DeviceResponse } from './serial-manager';

interface VirtualPin {
  mode: 'INPUT' | 'OUTPUT' | 'INPUT_PULLUP';
  state: number;
}

interface MotorState {
  duty: number; // 0-255
  frequency: number;
}

interface IMUData {
  accel: { x: number; y: number; z: number };
  gyro: { x: number; y: number; z: number };
  orientation: { roll: number; pitch: number; yaw: number };
}

interface BarometerData {
  pressure_hpa: number;
  temperature_c: number;
  altitude_m: number;
}

// Differential Drive Robot State
interface RobotPose {
  x: number;       // Position in meters
  y: number;       // Position in meters
  rotation: number; // Heading in radians
}

interface DiffDriveMotors {
  left: number;    // -255 to 255
  right: number;   // -255 to 255
}

interface LEDState {
  r: number;
  g: number;
  b: number;
}

interface EncoderState {
  left: number;
  right: number;
}

// Robot4 Camera Frame
interface CameraFrame {
  width: number;
  height: number;
  data: Uint8Array;
  timestamp: number;
}

// Robot4 Distance Sensors
interface DistanceSensors {
  front: number;
  frontLeft: number;
  frontRight: number;
  left: number;
  right: number;
  back: number;
  backLeft: number;
  backRight: number;
}

// Robot4 Line Sensors
interface LineSensors {
  values: number[];  // 5 sensors, 0-255
}

export class VirtualESP32 {
  private gpioState = new Map<number, VirtualPin>();
  private firmwareVersion = '1.0.0-virtual';
  private deviceName = 'ESP32-S3-Virtual';
  private startTime = Date.now();
  private responseDelay = 50; // Simulate 50ms latency

  // Simulated sensor values
  private adcValues = new Map<number, number>();
  private i2cSensors = new Map<string, any>();

  // Flight controller state
  private motors: MotorState[] = [
    { duty: 0, frequency: 50 },
    { duty: 0, frequency: 50 },
    { duty: 0, frequency: 50 },
    { duty: 0, frequency: 50 },
  ];
  private armed = false;

  // IMU simulation
  private imuData: IMUData = {
    accel: { x: 0, y: 0, z: 9.81 },
    gyro: { x: 0, y: 0, z: 0 },
    orientation: { roll: 0, pitch: 0, yaw: 0 },
  };

  // Barometer simulation
  private barometerData: BarometerData = {
    pressure_hpa: 1013.25,
    temperature_c: 25.0,
    altitude_m: 0,
  };

  // Differential drive robot state
  private robotPose: RobotPose = { x: 0, y: 0, rotation: 0 };
  private diffDriveMotors: DiffDriveMotors = { left: 0, right: 0 };
  private ledState: LEDState = { r: 0, g: 0, b: 0 };
  private encoders: EncoderState = { left: 0, right: 0 };
  private batteryVoltage = 4.2; // Fully charged LiPo
  private physicsInterval: ReturnType<typeof setInterval> | null = null;

  // Robot4 Camera simulation
  private cameraFrame: CameraFrame = {
    width: 160,
    height: 120,
    data: new Uint8Array(160 * 120),
    timestamp: 0,
  };
  private cameraEnabled = false;
  private cameraStreaming = false;

  // Robot4 Distance sensors (cm)
  private distanceSensors: DistanceSensors = {
    front: 255,
    frontLeft: 255,
    frontRight: 255,
    left: 255,
    right: 255,
    back: 255,
    backLeft: 255,
    backRight: 255,
  };

  // Robot4 Line sensors
  private lineSensors: LineSensors = {
    values: [0, 0, 0, 0, 0],  // 5 sensors
  };

  // Robot4 Bumper/button state
  private buttonsState = 0;

  // Robot4 World configuration for simulation
  private robot4World: {
    walls: Array<{ x1: number; y1: number; x2: number; y2: number }>;
    obstacles: Array<{ x: number; y: number; radius: number }>;
    lines: Array<{ points: Array<{ x: number; y: number }> }>;
  } = {
    walls: [
      { x1: -2, y1: -2, x2: 2, y2: -2 },
      { x1: 2, y1: -2, x2: 2, y2: 2 },
      { x1: 2, y1: 2, x2: -2, y2: 2 },
      { x1: -2, y1: 2, x2: -2, y2: -2 },
    ],
    obstacles: [],
    lines: [],
  };

  // Robot physics constants
  private readonly WHEEL_BASE = 0.5;       // Distance between wheels (meters)
  private readonly SPEED_SCALE = 0.01;     // Motor power to m/s conversion
  private readonly PHYSICS_DT = 0.1;       // Physics update interval (seconds)

  constructor() {
    this.initializeDefaultState();
    this.startPhysicsLoop();
  }

  /**
   * Start the physics simulation loop for differential drive kinematics
   */
  private startPhysicsLoop(): void {
    if (this.physicsInterval) {
      clearInterval(this.physicsInterval);
    }
    this.physicsInterval = setInterval(() => {
      this.updateDiffDrivePhysics(this.PHYSICS_DT);
    }, this.PHYSICS_DT * 1000);
  }

  /**
   * Update robot position using differential drive kinematics
   */
  private updateDiffDrivePhysics(dt: number): void {
    const vL = this.diffDriveMotors.left * this.SPEED_SCALE;
    const vR = this.diffDriveMotors.right * this.SPEED_SCALE;

    // Linear and angular velocity
    const v = (vR + vL) / 2.0;
    const omega = (vR - vL) / this.WHEEL_BASE;

    // Update pose
    this.robotPose.rotation += omega * dt;
    // Normalize rotation to [-PI, PI]
    while (this.robotPose.rotation > Math.PI) this.robotPose.rotation -= 2 * Math.PI;
    while (this.robotPose.rotation < -Math.PI) this.robotPose.rotation += 2 * Math.PI;

    // Use sin for X and cos for Y so rotation=0 means facing +Y (forward in Three.js +Z)
    this.robotPose.x += v * Math.sin(this.robotPose.rotation) * dt;
    this.robotPose.y += v * Math.cos(this.robotPose.rotation) * dt;

    // Update encoders (simulate ticks based on wheel rotation)
    const TICKS_PER_METER = 1000;
    this.encoders.left += Math.round(vL * dt * TICKS_PER_METER);
    this.encoders.right += Math.round(vR * dt * TICKS_PER_METER);

    // Simulate battery drain when motors are active
    if (Math.abs(vL) > 0 || Math.abs(vR) > 0) {
      const load = (Math.abs(this.diffDriveMotors.left) + Math.abs(this.diffDriveMotors.right)) / 510;
      this.batteryVoltage = Math.max(3.0, this.batteryVoltage - load * 0.0001);
    }
  }

  /**
   * Initialize default GPIO and sensor states
   */
  private initializeDefaultState(): void {
    // Initialize common GPIO pins
    for (let pin = 0; pin < 48; pin++) {
      this.gpioState.set(pin, {
        mode: 'INPUT',
        state: 0,
      });
    }

    // Pre-configure common pins
    this.gpioState.set(2, { mode: 'OUTPUT', state: 0 }); // LED
    this.gpioState.set(4, { mode: 'OUTPUT', state: 0 }); // Relay

    // Initialize ADC values (simulated sensor readings)
    this.adcValues.set(1, 2048); // ~1.65V (mid-range)
    this.adcValues.set(2, 1500); // ~1.22V
    this.adcValues.set(3, 3000); // ~2.43V

    // Initialize I2C sensors (example: INA219 power monitor)
    this.i2cSensors.set('ina219', {
      voltage_v: 5.02,
      current_ma: 123.5,
      power_mw: 620.0,
    });
  }

  /**
   * Process command and return response with simulated delay
   */
  async processCommand(command: DeviceCommand): Promise<DeviceResponse> {
    // Simulate network latency
    await this.delay(this.responseDelay);

    const { action } = command;

    try {
      switch (action) {
        case 'get_info':
          return this.handleGetInfo();

        case 'set_gpio':
          return this.handleSetGPIO(command);

        case 'read_gpio':
          return this.handleReadGPIO(command);

        case 'read_adc':
          return this.handleReadADC(command);

        case 'read_i2c':
          return this.handleReadI2C(command);

        case 'set_pwm':
          return this.handleSetPWM(command);

        case 'read_sensors':
          return this.handleReadSensors();

        // Flight controller commands
        case 'set_motors':
          return this.handleSetMotors(command);

        case 'get_motors':
          return this.handleGetMotors();

        case 'arm':
          return this.handleArm(true);

        case 'disarm':
          return this.handleArm(false);

        case 'read_imu':
          return this.handleReadIMU();

        case 'read_barometer':
          return this.handleReadBarometer();

        case 'set_imu_data':
          return this.handleSetIMUData(command);

        case 'set_altitude':
          return this.handleSetAltitude(command);

        // Differential drive robot commands
        case 'drive':
          return this.handleDrive(command);

        case 'stop':
          return this.handleStop();

        case 'get_pose':
          return this.handleGetPose();

        case 'reset_pose':
          return this.handleResetPose();

        case 'set_led':
          return this.handleSetLED(command);

        case 'get_camera_status':
          return this.handleGetCameraStatus();

        case 'get_robot_telemetry':
          return this.handleGetRobotTelemetry();

        // Robot4 WASM4-style commands
        case 'r4_get_state':
          return this.handleR4GetState();

        case 'r4_set_world':
          return this.handleR4SetWorld(command);

        case 'r4_get_sensors':
          return this.handleR4GetSensors();

        case 'r4_capture_frame':
          return this.handleR4CaptureFrame();

        case 'r4_get_frame':
          return this.handleR4GetFrame();

        case 'r4_set_buttons':
          return this.handleR4SetButtons(command);

        case 'r4_set_line_sensors':
          return this.handleR4SetLineSensors(command);

        default:
          // Handle custom_ prefixed commands
          if (action.startsWith('custom_')) {
            return this.handleCustomCommand(command);
          }
          return {
            status: 'error',
            msg: `Unknown action: ${action}`,
          };
      }
    } catch (error) {
      return {
        status: 'error',
        msg: (error as Error).message,
      };
    }
  }

  /**
   * Get device info
   */
  private handleGetInfo(): DeviceResponse {
    const uptime_ms = Date.now() - this.startTime;
    const uptime_s = Math.floor(uptime_ms / 1000);

    return {
      status: 'ok',
      device: this.deviceName,
      firmware: this.firmwareVersion,
      uptime_ms,
      uptime_s,
      chip: 'ESP32-S3',
      cpu_freq_mhz: 240,
      flash_size_mb: 8,
      free_heap_kb: 220,
      virtual: true,
    };
  }

  /**
   * Set GPIO pin state
   */
  private handleSetGPIO(command: DeviceCommand): DeviceResponse {
    const { pin, state } = command;

    if (typeof pin !== 'number' || pin < 0 || pin > 47) {
      return { status: 'error', msg: 'Invalid pin number (0-47)' };
    }

    if (state !== 0 && state !== 1) {
      return { status: 'error', msg: 'State must be 0 or 1' };
    }

    const pinConfig = this.gpioState.get(pin);
    if (!pinConfig) {
      return { status: 'error', msg: `Pin ${pin} not configured` };
    }

    // Set pin to OUTPUT mode if not already
    pinConfig.mode = 'OUTPUT';
    pinConfig.state = state;

    return {
      status: 'ok',
      msg: 'GPIO set',
      pin,
      state,
    };
  }

  /**
   * Read GPIO pin state
   */
  private handleReadGPIO(command: DeviceCommand): DeviceResponse {
    const { pin } = command;

    if (typeof pin !== 'number' || pin < 0 || pin > 47) {
      return { status: 'error', msg: 'Invalid pin number (0-47)' };
    }

    const pinConfig = this.gpioState.get(pin);
    if (!pinConfig) {
      return { status: 'error', msg: `Pin ${pin} not configured` };
    }

    return {
      status: 'ok',
      pin,
      state: pinConfig.state,
      mode: pinConfig.mode,
    };
  }

  /**
   * Read ADC value (simulated analog sensor)
   */
  private handleReadADC(command: DeviceCommand): DeviceResponse {
    const { pin } = command;

    if (typeof pin !== 'number') {
      return { status: 'error', msg: 'Pin number required' };
    }

    // Get or generate simulated ADC value
    let value = this.adcValues.get(pin);
    if (value === undefined) {
      // Generate random value with slight variation
      value = Math.floor(Math.random() * 4095);
      this.adcValues.set(pin, value);
    } else {
      // Add slight random variation to simulate real sensor
      value = Math.max(0, Math.min(4095, value + Math.floor((Math.random() - 0.5) * 100)));
      this.adcValues.set(pin, value);
    }

    const voltage = value * (3.3 / 4095.0);

    return {
      status: 'ok',
      pin,
      value,
      voltage: parseFloat(voltage.toFixed(3)),
    };
  }

  /**
   * Read I2C sensor data
   */
  private handleReadI2C(command: DeviceCommand): DeviceResponse {
    const { sensor } = command;

    if (!sensor) {
      return { status: 'error', msg: 'Sensor name required' };
    }

    const sensorData = this.i2cSensors.get(sensor);
    if (!sensorData) {
      return {
        status: 'error',
        msg: `Sensor '${sensor}' not found. Available: ${Array.from(this.i2cSensors.keys()).join(', ')}`,
      };
    }

    // Add slight variation to simulate real sensor
    const data = { ...sensorData };
    if (sensor === 'ina219') {
      data.voltage_v += (Math.random() - 0.5) * 0.1;
      data.current_ma += (Math.random() - 0.5) * 10;
      data.power_mw = data.voltage_v * data.current_ma;

      // Round to realistic precision
      data.voltage_v = parseFloat(data.voltage_v.toFixed(2));
      data.current_ma = parseFloat(data.current_ma.toFixed(1));
      data.power_mw = parseFloat(data.power_mw.toFixed(1));
    }

    return {
      status: 'ok',
      sensor,
      data,
    };
  }

  /**
   * Set PWM output
   */
  private handleSetPWM(command: DeviceCommand): DeviceResponse {
    const { pin, duty_cycle, frequency } = command;

    if (typeof pin !== 'number' || pin < 0 || pin > 47) {
      return { status: 'error', msg: 'Invalid pin number (0-47)' };
    }

    if (typeof duty_cycle !== 'number' || duty_cycle < 0 || duty_cycle > 255) {
      return { status: 'error', msg: 'Duty cycle must be 0-255' };
    }

    return {
      status: 'ok',
      msg: 'PWM set',
      pin,
      duty_cycle,
      frequency: frequency || 5000,
    };
  }

  /**
   * Read all sensor data at once
   */
  private handleReadSensors(): DeviceResponse {
    const sensors: Record<string, any> = {};

    // Collect all I2C sensor data
    this.i2cSensors.forEach((data, name) => {
      sensors[name] = { ...data };
    });

    // Add IMU data
    sensors.imu = {
      ...this.imuData,
      // Add slight noise
      accel: {
        x: this.imuData.accel.x + (Math.random() - 0.5) * 0.1,
        y: this.imuData.accel.y + (Math.random() - 0.5) * 0.1,
        z: this.imuData.accel.z + (Math.random() - 0.5) * 0.1,
      },
    };

    // Add barometer data
    sensors.barometer = {
      ...this.barometerData,
      pressure_hpa: this.barometerData.pressure_hpa + (Math.random() - 0.5) * 0.5,
      temperature_c: this.barometerData.temperature_c + (Math.random() - 0.5) * 0.2,
    };

    // Add motor states
    sensors.motors = this.motors.map((m, i) => ({
      motor: i + 1,
      duty: m.duty,
      throttle_pct: Math.round((m.duty / 255) * 100),
    }));

    // Add system info
    sensors.system = {
      uptime_s: Math.floor((Date.now() - this.startTime) / 1000),
      free_heap_kb: 220 - Math.floor(Math.random() * 20),
      cpu_temp_c: 45 + Math.floor(Math.random() * 15),
      armed: this.armed,
    };

    return {
      status: 'ok',
      sensors,
    };
  }

  // === Flight Controller Commands ===

  /**
   * Set all 4 motors at once
   * Command: { action: 'set_motors', motors: [duty1, duty2, duty3, duty4] }
   */
  private handleSetMotors(command: DeviceCommand): DeviceResponse {
    const { motors } = command;

    if (!this.armed) {
      return { status: 'error', msg: 'Flight controller not armed' };
    }

    if (!Array.isArray(motors) || motors.length !== 4) {
      return { status: 'error', msg: 'Motors must be array of 4 values (0-255)' };
    }

    for (let i = 0; i < 4; i++) {
      const duty = Math.max(0, Math.min(255, Math.floor(motors[i])));
      this.motors[i].duty = duty;
    }

    return {
      status: 'ok',
      msg: 'Motors set',
      motors: this.motors.map((m, i) => ({
        motor: i + 1,
        duty: m.duty,
        throttle_pct: Math.round((m.duty / 255) * 100),
      })),
    };
  }

  /**
   * Get current motor states
   */
  private handleGetMotors(): DeviceResponse {
    return {
      status: 'ok',
      armed: this.armed,
      motors: this.motors.map((m, i) => ({
        motor: i + 1,
        duty: m.duty,
        frequency: m.frequency,
        throttle_pct: Math.round((m.duty / 255) * 100),
      })),
    };
  }

  /**
   * Arm or disarm the flight controller
   */
  private handleArm(arm: boolean): DeviceResponse {
    this.armed = arm;

    if (!arm) {
      // Disarm - stop all motors
      this.motors.forEach(m => (m.duty = 0));
    }

    return {
      status: 'ok',
      msg: arm ? 'Armed' : 'Disarmed',
      armed: this.armed,
    };
  }

  /**
   * Read IMU sensor data
   */
  private handleReadIMU(): DeviceResponse {
    // Add slight noise to simulate real sensor
    const noise = () => (Math.random() - 0.5) * 0.1;

    return {
      status: 'ok',
      sensor: 'imu',
      data: {
        accel: {
          x: parseFloat((this.imuData.accel.x + noise()).toFixed(3)),
          y: parseFloat((this.imuData.accel.y + noise()).toFixed(3)),
          z: parseFloat((this.imuData.accel.z + noise()).toFixed(3)),
        },
        gyro: {
          x: parseFloat((this.imuData.gyro.x + noise() * 10).toFixed(2)),
          y: parseFloat((this.imuData.gyro.y + noise() * 10).toFixed(2)),
          z: parseFloat((this.imuData.gyro.z + noise() * 10).toFixed(2)),
        },
        orientation: {
          roll: parseFloat((this.imuData.orientation.roll + noise()).toFixed(2)),
          pitch: parseFloat((this.imuData.orientation.pitch + noise()).toFixed(2)),
          yaw: parseFloat((this.imuData.orientation.yaw + noise()).toFixed(2)),
        },
      },
      timestamp_ms: Date.now(),
    };
  }

  /**
   * Read barometer/altitude sensor
   */
  private handleReadBarometer(): DeviceResponse {
    const noise = () => (Math.random() - 0.5);

    return {
      status: 'ok',
      sensor: 'barometer',
      data: {
        pressure_hpa: parseFloat((this.barometerData.pressure_hpa + noise() * 0.5).toFixed(2)),
        temperature_c: parseFloat((this.barometerData.temperature_c + noise() * 0.2).toFixed(1)),
        altitude_m: parseFloat((this.barometerData.altitude_m + noise() * 0.1).toFixed(2)),
      },
      timestamp_ms: Date.now(),
    };
  }

  /**
   * Set IMU data (for HIL simulation)
   */
  private handleSetIMUData(command: DeviceCommand): DeviceResponse {
    const { accel, gyro, orientation } = command;

    if (accel) {
      this.imuData.accel = { ...this.imuData.accel, ...accel };
    }
    if (gyro) {
      this.imuData.gyro = { ...this.imuData.gyro, ...gyro };
    }
    if (orientation) {
      this.imuData.orientation = { ...this.imuData.orientation, ...orientation };
    }

    return {
      status: 'ok',
      msg: 'IMU data updated',
      data: this.imuData,
    };
  }

  /**
   * Set altitude (for HIL simulation)
   */
  private handleSetAltitude(command: DeviceCommand): DeviceResponse {
    const { altitude } = command;

    if (typeof altitude !== 'number') {
      return { status: 'error', msg: 'Altitude must be a number' };
    }

    // Update barometer to reflect new altitude
    // Using barometric formula: pressure decreases ~12 hPa per 100m
    const seaLevelPressure = 1013.25;
    this.barometerData.altitude_m = altitude;
    this.barometerData.pressure_hpa = seaLevelPressure * Math.pow(1 - (altitude / 44330), 5.255);

    return {
      status: 'ok',
      msg: 'Altitude updated',
      altitude_m: this.barometerData.altitude_m,
      pressure_hpa: parseFloat(this.barometerData.pressure_hpa.toFixed(2)),
    };
  }

  // === Differential Drive Robot Commands ===

  /**
   * Set differential drive motor speeds
   * Command: { action: 'drive', l: <int>, r: <int> }
   */
  private handleDrive(command: DeviceCommand): DeviceResponse {
    const { l, r } = command;

    if (typeof l !== 'number' || typeof r !== 'number') {
      return { status: 'error', msg: 'Motor speeds l and r must be numbers' };
    }

    // Clamp to valid range
    this.diffDriveMotors.left = Math.max(-255, Math.min(255, Math.round(l)));
    this.diffDriveMotors.right = Math.max(-255, Math.min(255, Math.round(r)));

    return {
      status: 'ok',
      msg: 'motors set',
      motors: { ...this.diffDriveMotors },
    };
  }

  /**
   * Stop all motors
   */
  private handleStop(): DeviceResponse {
    this.diffDriveMotors.left = 0;
    this.diffDriveMotors.right = 0;

    return {
      status: 'ok',
      msg: 'motors stopped',
      motors: { ...this.diffDriveMotors },
    };
  }

  /**
   * Get current robot pose
   */
  private handleGetPose(): DeviceResponse {
    return {
      status: 'ok',
      pose: {
        x: parseFloat(this.robotPose.x.toFixed(4)),
        y: parseFloat(this.robotPose.y.toFixed(4)),
        rotation: parseFloat(this.robotPose.rotation.toFixed(4)),
      },
      motors: { ...this.diffDriveMotors },
      encoders: { ...this.encoders },
      timestamp_ms: Date.now(),
    };
  }

  /**
   * Reset robot pose to origin
   */
  private handleResetPose(): DeviceResponse {
    this.robotPose = { x: 0, y: 0, rotation: 0 };
    this.encoders = { left: 0, right: 0 };

    return {
      status: 'ok',
      msg: 'pose reset',
      pose: { ...this.robotPose },
    };
  }

  /**
   * Set LED color
   * Command: { action: 'set_led', r: <int>, g: <int>, b: <int> }
   */
  private handleSetLED(command: DeviceCommand): DeviceResponse {
    const { r, g, b } = command;

    if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') {
      return { status: 'error', msg: 'LED values r, g, b must be numbers (0-255)' };
    }

    this.ledState = {
      r: Math.max(0, Math.min(255, Math.round(r))),
      g: Math.max(0, Math.min(255, Math.round(g))),
      b: Math.max(0, Math.min(255, Math.round(b))),
    };

    return {
      status: 'ok',
      msg: 'LED color set',
      led: { ...this.ledState },
    };
  }

  /**
   * Get camera status
   */
  private handleGetCameraStatus(): DeviceResponse {
    return {
      status: 'ok',
      cam_status: 'ready',
      resolution: '640x480',
      fps: 30,
    };
  }

  /**
   * Get full robot telemetry (pose, motors, sensors, battery)
   */
  private handleGetRobotTelemetry(): DeviceResponse {
    return {
      status: 'ok',
      pose: {
        x: parseFloat(this.robotPose.x.toFixed(4)),
        y: parseFloat(this.robotPose.y.toFixed(4)),
        rotation: parseFloat(this.robotPose.rotation.toFixed(4)),
      },
      motors: { ...this.diffDriveMotors },
      encoders: { ...this.encoders },
      led: { ...this.ledState },
      vbat: parseFloat(this.batteryVoltage.toFixed(2)),
      cam_status: 'ready',
      uptime_ms: Date.now() - this.startTime,
      timestamp_ms: Date.now(),
    };
  }

  /**
   * Handle custom commands (extensibility point)
   */
  private handleCustomCommand(command: DeviceCommand): DeviceResponse {
    const { action } = command;

    // Log custom commands for debugging
    console.log(`[VirtualESP32] Custom command: ${action}`, command);

    // Return acknowledgment
    return {
      status: 'ok',
      msg: `Custom command '${action}' received`,
      action,
      params: { ...command, action: undefined },
    };
  }

  /**
   * Simulate command processing delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Set response delay (for testing timeout scenarios)
   */
  setResponseDelay(ms: number): void {
    this.responseDelay = ms;
  }

  /**
   * Inject custom sensor data (for testing)
   */
  setSensorData(sensor: string, data: any): void {
    this.i2cSensors.set(sensor, data);
  }

  /**
   * Get current GPIO state (for debugging)
   */
  getGPIOState(pin: number): VirtualPin | undefined {
    return this.gpioState.get(pin);
  }

  /**
   * Reset device to initial state
   */
  reset(): void {
    this.gpioState.clear();
    this.adcValues.clear();
    this.i2cSensors.clear();
    this.startTime = Date.now();

    // Reset flight controller state
    this.motors = [
      { duty: 0, frequency: 50 },
      { duty: 0, frequency: 50 },
      { duty: 0, frequency: 50 },
      { duty: 0, frequency: 50 },
    ];
    this.armed = false;

    // Reset IMU
    this.imuData = {
      accel: { x: 0, y: 0, z: 9.81 },
      gyro: { x: 0, y: 0, z: 0 },
      orientation: { roll: 0, pitch: 0, yaw: 0 },
    };

    // Reset barometer
    this.barometerData = {
      pressure_hpa: 1013.25,
      temperature_c: 25.0,
      altitude_m: 0,
    };

    // Reset robot state
    this.robotPose = { x: 0, y: 0, rotation: 0 };
    this.diffDriveMotors = { left: 0, right: 0 };
    this.ledState = { r: 0, g: 0, b: 0 };
    this.encoders = { left: 0, right: 0 };
    this.batteryVoltage = 4.2;

    this.initializeDefaultState();
  }

  /**
   * Get armed status
   */
  isArmed(): boolean {
    return this.armed;
  }

  /**
   * Get motor state
   */
  getMotorState(): MotorState[] {
    return [...this.motors];
  }

  /**
   * Get IMU data
   */
  getIMUData(): IMUData {
    return { ...this.imuData };
  }

  /**
   * Get barometer data
   */
  getBarometerData(): BarometerData {
    return { ...this.barometerData };
  }

  // === Robot State Getters ===

  /**
   * Get current robot pose
   */
  getRobotPose(): RobotPose {
    return { ...this.robotPose };
  }

  /**
   * Get differential drive motor state
   */
  getDiffDriveMotors(): DiffDriveMotors {
    return { ...this.diffDriveMotors };
  }

  /**
   * Get LED state
   */
  getLEDState(): LEDState {
    return { ...this.ledState };
  }

  /**
   * Get encoder values
   */
  getEncoders(): EncoderState {
    return { ...this.encoders };
  }

  /**
   * Get battery voltage
   */
  getBatteryVoltage(): number {
    return this.batteryVoltage;
  }

  /**
   * Clean up resources (stop physics loop)
   */
  dispose(): void {
    if (this.physicsInterval) {
      clearInterval(this.physicsInterval);
      this.physicsInterval = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROBOT4 WASM4-STYLE COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get full Robot4 state (for WASM runtime sync)
   */
  private handleR4GetState(): DeviceResponse {
    // Update simulated sensors based on pose
    this.updateR4Sensors();

    return {
      status: 'ok',
      pose: {
        x: parseFloat(this.robotPose.x.toFixed(4)),
        y: parseFloat(this.robotPose.y.toFixed(4)),
        rotation: parseFloat(this.robotPose.rotation.toFixed(4)),
      },
      motors: { ...this.diffDriveMotors },
      encoders: { ...this.encoders },
      led: { ...this.ledState },
      battery: Math.round((this.batteryVoltage - 3.0) / 1.2 * 100), // Convert to percentage
      sensors: [
        this.distanceSensors.front,
        this.distanceSensors.frontLeft,
        this.distanceSensors.frontRight,
        this.distanceSensors.left,
        this.distanceSensors.right,
        this.distanceSensors.back,
        this.distanceSensors.backLeft,
        this.distanceSensors.backRight,
      ],
      line_sensors: this.lineSensors.values,
      buttons: this.buttonsState,
      camera_enabled: this.cameraEnabled,
      timestamp_ms: Date.now() - this.startTime,
    };
  }

  /**
   * Set Robot4 world configuration
   */
  private handleR4SetWorld(command: DeviceCommand): DeviceResponse {
    const { walls, obstacles, lines } = command;

    if (walls) {
      this.robot4World.walls = walls;
    }
    if (obstacles) {
      this.robot4World.obstacles = obstacles;
    }
    if (lines) {
      this.robot4World.lines = lines;
    }

    return {
      status: 'ok',
      msg: 'World updated',
      world: this.robot4World,
    };
  }

  /**
   * Get Robot4 sensor readings
   */
  private handleR4GetSensors(): DeviceResponse {
    this.updateR4Sensors();

    return {
      status: 'ok',
      distance: [
        this.distanceSensors.front,
        this.distanceSensors.frontLeft,
        this.distanceSensors.frontRight,
        this.distanceSensors.left,
        this.distanceSensors.right,
        this.distanceSensors.back,
        this.distanceSensors.backLeft,
        this.distanceSensors.backRight,
      ],
      line: this.lineSensors.values,
      buttons: this.buttonsState,
    };
  }

  /**
   * Capture camera frame (simulated)
   */
  private handleR4CaptureFrame(): DeviceResponse {
    this.generateR4CameraFrame();

    return {
      status: 'ok',
      msg: 'Frame captured',
      width: this.cameraFrame.width,
      height: this.cameraFrame.height,
      timestamp: this.cameraFrame.timestamp,
    };
  }

  /**
   * Get camera frame data (base64 encoded)
   */
  private handleR4GetFrame(): DeviceResponse {
    // Convert to base64
    let binary = '';
    for (let i = 0; i < this.cameraFrame.data.length; i++) {
      binary += String.fromCharCode(this.cameraFrame.data[i]);
    }
    const base64 = btoa(binary);

    return {
      status: 'ok',
      width: this.cameraFrame.width,
      height: this.cameraFrame.height,
      data: base64,
      timestamp: this.cameraFrame.timestamp,
    };
  }

  /**
   * Set button/bumper state (for testing)
   */
  private handleR4SetButtons(command: DeviceCommand): DeviceResponse {
    const { buttons } = command;

    if (typeof buttons === 'number') {
      this.buttonsState = buttons & 0xFF;
    }

    return {
      status: 'ok',
      buttons: this.buttonsState,
    };
  }

  /**
   * Set line sensor values (for testing)
   */
  private handleR4SetLineSensors(command: DeviceCommand): DeviceResponse {
    const { values } = command;

    if (Array.isArray(values) && values.length === 5) {
      this.lineSensors.values = values.map(v => Math.max(0, Math.min(255, Math.round(v))));
    }

    return {
      status: 'ok',
      line_sensors: this.lineSensors.values,
    };
  }

  /**
   * Update Robot4 distance sensors based on world and pose
   */
  private updateR4Sensors(): void {
    const sensorAngles = [0, -45, 45, -90, 90, 180, -135, 135]; // degrees
    const sensorKeys: (keyof DistanceSensors)[] = [
      'front', 'frontLeft', 'frontRight', 'left', 'right', 'back', 'backLeft', 'backRight',
    ];

    for (let i = 0; i < sensorAngles.length; i++) {
      const angle = this.robotPose.rotation + (sensorAngles[i] * Math.PI / 180);
      const distance = this.raycastR4(this.robotPose.x, this.robotPose.y, angle, 2.55);
      this.distanceSensors[sensorKeys[i]] = Math.min(255, Math.round(distance * 100));
    }

    // Update line sensors
    const lineWidth = 0.08;
    for (let i = 0; i < 5; i++) {
      const offset = (i - 2) * (lineWidth / 4);
      // Use sin for X and cos for Y so rotation=0 means facing +Y (forward in Three.js +Z)
      const sensorX = this.robotPose.x + Math.sin(this.robotPose.rotation) * 0.05 +
                      Math.sin(this.robotPose.rotation + Math.PI / 2) * offset;
      const sensorY = this.robotPose.y + Math.cos(this.robotPose.rotation) * 0.05 +
                      Math.cos(this.robotPose.rotation + Math.PI / 2) * offset;

      const onLine = this.isPointOnLineR4(sensorX, sensorY);
      this.lineSensors.values[i] = onLine ? 255 : 0;
    }

    // Check for bumper collision
    const robotRadius = 0.08;
    let collision = false;

    for (const wall of this.robot4World.walls) {
      const dist = this.pointToLineDistanceR4(
        this.robotPose.x, this.robotPose.y,
        wall.x1, wall.y1, wall.x2, wall.y2
      );
      if (dist < robotRadius) {
        collision = true;
        break;
      }
    }

    for (const obs of this.robot4World.obstacles) {
      const dist = Math.sqrt(
        (this.robotPose.x - obs.x) ** 2 + (this.robotPose.y - obs.y) ** 2
      );
      if (dist < robotRadius + obs.radius) {
        collision = true;
        break;
      }
    }

    if (collision) {
      this.buttonsState |= 0x01; // Front bumper
    } else {
      this.buttonsState &= ~0x01;
    }
  }

  /**
   * Raycast for distance measurement
   */
  private raycastR4(x: number, y: number, angle: number, maxDist: number): number {
    let minDist = maxDist;

    for (const wall of this.robot4World.walls) {
      const dist = this.rayLineIntersectionR4(x, y, angle, wall.x1, wall.y1, wall.x2, wall.y2);
      if (dist !== null && dist < minDist) {
        minDist = dist;
      }
    }

    for (const obs of this.robot4World.obstacles) {
      const dist = this.rayCircleIntersectionR4(x, y, angle, obs.x, obs.y, obs.radius);
      if (dist !== null && dist < minDist) {
        minDist = dist;
      }
    }

    return minDist;
  }

  /**
   * Ray-line segment intersection
   */
  private rayLineIntersectionR4(
    rx: number, ry: number, angle: number,
    x1: number, y1: number, x2: number, y2: number
  ): number | null {
    // Use sin for X and cos for Y so angle=0 means facing +Y (forward in Three.js +Z)
    const dx = Math.sin(angle);
    const dy = Math.cos(angle);

    const x3 = rx;
    const y3 = ry;
    const x4 = rx + dx * 10;
    const y4 = ry + dy * 10;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0) {
      const ix = x1 + t * (x2 - x1);
      const iy = y1 + t * (y2 - y1);
      return Math.sqrt((ix - rx) ** 2 + (iy - ry) ** 2);
    }

    return null;
  }

  /**
   * Ray-circle intersection
   */
  private rayCircleIntersectionR4(
    rx: number, ry: number, angle: number,
    cx: number, cy: number, radius: number
  ): number | null {
    // Use sin for X and cos for Y so angle=0 means facing +Y (forward in Three.js +Z)
    const dx = Math.sin(angle);
    const dy = Math.cos(angle);

    const fx = rx - cx;
    const fy = ry - cy;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    if (t1 >= 0) return t1;
    if (t2 >= 0) return t2;
    return null;
  }

  /**
   * Check if point is on a line track
   */
  private isPointOnLineR4(x: number, y: number): boolean {
    const lineThreshold = 0.02;

    for (const line of this.robot4World.lines) {
      for (let i = 0; i < line.points.length - 1; i++) {
        const p1 = line.points[i];
        const p2 = line.points[i + 1];
        const dist = this.pointToLineDistanceR4(x, y, p1.x, p1.y, p2.x, p2.y);
        if (dist < lineThreshold) return true;
      }
    }

    return false;
  }

  /**
   * Point to line segment distance
   */
  private pointToLineDistanceR4(
    px: number, py: number,
    x1: number, y1: number, x2: number, y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;

    return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
  }

  /**
   * Generate simulated camera frame
   */
  private generateR4CameraFrame(): void {
    const fov = Math.PI / 3; // 60 degree FOV
    const halfFov = fov / 2;

    for (let y = 0; y < this.cameraFrame.height; y++) {
      for (let x = 0; x < this.cameraFrame.width; x++) {
        const pixelAngle = this.robotPose.rotation + halfFov -
                          (x / this.cameraFrame.width) * fov;

        const distance = this.raycastR4(this.robotPose.x, this.robotPose.y, pixelAngle, 3.0);

        // Convert distance to brightness (closer = brighter)
        let brightness = 0;
        if (distance < 3.0) {
          brightness = Math.round(255 * (1 - distance / 3.0));
        }

        // Vertical gradient
        const verticalFactor = 1 - Math.abs(y - this.cameraFrame.height / 2) /
                              (this.cameraFrame.height / 2) * 0.3;
        brightness = Math.round(brightness * verticalFactor);

        this.cameraFrame.data[y * this.cameraFrame.width + x] = Math.min(255, brightness);
      }
    }

    this.cameraFrame.timestamp = Date.now();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROBOT4 PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get Robot4 world configuration
   */
  getRobot4World() {
    return { ...this.robot4World };
  }

  /**
   * Set Robot4 world configuration
   */
  setRobot4World(world: typeof this.robot4World): void {
    this.robot4World = { ...world };
  }

  /**
   * Get distance sensors
   */
  getDistanceSensors(): DistanceSensors {
    return { ...this.distanceSensors };
  }

  /**
   * Get line sensors
   */
  getLineSensors(): number[] {
    return [...this.lineSensors.values];
  }

  /**
   * Get camera frame
   */
  getCameraFrame(): CameraFrame {
    return {
      ...this.cameraFrame,
      data: new Uint8Array(this.cameraFrame.data),
    };
  }
}

/**
 * Singleton instance for easy access
 */
export const virtualESP32 = new VirtualESP32();
