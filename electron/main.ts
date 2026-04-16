// =============================================================================
// Electron Main Process — shared between Windows and macOS builds
// Provides: system tray, global shortcuts, window management, auto-update
// =============================================================================

// NOTE: This file is a structural stub. To build, install electron and
// electron-builder as devDependencies, then configure package.json scripts.
//
// Build commands:
//   Windows: npx electron-builder --win --x64
//   macOS:   npx electron-builder --mac --x64 --arm64

import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  nativeImage,
  shell,
  ipcMain,
} from 'electron';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_NAME = '星聚';
const PROD_URL = 'https://xingju.cc'; // Replace with actual production URL
const DEV_URL = 'http://localhost:3000';
const IS_DEV = process.env.NODE_ENV === 'development';
const IS_MAC = process.platform === 'darwin';

// ---------------------------------------------------------------------------
// Window management
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#0f0f0f',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    show: false, // Show after ready-to-show to avoid flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the app
  const url = IS_DEV ? DEV_URL : PROD_URL;
  win.loadURL(url);

  // Show window when ready
  win.once('ready-to-show', () => {
    win.show();
  });

  // Open external links in the default browser
  win.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
    if (linkUrl.startsWith('http')) {
      shell.openExternal(linkUrl);
    }
    return { action: 'deny' };
  });

  // Minimize to tray instead of closing (Windows behavior)
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------

function createTray(): Tray {
  // Use a 16x16 or 22x22 icon — placeholder path
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    // Fallback: create a tiny empty icon
    icon = nativeImage.createEmpty();
  }

  const newTray = new Tray(icon);
  newTray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开星聚',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: '播放/暂停',
      accelerator: 'MediaPlayPause',
      click: () => {
        mainWindow?.webContents.send('media-toggle');
      },
    },
    {
      label: '上一首',
      click: () => {
        mainWindow?.webContents.send('media-prev');
      },
    },
    {
      label: '下一首',
      click: () => {
        mainWindow?.webContents.send('media-next');
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  newTray.setContextMenu(contextMenu);

  newTray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  return newTray;
}

// ---------------------------------------------------------------------------
// Global shortcuts
// ---------------------------------------------------------------------------

function registerGlobalShortcuts(): void {
  // Toggle play/pause
  globalShortcut.register('MediaPlayPause', () => {
    mainWindow?.webContents.send('media-toggle');
  });

  // Next track
  globalShortcut.register('MediaNextTrack', () => {
    mainWindow?.webContents.send('media-next');
  });

  // Previous track
  globalShortcut.register('MediaPreviousTrack', () => {
    mainWindow?.webContents.send('media-prev');
  });

  // Quick hide (Boss key) — Ctrl/Cmd + Shift + H
  const hideAccelerator = IS_MAC ? 'Command+Shift+H' : 'Ctrl+Shift+H';
  globalShortcut.register(hideAccelerator, () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  // Toggle fullscreen — F11
  globalShortcut.register('F11', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function setupIPC(): void {
  // Window controls from renderer
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle('window:close', () => mainWindow?.hide());
  ipcMain.handle('window:fullscreen', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  // App info
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:platform', () => process.platform);
}

// ---------------------------------------------------------------------------
// Auto-update stub
// ---------------------------------------------------------------------------

async function checkForUpdates(): Promise<void> {
  // In production, use electron-updater:
  // import { autoUpdater } from 'electron-updater';
  // autoUpdater.checkForUpdatesAndNotify();
  console.info('[electron] Auto-update check — stub (configure electron-updater for production)');
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

// Extend the App type to include our custom property
let isQuitting = false;

app.whenReady().then(() => {
  mainWindow = createMainWindow();
  tray = createTray();
  registerGlobalShortcuts();
  setupIPC();

  // Check for updates after a short delay
  setTimeout(checkForUpdates, 5000);

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    } else {
      mainWindow?.show();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (!IS_MAC) {
    app.quit();
  }
});

// Clean up before quit
app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
});

// ---------------------------------------------------------------------------
// macOS-specific notes
// ---------------------------------------------------------------------------
// - Set CFBundleIdentifier to cc.wu.fansxingju in electron-builder config
// - Provide icns icon at electron/assets/icon.icns
// - Sign with Apple Developer certificate for distribution
// - Notarize with `electron-notarize` for Gatekeeper
// - Build: npx electron-builder --mac --x64 --arm64
// - Output: .dmg installer

// ---------------------------------------------------------------------------
// Windows-specific notes
// ---------------------------------------------------------------------------
// - Provide ico icon at electron/assets/icon.ico
// - Sign with code signing certificate for SmartScreen
// - Build: npx electron-builder --win --x64
// - Output: .exe (NSIS) or .msi installer
// - Target size: ≤ 80MB
