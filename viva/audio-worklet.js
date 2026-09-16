class PCMProcessor extends AudioWorkletProcessor {
  constructor(){super();this.samples=new Int16Array(1600);this.index=0;this.energy=0;}
  process(inputs){
    const channels=inputs[0];if(!channels?.length)return true;
    for(let i=0;i<channels[0].length;i++){
      let value=0;for(const channel of channels)value+=channel[i]||0;value/=channels.length;
      value=Math.max(-1,Math.min(1,value));this.energy+=value*value;
      this.samples[this.index++]=value<0?value*32768:value*32767;
      if(this.index===this.samples.length){
        this.port.postMessage({pcm:this.samples.buffer,level:Math.sqrt(this.energy/this.index)},[this.samples.buffer]);
        this.samples=new Int16Array(1600);this.index=0;this.energy=0;
      }
    }
    return true;
  }
}
registerProcessor('viva-pcm',PCMProcessor);
