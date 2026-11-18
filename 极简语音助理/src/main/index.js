const { app, BrowserWindow, ipcMain, screen, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { loadConfig, getConfigPath } = require('./config');
const { RealtimeSession } = require('./realtime');

let mainWindow = null;
let realtimeSession = null;

function createWindow() {
  let config = {};
  try {
    config = loadConfig();
  } catch (e) {
    config = {};
  }

  const winSettings = config.window_settings || {};
  const width = winSettings.width || 120;
  const height = winSettings.height || 120;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: winSettings.position_x || (screenWidth - width - 40),
    y: winSettings.position_y || (screenHeight - height - 60),
    frame: false,
    transparent: true,
    alwaysOnTop: winSettings.always_on_top ?? true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  realtimeSession = new RealtimeSession({
    onStateChange: (state, message = '') => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('state:change', { state, message });
      }
    },
    onAudioDelta: (delta) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:delta', delta);
      }
    },
    onSpeechStarted: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio:stop');
      }
    }
  });
}

// 退出应用
ipcMain.handle('app:quit', () => {
  if (realtimeSession) {
    realtimeSession.disconnect();
  }
  app.quit();
});

// 打开配置文件所在目录并选中
ipcMain.handle('config:open', () => {
  const cfgPath = getConfigPath();
  shell.showItemInFolder(cfgPath);
});

// 保存配置
ipcMain.handle('config:saveKey', (_event, { endpoint, apiKey }) => {
  try {
    const cfgPath = getConfigPath();
    const config = loadConfig();
    if (endpoint) config.azure_realtime.endpoint = endpoint.trim();
    if (apiKey) config.azure_realtime.api_key = apiKey.trim();
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 切换对话状态
ipcMain.handle('session:toggle', async (_event, currentState) => {
  if (!realtimeSession) return 'disconnected';

  // 如果当前是错误状态，再次点击重置为待命 idle
  if (currentState === 'error') {
    realtimeSession.disconnect();
    return 'idle';
  }

  if (realtimeSession.isConnected) {
    realtimeSession.disconnect();
    return 'disconnected';
  } else {
    try {
      await realtimeSession.connect();
      return 'connecting';
    } catch (err) {
      console.error('连接失败:', err.message);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('state:change', {
          state: 'error',
          message: err.message
        });
      }
      return 'error';
    }
  }
});

// 显示右键菜单
ipcMain.on('show-context-menu', () => {
  const menu = Menu.buildFromTemplate([
    {
      label: '打开配置文件 (config.json)',
      click: () => {
        const cfgPath = getConfigPath();
        shell.showItemInFolder(cfgPath);
      }
    },
    {
      label: '重置/断开连接',
      click: () => {
        if (realtimeSession) realtimeSession.disconnect();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('state:change', { state: 'idle', message: '' });
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出软件',
      click: () => {
        if (realtimeSession) realtimeSession.disconnect();
        app.quit();
      }
    }
  ]);
  menu.popup(BrowserWindow.fromWebContents(mainWindow.webContents));
});

ipcMain.on('audio:chunk', (_event, base64) => {
  if (realtimeSession && realtimeSession.isConnected) {
    realtimeSession.sendAudioChunk(base64);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
