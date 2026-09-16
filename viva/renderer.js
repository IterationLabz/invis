'use strict';
const $=id=>document.getElementById(id);
const api=window.viva;
let state={phase:'presentation',listening:false,starting:false,settings:null,elapsed:0,timerStarted:null,timerRunning:false};
let audioContext=null,captures=[],captureAttempt=0,answerId=0;
const turnNodes=new Map();let finalCount=0,levels={microphone:0,meeting:0};
function error(message){$('error').textContent=String(message).replace(/^Error invoking remote method '[^']+': Error: /,'');$('error').hidden=false;}
function clearError(){$('error').hidden=true;}
function showTransparency(value){$('transparency').value=String(value);$('transparencyValue').textContent=value+'%';if(state.settings)state.settings.transparency=value;}
$('transparency').addEventListener('input',()=>{const value=Number($('transparency').value);showTransparency(value);api.transparency(value).catch(e=>error(e.message));});
function renderScript(markdown){
  $('script').replaceChildren();
  for(const block of markdown.split(/\n\s*\n/)){
    const match=block.match(/^(#{1,3})\s+(.+)$/s);const element=document.createElement(match?'h'+match[1].length:'p');
    element.textContent=match?match[2]:block.replace(/\n/g,' ');$('script').appendChild(element);
  }
}
function tab(name){for(const item of ['script','transcript','notes']){$(item+'Tab').setAttribute('aria-selected',String(item===name));$(item+'Panel').hidden=item!==name;}}
for(const item of ['script','transcript','notes'])$(item+'Tab').addEventListener('click',()=>tab(item));
function updateStatus(){
  $('status').textContent=state.starting?'Connecting audio and transcription…':state.listening?(state.phase==='presentation'?'Listening · collecting presentation context. No automatic answers.':'Listening · Q&A mode. Questions come from your selected source.'):(state.phase==='presentation'?'Presentation mode · rehearse the script or start listening.':'Q&A mode · start listening or type a practice question.');
  $('listen').textContent=state.starting?'Cancel connection':state.listening?'Stop listening':'Start listening';
  for(const id of ['useMic','useMeeting','micDevice'])$(id).disabled=state.listening||state.starting;
}
function elapsed(){return state.elapsed+(state.timerRunning?Date.now()-state.timerStarted:0);}
function tick(){const seconds=Math.floor(elapsed()/1000);$('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');$('clock').classList.toggle('overtime',seconds>=600);$('timerHint').textContent=seconds>=600?'10 minutes reached':'of 10:00';}
function toggleTimer(){if(state.timerRunning){state.elapsed=elapsed();state.timerRunning=false;}else{state.timerStarted=Date.now();state.timerRunning=true;}$('timerToggle').textContent=state.timerRunning?'Pause timer':'Start timer';tick();}
$('timerToggle').addEventListener('click',toggleTimer);setInterval(tick,500);
async function setPhase(phase){
  try{await api.phase(phase);state.phase=phase;
    $('presentation').classList.toggle('selected',phase==='presentation');$('qa').classList.toggle('selected',phase==='qa');
    $('presentation').setAttribute('aria-pressed',String(phase==='presentation'));$('qa').setAttribute('aria-pressed',String(phase==='qa'));
    if(phase==='qa'){if(state.timerRunning)toggleTimer();tab('transcript');}
    updateStatus();
  }catch(e){error(e.message);}
}
$('presentation').addEventListener('click',()=>setPhase('presentation'));$('qa').addEventListener('click',()=>setPhase('qa'));
async function preferences(){try{await api.preferences({autoAnswers:$('autoAnswers').checked,questionSource:$('questionSource').value});}catch(e){error(e.message);}}
$('autoAnswers').addEventListener('change',preferences);$('questionSource').addEventListener('change',preferences);
async function listDevices(){try{
  const selected=$('micDevice').value;const devices=await navigator.mediaDevices.enumerateDevices();
  $('micDevice').replaceChildren(new Option('Default microphone',''));
  devices.filter(d=>d.kind==='audioinput'&&d.deviceId!=='default').forEach((d,i)=>$('micDevice').append(new Option(d.label||`Microphone ${i+1}`,d.deviceId)));
  if([...$('micDevice').options].some(o=>o.value===selected))$('micDevice').value=selected;
}catch{}}
function cleanupAudio(){
  for(const capture of captures){capture.node?.disconnect();capture.sourceNode?.disconnect();for(const track of capture.stream.getTracks())track.stop();}
  captures=[];audioContext?.close().catch(()=>{});audioContext=null;
  levels={microphone:0,meeting:0};$('micLevel').value=0;$('meetingLevel').value=0;
  state.listening=false;state.starting=false;updateStatus();
}
async function stopListening(){captureAttempt++;cleanupAudio();try{await api.stopAudio();}catch(e){error(e.message);}}
async function startListening(){
  clearError();if(!$('useMic').checked&&!$('useMeeting').checked){error('Select a microphone or meeting audio first.');return;}
  const attempt=++captureAttempt;state.starting=true;updateStatus();
  const guard=stream=>{if(attempt!==captureAttempt){stream?.getTracks().forEach(t=>t.stop());throw new Error('Listening cancelled.');}};
  try{
    if($('useMeeting').checked){
      const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:320,height:180,frameRate:1},audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},systemAudio:'include'});
      guard(stream);
      if(!stream.getAudioTracks().length){stream.getTracks().forEach(t=>t.stop());throw new Error('No meeting audio track was provided. Enable audio in the sharing picker, or use a loopback microphone device.');}
      captures.push({source:'meeting',stream,lastSignal:Date.now()});
    }
    if($('useMic').checked){
      const permission=await api.microphonePermission();guard();if(!permission)throw new Error('Microphone access was denied. Enable it in macOS Privacy & Security, then restart Invis.');
      const deviceId=$('micDevice').value;
      const stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{...(deviceId?{deviceId:{exact:deviceId}}:{}),echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      guard(stream);captures.push({source:'microphone',stream,lastSignal:Date.now()});await listDevices();
    }
    audioContext=new AudioContext({sampleRate:16000});await audioContext.resume();guard();
    if(audioContext.sampleRate!==16000)throw new Error('Your audio device could not provide the required 16 kHz stream. Choose another input.');
    await audioContext.audioWorklet.addModule('audio-worklet.js');guard();
    await preferences();await api.startAudio(captures.map(c=>c.source));guard();
    for(const capture of captures){
      const audioOnly=new MediaStream(capture.stream.getAudioTracks());
      capture.sourceNode=audioContext.createMediaStreamSource(audioOnly);
      capture.node=new AudioWorkletNode(audioContext,'viva-pcm');
      // The processor emits silence, so connecting it keeps the worklet active without monitoring audio.
      capture.sourceNode.connect(capture.node);capture.node.connect(audioContext.destination);
      capture.node.port.onmessage=event=>{
        if(attempt!==captureAttempt)return;const {pcm,level}=event.data;levels[capture.source]=level;
        if(level>0.003)capture.lastSignal=Date.now();
        api.audio(capture.source,new Uint8Array(pcm));
      };
      capture.stream.getTracks().forEach(track=>track.addEventListener('ended',()=>{if(state.listening){error(`${capture.source==='meeting'?'Meeting audio':'Microphone'} stopped. Restart listening to reconnect.`);stopListening();}}));
    }
    state.listening=true;state.starting=false;updateStatus();
    if(state.phase==='presentation'&&!state.timerRunning)toggleTimer();
    if(state.phase==='qa'&&$('autoAnswers').checked&&!captures.some(c=>c.source===$('questionSource').value))error('Your question source is not being captured. Enable meeting audio, or select Microphone (rehearsal).');
  }catch(e){if(attempt===captureAttempt){cleanupAudio();await api.stopAudio().catch(()=>{});error(e.message);}}
}
$('listen').addEventListener('click',()=>state.listening||state.starting?stopListening():startListening());
setInterval(()=>{
  $('micLevel').value=Math.min(1,levels.microphone*5);$('meetingLevel').value=Math.min(1,levels.meeting*5);
  if(state.listening){const silent=captures.find(c=>c.source==='meeting'&&Date.now()-c.lastSignal>20000);if(silent){$('status').textContent='No meeting audio signal detected. Play meeting audio and check macOS recording permissions.';}}
},200);
function transcript(turn,partial){
  const key=turn.id.startsWith(turn.source+':')?turn.id:turn.source+':'+turn.id;
  let row=turnNodes.get(key);
  if(!row){
    row=document.createElement('article');row.className='turn';row.dataset.at=turn.at;row.dataset.order=turn.order;
    const meta=document.createElement('div');meta.className='turn-meta';const label=document.createElement('span');
    label.textContent=`${turn.source==='meeting'?'Meeting':'My microphone'} · ${turn.phase==='qa'?'Q&A':'Presentation'} · ${new Date(turn.at).toLocaleTimeString()}`;
    const button=document.createElement('button');button.textContent='Ask about this';button.addEventListener('click',()=>{$('question').value=row.querySelector('p').textContent;$('question').focus();});
    meta.append(label,button);row.append(meta,document.createElement('p'));turnNodes.set(key,row);
    const before=[...$('transcripts').children].find(c=>Number(c.dataset.at)>turn.at);
    $('transcripts').insertBefore(row,before||null);
  }
  row.classList.toggle('partial',partial);row.querySelector('p').textContent=turn.text;
  if(!partial&&!row.dataset.complete){row.dataset.complete='true';$('turnCount').textContent=String(++finalCount);}
  $('emptyTranscript').hidden=true;
  const panel=$('transcriptPanel');if(panel.scrollHeight-panel.scrollTop-panel.clientHeight<200)panel.scrollTop=panel.scrollHeight;
}
api.onEvent(event=>{
  switch(event.type){
    case 'transparency':showTransparency(event.value);break;
    case 'partial':transcript(event.turn,true);break;
    case 'transcript':transcript(event.turn,false);break;
    case 'error':error(event.message);break;
    case 'capture-stopped':captureAttempt++;cleanupAudio();break;
    case 'answer-start':answerId=event.id;$('answerStatus').textContent=event.automatic?'Checking the question…':'Preparing answer…';$('ask').disabled=true;break;
    case 'answer-progress':if(event.id===answerId)$('answerStatus').textContent='Writing answer…';break;
    case 'answer':
      if(event.id!==answerId)break;
      $('answerEmpty').hidden=true;$('answerContent').hidden=false;$('questionLabel').textContent=event.question;
      $('answerText').textContent=event.answer;$('followUp').textContent=event.followUp;$('followUpWrap').hidden=!event.followUp;
      $('source').textContent='Based on: '+event.source;$('uncertainty').textContent=event.uncertainty;$('uncertainty').hidden=!event.uncertainty;
      $('answerStatus').textContent='Answer ready';$('ask').disabled=false;break;
    case 'not-question':if(event.id===answerId){$('answerStatus').textContent='Listening for a question';$('ask').disabled=false;}break;
    case 'answer-error':if(event.id===answerId){error(event.message);$('answerStatus').textContent='Could not answer';$('ask').disabled=false;}break;
    case 'answer-cancelled':answerId=0;$('ask').disabled=false;$('answerStatus').textContent='Ready';break;
  }
});
$('askForm').addEventListener('submit',async event=>{event.preventDefault();const text=$('question').value.trim();if(!text)return;clearError();try{await api.ask(text);}catch(e){error(e.message);}});
$('question').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();$('askForm').requestSubmit();}});
$('cancelAnswer').addEventListener('click',()=>api.cancelAnswer().catch(e=>error(e.message)));
$('saveNotes').addEventListener('click',async()=>{try{await api.notes($('notes').value);$('notesStatus').textContent='Using these notes for this session';}catch(e){error(e.message);}});
$('pdf').addEventListener('click',()=>api.openPDF().catch(e=>error(e.message)));
$('hideWindow').addEventListener('click',()=>api.windowAction('hide').catch(e=>error(e.message)));
$('quitWindow').addEventListener('click',()=>api.windowAction('quit').catch(e=>error(e.message)));
$('export').addEventListener('click',()=>api.export().catch(e=>error(e.message)));
$('reset').addEventListener('click',async()=>{if(!confirm('Start a new session? Export first if you want to keep this transcript.'))return;await stopListening();await api.reset();turnNodes.clear();finalCount=0;$('turnCount').textContent='0';$('transcripts').replaceChildren();$('emptyTranscript').hidden=false;$('answerContent').hidden=true;$('answerEmpty').hidden=false;$('notes').value='';$('notesStatus').textContent='';state.elapsed=0;state.timerRunning=false;$('timerToggle').textContent='Start timer';tick();await setPhase('presentation');clearError();});
$('settings').addEventListener('click',()=>{const s=state.settings;$('answerModel').value=s.answerModel;$('transcriptionModel').value=s.transcriptionModel;$('geminiKey').value='';$('keyStatus').textContent=`Gemini key: ${s.hasGeminiKey?'saved':'missing'} · used for speech and answers`;$('settingsDialog').showModal();});
$('closeSettings').addEventListener('click',()=>$('settingsDialog').close());
$('settingsForm').addEventListener('submit',async event=>{event.preventDefault();try{if(state.listening||state.starting)await stopListening();state.settings=await api.saveSettings({answerModel:$('answerModel').value.trim(),transcriptionModel:$('transcriptionModel').value,geminiApiKey:$('geminiKey').value.trim()});$('geminiKey').value='';$('settingsDialog').close();clearError();}catch(e){error(e.message);}});
window.addEventListener('beforeunload',()=>{cleanupAudio();api.stopAudio();});
(async()=>{try{const boot=await api.bootstrap();state.settings=boot.settings;showTransparency(boot.settings.transparency||0);renderScript(boot.script);$('notes').value=boot.notes||'';await listDevices();updateStatus();if(!boot.settings.hasGeminiKey)error('A Gemini key is missing. Open Settings before starting a live session.');}catch(e){error(e.message);}})();
