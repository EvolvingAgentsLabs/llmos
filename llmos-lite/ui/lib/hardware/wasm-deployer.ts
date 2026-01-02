/**
 * WASM Deployer - TCP client for ESP32 WASMachine App Manager
 *
 * Implements the protocol from espressif-esp-wasmachine/test-tools/host-tool
 * to install, uninstall, and query WebAssembly applications on ESP32 devices.
 */

// Protocol Constants (from wm_wamr_app_mgr.c)
const LEADING_BYTES = Buffer.from([0x12, 0x34]);
const MSG_TYPE_REQUEST = 0;
const MSG_TYPE_RESPONSE = 1;

// Request Types
const REQ_INSTALL = 1;
const REQ_UNINSTALL = 2;
const REQ_QUERY = 3;

// Response Status Codes
const RESP_SUCCESS = 0;
const RESP_ERROR = 1;

export interface WasmDeployConfig {
  deviceIp: string;
  port?: number;
  timeout?: number;
}

export interface InstallOptions {
  appName: string;
  wasmBinary: Buffer;
  heapSize?: number;
  timers?: number;
  watchdog?: number;
}

export interface WasmAppInfo {
  name: string;
  heap: number;
  type?: number;
}

export interface QueryResponse {
  num: number;
  apps: WasmAppInfo[];
}

/**
 * Pack request message following WASMachine protocol
 */
function packRequest(reqType: number, payload: Buffer): Buffer {
  const payloadLength = payload.length;

  // Header: Leading(2) + Type(2) + Length(4)
  const header = Buffer.alloc(8);
  LEADING_BYTES.copy(header, 0);
  header.writeUInt16BE(MSG_TYPE_REQUEST, 2);
  header.writeUInt32BE(payloadLength, 4);

  return Buffer.concat([header, payload]);
}

/**
 * Parse response message
 */
function parseResponse(data: Buffer): any {
  if (data.length < 8) {
    throw new Error('Invalid response: too short');
  }

  // Verify leading bytes
  if (data[0] !== 0x12 || data[1] !== 0x34) {
    throw new Error('Invalid response: bad magic bytes');
  }

  const msgType = data.readUInt16BE(2);
  const payloadLength = data.readUInt32BE(4);
  const payload = data.slice(8, 8 + payloadLength);

  if (msgType !== MSG_TYPE_RESPONSE) {
    throw new Error(`Invalid response type: ${msgType}`);
  }

  // Try to parse as JSON
  try {
    return JSON.parse(payload.toString('utf-8'));
  } catch {
    // Return raw payload if not JSON
    return { raw: payload.toString('utf-8') };
  }
}

/**
 * Send TCP request and wait for response
 */
