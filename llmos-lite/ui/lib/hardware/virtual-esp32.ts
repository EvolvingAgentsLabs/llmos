/**
 * Virtual ESP32-S3 Device Emulator
 *
 * Simulates ESP32-S3 JSON protocol for development/testing without physical hardware.
 * Provides realistic responses, timing, and state management.
 */

import type { DeviceCommand, DeviceResponse } from './serial-manager';

interface VirtualPin {
  mode: 'INPUT' | 'OUTPUT' | 'INPUT_PULLUP';
  state: number;
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

        default:
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

    // Add system info
    sensors.system = {
      uptime_s: Math.floor((Date.now() - this.startTime) / 1000),
      free_heap_kb: 220 - Math.floor(Math.random() * 20),
      cpu_temp_c: 45 + Math.floor(Math.random() * 15),
    };

    return {
      status: 'ok',
      sensors,
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
    this.initializeDefaultState();
  }
}

/**
 * Singleton instance for easy access
 */
export const virtualESP32 = new VirtualESP32();
