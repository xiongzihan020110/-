import { saveAsset, sessionAssets, getAsset } from './media-store.js?v=0.5.2';
import { RATE, pcm16, wavHeader, joinPcmParts, toWav } from './media-core.js?v=0.5.2';
import { saveToDisk } from './file-paths.js?v=0.5.2';
const $=id=>document.getElementById(id);
let recordParts=[],recordLength=0,recordPosition=0,recordOffset=0,recordSession,saveChain=Promise.resolve(),storageFailure,recordEnabled=false;
let activePlayer=null;
let playerUrl,rangeEnd=0,loopRange=false,rangeStart=0,timelineOffset=0;
export async function beginRecording(sessionId,offset,enabled,onError){await finishRecording();recordSession=sessionId;recordOffset=offset;recordPosition=0;recordEnabled=enabled;storageFailure=onError;}
export function recordSamples(samples){if(!recordEnabled)return;recordParts.push(samples.slice());recordLength+=samples.length;if(recordLength>=RATE*5)flushRecording();}
function flushRecording(){if(!recordLength)return;const n=recordLength;const data=new Float32Array(n);let p=0;for(const part of recordParts){data.set(part,p);p+=part.length;}const start=recordOffset+recordPosition/RATE;recordPosition+=n;const asset={id:crypto.randomUUID(),sessionId:recordSession,kind:'pcm',start,end:recordOffset+recordPosition/RATE,blob:new Blob([pcm16(data)],{type:'application/octet-stream'})};recordParts=[];recordLength=0;saveChain=saveChain.then(()=>saveAsset(asset)).catch(e=>{recordEnabled=false;storageFailure?.(`录音保存失败：${e.message}。本地空间可能不足，请及时导出。`);});}
export async function finishRecording(){flushRecording();await saveChain;recordEnabled=false;}
export async function keepFile(file,sessionId){const asset={id:crypto.randomUUID(),sessionId,kind:'file',name:file.name,blob:file};await saveAsset(asset);return asset.id;}
function samplesOf(buffer){const v=new DataView(buffer),out=new Float32Array(buffer.byteLength/2);for(let i=0;i<out.length;i++)out[i]=v.getInt16(i*2,true)/32768;return out;}
export function stopPlayback(){activePlayer?.pause();$('practicePlayer')?.pause();$('recordingPlayer')?.pause();loopRange=false;}
export async function playRange(row,sessionId,options={}){
  await finishPending();stopPlayback();const player=options.player||$('practicePlayer');activePlayer=player;let blob;rangeStart=0;
  if(row.mediaId){const asset=await getAsset(row.mediaId);if(!asset)throw new Error('原始媒体文件不存在，请重新导入');blob=asset.blob;rangeStart=row.start;rangeEnd=row.end;timelineOffset=0;}
  else if($('continuousPlay')?.checked&&!options.clip){const recording=await recordingBlob(sessionId);blob=recording.blob;rangeStart=row.start;rangeEnd=row.end;timelineOffset=0;}
  else {const all=(await sessionAssets(sessionId)).filter(a=>a.kind==='pcm'&&a.end>row.start&&a.start<row.end).sort((a,b)=>a.start-b.start);if(!all.length)throw new Error('此句没有保存的录音。请在收音前开启“保留录音”');const parts=await Promise.all(all.map(async a=>({...a,samples:samplesOf(await a.blob.arrayBuffer())})));blob=toWav(joinPcmParts(parts,row.start,row.end));rangeEnd=row.end-row.start;timelineOffset=row.start;}
  if(playerUrl)URL.revokeObjectURL(playerUrl);playerUrl=URL.createObjectURL(blob);player.src=playerUrl;player.classList.toggle('audio-only',!blob.type.startsWith('video/'));player.playbackRate=Number($('playbackRate').value);loopRange=$('loopSentence').checked;
  await new Promise((resolve,reject)=>{player.onloadedmetadata=resolve;player.onerror=()=>reject(new Error('浏览器不支持播放该媒体格式'));player.load();});
  player.currentTime=rangeStart;if(options.autoplay!==false)await player.play();$('practiceLabel').textContent=`${options.autoplay===false?'录音已就绪':'正在精听'}：${row.original}`;
}
async function finishPending(){if(recordLength)flushRecording();await saveChain;}
export async function previewFile(id){stopPlayback();const asset=await getAsset(id);if(!asset)return;if(playerUrl)URL.revokeObjectURL(playerUrl);playerUrl=URL.createObjectURL(asset.blob);const p=$('practicePlayer');activePlayer=p;timelineOffset=0;rangeStart=0;rangeEnd=0;p.src=playerUrl;p.classList.toggle('audio-only',!asset.blob.type.startsWith('video/'));p.load();}
export function initializePlayer(){for(const id of ['practicePlayer','recordingPlayer']){const p=$(id);if(!p)continue;p.onplay=()=>{if(activePlayer&&activePlayer!==p)activePlayer.pause();activePlayer=p;loopRange=id==='recordingPlayer'?false:$('loopSentence').checked;};p.ontimeupdate=()=>{if(activePlayer!==p)return;document.dispatchEvent(new CustomEvent('classbridge-playback',{detail:{time:p.currentTime+timelineOffset}}));if(loopRange&&rangeEnd>0&&p.currentTime>=rangeEnd-.025){p.currentTime=rangeStart;p.play().catch(()=>{});}};p.onended=()=>{if(loopRange){p.currentTime=rangeStart;p.play().catch(()=>{});}};}$('playbackRate').onchange=()=>{const p=activePlayer||$('practicePlayer');p.playbackRate=Number($('playbackRate').value);};$('loopSentence').onchange=()=>loopRange=$('loopSentence').checked;$('stopPlayback').onclick=stopPlayback;}
export async function recordingBlob(sessionId){
  await finishPending();const all=(await sessionAssets(sessionId)).sort((a,b)=>a.start-b.start);
  const files=all.filter(a=>a.kind==='file');if(files.length)return{blob:files[0].blob,name:files[0].name};
  const parts=all.filter(a=>a.kind==='pcm');if(!parts.length)throw new Error('当前课堂没有保存的录音');
  let position=0;const data=[];for(const p of parts){const start=Math.round(p.start*RATE);if(start>position)data.push(new Uint8Array((start-position)*2));const skip=Math.max(0,position-start);data.push(p.blob.slice(skip*2));position=Math.max(position,Math.round(p.end*RATE));}
  if(position*2>0xffffffff-44)throw new Error('录音超过 WAV 大小上限，请分课堂保存');
  return{blob:new Blob([wavHeader(position),...data],{type:'audio/wav'}),name:'课堂录音.wav'};
}
export async function exportRecording(sessionId,name){const recording=await recordingBlob(sessionId);return saveToDisk(recording.blob,recording.name==='课堂录音.wav'?`${name||'课堂录音'}.wav`:recording.name);}
export function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
