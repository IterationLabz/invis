'use strict';
const fs=require('node:fs');
function header(bytes) {
  const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(bytes+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(16000,24);h.writeUInt32LE(32000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(bytes,40);return h;
}
class Recording {
  constructor(file) { this.fd=fs.openSync(file,'wx',0o600);this.bytes=0;fs.writeSync(this.fd,header(0)); }
  append(pcm) {
    if(this.fd===null) return;
    const data=Buffer.from(pcm);
    if(!data.length||data.length%2||data.length>16000) throw new Error('Invalid audio packet.');
    if(this.bytes+data.length>1024*1024*1024) throw new Error('Recording limit reached. Start a new recording.');
    fs.writeSync(this.fd,data);this.bytes+=data.length;
    // Keep a recoverable WAV header even if the process exits unexpectedly.
    fs.writeSync(this.fd,header(this.bytes),0,44,0);
  }
  close() { if(this.fd!==null) {fs.closeSync(this.fd);this.fd=null;} return this.bytes/32000; }
}
module.exports={Recording,header};
