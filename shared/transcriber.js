'use strict';
const {EventEmitter}=require('node:events');
const WebSocket=require('ws');
const {randomUUID}=require('node:crypto');
const {DEFAULTS}=require('./defaults');

function sessionUpdate(model=DEFAULTS.transcriptionModel) {
  return {setup:{model:`models/${model}`,generationConfig:{responseModalities:['TEXT']},inputAudioTranscription:{languageCodes:[],customVocabulary:[]}}};
}
class Transcriber extends EventEmitter {
  constructor({apiKey,model=DEFAULTS.transcriptionModel,source,getPhase,Socket=WebSocket}) {
    super();Object.assign(this,{apiKey,model,source,getPhase,Socket});
    this.id=randomUUID();this.activeTurns=new Set();this.order=0;this.connection=0;this.sockets=new Set();this.closeTimers=new Set();this.stopped=false;this.ready=false;
    this.fallbackConnection={id:0,current:null};
  }
  async start(){
    if(!this.apiKey)throw new Error('Gemini transcription needs a key. Open Settings.');
    this.socket=await this.connect();
    if(this.stopped){this.socket.close();throw new Error('Listening was cancelled.');}
    this.ready=true;this.scheduleRenewal();this.emit('status','connected');
  }
  connect(){
    // The key stays in the main process. Never log this URL or raw socket errors.
    const socket=new this.Socket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(this.apiKey)}`,{handshakeTimeout:15000,maxPayload:2*1024*1024});
    this.sockets.add(socket);const connection={id:++this.connection,current:null};
    return new Promise((resolve,reject)=>{
      let settled=false;
      const timer=setTimeout(()=>finish(new Error('Gemini transcription connection timed out.')),18000);
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(error){socket.close();reject(error);}else resolve(socket);};
      socket.on('open',()=>socket.send(JSON.stringify(sessionUpdate(this.model))));
      socket.on('message',buffer=>{
        if(this.stopped)return;let event;try{event=JSON.parse(buffer.toString());}catch{return;}
        if(event.setupComplete){finish();return;}
        if(event.error){const raw=String(event.error.code||'unknown');const code=/^[a-z0-9_]+$/i.test(raw)?raw:'unknown';const error=new Error(`Gemini transcription error (${code}). Check model access and billing.`);if(!settled)finish(error);else if(socket===this.socket)this.emit('failure',error.message);return;}
        this.handleEvent(event,connection);
        if(event.goAway&&socket===this.socket)this.renew();
      });
      socket.on('unexpected-response',(_req,res)=>finish(new Error(`Gemini transcription rejected (${res.statusCode}). Check key and billing.`)));
      socket.on('error',()=>{const error=new Error('Gemini transcription network connection failed.');if(!settled)finish(error);else if(socket===this.socket&&!this.stopped)this.emit('failure',error.message);});
      socket.on('close',code=>{this.sockets.delete(socket);if(!settled)finish(new Error(`Gemini transcription closed before setup (${code}). Check model access.`));else if(socket===this.socket&&!this.stopped){this.ready=false;this.emit('failure','Gemini transcription disconnected. Stop and restart listening.');}});
    });
  }
  scheduleRenewal(){clearTimeout(this.renewTimer);this.renewTimer=setTimeout(()=>this.renew(),9*60*1000);this.renewTimer.unref?.();}
  async renew(){
    if(this.renewing||this.stopped)return;this.renewing=true;
    try{
      const next=await this.connect();if(this.stopped){next.close();return;}
      const previous=this.socket;this.socket=next;
      if(previous?.readyState===WebSocket.OPEN)previous.send(JSON.stringify({realtimeInput:{audioStreamEnd:true}}));
      // Keep receiving the previous utterance's final text while new audio uses the new session.
      const timer=setTimeout(()=>{this.closeTimers.delete(timer);previous?.close();},1800);this.closeTimers.add(timer);timer.unref?.();
      this.scheduleRenewal();this.emit('status','renewed');
    }catch(error){if(!this.stopped)this.emit('failure',error.message);}finally{this.renewing=false;}
  }
  handleEvent(event,connection=this.fallbackConnection){
    const content=event.serverContent;if(!content)return;
    const interim=content.interimInputTranscription?.text,final=content.inputTranscription?.text;
    if(typeof interim!=='string'&&typeof final!=='string')return;
    if(!connection.current){connection.current={id:`${this.id}-${connection.id}-${++this.order}`,order:this.order,at:Date.now(),phase:this.getPhase(),source:this.source,text:''};this.activeTurns.add(connection.current.id);this.emit('speech-started');}
    const turn=connection.current;
    if(typeof interim==='string'){turn.text=interim;this.emit('partial',{...turn});}
    if(typeof final==='string'){turn.text=final;if(final.trim())this.emit('transcript',{...turn});connection.current=null;this.activeTurns.delete(turn.id);if(!this.activeTurns.size)this.emit('speech-stopped');}
  }
  append(data){
    if(!this.ready||this.stopped||this.socket?.readyState!==WebSocket.OPEN)return;
    const pcm=Buffer.from(data);if(!pcm.length||pcm.length>16000||pcm.length%2)return;
    if(this.socket.bufferedAmount>160000){this.emit('failure','Audio upload is falling behind. Restart on a stable connection.');return;}
    this.socket.send(JSON.stringify({realtimeInput:{audio:{data:pcm.toString('base64'),mimeType:'audio/pcm;rate=16000'}}}));
  }
  async finish(){
    if(this.stopped)return;
    for(const socket of this.sockets)if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({realtimeInput:{audioStreamEnd:true}}));
    await new Promise(resolve=>setTimeout(resolve,1800));
    this.stop();
  }
  stop(){this.stopped=true;this.ready=false;clearTimeout(this.renewTimer);for(const timer of this.closeTimers)clearTimeout(timer);this.closeTimers.clear();for(const socket of this.sockets){if(socket.readyState===WebSocket.CONNECTING)socket.terminate();else socket.close();}}
}
module.exports={Transcriber,sessionUpdate};
