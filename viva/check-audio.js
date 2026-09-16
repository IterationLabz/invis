'use strict';
// Explicit live smoke test: synthesized speech only, never microphone/meeting audio.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const {Transcriber}=require('./transcriber');
const {loadCredentials}=require('./credentials');
const {VivaSession,generateAnswer}=require('./core');
async function check(){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'invis-viva-audio-'));
  const aiff=path.join(folder,'sample.aiff'),wav=path.join(folder,'sample.wav');
  const words='How does a binary search work?';
  execFileSync('say',['-v','Samantha','-o',aiff,words]);
  execFileSync('afconvert',['-f','WAVE','-d','LEI16@16000','-c','1',aiff,wav]);
  const file=fs.readFileSync(wav);let pcm;
  for(let offset=12;offset+8<=file.length;){const size=file.readUInt32LE(offset+4);if(file.toString('ascii',offset,offset+4)==='data'){pcm=file.subarray(offset+8,offset+8+size);break;}offset+=8+size+(size%2);}
  if(!pcm)throw new Error('Test WAV contains no PCM data.');
  const keys=loadCredentials(),session=new VivaSession();session.setPhase('qa');
  const transcriber=new Transcriber({source:'meeting',apiKey:keys.geminiApiKey,getPhase:()=>session.phase});
  const turns=[];let failure='';transcriber.on('transcript',turn=>{turns.push(turn);session.addTranscript(turn);});transcriber.on('failure',message=>{failure=message;});
  try{
    await transcriber.start();
    const audio=Buffer.concat([pcm,Buffer.alloc(16000*2*2)]);
    for(let offset=0;offset<audio.length;offset+=3200){if(failure)throw new Error(failure);transcriber.append(audio.subarray(offset,offset+3200));await delay(100);}
    for(let i=0;!turns.length&&i<60;i++){if(failure)throw new Error(failure);await delay(100);}
    const transcript=turns.map(t=>t.text).join(' ');
    if(!/binary search/i.test(transcript))throw new Error('Synthetic speech did not produce the expected final transcript.');
    const start=Date.now();const result=await generateAnswer({session,question:transcript,automatic:true,apiKey:keys.geminiApiKey,signal:AbortSignal.timeout(30000)});
    if(!result.isQuestion||!result.answer)throw new Error('The transcribed question did not produce an answer.');
    console.log(JSON.stringify({ok:true,input:words,transcript,answer:result.answer,answerMilliseconds:Date.now()-start,physicalDevicesTested:false},null,2));
  }finally{transcriber.stop();for(const name of [aiff,wav])if(fs.existsSync(name))fs.unlinkSync(name);fs.rmdirSync(folder);}
}
check().catch(error=>{console.error(error.message);process.exitCode=1;});
