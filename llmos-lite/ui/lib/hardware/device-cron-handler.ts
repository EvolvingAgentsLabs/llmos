/**
 * Device Cron Handler
 *
 * Executes periodic device polling tasks defined in device projects.
 * Updates device state files in VFS.
 */

import { SerialManager, DeviceCommand, DeviceResponse } from './serial-manager';
import { getVFS } from '../virtual-fs';

export interface DeviceCronConfig {
  id: string;
  deviceId: string;
  projectPath: string;
  commands: DeviceCommand[];
  interval: number; // milliseconds
  enabled: boolean;
}

export interface DeviceState {
  sensors: Record<string, any>;
  gpio: Record<string, number>;
  connection: {
    connected: boolean;
    lastUpdate: string;
    deviceId: string;
  };
}

/**
 * Execute device polling task
 */
export async function executeDevicePoll(config: DeviceCronConfig): Promise<void> {
  const vfs = getVFS();

  try {
    // Check if device is still connected
    if (!SerialManager.isConnected(config.deviceId)) {
      console.warn(`[DeviceCron] Device ${config.deviceId} not connected, skipping poll`);

      // Update connection state
      const connectionPath = `${config.projectPath}/state/connection.json`;
      vfs.writeFile(connectionPath, JSON.stringify({
        connected: false,
        lastUpdate: new Date().toISOString(),
        deviceId: config.deviceId,
        error: 'Device disconnected',
      }, null, 2));

      return;
    }

    // Execute all commands
    const results: Record<string, any> = {};

    for (const command of config.commands) {
      try {
        const response = await SerialManager.sendCommand(config.deviceId, command, 3000);

        if (response.status === 'ok') {
          // Store result by action name
          results[command.action] = response;
        } else {
          console.warn(`[DeviceCron] Command ${command.action} failed:`, response.msg);
        }
      } catch (error) {
        console.error(`[DeviceCron] Command ${command.action} error:`, error);
      }
    }

    // Update state files
    await updateDeviceState(config.projectPath, config.deviceId, results);

    // Log telemetry
    await logTelemetry(config.projectPath, results);

  } catch (error) {
    console.error(`[DeviceCron] Poll execution failed:`, error);
  }
}

/**
 * Update device state files in VFS
 */
async function updateDeviceState(
  projectPath: string,
  deviceId: string,
  results: Record<string, any>
): Promise<void> {
  const vfs = getVFS();

  try {
    // Update sensors.json
    const sensorData: Record<string, any> = {};

    if (results.read_adc) {
      sensorData.adc = {
        value: results.read_adc.value,
        voltage: results.read_adc.voltage,
      };
    }

    if (results.read_i2c) {
      const sensor = results.read_i2c.sensor;
      sensorData[sensor] = {
        voltage_v: results.read_i2c.voltage_v,
        current_ma: results.read_i2c.current_ma,
        power_mw: results.read_i2c.power_mw,
      };
    }

    if (Object.keys(sensorData).length > 0) {
      const sensorsPath = `${projectPath}/state/sensors.json`;
      vfs.writeFile(sensorsPath, JSON.stringify({
        ...sensorData,
        timestamp: new Date().toISOString(),
      }, null, 2));
    }

    // Update gpio.json
    if (results.read_gpio) {
      const gpioPath = `${projectPath}/state/gpio.json`;
      const currentGpio = JSON.parse(vfs.readFileContent(gpioPath) || '{}');

      currentGpio[`pin${results.read_gpio.pin}`] = results.read_gpio.state;
      currentGpio.timestamp = new Date().toISOString();

      vfs.writeFile(gpioPath, JSON.stringify(currentGpio, null, 2));
    }

    // Update connection.json
    const connectionPath = `${projectPath}/state/connection.json`;
    vfs.writeFile(connectionPath, JSON.stringify({
      connected: true,
      lastUpdate: new Date().toISOString(),
      deviceId,
    }, null, 2));

  } catch (error) {
    console.error('[DeviceCron] State update failed:', error);
  }
}

/**
 * Log telemetry data to output/telemetry/<date>.log
 */
async function logTelemetry(projectPath: string, results: Record<string, any>): Promise<void> {
  const vfs = getVFS();

  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const telemetryPath = `${projectPath}/output/telemetry/${dateStr}.log`;

    // Read existing log or create new
    let logContent = vfs.readFileContent(telemetryPath) || '';

    // Append new entry
    const entry = {
      timestamp: now.toISOString(),
      data: results,
    };

    logContent += JSON.stringify(entry) + '\n';

    // Write back
    vfs.writeFile(telemetryPath, logContent);

  } catch (error) {
    console.error('[DeviceCron] Telemetry logging failed:', error);
  }
}

/**
 * Register device cron with scheduler
 */
export async function registerDeviceCron(config: DeviceCronConfig): Promise<void> {
  const { CronScheduler } = await import('../cron-scheduler');
  const scheduler = CronScheduler.getInstance();

  scheduler.registerCron({
    id: config.id,
    name: `Device Poll: ${config.projectPath}`,
    volume: 'user',
    intervalMs: config.interval,
    enabled: config.enabled,
  });

  // Set up polling interval
  if (config.enabled) {
    const pollInterval = setInterval(async () => {
      await executeDevicePoll(config);
    }, config.interval);

    // Store interval ID for cleanup
    (globalThis as any).__deviceCronIntervals = (globalThis as any).__deviceCronIntervals || new Map();
    (globalThis as any).__deviceCronIntervals.set(config.id, pollInterval);

    console.log(`[DeviceCron] Registered polling for ${config.id} (interval: ${config.interval}ms)`);
  }
}

/**
 * Unregister device cron
 */
export function unregisterDeviceCron(cronId: string): void {
  const intervals = (globalThis as any).__deviceCronIntervals as Map<string, NodeJS.Timeout>;
  if (intervals?.has(cronId)) {
    clearInterval(intervals.get(cronId));
    intervals.delete(cronId);
    console.log(`[DeviceCron] Unregistered polling for ${cronId}`);
  }
}
