'use strict';
const $=id=>document.getElementById(id),api=window.invis;
let view='meetings',active=null,sessions=[],settings={},selectedTab='transcript',working=false,recording=false,starting=false,stopping=false;
let context=null,captures=[],attempt=0,startedAt=0,notificationTimer;
const turns=new Map();
function fail(e){$('errorText').textContent=String(e.message||e).replace(/^Error invoking remote method '[^']+': Error: /,'');$('error').hidden=false;}
function notify(message){$('notification').textContent=message;$('notification').hidden=false;clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>$('notification').hidden=true,5000);}
function run(fn){return async(...args)=>{try{await fn(...args);}catch(e){fail(e);}};}
function node(tag,content,className){const element=document.createElement(tag);if(content!==undefined)element.textContent=content;if(className)element.className=className;return element;}
function showTransparency(value){$('transparency').value=String(value);$('transparencyValue').textContent=value+'%';settings.transparency=value;}
$('transparency').oninput=run(async()=>{const value=Number($('transparency').value);showTransparency(value);await api.transparency(value);});
$('hideWindow').onclick=run(()=>api.windowAction('hide'));
$('compactWindow').onclick=run(()=>api.windowAction('compact'));
$('quitWindow').onclick=run(()=>api.windowAction('quit'));
function date(at){return new Date(at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
function clock(seconds){return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;}
$('dismissError').onclick=()=>$('error').hidden=true;
async function refresh(){const result=await api.list();sessions=result.meetings;$('meetingCount').textContent=sessions.filter(s=>s.kind==='meeting').length;if(result.unreadable)fail(`${result.unreadable} saved meeting file(s) could not be read. The original files have been kept.`);renderLibrary();}
function sessionRow(m,ask=false){
  const row=node('button',undefined,'session-row'),info=node('span',undefined,'session-info');
  info.append(node('strong',m.title),node('small',`${date(m.createdAt)} · ${m.turns} transcript ${m.turns===1?'entry':'entries'} · ${m.recordings} audio ${m.recordings===1?'track':'tracks'}`));
  row.append(node('span',m.kind==='dictation'?'≋':'▤','session-icon'),info,node('span',m.kind==='dictation'?'Dictation':'Meeting','session-tag'),node('span','↗','session-arrow'));
  row.onclick=run(()=>openMeeting(m.id,ask?'ask':'transcript'));return row;
}
function renderLibrary(){
  const kind=view==='dictation'?'dictation':'meeting',term=$('search').value.toLocaleLowerCase(),items=sessions.filter(m=>m.kind===kind&&m.title.toLocaleLowerCase().includes(term));
  $('sessionList').replaceChildren(...items.map(m=>sessionRow(m)));$('libraryCount').textContent=items.length;$('emptyLibrary').hidden=!!items.length;
  $('emptyLibrary').querySelector('h3').textContent=term?'No conversations match that search.':'A fresh page for your next conversation.';
  $('emptyLibrary').querySelector('p').textContent=term?'Try another name, or clear your search.':'Start a recording or import a transcript. Everything you save will be here.';
  $('askMeetings').replaceChildren(...sessions.map(m=>sessionRow(m,true)));$('askEmpty').hidden=!!sessions.length;
}
async function saveDraft(){if(active){const id=active.id;const saved=await api.update(id,{title:$('meetingTitle').value,notes:$('notes').value});if(active?.id===id)active=saved;}}
async function navigate(next){
  if(recording||starting||stopping)throw new Error('Stop recording before leaving this conversation.');
  if(working)throw new Error('Wait for the AI response or cancel it first.');
  await saveDraft();active=null;view=next;
  for(const button of document.querySelectorAll('[data-view]'))button.classList.toggle('selected',button.dataset.view===view);
  $('viewLabel').textContent=view==='dictation'?'Dictation':view==='ask'?'Ask AI':'Meetings';
  $('libraryView').hidden=view==='ask';$('detailView').hidden=true;$('askLanding').hidden=view!=='ask';
  const dictation=view==='dictation';
  $('libraryTitle').textContent=dictation?'Give your thoughts a voice.':'A little more present.';
  $('libraryEyebrow').textContent=dictation?'LESS TYPING. MORE THINKING.':'LESS NOTE-TAKING. MORE BEING THERE.';
  $('libraryDescription').textContent=dictation?'Speak naturally. Turn your words into writing you can use.':'Good conversations deserve more than your memory.';
  $('createSession').textContent=dictation?'＋ New dictation':'＋ New meeting';$('heroCreate').textContent=dictation?'Start dictating ↗':'Start a meeting ↗';
  document.querySelector('.hero h2').replaceChildren(...(dictation?[node('span','A thought worth keeping.'),node('br'),node('span','Just say it.')]:[node('span','You bring the ideas.'),node('br'),node('span','We’ll keep the details.')]));
  document.querySelector('.hero p').textContent=dictation?'Capture your voice, polish the transcript, and copy it into your next email, document, or message.':'Record the conversation. Find the decisions. Leave with a clear next step.';
  $('recentTitle').firstChild.textContent=dictation?'Your dictations ':'Your meetings ';$('emptyCreate').textContent=dictation?'Create your first dictation →':'Create your first meeting →';
  $('search').value='';await refresh();
}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=run(()=>navigate(button.dataset.view));
async function create(kind=view==='dictation'?'dictation':'meeting'){
  if(recording||starting||stopping||working)throw new Error('Finish the current recording or AI request first.');
  await saveDraft();const m=await api.create({kind});await openMeeting(m.id);await refresh();$('meetingTitle').focus();$('meetingTitle').select();
}
$('newMeeting').onclick=run(()=>create('meeting'));for(const id of ['createSession','heroCreate','emptyCreate'])$(id).onclick=run(()=>create());
$('search').oninput=renderLibrary;
$('back').onclick=run(()=>navigate(active?.kind==='dictation'?'dictation':'meetings'));
async function openMeeting(id,tab='transcript'){
  if(recording||starting||stopping||working)throw new Error('Finish the current recording or AI request first.');
  await saveDraft();active=await api.get(id);$('libraryView').hidden=true;$('askLanding').hidden=true;$('detailView').hidden=false;
  $('meetingTitle').value=active.title;$('notes').value=active.notes;$('viewLabel').textContent=active.kind==='dictation'?'Dictation':'Meetings';
  $('meetingMeta').textContent=`${active.kind==='dictation'?'VOICE NOTE':'MEETING'} / ${date(active.createdAt)} / SAVED LOCALLY`;
  $('back').textContent=active.kind==='dictation'?'← All dictations':'← All meetings';
  $('polish').hidden=active.kind!=='dictation';$('useMeeting').checked=false;$('useMic').checked=true;$('liveTranscript').checked=!!settings.hasKey;
  $('clock').textContent='00:00';renderMeeting();setTab(tab);updateCapture();
}
function setTab(tab){selectedTab=tab;for(const name of ['transcript','analysis','notes','recordings','ask']){$(name+'Panel').hidden=name!==tab;$(name+'Tab').setAttribute('aria-selected',String(name===tab));$(name+'Tab').tabIndex=name===tab?0:-1;}}
for(const button of document.querySelectorAll('[data-tab]')){
  button.onclick=()=>setTab(button.dataset.tab);
  button.onkeydown=event=>{const names=['transcript','analysis','notes','recordings','ask'];let n=names.indexOf(button.dataset.tab);if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();n=event.key==='Home'?0:event.key==='End'?4:(n+(event.key==='ArrowRight'?1:4))%5;setTab(names[n]);$(names[n]+'Tab').focus();}};
}
function renderTurn(t,partial=false){
  const key=t.source+':'+t.id;let row=turns.get(key);
  if(!row){row=node('article',undefined,'turn');row.dataset.at=t.at;row.dataset.order=t.order||0;const meta=node('div',undefined,'turn-meta');meta.append(node('strong',t.source==='microphone'?'Microphone':t.source==='meeting'?'Meeting audio':'Imported transcript'),node('span',new Date(t.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})));row.append(meta,node('p'));turns.set(key,row);const before=[...$('transcripts').children].find(c=>Number(c.dataset.at)>t.at||(Number(c.dataset.at)===t.at&&Number(c.dataset.order)>(t.order||0)));$('transcripts').insertBefore(row,before||null);}
  row.classList.toggle('partial',partial);row.querySelector('p').textContent=t.text;$('emptyTranscript').hidden=true;
  if(!partial){row.dataset.final='true';let reference=row.querySelector('.turn-reference');if(!reference){reference=node('span',undefined,'turn-reference');row.querySelector('.turn-meta').append(node('br'),reference);}reference.textContent='['+(t.ref||`T${active.transcripts.findIndex(x=>x.id===t.id&&x.source===t.source)+1}`)+']';}
}
function renderAnalysis(){
  $('analysisContent').replaceChildren();const a=active.analysis;$('emptyAnalysis').hidden=!!a;
  $('analysisStatus').textContent=a?`${a.turnCount<active.transcripts.length?'New transcript available — regenerate to include it.':'Generated '+new Date(a.at).toLocaleString()} · Review against the source transcript.`:'A summary, decisions, action items, and open questions.';
  if(!a)return;
  const summary=node('div',undefined,'insight-card');summary.append(node('p','THE BIG PICTURE','eyebrow'),node('p',a.summary));$('analysisContent').append(summary);
  const actions=node('div',undefined,'insight-card');actions.append(node('h3','Action items'));
  if(a.actions.length){const table=node('table',undefined,'actions-table'),head=node('thead'),headRow=node('tr');for(const label of ['Next step','Owner','Due','Evidence'])headRow.append(node('th',label));head.append(headRow);table.append(head);const body=node('tbody');for(const a of active.analysis.actions){const row=node('tr');for(const value of [a.task,a.owner||'Unassigned',a.due||'Not specified',a.evidence])row.append(node('td',value));body.append(row);}table.append(body);actions.append(table);}else actions.append(node('p','No confirmed action items found.'));$('analysisContent').append(actions);
  for(const [label,values] of [['Decisions',a.decisions],['Open questions',a.questions]]){const card=node('div',undefined,'insight-card');card.append(node('h3',label));if(values.length){const list=node('ul');for(const value of values)list.append(node('li',value));card.append(list);}else card.append(node('p','None identified in the available context.'));$('analysisContent').append(card);}
}
function renderAnswers(){
  $('answers').replaceChildren();
  for(const a of active.answers){const answer=node('article',undefined,'chat-answer');answer.append(node('p',a.answer),node('small','Evidence: '+(a.evidence.join(', ')||'No transcript citations provided')));const copy=node('button','Copy');copy.onclick=run(async()=>{await api.copy(a.answer);notify('Answer copied.');});answer.append(copy);$('answers').append(node('p',a.question,'chat-question'),answer);}
}
function renderRecordings(){
  $('recordings').replaceChildren();
  if(!active.recordings.length){$('recordings').append(node('p','No audio yet. Start a recording to save it here.','panel-empty'));return;}
  for(const r of active.recordings){const card=node('article',undefined,'recording-card');card.append(node('p',`${r.source==='microphone'?'Microphone':'Meeting audio'} · ${date(r.createdAt)} · ${clock(r.duration||0)}${r.status==='recovered'?' · Recovered after interruption':''}`));if(r.status==='recording'){card.append(node('p','Recording in progress. Playback is available after you stop.','muted'));}else{const audio=node('audio');audio.controls=true;audio.preload='none';audio.src=`invis-audio://${active.id}/${r.id}`;audio.setAttribute('aria-label',r.source+' recording');const download=node('button','Export audio ↗');download.onclick=run(async()=>{if(await api.exportAudio(active.id,r.id))notify('Audio exported.');});card.append(audio,download);}$('recordings').append(card);}
}
function renderMeeting(){turns.clear();$('transcripts').replaceChildren();$('emptyTranscript').hidden=!!active.transcripts.length;for(const t of active.transcripts)renderTurn(t);$('turnCount').textContent=active.transcripts.length;renderAnalysis();renderAnswers();renderRecordings();$('polishedWrap').hidden=!active.polished;$('polished').textContent=active.polished||'';}
$('meetingTitle').onchange=run(async()=>{await saveDraft();await refresh();});
$('saveNotes').onclick=run(async()=>{await saveDraft();notify('Notes saved.');});
$('notes').onblur=run(saveDraft);
let notesTimer;
$('notes').oninput=()=>{clearTimeout(notesTimer);notesTimer=setTimeout(()=>saveDraft().catch(fail),500);};
$('import').onclick=run(async()=>{await saveDraft();const m=await api.import(active.id);if(m){active=m;renderMeeting();notify('Transcript imported.');await refresh();}});
$('paste').onclick=()=>{$('pastedText').value='';$('pasteDialog').showModal();};$('closePaste').onclick=()=>$('pasteDialog').close();
$('pasteForm').onsubmit=run(async event=>{event.preventDefault();await saveDraft();active=await api.paste(active.id,$('pastedText').value);$('pasteDialog').close();renderMeeting();await refresh();notify('Transcript imported.');});
$('copyTranscript').onclick=run(async()=>{await api.copy(active.transcripts.map(t=>t.text).join('\n\n'));notify('Transcript copied.');});
$('copyPolished').onclick=run(async()=>{await api.copy(active.polished);notify('Writing copied.');});
$('export').onclick=run(async()=>{await saveDraft();if(await api.export(active.id,$('exportFormat').value))notify('Meeting exported.');});
$('deleteMeeting').onclick=run(async()=>{if(recording||starting||stopping||working)throw new Error('Stop recording and AI before deleting.');if(!confirm(`Delete “${active.title}” and its recordings from this device? This cannot be undone.`))return;await api.remove(active.id);active=null;await navigate(view);notify('Meeting deleted.');});
function updateAI(){for(const id of ['analyze','ask','polish'])$(id).disabled=working;$('busy').hidden=!working;}
async function generate(mode,question=''){
  if(!active||working)return;await saveDraft();working=true;updateAI();$('busyText').textContent=mode==='analysis'?'Finding the decisions and next steps…':mode==='polish'?'Turning your words into clear writing…':'Reading your meeting…';
  try{active=await api.generate(active.id,mode,question);renderAnalysis();renderAnswers();$('polishedWrap').hidden=!active.polished;$('polished').textContent=active.polished||'';if(mode==='ask'){$('question').value='';$('answers').lastElementChild?.scrollIntoView({block:'nearest'});}await refresh();}finally{working=false;updateAI();}
}
$('analyze').onclick=run(()=>generate('analysis'));$('polish').onclick=run(()=>generate('polish'));$('cancelAI').onclick=run(()=>api.cancel());
$('askForm').onsubmit=run(async event=>{event.preventDefault();const q=$('question').value.trim();if(q)await generate('ask',q);});
for(const button of document.querySelectorAll('[data-question]'))button.onclick=()=>{$('question').value=button.dataset.question;$('question').focus();};
$('question').onkeydown=event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();$('askForm').requestSubmit();}};
function updateCapture(){
  api.dockStatus({starting}).catch(()=>{});
  $('record').textContent=stopping?'Saving recording…':starting?'Cancel connection':recording?'■ Stop recording':'● Start recording';$('record').disabled=stopping;
  $('recordState').textContent=stopping?'Finishing the last phrase':starting?'Connecting your audio':recording?'Recording in progress':'Ready when you are';$('recordDot').classList.toggle('live',recording);
  for(const id of ['useMic','useMeeting','micDevice','liveTranscript','import','paste','deleteMeeting'])$(id).disabled=recording||starting||stopping;
}
async function devices(){try{const current=$('micDevice').value,all=await navigator.mediaDevices.enumerateDevices();$('micDevice').replaceChildren(new Option('Default microphone',''));all.filter(d=>d.kind==='audioinput'&&d.deviceId!=='default').forEach((d,i)=>$('micDevice').append(new Option(d.label||`Microphone ${i+1}`,d.deviceId)));if([...$('micDevice').options].some(o=>o.value===current))$('micDevice').value=current;}catch{}}
function cleanup(){for(const c of captures){c.node?.disconnect();c.input?.disconnect();c.stream.getTracks().forEach(t=>t.stop());}captures=[];context?.close().catch(()=>{});context=null;$('micLevel').value=0;$('meetingLevel').value=0;recording=false;starting=false;updateCapture();}
async function stop(){attempt++;stopping=true;cleanup();updateCapture();try{const m=await api.stop();if(m&&active?.id===m.id){active=m;renderMeeting();}await refresh();}finally{stopping=false;updateCapture();}}
async function start(){
  if(!$('useMic').checked&&!$('useMeeting').checked)throw new Error('Choose a microphone or meeting audio.');
  if($('liveTranscript').checked&&!settings.hasKey)throw new Error('Add a Gemini key in Settings, or turn off live transcription to record locally.');
  await saveDraft();const version=++attempt;starting=true;updateCapture();
  const guard=stream=>{if(version!==attempt){stream?.getTracks().forEach(t=>t.stop());throw new Error('Recording cancelled.');}};
  try{
    if($('useMeeting').checked){const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:320,height:180,frameRate:1},audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},systemAudio:'include'});guard(stream);if(!stream.getAudioTracks().length){stream.getTracks().forEach(t=>t.stop());throw new Error('No meeting audio was shared. Enable audio in the picker, or select a loopback microphone.');}captures.push({source:'meeting',stream});}
    if($('useMic').checked){const permission=await api.microphonePermission();guard();if(!permission)throw new Error('Allow microphone access in your system privacy settings.');const deviceId=$('micDevice').value;const stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{...(deviceId?{deviceId:{exact:deviceId}}:{}),echoCancellation:true,noiseSuppression:true,autoGainControl:true}});guard(stream);captures.push({source:'microphone',stream});await devices();}
    context=new AudioContext({sampleRate:16000});await context.resume();guard();if(context.sampleRate!==16000)throw new Error('This audio device cannot supply 16 kHz audio. Try another microphone.');await context.audioWorklet.addModule('audio-worklet.js');guard();
    await api.start(active.id,captures.map(c=>c.source),$('liveTranscript').checked);guard();
    for(const c of captures){c.input=context.createMediaStreamSource(new MediaStream(c.stream.getAudioTracks()));c.node=new AudioWorkletNode(context,'invis-pcm');c.input.connect(c.node);c.node.connect(context.destination);c.node.port.onmessage=event=>{if(version!==attempt)return;api.audio(c.source,new Uint8Array(event.data.pcm));$(c.source==='microphone'?'micLevel':'meetingLevel').value=Math.min(1,event.data.level*6);};for(const track of c.stream.getTracks())track.addEventListener('ended',()=>{if(recording){fail('An audio source disconnected. The recording has been saved.');stop().catch(fail);}});}
    starting=false;recording=true;startedAt=Date.now();active=await api.get(active.id);renderRecordings();updateCapture();
  }catch(e){if(version===attempt){cleanup();await api.stop().catch(()=>{});throw e;}}
}
$('record').onclick=run(()=>recording||starting?stop():start());
setInterval(()=>{if(recording)$('clock').textContent=clock((Date.now()-startedAt)/1000);},500);
async function dockCommand(action){
  try{
    if(action==='finish'){await stop();return;}
    if(action==='ask'){if(active)setTab('ask');else await navigate('ask');return;}
    if(action==='meeting'){
      if(recording||starting||working)return;
      if(!active||active.kind!=='meeting')await create('meeting');
      $('useMeeting').checked=true;setTab('transcript');$('record').focus();return;
    }
    if(action==='dictate'){
      if(recording||starting||working)throw new Error('Finish your current recording or AI request first.');
      await create('dictation');$('useMic').checked=true;$('useMeeting').checked=false;await start();
    }
  }catch(e){fail(e);await api.dockStatus({error:String(e.message||e)});}
  finally{await api.dockStatus({starting,complete:true});}
}
api.onEvent(event=>{
  if(event.type==='dock-command'){dockCommand(event.action).catch(fail);return;}
  if(event.type==='transparency'){showTransparency(event.value);return;}
  if(event.type==='error'){fail(event.message);return;}
  if(event.meetingId!==active?.id)return;
  if(event.type==='partial')renderTurn(event.turn,true);
  if(event.type==='transcript'){const t=event.turn;if(!active.transcripts.some(x=>x.id===t.id&&x.source===t.source))active.transcripts.push(t);active.transcripts.sort((a,b)=>a.at-b.at||a.order-b.order);renderTurn(t);$('turnCount').textContent=active.transcripts.length;}
  if(event.type==='capture-stopped'){attempt++;cleanup();active=event.meeting;renderMeeting();notify('Recording saved to this device.');}
});
$('settings').onclick=()=>{$('dockAnimations').checked=settings.dockAnimations!==false;$('apiKey').value='';$('answerModel').value=settings.answerModel;$('transcriptionModel').value=settings.transcriptionModel;$('keyStatus').textContent=settings.hasKey?'Gemini is connected with your configured key.':'Add your own Gemini key for live transcription and AI.';$('settingsError').hidden=true;$('settingsDialog').showModal();};
$('closeSettings').onclick=()=>$('settingsDialog').close();
$('settingsForm').onsubmit=async event=>{event.preventDefault();try{settings=await api.settings({dockAnimations:$('dockAnimations').checked,key:$('apiKey').value.trim(),answerModel:$('answerModel').value.trim(),transcriptionModel:$('transcriptionModel').value.trim()});$('apiKey').value='';$('settingsDialog').close();$('liveTranscript').checked=!!settings.hasKey;notify('Settings saved.');}catch(e){$('settingsError').textContent=String(e.message).replace(/^Error invoking remote method '[^']+': Error: /,'');$('settingsError').hidden=false;}};
for(const id of ['contribute','contributeFooter'])$(id).onclick=()=>$('contributeDialog').showModal();$('closeContribute').onclick=()=>$('contributeDialog').close();
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='n'&&!document.querySelector('dialog[open]')){event.preventDefault();create('meeting').catch(fail);}});
window.addEventListener('beforeunload',()=>{cleanup();if(active)api.update(active.id,{title:$('meetingTitle').value,notes:$('notes').value}).catch(()=>{});});
(async()=>{try{const boot=await api.bootstrap();settings=boot.settings;showTransparency(settings.transparency);$('visibilityShortcut').textContent=settings.platform==='darwin'?'⌘ B':'Ctrl B';sessions=boot.meetings;await navigate('meetings');await devices();await api.dockStatus({ready:true});}catch(e){fail(e);}})();
