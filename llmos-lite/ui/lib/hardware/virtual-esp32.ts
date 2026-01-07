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

  constructor() {
    this.initializeDefaultState();
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
}

/**
 * Singleton instance for easy access
 */
export const virtualESP32 = new VirtualESP32();
