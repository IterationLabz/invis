const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  onScreenshotCaptured: (callback) => ipcRenderer.on('screenshot-captured', (event, dataUrl) => callback(dataUrl)),
  toggleSecureInput: (enabled) => ipcRenderer.send('toggle-secure-input', enabled)
});
