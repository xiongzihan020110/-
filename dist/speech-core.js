// This is a conservative signal gate, not a claim that energy proves human speech.
// Reject DC, silence and high-frequency random noise before invoking Whisper.
export function speechSignal(samples,rate=16000){
  if(!samples?.length)return {rms:0,voicedSeconds:0,usable:false};
  let total=0,voiced=0;const frame=Math.round(rate*.02);
  for(let from=0;from<samples.length;from+=frame){const end=Math.min(samples.length,from+frame),n=end-from;let mean=0;for(let i=from;i<end;i++)mean+=samples[i];mean/=n;let energy=0,crossings=0,previous=samples[from]-mean;for(let i=from;i<end;i++){const x=samples[i]-mean;energy+=x*x;if(i>from&&(x>=0)!==(previous>=0))crossings++;previous=x;}total+=energy;const rms=Math.sqrt(energy/n),zcr=crossings/n;if(rms>.0015&&zcr>=.005&&zcr<.38)voiced+=n;}
  const voicedSeconds=voiced/rate;
  return {rms:Math.sqrt(total/samples.length),voicedSeconds,usable:voicedSeconds>=.2};
}
export function recognitionOptions(direction,timestamps=true){return {...(direction==='en-zh'?{}:{language:'chinese',task:'transcribe'}),return_timestamps:timestamps,max_new_tokens:224};}
