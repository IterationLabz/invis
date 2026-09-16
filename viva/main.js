'use strict';
const {app,BrowserWindow,ipcMain,session:electronSession,desktopCapturer,dialog,shell,systemPreferences,safeStorage,globalShortcut}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {VivaSession,generateAnswer,cleanText,DEFAULTS}=require('./core');
const {Transcriber}=require('./transcriber');
const {loadCredentials}=require('./credentials');

// A normal, user-controlled window. Audio starts only after Start listening.
app.setName('Invis Viva');
if(process.argv.includes('--inspect-ui'))app.commandLine.appendSwitch('remote-debugging-port','9337');
const primaryInstance=app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
const viva=new VivaSession();
let window=null, settings={}, settingsPath='', credentials=loadCredentials();
const streams=new Map(), pending=new Map(), timers=new Map(), speaking=new Set();
let recording=false, generation=null, generationId=0, captureVersion=0;
const entry=path.join(__dirname,'index.html');
const pdfPath=path.join(app.isPackaged?path.join(process.resourcesPath,'viva'):path.join(__dirname,'..','resources','viva'),'presentation.pdf');
const uiURL=pathToFileURL(entry).href;
function emit(type,data={}){if(window&&!window.isDestroyed())window.webContents.send('viva:event',{type,...data});}
function allowed(event){return event.sender===window?.webContents&&event.senderFrame?.url===uiURL;}
function handle(name,fn){ipcMain.handle('viva:'+name,async(event,...args)=>{if(!allowed(event))throw new Error('Untrusted caller.');return fn(...args);});}
function publicSettings(){return {transparency:settings.transparency||0,answerModel:settings.answerModel||DEFAULTS.answerModel,transcriptionModel:settings.transcriptionModel||DEFAULTS.transcriptionModel,hasGeminiKey:!!credentials.geminiApiKey,platform:process.platform};}
function revealWindow(){
  if(!window||window.isDestroyed())return;
  if((settings.transparency||0)>=95){settings.transparency=0;window.setOpacity(1);persistSettings();emit('transparency',{value:0});}
  window.show();window.focus();
}
function persistSettings(){fs.mkdirSync(path.dirname(settingsPath),{recursive:true});fs.writeFileSync(settingsPath,JSON.stringify(settings,null,2),{mode:0o600});}
function clearPending(){for(const timer of timers.values())clearTimeout(timer);timers.clear();pending.clear();speaking.clear();}
function cancelAnswer(){generationId++;generation?.abort();generation=null;emit('answer-cancelled');}
function stopCapture(){captureVersion++;recording=false;for(const stream of streams.values())stream.stop();streams.clear();clearPending();emit('capture-stopped');}
let autoAnswers=true, questionSource='meeting';
function schedule(source){
  clearTimeout(timers.get(source));
  if(speaking.has(source))return;
  timers.set(source,setTimeout(async()=>{
    timers.delete(source);
    const turns=pending.get(source)||[];pending.delete(source);
    if(!recording||!autoAnswers||viva.phase!=='qa'||source!==questionSource||!turns.length)return;
    const question=turns.sort((a,b)=>a.order-b.order).map(t=>t.text).join(' ');
    try{await answer(question,true);}catch(error){emit('error',{message:error.message});}
  },1400));
}
async function answer(question,automatic=false){
  if(automatic&&viva.phase!=='qa')return {skipped:true};
  const id=++generationId;generation?.abort();const controller=generation=new AbortController();
  const sessionId=viva.id;
  emit('answer-start',{question,automatic,id});
  const timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const result=await generateAnswer({session:viva,question,automatic,apiKey:credentials.geminiApiKey,model:settings.answerModel||DEFAULTS.answerModel,signal:controller.signal,
      onDelta:()=>{if(id===generationId)emit('answer-progress',{id});}});
    if(id!==generationId||viva.id!==sessionId||controller.signal.aborted)return {cancelled:true};
    if(result.isQuestion){viva.addAnswer(result);emit('answer',{...result,id});}
    else emit('not-question',{id});
    return result;
  }catch(error){
    if(id!==generationId)return {cancelled:true};
    const message=controller.signal.aborted?'Answer timed out. Try again or shorten the question.':error.message;
    emit('answer-error',{id,message});throw new Error(message);
  }finally{clearTimeout(timeout);if(id===generationId)generation=null;}
}

