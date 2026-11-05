export const RATE = 16000;
export function wavHeader(samples, rate = RATE) {
  const buffer = new ArrayBuffer(44); const v = new DataView(buffer);
  const text = (offset, str) => [...str].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
  text(0,'RIFF'); v.setUint32(4,36+samples*2,true); text(8,'WAVE'); text(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true); v.setUint32(24,rate,true); v.setUint32(28,rate*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); text(36,'data');v.setUint32(40,samples*2,true);return buffer;
}
export function pcm16(samples) { const out=new ArrayBuffer(samples.length*2);const view=new DataView(out);for(let i=0;i<samples.length;i++){const x=Math.max(-1,Math.min(1,samples[i]));view.setInt16(i*2,x<0?x*32768:x*32767,true);}return out; }
export function toWav(samples) {return new Blob([wavHeader(samples.length),pcm16(samples)],{type:'audio/wav'});}
export function joinPcmParts(parts,start,end) {
  const length=Math.max(0,Math.round((end-start)*RATE)); const out=new Float32Array(length);
  for(const part of parts){const from=Math.max(start,part.start),to=Math.min(end,part.end);if(to<=from)continue;const src=Math.round((from-part.start)*RATE),dest=Math.round((from-start)*RATE);const count=Math.min(Math.round((to-from)*RATE),part.samples.length-src,out.length-dest);if(count>0)out.set(part.samples.subarray(src,src+count),dest);}
  return out;
}
export function sentenceRanges(text,start,end) {
  const sentences=(text.match(/[^.!?。！？]+[.!?。！？]*\s*/g)||[text]).map(t=>t.trim()).filter(Boolean);
  const total=sentences.reduce((n,s)=>n+s.length,0)||1;let cursor=start;
  return sentences.map((original,i)=>{const next=i===sentences.length-1?end:cursor+(end-start)*original.length/total;const row={original,start:cursor,end:next,approximate:true};cursor=next;return row;});
}
