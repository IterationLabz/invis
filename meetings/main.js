'use strict';
const {app,BrowserWindow,ipcMain,session,desktopCapturer,dialog,systemPreferences,safeStorage,clipboard,protocol,net,globalShortcut,screen}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomUUID}=require('node:crypto');
const {MeetingStore,text,markdown}=require('./store');
const {Recording}=require('./recording');
const {Transcriber}=require('../shared/transcriber');
const {DEFAULTS}=require('../shared/defaults');
const {generate}=require('./provider');
const {createVisibility}=require('./visibility');
const {createDock}=require('./dock');
app.setName('Invis');
protocol.registerSchemesAsPrivileged([{scheme:'invis-audio',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
if(process.argv.includes('--inspect-ui'))app.commandLine.appendSwitch('remote-debugging-port','9338');
if(!app.requestSingleInstanceLock())app.quit();
let window,visibility,dock,workspaceReady=false,dockTask=null,dockError='',lastLevel=0,levelAt=0,uiStarting=false,store,settings={},settingsPath,key=process.env.GEMINI_API_KEY||'',capture=null,job=null,closing=false;
const entry=path.join(__dirname,'index.html'), uiURL=pathToFileURL(entry).href;
function emit(type,value={}) {
  if(type==='error')dockError=String(value.message||'Open workspace to review the error.').slice(0,350);
  if(window&&!window.isDestroyed())window.webContents.send('invis:event',{type,...value});
  dock?.send();
}
function dockState(){return {animations:settings.dockAnimations!==false,ready:workspaceReady,recording:!!capture?.acceptAudio,starting:uiStarting||!!capture&&!capture.acceptAudio&&!capture.stopping||dockTask==='dictate',stopping:!!capture?.stopping||dockTask==='finish',startedAt:capture?.startedAt||0,kind:capture?.kind||'meeting',level:lastLevel,levelAt,error:dockError};}
function dockAction(action){
  if(action==='hide'){visibility.hide();return;}
  if(action==='quit'){app.quit();return;}
  if(action==='workspace'){visibility.workspace();return;}
  if(!workspaceReady)throw new Error('The workspace is still loading.');
  if(action==='ask'){visibility.workspace();emit('dock-command',{action});return;}
  if(action==='meeting'){visibility.workspace();emit('dock-command',{action});return;}
  if(dockTask)return;
  if(action==='dictate'&&capture){visibility.workspace();return;}
  if(action==='finish'&&!capture&&!uiStarting)return;
  dockError='';dockTask=action;dock?.send();emit('dock-command',{action});
}
function allowed(event) {return event.sender===window?.webContents&&event.senderFrame?.url===uiURL;}
function handle(name,fn) {ipcMain.handle('invis:'+name,async(event,...args)=>{if(!allowed(event))throw new Error('Untrusted caller.');return fn(...args);});}
function preferences() {return {dockAnimations:settings.dockAnimations!==false,answerModel:settings.answerModel||DEFAULTS.answerModel,transcriptionModel:settings.transcriptionModel||DEFAULTS.transcriptionModel,hasKey:!!key,platform:process.platform,transparency:settings.transparency};}
function saveSettings() {fs.writeFileSync(settingsPath,JSON.stringify(settings),{mode:0o600});}
function cancelJob() {job?.controller.abort();job=null;}
async function stopCapture() {
  if(!capture)return;
  const current=capture;
  if(current.stopping)return current.stopping;
  current.acceptAudio=false;
  current.stopping=(async()=>{
    // End the upload before closing sockets so the provider can finalize the last phrase.
    await Promise.all([...current.streams.values()].map(s=>s.finish()));
    const m=store.get(current.id);
    for(const item of current.writers.values()) {
      const duration=item.writer.close(), record=m.recordings.find(r=>r.id===item.id);
      if(record){record.duration=duration;record.status='saved';}
    }
    store.save(m);if(capture===current)capture=null;
    emit('capture-stopped',{meetingId:current.id,meeting:m});
    return m;
  })();
  return current.stopping;
}
app.whenReady().then(()=>{
  const root=process.env.INVIS_DATA_DIR||app.getPath('userData');fs.mkdirSync(root,{recursive:true,mode:0o700});
  store=new MeetingStore(path.join(root,'meetings'));settingsPath=path.join(root,'settings.json');
  try{settings=JSON.parse(fs.readFileSync(settingsPath,'utf8'));}catch{}
  if(settings.key&&safeStorage.isEncryptionAvailable())try{key=safeStorage.decryptString(Buffer.from(settings.key,'base64'));}catch{}
  // Completed chunks remain playable after a crash; only metadata needs recovery.
  for(const item of store.list().meetings){const m=store.get(item.id);let changed=false;for(const r of m.recordings)if(r.status==='recording'){try{r.duration=Math.max(0,fs.statSync(store.audioPath(m.id,r.id)).size-44)/32000;}catch{r.duration=0;}r.status='recovered';changed=true;}if(changed)store.save(m);}
  protocol.handle('invis-audio',request=>{
    try{const url=new URL(request.url),id=url.hostname,recordingId=url.pathname.slice(1);const m=store.get(id);if(!m.recordings.some(r=>r.id===recordingId))return new Response('Not found',{status:404});return net.fetch(pathToFileURL(store.audioPath(id,recordingId)).href,{headers:request.headers});}catch{return new Response('Not found',{status:404});}
  });
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===window?.webContents&&contents.getURL()===uiURL&&['media','display-capture'].includes(permission)));
  session.defaultSession.setPermissionCheckHandler((contents,permission)=>contents===window?.webContents&&contents.getURL()===uiURL&&['media','display-capture'].includes(permission));
  session.defaultSession.setDisplayMediaRequestHandler(async(request,callback)=>{
    if(request.frame?.url!==uiURL){callback({});return;}
    try{const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:0,height:0}});if(!sources.length){callback({});return;}let selected=0;if(sources.length>1){const result=await dialog.showMessageBox(window,{title:'Meeting audio',message:'Choose the display hosting your meeting.',buttons:[...sources.map(s=>s.name),'Cancel'],cancelId:sources.length});selected=result.response;}callback(selected<sources.length?{video:sources[selected],audio:'loopback'}:{});}catch{callback({});}
  },{useSystemPicker:true});
  window=new BrowserWindow({width:1320,height:900,minWidth:840,minHeight:640,title:'Invis',show:false,backgroundColor:'#00000000',transparent:true,frame:false,type:'panel',hasShadow:false,fullscreenable:false,skipTaskbar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  window.setContentProtection(true);
  window.setAlwaysOnTop(true,'floating');
  if(process.platform==='darwin')window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  dock=createDock({BrowserWindow,screen,ipcMain,getState:dockState,onAction:dockAction,onQuit:()=>closing});
  visibility=createVisibility({window,companion:dock.window,settings,persist:saveSettings,onChange:value=>emit('transparency',{value})});
  if(!globalShortcut.register('CommandOrControl+B',()=>visibility.toggle())){
    dialog.showErrorBox('Invis shortcut unavailable','Command/Ctrl+B is already in use or unavailable. Quit the app using that shortcut and relaunch Invis.');
    app.quit();return;
  }
  if(process.platform==='darwin')app.dock.hide();
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!==uiURL)event.preventDefault();});
  window.webContents.on('render-process-gone',()=>{workspaceReady=false;dockTask=null;uiStarting=false;dockError='Workspace stopped unexpectedly. Quit and reopen Invis.';stopCapture().catch(()=>{});cancelJob();dock?.send();});
  window.on('close',event=>{if(!closing){event.preventDefault();visibility.compact();}});
  window.on('closed',()=>{window=null;});window.loadFile(entry);
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{globalShortcut.unregisterAll();cancelJob();if(capture&&!closing){event.preventDefault();closing=true;stopCapture().finally(()=>app.quit());}else closing=true;});
// Launching again or activating the app never reveals the workspace.
// Only the registered keyboard shortcut calls visibility.toggle().
handle('transparency',value=>visibility.set(value));
handle('dock-status',value=>{if(value?.ready===true)workspaceReady=true;uiStarting=value?.starting===true;if(value?.complete)dockTask=null;if(typeof value?.error==='string')dockError=value.error.slice(0,350);dock?.send();});
handle('window-action',action=>{if(action==='hide')visibility.hide();else if(action==='compact')visibility.compact();else if(action==='quit')app.quit();else throw new Error('Unknown window action.');});
handle('bootstrap',()=>({settings:preferences(),...store.list()}));
handle('list',()=>store.list());
handle('create',value=>store.create(value));
handle('get',id=>store.get(id));
handle('update',(id,value)=>store.update(id,value));
handle('delete',id=>{if(capture?.id===id||job?.id===id)throw new Error('Stop recording and AI before deleting this meeting.');store.remove(id);return store.list();});
handle('settings',value=>{
  if(capture)throw new Error('Stop recording before changing settings.');
  const next={...settings};
  for(const name of ['answerModel','transcriptionModel']){if(typeof value[name]!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(value[name]))throw new Error('Invalid model name.');next[name]=value[name];}
  if(value.key){if(!safeStorage.isEncryptionAvailable())throw new Error('Secure storage unavailable. Set GEMINI_API_KEY in your environment instead.');const replacement=text(value.key,500);next.key=safeStorage.encryptString(replacement).toString('base64');key=replacement;}
  if(value.dockAnimations!==undefined){if(typeof value.dockAnimations!=='boolean')throw new Error('Invalid animation setting.');next.dockAnimations=value.dockAnimations;}
  Object.assign(settings,next);saveSettings();dock?.send();return preferences();
});
handle('microphone-permission',()=>process.platform==='darwin'?systemPreferences.askForMediaAccess('microphone'):true);
handle('start',async(id,sources,transcribe)=>{
  if(capture)throw new Error('A recording is already active.');
  if(!Array.isArray(sources)||!sources.length||sources.length>2||sources.some(s=>!['microphone','meeting'].includes(s))||new Set(sources).size!==sources.length)throw new Error('Choose at least one audio source.');
  if(transcribe&&!key)throw new Error('Add a Gemini key in Settings, or turn off live transcription to record locally.');
  const m=store.get(id),current=capture={id,kind:m.kind,startedAt:Date.now(),streams:new Map(),writers:new Map(),acceptAudio:false};
  try{
    for(const source of sources){
      const recordId=randomUUID(),writer=new Recording(store.audioPath(id,recordId));current.writers.set(source,{id:recordId,writer});
      m.recordings.push({id:recordId,source,createdAt:Date.now(),duration:0,status:'recording'});
    }
    store.save(m);
    if(transcribe)await Promise.all(sources.map(async source=>{
      const stream=new Transcriber({source,apiKey:key,model:settings.transcriptionModel||DEFAULTS.transcriptionModel,getPhase:()=> 'meeting'});current.streams.set(source,stream);
      stream.on('partial',turn=>{if(capture===current)emit('partial',{meetingId:id,turn});});
      stream.on('transcript',turn=>{if(capture!==current)return;try{const saved=store.addTurn(id,turn);const final=saved.transcripts.find(t=>t.id===turn.id&&t.source===turn.source);emit('transcript',{meetingId:id,turn:final});}catch(e){emit('error',{message:e.message});stopCapture().catch(()=>{});}});
      stream.on('failure',message=>{if(capture!==current)return;emit('error',{message:message+' Local audio recording continues. Stop to save, then reconnect.'});stream.stop();});
      await stream.start();
    }));
    if(capture!==current||current.stopping)throw new Error('Recording cancelled.');current.acceptAudio=true;current.startedAt=Date.now();dockError='';dock?.send();return {started:true};
  }catch(e){await stopCapture();throw e;}
});
ipcMain.on('invis:audio',(event,source,pcm)=>{
  if(!allowed(event)||!capture?.acceptAudio||!(pcm instanceof Uint8Array))return;
  try{
    capture.writers.get(source)?.writer.append(pcm);capture.streams.get(source)?.append(pcm);
    if(pcm.byteLength&&pcm.byteLength%2===0&&pcm.byteLength<=16000&&Date.now()-levelAt>=100){const samples=Buffer.from(pcm);let energy=0;for(let i=0;i<samples.length;i+=2){const sample=samples.readInt16LE(i)/32768;energy+=sample*sample;}lastLevel=Math.sqrt(energy/(samples.length/2));levelAt=Date.now();dock?.send();}
  }catch(e){emit('error',{message:e.message});stopCapture().catch(()=>{});}
});
handle('stop',()=>stopCapture());
handle('import',async id=>{
  if(capture?.id===id)throw new Error('Stop recording before importing.');store.get(id);
  const selected=await dialog.showOpenDialog(window,{title:'Import a transcript',properties:['openFile'],filters:[{name:'Transcript',extensions:['txt','md','vtt','srt']}]});
  if(selected.canceled)return null;
  const file=selected.filePaths[0];if(fs.statSync(file).size>800000)throw new Error('Choose a transcript smaller than 800 KB.');
  return store.addTurn(id,{id:randomUUID(),source:'import',text:fs.readFileSync(file,'utf8')});
});
handle('paste',(id,content)=>{if(capture?.id===id)throw new Error('Stop recording before importing.');return store.addTurn(id,{id:randomUUID(),source:'import',text:content});});
handle('generate',async(id,mode,question='')=>{
  if(job)throw new Error('An AI request is already running. Cancel it or wait.');
  const meeting=store.get(id),controller=new AbortController(),current=job={id,controller};
  const timeout=setTimeout(()=>controller.abort(),60000);
  try{
    const result=await generate({meeting,mode,question,apiKey:key,model:settings.answerModel||DEFAULTS.answerModel,signal:controller.signal});
    if(controller.signal.aborted)throw new Error('AI request cancelled.');
    const latest=store.get(id);
    if(mode==='analysis')latest.analysis={...result,at:Date.now(),turnCount:meeting.transcripts.length};
    if(mode==='ask')latest.answers.push({question:text(question,8000),...result,at:Date.now()});
    if(mode==='polish')latest.polished=result.text;
    return store.save(latest);
  }catch(e){if(controller.signal.aborted)throw new Error('AI request cancelled or timed out.');throw e;}finally{clearTimeout(timeout);if(job===current)job=null;}
});
handle('cancel',()=>{cancelJob();return true;});
handle('copy',value=>{clipboard.writeText(text(value,1000000));return true;});
handle('export',async(id,format)=>{
  const m=store.get(id);if(!['md','json'].includes(format))throw new Error('Unknown export format.');
  const result=await dialog.showSaveDialog(window,{defaultPath:m.title.replace(/[^a-z0-9 _-]/gi,'').slice(0,80)+'.'+format,filters:[{name:format==='md'?'Markdown':'JSON',extensions:[format]}]});
  if(result.canceled)return false;fs.writeFileSync(result.filePath,format==='md'?markdown(m):JSON.stringify(m,null,2),{mode:0o600});return true;
});
handle('export-audio',async(id,recordingId)=>{
  const m=store.get(id);if(capture?.id===id)throw new Error('Stop recording before exporting audio.');if(!m.recordings.some(r=>r.id===recordingId))throw new Error('Recording not found.');
  const result=await dialog.showSaveDialog(window,{defaultPath:'invis-recording.wav',filters:[{name:'WAV audio',extensions:['wav']}]});if(result.canceled)return false;fs.copyFileSync(store.audioPath(id,recordingId),result.filePath);fs.chmodSync(result.filePath,0o600);return true;
});