async function sendTCPRequest(
  config: WasmDeployConfig,
  requestData: Buffer,
  timeout: number = 10000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const socket = new net.Socket();
    const port = config.port || 8080;

    let responseBuffer = Buffer.alloc(0);
    let timeoutId: NodeJS.Timeout;

    // Set timeout
    timeoutId = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connection timeout after ${timeout}ms`));
    }, timeout);

    socket.on('connect', () => {
      console.log(`[WasmDeployer] Connected to ${config.deviceIp}:${port}`);
      socket.write(requestData);
    });

    socket.on('data', (chunk: Buffer) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);

      // Check if we have complete header
      if (responseBuffer.length >= 8) {
        const payloadLength = responseBuffer.readUInt32BE(4);
        const totalLength = 8 + payloadLength;

        // Check if we have complete message
        if (responseBuffer.length >= totalLength) {
          clearTimeout(timeoutId);
          socket.destroy();

          try {
            const response = parseResponse(responseBuffer);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        }
      }
    });

    socket.on('error', (error: Error) => {
      clearTimeout(timeoutId);
      reject(new Error(`Socket error: ${error.message}`));
    });

    socket.on('close', () => {
      clearTimeout(timeoutId);
      if (responseBuffer.length === 0) {
        reject(new Error('Connection closed without response'));
      }
    });

    socket.connect(port, config.deviceIp);
  });
}

/**
 * Install WASM application on device
 */
export async function installWasmApp(
  config: WasmDeployConfig,
  options: InstallOptions
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { appName, wasmBinary, heapSize = 8192, timers = 4, watchdog = 5000 } = options;

    console.log(`[WasmDeployer] Installing app: ${appName}`);
    console.log(`[WasmDeployer] Binary size: ${wasmBinary.length} bytes`);
    console.log(`[WasmDeployer] Heap: ${heapSize} bytes`);

    // Construct install request payload
    // Format (simplified): JSON metadata + binary data
    const metadata = {
      cmd: REQ_INSTALL,
      app_name: appName,
      heap_size: heapSize,
      timers,
      watchdog,
      size: wasmBinary.length
    };

    const metadataJson = JSON.stringify(metadata);
    const metadataBuffer = Buffer.from(metadataJson, 'utf-8');

    // Payload: metadata_length(4) + metadata + wasm_binary
    const payload = Buffer.alloc(4 + metadataBuffer.length + wasmBinary.length);
    payload.writeUInt32BE(metadataBuffer.length, 0);
    metadataBuffer.copy(payload, 4);
    wasmBinary.copy(payload, 4 + metadataBuffer.length);

    const request = packRequest(REQ_INSTALL, payload);

    // Send request (longer timeout for binary upload)
    const response = await sendTCPRequest(config, request, 30000);

    if (response.status === 'ok' || response.status === RESP_SUCCESS) {
      return {
        success: true,
        message: `App ${appName} installed successfully`
      };
    } else {
      return {
        success: false,
        error: response.error || response.msg || 'Installation failed'
      };
    }

  } catch (error: any) {
    console.error(`[WasmDeployer] Install error:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Uninstall WASM application from device
 */
export async function uninstallWasmApp(
  config: WasmDeployConfig,
  appName: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    console.log(`[WasmDeployer] Uninstalling app: ${appName}`);

    const metadata = {
      cmd: REQ_UNINSTALL,
      app_name: appName
    };

    const payload = Buffer.from(JSON.stringify(metadata), 'utf-8');
    const request = packRequest(REQ_UNINSTALL, payload);

    const response = await sendTCPRequest(config, request);

    if (response.status === 'ok' || response.status === RESP_SUCCESS) {
      return {
        success: true,
        message: `App ${appName} uninstalled successfully`
      };
    } else {
      return {
        success: false,
        error: response.error || response.msg || 'Uninstall failed'
      };
    }

  } catch (error: any) {
    console.error(`[WasmDeployer] Uninstall error:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Query installed applications on device
 */
export async function queryWasmApps(
  config: WasmDeployConfig,
  appName?: string
): Promise<{ success: boolean; apps?: WasmAppInfo[]; error?: string }> {
  try {
    console.log(`[WasmDeployer] Querying apps${appName ? `: ${appName}` : ''}`);

    const metadata = {
      cmd: REQ_QUERY,
      ...(appName && { app_name: appName })
    };

    const payload = Buffer.from(JSON.stringify(metadata), 'utf-8');
    const request = packRequest(REQ_QUERY, payload);

    const response = await sendTCPRequest(config, request);

    if (response.status === 'ok' || response.num !== undefined) {
      // Parse response format: {"num":2,"applet1":"app1","heap1":8192,"applet2":"app2","heap2":16384}
      const apps: WasmAppInfo[] = [];
      const num = response.num || 0;

      for (let i = 1; i <= num; i++) {
        const nameKey = `applet${i}`;
        const heapKey = `heap${i}`;

        if (response[nameKey]) {
          apps.push({
            name: response[nameKey],
            heap: response[heapKey] || 0
          });
        }
      }

      return {
        success: true,
        apps
      };
    } else {
      return {
        success: false,
        error: response.error || response.msg || 'Query failed'
      };
    }

  } catch (error: any) {
    console.error(`[WasmDeployer] Query error:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if device is reachable
 */
export async function checkDeviceConnection(
  config: WasmDeployConfig
): Promise<{ reachable: boolean; error?: string }> {
  try {
    // Try a simple query to check connectivity
    const result = await queryWasmApps(config);
    return {
      reachable: result.success
    };
  } catch (error: any) {
    return {
      reachable: false,
      error: error.message
    };
  }
}
