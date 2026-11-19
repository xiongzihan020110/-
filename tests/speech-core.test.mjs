import {test} from 'node:test';import assert from 'node:assert/strict';
import {speechSignal,recognitionOptions} from '../dist/speech-core.js';
import {Segmenter,resample} from '../dist/core.js';
import {readFile} from 'node:fs/promises';import vm from 'node:vm';
test('silence, DC offset and seeded white noise do not enter recognition',()=>{
 let seed=13;const noise=Float32Array.from({length:64000},()=>{seed=(seed*1664525+1013904223)>>>0;return (seed/4294967296*2-1)*.003;});
 for(const audio of [new Float32Array(64000),new Float32Array(64000).fill(.02),noise]){assert.equal(speechSignal(audio).usable,false);const parts=[];const s=new Segmenter(p=>parts.push(p));for(let i=0;i<audio.length;i+=2048)s.push(audio.slice(i,i+2048));s.flush();assert.equal(parts.length,0);}
});
test('English-only Whisper does not receive an unsupported language token',()=>{assert.equal('language' in recognitionOptions('en-zh'),false);assert.equal(recognitionOptions('zh-en').language,'chinese');assert.equal('task' in recognitionOptions('en-zh'),false);assert.equal(recognitionOptions('zh-en').task,'transcribe');});
test('AudioWorklet preserves all input samples and mutes output',async()=>{
 let Processor;const messages=[];vm.runInNewContext(await readFile(new URL('../dist/audio-worklet.js',import.meta.url),'utf8'),{Float32Array,AudioWorkletProcessor:class{constructor(){this.port={postMessage:data=>messages.push(data)};}},registerProcessor:(name,type)=>Processor=type});
 const p=new Processor();const input=Float32Array.from({length:48000},(_,i)=>.1*Math.sin(2*Math.PI*440*i/48000));
 for(let i=0;i<input.length;i+=128){const output=new Float32Array(128).fill(1);p.process([[input.slice(i,i+128)]],[[output]]);assert.ok(output.every(x=>x===0));}p.port.onmessage({data:'flush'});
 const chunks=messages.filter(x=>x instanceof Float32Array),actual=new Float32Array(chunks.reduce((n,x)=>n+x.length,0));let offset=0;for(const c of chunks){actual.set(c,offset);offset+=c.length;}assert.deepEqual(actual,input);
 const downsampled=resample(actual,48000);assert.equal(downsampled.length,16000);let crossings=0;for(let i=1;i<downsampled.length;i++)if(downsampled[i]>=0&&downsampled[i-1]<0)crossings++;assert.ok(Math.abs(crossings-440)<=1,'sampling must preserve pitch');
});
