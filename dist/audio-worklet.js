class CaptureProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(2048); this.offset = 0; this.port.onmessage=({data})=>{if(data==='flush'){if(this.offset){const tail=this.buffer.slice(0,this.offset);this.port.postMessage(tail,[tail.buffer]);this.offset=0;}this.port.postMessage({flushed:true});}}; }
  process(inputs, outputs) {
    const channels = inputs[0];
    if (channels?.length) {
      for (let i = 0; i < channels[0].length; i++) {
        let sample = 0; for (const channel of channels) sample += channel[i] / channels.length;
        this.buffer[this.offset++] = sample;
        if (this.offset === this.buffer.length) { this.port.postMessage(this.buffer, [this.buffer.buffer]); this.buffer = new Float32Array(2048); this.offset = 0; }
      }
    }
    for (const output of outputs) for (const channel of output) channel.fill(0);
    return true;
  }
}
registerProcessor('classbridge-capture', CaptureProcessor);
