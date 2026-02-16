/**
 * Electron Main Process for LLMos Desktop
 *
 * This is the entry point for the desktop application.
 * It handles:
 * - Window management
 * - Native file system access
 * - Serial port communication for hardware
 * - IPC communication with renderer
 */

import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import * as path from 'path';
import * as url from 'url';
import { NativeFileSystem } from './services/native-fs';
import { ElectronSerialManager } from './services/serial-manager';

// Environment - auto-detect dev mode when app is not packaged
const isDev = process.env.ELECTRON_DEV_MODE === 'true' || !app.isPackaged;
const isProduction = app.isPackaged;

// Services
let nativeFS: NativeFileSystem;
let serialManager: ElectronSerialManager;

// Main window reference
let mainWindow: BrowserWindow | null = null;

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'LLMos Desktop',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for preload script
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, '../public/icon.png'),
  });

  // Load the app
  if (isDev) {
    // Development: load from Next.js dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load from built Next.js app
    const startUrl = url.format({
      pathname: path.join(__dirname, '../.next/server/app/index.html'),
      protocol: 'file:',
      slashes: true,
    });

    // For Next.js standalone output, we need to start the server
    if (isProduction) {
      // Load the standalone server
      mainWindow.loadURL('http://localhost:3000');
    } else {
      mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
    }
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Clean up on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Initialize services
 */
async function initializeServices(): Promise<void> {
  console.log('[Electron] Initializing services...');

  // User data path for storing files
  const userDataPath = app.getPath('userData');
  const documentsPath = app.getPath('documents');

  // Initialize native file system
  nativeFS = new NativeFileSystem({
    userVolumePath: path.join(documentsPath, 'LLMos', 'user'),
    teamVolumePath: path.join(documentsPath, 'LLMos', 'team'),
    systemVolumePath: path.join(userDataPath, 'system'),
    tempPath: path.join(userDataPath, 'temp'),
  });
  await nativeFS.initialize();

  // Initialize serial manager
  serialManager = new ElectronSerialManager();

  console.log('[Electron] Services initialized');
}

/**
 * Register IPC handlers
 */
function registerIpcHandlers(): void {
  // ============ File System Handlers ============

  ipcMain.handle('fs:read', async (_, volumeType: string, filePath: string) => {
    return nativeFS.readFile(volumeType, filePath);
  });

  ipcMain.handle('fs:write', async (_, volumeType: string, filePath: string, content: string) => {
    return nativeFS.writeFile(volumeType, filePath, content);
  });

  ipcMain.handle('fs:delete', async (_, volumeType: string, filePath: string) => {
    return nativeFS.deleteFile(volumeType, filePath);
  });

  ipcMain.handle('fs:list', async (_, volumeType: string, directory: string) => {
    return nativeFS.listFiles(volumeType, directory);
  });

  ipcMain.handle('fs:exists', async (_, volumeType: string, filePath: string) => {
    return nativeFS.exists(volumeType, filePath);
  });

  ipcMain.handle('fs:mkdir', async (_, volumeType: string, dirPath: string) => {
    return nativeFS.mkdir(volumeType, dirPath);
  });

  // Native file dialogs
  ipcMain.handle('dialog:openFile', async (_, options) => {
    if (!mainWindow) return null;
    return dialog.showOpenDialog(mainWindow, options);
  });

  ipcMain.handle('dialog:saveFile', async (_, options) => {
    if (!mainWindow) return null;
    return dialog.showSaveDialog(mainWindow, options);
  });

  // ============ Serial Port Handlers ============

  ipcMain.handle('serial:list', async () => {
    return serialManager.listPorts();
  });

  ipcMain.handle('serial:connect', async (_, portPath: string, options: any) => {
    return serialManager.connect(portPath, options);
  });

  ipcMain.handle('serial:disconnect', async (_, portPath: string) => {
    return serialManager.disconnect(portPath);
  });

  ipcMain.handle('serial:write', async (_, portPath: string, data: Buffer | string) => {
    return serialManager.write(portPath, data);
  });

  ipcMain.handle('serial:isConnected', async (_, portPath: string) => {
    return serialManager.isConnected(portPath);
  });

  // Forward serial data events to renderer
  serialManager.on('data', (portPath: string, data: Buffer) => {
    mainWindow?.webContents.send('serial:data', portPath, data);
  });

  serialManager.on('error', (portPath: string, error: Error) => {
    mainWindow?.webContents.send('serial:error', portPath, error.message);
  });

  serialManager.on('close', (portPath: string) => {
    mainWindow?.webContents.send('serial:close', portPath);
  });

  // ============ System Handlers ============

  ipcMain.handle('system:platform', async () => {
    return process.platform;
  });

  ipcMain.handle('system:isDesktop', async () => {
    return true;
  });

  ipcMain.handle('system:paths', async () => {
    return {
      userData: app.getPath('userData'),
      documents: app.getPath('documents'),
      temp: app.getPath('temp'),
      home: app.getPath('home'),
    };
  });

  ipcMain.handle('system:openExternal', async (_, url: string) => {
    return shell.openExternal(url);
  });
}

/**
 * Create application menu
 */
function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, {
              properties: ['openDirectory'],
              title: 'Open Project',
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow?.webContents.send('menu:openProject', result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Hardware',
      submenu: [
        {
          label: 'Connect ESP32...',
          click: () => mainWindow?.webContents.send('menu:connectHardware'),
        },
        { type: 'separator' },
        {
          label: 'Serial Monitor',
          click: () => mainWindow?.webContents.send('menu:serialMonitor'),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/EvolvingAgentsLabs/llmos'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/EvolvingAgentsLabs/llmos/issues'),
        },
        { type: 'separator' },
        {
          label: 'About LLMos',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About LLMos Desktop',
              message: 'LLMos Desktop',
              detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode.js: ${process.versions.node}\nChromium: ${process.versions.chrome}`,
            });
          },
        },
      ],
    },
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============ App Lifecycle ============

app.whenReady().then(async () => {
  await initializeServices();
  registerIpcHandlers();
  createMenu();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Quit on all platforms except macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Clean up serial connections
  await serialManager?.disconnectAll();
});

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'http://localhost:3000' && parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });
});
