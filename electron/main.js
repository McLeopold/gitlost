const path = require('path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const ipcApi = require('../lib/ipc-api');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../web/graph.html'));
  mainWindow.once('ready-to-show', function () {
    mainWindow.show();
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

ipcMain.handle('gitlost:get', function (_event, payload) {
  return ipcApi.handle_get(payload && payload.url, payload && payload.headers);
});

ipcMain.handle('gitlost:select-folder', async function (_event) {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('gitlost:put', function (_event, payload) {
  return ipcApi.handle_put(payload && payload.url, payload && payload.headers);
});

ipcMain.handle('gitlost:get-log', function () {
  return ipcApi.get_log();
});

app.whenReady()
  .then(function () {
    createWindow();

    autoUpdater.checkForUpdatesAndNotify();

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch(function (err) {
    console.error('Failed to start GitLost in Electron:', err);
    app.quit();
  });

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', function () {
  ipcApi.close_all();
});
