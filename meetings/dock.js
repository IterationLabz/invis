'use strict';
const path=require('node:path');
const {pathToFileURL}=require('node:url');
function dockBounds(area,compact=false,current=null) {
  const width=compact?28:90,height=compact?100:368;
  const right=current?current.x+current.width:area.x+area.width-18;
  const center=current?current.y+current.height/2:area.y+area.height*.48;
  return {x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,right-width))),y:Math.round(Math.max(area.y,Math.min(area.y+area.height-height,center-height/2))),width,height};
}
function createDock({BrowserWindow,screen,ipcMain,getState,onAction,onQuit}) {
  const entry=path.join(__dirname,'dock.html'),url=pathToFileURL(entry).href;
  const dock=new BrowserWindow({...dockBounds(screen.getPrimaryDisplay().workArea),title:'Invis controls',show:false,transparent:true,backgroundColor:'#00000000',frame:false,type:'panel',resizable:false,hasShadow:false,skipTaskbar:true,fullscreenable:false,webPreferences:{preload:path.join(__dirname,'dock-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  dock.setAlwaysOnTop(true,'floating');dock.setContentProtection(true);
  if(process.platform==='darwin')dock.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  let compact=false;
  function send(){if(!dock.isDestroyed())dock.webContents.send('invis-dock:state',{...getState(),compact});}
  function resize(value){compact=value;const bounds=dock.getBounds(),area=screen.getDisplayMatching(bounds).workArea;dock.setBounds(dockBounds(area,compact,bounds));send();}
  function relocate(){if(dock.isDestroyed())return;const bounds=dock.getBounds();dock.setBounds(dockBounds(screen.getDisplayMatching(bounds).workArea,compact,bounds));}
  const trusted=event=>event.sender===dock.webContents&&event.senderFrame?.url===url;
  ipcMain.handle('invis-dock:bootstrap',event=>{if(!trusted(event))throw new Error('Untrusted caller.');return {...getState(),compact};});
  ipcMain.handle('invis-dock:action',async(event,action)=>{
    if(!trusted(event))throw new Error('Untrusted caller.');
    if(action==='collapse'){resize(true);return;}
    if(action==='expand'){resize(false);return;}
    if(!['dictate','meeting','ask','workspace','finish','hide','quit'].includes(action))throw new Error('Unknown dock action.');
    return onAction(action);
  });
  dock.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  dock.webContents.on('will-navigate',(event,next)=>{if(next!==url)event.preventDefault();});
  dock.webContents.on('did-finish-load',send);
  // Quit from the normal app lifecycle is allowed; a dock close gesture just hides it.
  dock.on('close',event=>{if(!onQuit()){event.preventDefault();onAction('hide');}});
  screen.on('display-removed',relocate);screen.on('display-metrics-changed',relocate);
  dock.on('closed',()=>{screen.removeListener('display-removed',relocate);screen.removeListener('display-metrics-changed',relocate);});
  dock.loadFile(entry);
  return {window:dock,send,expand:()=>resize(false)};
}
module.exports={createDock,dockBounds};
