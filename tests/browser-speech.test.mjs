import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserSpeech} from '../dist/browser-speech.js';
test('browser disconnect preserves the last interim sentence exactly once',async()=>{
  let recognition;
  globalThis.window={SpeechRecognition:class {constructor(){recognition=this;}start(){}stop(){this.onend();}abort(){}}};
  const finals=[];let time=0;
  const speech=browserSpeech({language:'en-US',clock:()=>++time,onInterim(){},onFinal:r=>finals.push(r),onError:e=>{throw e;}});
  recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'A quiet sentence'}],{isFinal:false})]});
  await speech.stop();
  assert.equal(finals.length,1);assert.equal(finals[0].text,'A quiet sentence');
  recognition.onend();assert.equal(finals.length,1);
  delete globalThis.window;
});
test('a confirmed browser sentence is not emitted again on stop',async()=>{
  let recognition;
  globalThis.window={SpeechRecognition:class {constructor(){recognition=this;}start(){}stop(){this.onend();}abort(){}}};
  const finals=[];
  const speech=browserSpeech({language:'en-US',clock:()=>1,onInterim(){},onFinal:r=>finals.push(r),onError:e=>{throw e;}});
  recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'Hello'}],{isFinal:false})]});
  recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'Hello.'}],{isFinal:true})]});
  await speech.stop();assert.deepEqual(finals.map(r=>r.text),['Hello.']);delete globalThis.window;
});
