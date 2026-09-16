const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('viva',{
  bootstrap:()=>ipcRenderer.invoke('viva:bootstrap'),
  phase:value=>ipcRenderer.invoke('viva:phase',value),
  preferences:value=>ipcRenderer.invoke('viva:preferences',value),
  notes:value=>ipcRenderer.invoke('viva:notes',value),
  saveSettings:value=>ipcRenderer.invoke('viva:save-settings',value),
  startAudio:sources=>ipcRenderer.invoke('viva:start-audio',sources),
  stopAudio:()=>ipcRenderer.invoke('viva:stop-audio'),
  audio:(source,pcm)=>ipcRenderer.send('viva:audio',source,pcm),
  ask:text=>ipcRenderer.invoke('viva:ask',text),
  cancelAnswer:()=>ipcRenderer.invoke('viva:cancel-answer'),
  reset:()=>ipcRenderer.invoke('viva:reset'),
  openPDF:()=>ipcRenderer.invoke('viva:open-pdf'),
  export:()=>ipcRenderer.invoke('viva:export'),
  microphonePermission:()=>ipcRenderer.invoke('viva:microphone-permission'),
  windowAction:action=>ipcRenderer.invoke('viva:window-action',action),
  transparency:value=>ipcRenderer.invoke('viva:transparency',value),
  onEvent:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('viva:event',listener);return ()=>ipcRenderer.removeListener('viva:event',listener);}
});
