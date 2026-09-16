'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('invisDock',{
  bootstrap:()=>ipcRenderer.invoke('invis-dock:bootstrap'),
  action:name=>ipcRenderer.invoke('invis-dock:action',name),
  onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('invis-dock:state',listener);return()=>ipcRenderer.removeListener('invis-dock:state',listener);}
});
