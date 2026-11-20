import { contextBridge } from 'electron';

export interface ElectronBridgeAPI {
  isElectron: boolean;
  platform: NodeJS.Platform;
}

const electronAPI: ElectronBridgeAPI = {
  isElectron: true,
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
