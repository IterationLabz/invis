'use strict';
const $=id=>document.getElementById(id),api=window.invisDock;
let state={},pending=false,lastAnnouncement='',hadRecording=false,savedUntil=0;
const bars=[...document.querySelectorAll('#wave i')],levels=Array(12).fill(0);
function update(value){
 state=value;const busy=state.starting||state.stopping;
 document.body.dataset.motion=state.animations===false?'off':'on';
 if(state.recording||busy||state.compact)clearHighlight();
 if(state.recording)hadRecording=true;
 if(hadRecording&&!state.recording&&!busy){hadRecording=false;if(!state.error)savedUntil=Date.now()+1800;}
 document.body.dataset.state=state.error?'error':state.recording?'recording':busy?'busy':'idle';
 $('strip').hidden=!!state.compact;$('handle').hidden=!state.compact;
 $('idleActions').hidden=state.recording||busy;$('liveActions').hidden=!state.recording||busy;$('busyActions').hidden=!busy;
 $('busyLabel').textContent=state.stopping?'SAVING':'CONNECTING';$('liveLabel').textContent=state.kind==='dictation'?'VOICE':'MEETING';
 const message=state.error|| (state.recording?'Recording in progress. Finish saves this session.':state.stopping?'Saving your recording.':state.starting?'Connecting your microphone.':'Invis is ready.');
 if(message!==lastAnnouncement){$('liveStatus').textContent=message;lastAnnouncement=message;}
 $('workspace').title=state.error?state.error+' — Open workspace':'Open workspace';
 for(const id of ['dictate','meeting','ask','finish'])$(id).disabled=pending||!state.ready;
 tick();
}
function tick(){const seconds=state.recording?Math.max(0,Math.floor((Date.now()-state.startedAt)/1000)):0;$('duration').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 const saved=Date.now()<savedUntil&&!state.recording&&!state.starting&&!state.error;
 document.body.dataset.saved=String(saved);
 $('modeHint').textContent=state.error?'Check':state.recording?'Live':state.stopping?'Saving':state.starting?'Linking':saved?'Saved':'Ready';
}
async function action(name){if(pending)return;pending=true;update(state);try{await api.action(name);}catch(e){$('liveStatus').textContent=e.message;}finally{pending=false;update(state);}}
for(const id of ['dictate','meeting','ask','workspace','finish','hide','collapse'])$(id).onclick=()=>action(id);
$('handle').onclick=()=>action('expand');
// Pointer movement highlights a control without activating it or starting audio.
const motionTargets=['dictate','meeting','ask','workspace'].map($);
const glow=$('hoverGlow'),strip=$('strip');
let hoverTimer,lastWheelAt=0;
function highlight(target){
 clearTimeout(hoverTimer);
 const bounds=target.getBoundingClientRect(),parent=strip.getBoundingClientRect();
 strip.dataset.hover=target.id;
 glow.style.transform=`translateY(${bounds.top-parent.top}px)`;
 glow.style.height=bounds.height+'px';
 glow.classList.add('visible');
}
function clearHighlight(){
 clearTimeout(hoverTimer);delete strip.dataset.hover;glow.classList.remove('visible');
 for(const target of motionTargets){target.style.setProperty('--mx','0px');target.style.setProperty('--my','0px');}
}
for(const target of motionTargets){
 target.addEventListener('pointerenter',()=>highlight(target));
 target.addEventListener('focus',()=>highlight(target));
 target.addEventListener('blur',clearHighlight);
 target.addEventListener('pointermove',event=>{
  if(state.animations===false)return;
  const bounds=target.getBoundingClientRect();
  target.style.setProperty('--mx',((event.clientX-bounds.left)/bounds.width-.5)*3+'px');
  target.style.setProperty('--my',((event.clientY-bounds.top)/bounds.height-.5)*3+'px');
 });
 target.addEventListener('pointerleave',()=>{target.style.setProperty('--mx','0px');target.style.setProperty('--my','0px');});
}
strip.addEventListener('pointerleave',clearHighlight);
strip.addEventListener('wheel',event=>{
 // A trackpad/wheel sweep previews the next control; a click is still required.
 if(state.recording||state.starting||state.stopping||state.animations===false||Math.abs(event.deltaY)<2||Date.now()-lastWheelAt<120)return;
 lastWheelAt=Date.now();
 const index=motionTargets.findIndex(target=>target.id===strip.dataset.hover);
 const next=index<0?(event.deltaY>0?0:motionTargets.length-1):(index+(event.deltaY>0?1:motionTargets.length-1))%motionTargets.length;
 highlight(motionTargets[next]);
 hoverTimer=setTimeout(clearHighlight,900);
},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearHighlight();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();action('hide');}});
setInterval(()=>{tick();const level=state.recording&&Date.now()-state.levelAt<350?state.level||0:0;levels.push(level);levels.shift();bars.forEach((bar,i)=>{bar.style.width=(3+Math.min(1,levels[i]*7)*30)+'px';});},100);
api.onState(update);api.bootstrap().then(update).catch(e=>{$('liveStatus').textContent=e.message;});
