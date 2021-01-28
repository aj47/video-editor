import { app, BrowserWindow } from 'electron';
import log from 'electron-log';
import path from 'path';

import { isProduction } from '@shared/util';

import { ipcRegister } from './ipc-register';
import MenuBuilder from './menu';

let win: BrowserWindow | null;

const installExtensions = async () => {
  // eslint-disable-next-line global-require
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;

  return installer
    .default([installer.REACT_DEVELOPER_TOOLS], forceDownload)
    .catch(log.debug);
};

const createWindow = async () => {
  if (!isProduction) await installExtensions();

  win = new BrowserWindow({
    show: false,
    width: 900,
    height: 550,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 36 },
    resizable: !isProduction,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      preload: path.join(__dirname, './preLoad.js'),
    },
  });

  if (process.env.NODE_ENV === 'production') {
    win.loadFile('./build/index.html');
  } else {
    win.loadURL('http://localhost:8080/');
  }

  win.webContents.on('did-finish-load', () => {
    if (!win) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      win.minimize();
    } else {
      win.show();
      win.focus();
      !isProduction && win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  win.on('closed', () => {
    win = null;
  });

  const menuBuilder = new MenuBuilder(win);
  menuBuilder.buildMenu();
};

app.whenReady().then(ipcRegister).then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
