const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {Transcriber,sessionUpdate}=require('../transcriber');
class Socket extends EventEmitter{
  constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];Socket.last=this;queueMicrotask(()=>this.emit('open'));}
  send(value){const event=JSON.parse(value);this.sent.push(event);if(event.setup)queueMicrotask(()=>this.emit('message',Buffer.from('{"setupComplete":{}}')));}
  close(){if(this.readyState===3)return;this.readyState=3;this.emit('close',1000);}terminate(){this.close();}
}
const event=(kind,text)=>({serverContent:{[kind]:{text}}});
test('Gemini setup requests text-only live ASR and vocabulary hints',()=>{
 const setup=sessionUpdate().setup;assert.equal(setup.model,'models/gemini-3.5-transcribe-live');assert.deepEqual(setup.generationConfig.responseModalities,['TEXT']);assert.deepEqual(setup.inputAudioTranscription.languageCodes,[]);assert.deepEqual(setup.inputAudioTranscription.customVocabulary,[]);
});
test('connection waits for setup, sends 16 kHz PCM and closes cleanly',async()=>{
 const t=new Transcriber({apiKey:'fake',source:'meeting',getPhase:()=> 'qa',Socket});await t.start();assert.equal(t.ready,true);t.append(new Uint8Array([1,2,3,4]));assert.deepEqual(Socket.last.sent.at(-1).realtimeInput.audio,{data:'AQIDBA==',mimeType:'audio/pcm;rate=16000'});const n=Socket.last.sent.length;t.append(new Uint8Array([1]));assert.equal(Socket.last.sent.length,n);t.stop();assert.equal(t.ready,false);
});
test('interim hypotheses replace text and final preserves original phase',()=>{
 let phase='presentation';const t=new Transcriber({source:'microphone',getPhase:()=>phase});const turns=[],partials=[];t.on('transcript',v=>turns.push(v));t.on('partial',v=>partials.push(v));
 t.handleEvent(event('interimInputTranscription','Hello'));phase='qa';
 t.handleEvent(event('interimInputTranscription','Hello there'));
 t.handleEvent(event('inputTranscription','Hello there.'));
 assert.equal(turns.length,1);assert.equal(turns[0].phase,'presentation');assert.equal(turns[0].text,'Hello there.');assert.equal(partials[1].text,'Hello there');
 t.handleEvent(event('inputTranscription','Next question?'));assert.equal(turns[1].phase,'qa');assert.equal(turns[1].order,2);
});
test('connection renewal retains old turn ordering and keeps new audio flowing',async()=>{
 const t=new Transcriber({apiKey:'fake',source:'meeting',getPhase:()=> 'qa',Socket});const turns=[];t.on('transcript',v=>turns.push(v));await t.start();const old=t.socket;
 old.emit('message',Buffer.from(JSON.stringify(event('interimInputTranscription','First'))));await t.renew();const next=t.socket;assert.notEqual(next,old);assert.deepEqual(old.sent.at(-1),{realtimeInput:{audioStreamEnd:true}});
 next.emit('message',Buffer.from(JSON.stringify(event('inputTranscription','Second'))));old.emit('message',Buffer.from(JSON.stringify(event('inputTranscription','First'))));
 assert.deepEqual(turns.map(t=>t.order),[2,1]);t.append(new Uint8Array([1,2]));assert.ok(next.sent.at(-1).realtimeInput.audio);t.stop();assert.equal(t.sockets.size,0);
});
test('restarting capture does not reuse transcript identifiers',()=>{
 const ids=[];for(let i=0;i<2;i++){const t=new Transcriber({source:'meeting',getPhase:()=> 'qa'});t.on('transcript',turn=>ids.push(turn.id));t.handleEvent(event('inputTranscription','Hello'));}assert.notEqual(ids[0],ids[1]);
});
test('old-session final does not mark new-session speech as stopped',()=>{
 const t=new Transcriber({source:'meeting',getPhase:()=> 'qa'}),old={id:1,current:null},next={id:2,current:null};let stops=0;t.on('speech-stopped',()=>stops++);
 t.handleEvent(event('interimInputTranscription','First'),old);t.handleEvent(event('interimInputTranscription','Next'),next);t.handleEvent(event('inputTranscription','First'),old);assert.equal(stops,0);t.handleEvent(event('inputTranscription','Next'),next);assert.equal(stops,1);
});
test('finish delivers the final phrase before shutting down transcription',async()=>{
 const t=new Transcriber({apiKey:'fake',source:'meeting',getPhase:()=> 'meeting',Socket});const turns=[];t.on('transcript',v=>turns.push(v));await t.start();const socket=t.socket;
 const done=t.finish();assert.deepEqual(socket.sent.at(-1),{realtimeInput:{audioStreamEnd:true}});
 socket.emit('message',Buffer.from(JSON.stringify(event('inputTranscription','Last action item.'))));await done;
 assert.equal(turns[0].text,'Last action item.');assert.equal(t.stopped,true);assert.equal(t.ready,false);
});