app.whenReady().then(()=>{
  settingsPath=path.join(app.getPath('userData'),'viva-settings.json');
  try{settings=JSON.parse(fs.readFileSync(settingsPath,'utf8'));}catch{}
  if(!settings.transcriptionModel?.startsWith('gemini-'))settings.transcriptionModel=DEFAULTS.transcriptionModel;
  if(safeStorage.isEncryptionAvailable())for(const key of ['geminiApiKey'])if(settings[key])try{credentials[key]=safeStorage.decryptString(Buffer.from(settings[key],'base64'));}catch{}
  // Do not expose credentials or source audio to arbitrary windows.
  electronSession.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>{
    callback(contents===window?.webContents&&contents.getURL()===uiURL&&['media','display-capture'].includes(permission));
  });
  electronSession.defaultSession.setPermissionCheckHandler((contents,permission)=>contents===window?.webContents&&contents.getURL()===uiURL&&['media','display-capture'].includes(permission));
  electronSession.defaultSession.setDisplayMediaRequestHandler(async(request,callback)=>{
    if(request.frame?.url!==uiURL){callback({});return;}
    try{
      const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:0,height:0}});
      if(!sources.length){callback({});return;}
      if(sources.length>1){
        const choice=await dialog.showMessageBox(window,{type:'question',title:'Choose meeting audio source',message:'Choose the display hosting your meeting.',buttons:[...sources.map(s=>s.name),'Cancel'],cancelId:sources.length});
        if(choice.response>=sources.length){callback({});return;}
        callback({video:sources[choice.response],audio:'loopback'});
      }else callback({video:sources[0],audio:'loopback'});
    }catch{callback({});}
  },{useSystemPicker:true});
  window=new BrowserWindow({width:1180,height:860,minWidth:760,minHeight:620,title:'Invis Viva',backgroundColor:'#00000000',transparent:true,frame:false,type:'panel',hasShadow:false,fullscreenable:false,vibrancy:'under-window',visualEffectState:'active',show:false,
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.setContentProtection(true);
  window.setAlwaysOnTop(true,'floating');
  if(process.platform==='darwin')window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  window.setOpacity(1-Math.max(0,Math.min(100,Number(settings.transparency)||0))/100);
  globalShortcut.register('CommandOrControl+B',()=>{if(!window)return;if(window.isVisible()&&(settings.transparency||0)<95)window.hide();else revealWindow();});
  window.once('ready-to-show',revealWindow);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!==uiURL)event.preventDefault();});
  window.on('closed',()=>{stopCapture();generation?.abort();window=null;});
  window.webContents.on('render-process-gone',()=>{stopCapture();generation?.abort();});
  window.loadFile(entry);
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{globalShortcut.unregisterAll();stopCapture();generation?.abort();});
app.on('activate',revealWindow);
app.on('second-instance',revealWindow);

