const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleSession: (currentState) => ipcRenderer.invoke('session:toggle', currentState),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  openConfig: () => ipcRenderer.invoke('config:open'),
  saveKey: (data) => ipcRenderer.invoke('config:saveKey', data),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  sendAudioChunk: (base64) => ipcRenderer.send('audio:chunk', base64),
  onStateChange: (callback) => ipcRenderer.on('state:change', (_event, data) => callback(data)),
  onAudioDelta: (callback) => ipcRenderer.on('audio:delta', (_event, delta) => callback(delta)),
  onStopAudio: (callback) => ipcRenderer.on('audio:stop', () => callback())
});
