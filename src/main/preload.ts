import {
  contextBridge,
  ipcRenderer,
  OpenDialogReturnValue,
  SaveDialogReturnValue,
  shell,
} from 'electron';
import log from 'electron-log';
import path from 'path';

import { ConvertOption, ConvertStatus, InspectData } from '@shared/types';

const contextBridgeApis = {
  process: {
    env: {
      NODE_ENV: process.env.NODE_ENV,
    },
    platform: process.platform,
  },
  path: {
    ...path,
  },
  log: log.functions,
  api: {
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    inspectFile: (filePath: string): Promise<InspectData | undefined> =>
      ipcRenderer.invoke('inspect-file', filePath),
    showOpenDialog: (): Promise<OpenDialogReturnValue> =>
      ipcRenderer.invoke('show-open-dialog'),
    showSaveDialog: (defaultPath: string): Promise<SaveDialogReturnValue> =>
      ipcRenderer.invoke('show-save-dialog', defaultPath),
    detectSilence: (filePath: string) =>
      ipcRenderer.invoke('detect-silence', filePath),
    convert: (filePath: string, option: ConvertOption) =>
      ipcRenderer.invoke('convert', filePath, option),
    onConvertStatus: (callback: (status: ConvertStatus) => void) => {
      const listener = (_: any, status: ConvertStatus) => callback(status);
      ipcRenderer.on('convert-status', listener);

      return () => {
        ipcRenderer.removeListener('convert-status', listener);
      };
    },
    cancel: () => ipcRenderer.send('cancel'),
    revealFile: (filePath: string) => shell.showItemInFolder(filePath),
  },
};

export type ContextBridgeApis = typeof contextBridgeApis;

(Object.keys(contextBridgeApis) as (keyof ContextBridgeApis)[]).forEach(
  (apiKey) => {
    contextBridge.exposeInMainWorld(apiKey, contextBridgeApis[apiKey]);
  }
);
