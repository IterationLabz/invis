'use strict';
const {loadCredentials}=require('./credentials');
const {VivaSession,generateAnswer,DEFAULTS}=require('./core');
const {Transcriber}=require('./transcriber');

async function check(){
  const keys=loadCredentials();const results={};
  const session=new VivaSession();
  const checks=await Promise.allSettled([
    (async()=>{const s=new Transcriber({apiKey:keys.geminiApiKey,source:'microphone',getPhase:()=>session.phase});try{await s.start();return {ok:true,model:DEFAULTS.transcriptionModel};}finally{s.stop();}})(),
    (async()=>{const start=Date.now();const result=await generateAnswer({session,question:'What is a binary search?',apiKey:keys.geminiApiKey,signal:AbortSignal.timeout(30000)});return {ok:result.isQuestion&&Boolean(result.answer),model:DEFAULTS.answerModel,milliseconds:Date.now()-start,answer:result.answer};})()
  ]);
  ['transcription','answers'].forEach((name,i)=>{results[name]=checks[i].status==='fulfilled'?checks[i].value:{ok:false,error:checks[i].reason.message};});
  console.log(JSON.stringify(results,null,2));
  if(Object.values(results).some(r=>!r.ok))process.exitCode=1;
}
check().catch(()=>{console.error('Service check failed. No credentials were printed.');process.exitCode=1;});
