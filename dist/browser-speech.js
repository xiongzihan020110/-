export function speechSupported(){return !!(window.SpeechRecognition||window.webkitSpeechRecognition);}
export function browserSpeech({language,onInterim,onFinal,onError,clock}){
  const Constructor=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Constructor)throw new Error('此浏览器不支持在线语音识别，请选择本地识别');
  let stopped=false,last=clock(),restarts=0,finish,pendingDraft='';const recognition=new Constructor();recognition.lang=language;recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
  recognition.onresult=event=>{restarts=0;let draft='';for(let i=event.resultIndex;i<event.results.length;i++){const result=event.results[i];if(result.isFinal){const end=clock();onFinal({text:result[0].transcript,start:last,end});last=end;}else draft+=result[0].transcript;}pendingDraft=draft;onInterim(draft);};
  recognition.onerror=event=>{if(event.error==='no-speech'||event.error==='aborted')return;stopped=true;onError(new Error(`浏览器语音识别失败：${event.error}。可切回本地识别；不会自动上传到其他服务。`));};
  const flushDraft=()=>{if(pendingDraft.trim()){const end=clock();onFinal({text:pendingDraft.trim(),start:last,end,provisional:true});last=end;pendingDraft='';onInterim('');}};
  recognition.onend=()=>{flushDraft();if(stopped){finish?.();return;}if(++restarts>3){stopped=true;onError(new Error('在线识别连续断开，请检查网络或切换本地识别'));return;}setTimeout(()=>{if(!stopped)try{recognition.start();}catch(e){onError(e);}},250);};
  recognition.start();return{stop(){stopped=true;return new Promise(resolve=>{const timer=setTimeout(()=>{flushDraft();resolve();},1500);finish=()=>{clearTimeout(timer);resolve();};try{recognition.stop();}catch{finish();}});},abort(){stopped=true;recognition.abort();onInterim('');}};
}
