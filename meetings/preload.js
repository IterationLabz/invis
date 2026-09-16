'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=name=>(...args)=>ipcRenderer.invoke('invis:'+name,...args);
contextBridge.exposeInMainWorld('invis',{
  dockStatus:invoke('dock-status'),transparency:invoke('transparency'),windowAction:invoke('window-action'),bootstrap:invoke('bootstrap'),list:invoke('list'),create:invoke('create'),get:invoke('get'),update:invoke('update'),remove:invoke('delete'),settings:invoke('settings'),
  microphonePermission:invoke('microphone-permission'),start:invoke('start'),stop:invoke('stop'),import:invoke('import'),paste:invoke('paste'),generate:invoke('generate'),cancel:invoke('cancel'),copy:invoke('copy'),export:invoke('export'),exportAudio:invoke('export-audio'),
  audio:(source,pcm)=>ipcRenderer.send('invis:audio',source,pcm),
  onEvent:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('invis:event',listener);return()=>ipcRenderer.removeListener('invis:event',listener);}
});
