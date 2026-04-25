import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, req?: any) => ipcRenderer.invoke(channel, req),
  on:     (channel: string, cb: (data: any) => void) => {
    ipcRenderer.on(channel, (_e, data) => cb(data));
  },
  off: (channel: string) => ipcRenderer.removeAllListeners(channel),
});
