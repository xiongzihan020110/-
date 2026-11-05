import { resample } from './core.js';
const RATE=16000;
const aborted=signal=>{if(signal.aborted)throw new DOMException('已取消导入','AbortError');};
export async function processFile(file,onAudio,onProgress,signal,options={}){
  let ctx;const url=URL.createObjectURL(file);const media=document.createElement('video');media.preload='metadata';media.src=url;media.playsInline=true;
  try{
    await new Promise((resolve,reject)=>{const abort=()=>done(new DOMException('已取消导入','AbortError'));const timer=setTimeout(()=>done(new Error('读取媒体超时，请检查文件是否完整')),30000);function done(error){clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve();}signal.addEventListener('abort',abort,{once:true});media.onloadedmetadata=()=>done();media.onerror=()=>done(new Error('浏览器无法读取此音视频格式。请转换为 MP3、WAV 或 MP4（AAC 音轨）后重试'));if(signal.aborted)abort();});aborted(signal);
    let duration=media.duration;
    onProgress(0,Number.isFinite(duration)?duration:0,'读取媒体');
    ctx=new AudioContext({sampleRate:RATE});
    if(!options.stream&&file.size<=100*1024*1024&&(!Number.isFinite(duration)||duration<=900)){
      let decoded;try{decoded=await ctx.decodeAudioData(await file.arrayBuffer());}catch{/* Some video containers require native media playback below. */}
      if(decoded){
        duration=decoded.duration;
        const mono=new Float32Array(decoded.length);for(let c=0;c<decoded.numberOfChannels;c++){const channel=decoded.getChannelData(c);for(let i=0;i<mono.length;i++)mono[i]+=channel[i]/decoded.numberOfChannels;}
        const samples=resample(mono,decoded.sampleRate);const count=Math.ceil(samples.length/(RATE*15));const chunk=Math.ceil(samples.length/count);
        for(let i=0;i<samples.length;i+=chunk){aborted(signal);const audio=samples.slice(i,i+chunk);let energy=0;for(const x of audio)energy+=x*x;if(Math.sqrt(energy/audio.length)>.002)await onAudio({audio,start:i/RATE,end:Math.min(samples.length,i+chunk)/RATE});onProgress(Math.min(samples.length,i+chunk)/RATE,duration,'本机快速处理');}
        return;
      }
    }
    if(!Number.isFinite(duration)||duration<=0)throw new Error('无法读取媒体时长，请将文件转换为有完整时长信息的 MP4 或 WAV');
    // Streaming fallback bounds decoded memory and supports playable video containers.
    onProgress(0,duration,'流式读取（按播放速度处理）');await ctx.audioWorklet.addModule('./audio-worklet.js');
    const node=new AudioWorkletNode(ctx,'classbridge-capture'),source=ctx.createMediaElementSource(media);source.connect(node);node.connect(ctx.destination);await ctx.resume();
    let parts=[],length=0,position=0,chain=Promise.resolve(),failed;
    const flush=()=>{if(!length)return;const audio=new Float32Array(length);let p=0;for(const part of parts){audio.set(part,p);p+=part.length;}const start=position/RATE;position+=length;parts=[];length=0;chain=chain.then(async()=>{aborted(signal);await onAudio({audio,start,end:Math.min(duration,position/RATE),approximate:true});onProgress(Math.min(duration,position/RATE),duration,'流式读取');}).catch(e=>{failed=e;media.pause();});};
    await new Promise((resolve,reject)=>{
      let processing=false;const abort=()=>{media.pause();reject(new DOMException('已取消导入','AbortError'));};signal.addEventListener('abort',abort,{once:true});
      node.port.onmessage=async({data})=>{if(processing||media.paused||signal.aborted)return;const audio=resample(data,ctx.sampleRate);parts.push(audio);length+=audio.length;if(length>=RATE*10){processing=true;media.pause();flush();await chain;if(failed){signal.removeEventListener('abort',abort);reject(failed);return;}processing=false;media.play().catch(reject);}};
      media.onended=async()=>{flush();await chain;signal.removeEventListener('abort',abort);failed?reject(failed):resolve();};media.onerror=()=>reject(new Error('媒体解码失败'));media.play().catch(reject);
    });
    node.disconnect();source.disconnect();
  }finally{media.pause();media.removeAttribute('src');media.load();URL.revokeObjectURL(url);await ctx?.close().catch(()=>{});}
}
