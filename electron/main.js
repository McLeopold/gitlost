const { app, BrowserWindow } = require('electron');

const server = require('../lib/server');

let mainWindow = null;
let isServerListening = false;
const defaultPort = parseInt(process.env.GITLOST_PORT || '6776', 10);

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', function () {
    mainWindow.show();
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function ensureServerStarted() {
  return new Promise(function (resolve, reject) {
    if (isServerListening && server.listening) {
      const address = server.address();
      resolve('http://127.0.0.1:' + address.port + '/');
      return;
    }

    server.once('error', function (err) {
      reject(err);
    });

    server.listen(defaultPort, '127.0.0.1', function () {
      isServerListening = true;
      const address = server.address();
      resolve('http://127.0.0.1:' + address.port + '/');
    });
  });
}

app.whenReady()
  .then(function () {
    return ensureServerStarted();
  })
  .then(function (url) {
    createWindow(url);

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(url);
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
  if (server.listening) {
    server.close();
  }
});