handle('bootstrap',()=>({settings:publicSettings(),context:fs.readFileSync(path.join(__dirname,fs.existsSync(path.join(__dirname,'context.local.md'))?'context.local.md':'context.md'),'utf8'),script:fs.readFileSync(path.join(__dirname,fs.existsSync(path.join(__dirname,'presentation-script.local.md'))?'presentation-script.local.md':'presentation-script.md'),'utf8'),phase:viva.phase,pdfAvailable:fs.existsSync(pdfPath),notes:viva.notes}));
handle('phase',phase=>{clearPending();cancelAnswer();viva.setPhase(phase);return {phase};});
handle('preferences',value=>{
  if(!value||typeof value!=='object')throw new Error('Invalid preferences.');
  autoAnswers=value.autoAnswers===true;questionSource=value.questionSource==='microphone'?'microphone':'meeting';clearPending();
  return {autoAnswers,questionSource};
});
handle('notes',text=>{viva.setNotes(text);return {saved:true};});
handle('save-settings',value=>{
  for(const key of ['answerModel','transcriptionModel']){
    if(typeof value[key]!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(value[key]))throw new Error('Invalid model name.');
    settings[key]=value[key];
  }
  for(const key of ['geminiApiKey'])if(value[key]){
    if(!safeStorage.isEncryptionAvailable())throw new Error('Secure key storage is unavailable on this computer.');
    credentials[key]=cleanText(value[key],500);settings[key]=safeStorage.encryptString(credentials[key]).toString('base64');
  }
  persistSettings();return publicSettings();
});
handle('start-audio',async sources=>{
  if(recording||streams.size)throw new Error('Already listening. Stop before restarting.');
  if(!Array.isArray(sources)||!sources.length||sources.length>2||sources.some(s=>!['microphone','meeting'].includes(s))||new Set(sources).size!==sources.length)throw new Error('Select at least one audio source.');
  if(!credentials.geminiApiKey)throw new Error('Gemini transcription needs a key. Open settings.');
  const version=++captureVersion;recording=true;
  try{
    await Promise.all(sources.map(async source=>{
      const stream=new Transcriber({source,apiKey:credentials.geminiApiKey,model:settings.transcriptionModel||DEFAULTS.transcriptionModel,getPhase:()=>viva.phase});
      streams.set(source,stream);
      stream.on('partial',turn=>{if(recording&&version===captureVersion)emit('partial',{turn});});
      stream.on('speech-started',()=>{if(version!==captureVersion)return;speaking.add(source);clearTimeout(timers.get(source));});
      stream.on('speech-stopped',()=>{if(version!==captureVersion)return;speaking.delete(source);schedule(source);});
      stream.on('transcript',turn=>{
        if(!recording||version!==captureVersion)return;
        try{
          const saved=viva.addTranscript(turn);if(!saved)return;emit('transcript',{turn:saved});
          if(viva.phase==='qa'&&saved.phase==='qa'&&autoAnswers&&source===questionSource){const list=pending.get(source)||[];list.push(saved);pending.set(source,list);schedule(source);}
        }catch(error){emit('error',{message:error.message});}
      });
      stream.on('failure',message=>{if(version!==captureVersion)return;emit('error',{message});stopCapture();});
      await stream.start();
      if(version!==captureVersion){stream.stop();throw new Error('Listening was cancelled.');}
    }));
    return {listening:true};
  }catch(error){if(version===captureVersion){emit('error',{message:error.message});stopCapture();}throw error;}
});
ipcMain.on('viva:audio',(event,source,pcm)=>{if(!allowed(event)||!recording)return;if(!(pcm instanceof Uint8Array)&&!(pcm instanceof ArrayBuffer))return;streams.get(source)?.append(pcm);});
handle('stop-audio',()=>{stopCapture();cancelAnswer();return {stopped:true};});
handle('ask',question=>answer(cleanText(question,8000),false));
handle('cancel-answer',()=>{cancelAnswer();return {cancelled:true};});
handle('reset',()=>{stopCapture();cancelAnswer();viva.reset();return {reset:true};});
handle('open-pdf',async()=>{if(!fs.existsSync(pdfPath))throw new Error('The bundled PDF is missing.');const error=await shell.openPath(pdfPath);if(error)throw new Error('Could not open the PDF.');return {opened:true};});
handle('export',async()=>{
  const result=await dialog.showSaveDialog(window,{title:'Export viva session',defaultPath:'invis-viva-session.md',filters:[{name:'Markdown',extensions:['md']}]});
  if(result.canceled)return {cancelled:true};fs.writeFileSync(result.filePath,viva.exportMarkdown(),{mode:0o600});return {saved:true};
});
handle('microphone-permission',async()=>process.platform==='darwin'?systemPreferences.askForMediaAccess('microphone'):true);
handle('window-action',action=>{if(action==='hide')window?.hide();else if(action==='quit')app.quit();else throw new Error('Unknown window action.');});
handle('transparency',value=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw new Error('Transparency must be between 0 and 100.');
  settings.transparency=Math.round(value);window?.setOpacity(1-settings.transparency/100);persistSettings();return settings.transparency;
});
