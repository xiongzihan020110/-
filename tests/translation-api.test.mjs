import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endpointFor, normalizeConfig, validateConfig, translateOnline } from '../dist/translation-api.js';
const response = data => new Response(JSON.stringify(data), { status:200, headers:{'Content-Type':'application/json'} });
test('normalizes protocol paths and rejects secrets in URLs', () => {
  assert.equal(endpointFor({provider:'compatible',baseUrl:'https://example.com/v1/'}),'https://example.com/v1/chat/completions');
  assert.equal(endpointFor({provider:'compatible',baseUrl:'https://example.com/v1/chat/completions'}),'https://example.com/v1/chat/completions');
  assert.equal(endpointFor({provider:'libretranslate',baseUrl:'http://localhost:5000'}),'http://localhost:5000/translate');
  for(const baseUrl of ['https://user:secret@example.com','https://example.com?key=secret','http://example.com','javascript:alert(1)']) assert.throws(()=>endpointFor({provider:'compatible',baseUrl}));
});
test('persistable configuration discards secrets', () => {
  const config = normalizeConfig({provider:'compatible',baseUrl:'https://example.com/v1',model:'model',apiKey:'secret',timeout:999});
  assert.equal(JSON.stringify(config).includes('secret'),false); assert.equal(config.timeout,120);
  assert.throws(()=>validateConfig({provider:'compatible',baseUrl:'https://example.com/v1'}),/模型/);
});
test('chat API uses selected endpoint, key and translation direction', async () => {
  let call;
  const text = await translateOnline('你好','zh-en',{provider:'compatible',baseUrl:'https://example.com/v1',model:'my-model'},'temporary-key',async(url, options)=>{call={url,options};return response({choices:[{message:{content:'Hello'}}]});});
  assert.equal(text,'Hello');assert.equal(call.url,'https://example.com/v1/chat/completions');assert.equal(call.options.headers.Authorization,'Bearer temporary-key');
  const body=JSON.parse(call.options.body);assert.equal(body.model,'my-model');assert.match(body.messages[0].content,/Chinese into English/);assert.equal(body.messages[1].content,'你好');assert.equal(body.stream,false);
  assert.equal(call.options.redirect,'error');assert.equal(call.options.credentials,'omit');
});
test('LibreTranslate uses language codes and JSON API key',async()=>{
  let body;const text=await translateOnline('Hello','en-zh',{provider:'libretranslate',baseUrl:'https://example.com'},'key',async(url, options)=>{assert.equal(url,'https://example.com/translate');body=JSON.parse(options.body);return response({translatedText:'你好'});});
  assert.equal(text,'你好');assert.deepEqual(body,{q:'Hello',source:'en',target:'zh',format:'text',api_key:'key'});
});
test('MyMemory chunks UTF-8 input without exceeding its byte limit',async()=>{
  const parts=[];await translateOnline('中文课堂'.repeat(100),'zh-en',{provider:'mymemory'},'',async url=>{const parsed=new URL(url);parts.push(parsed.searchParams.get('q'));assert.ok(new TextEncoder().encode(parts.at(-1)).length<=480);assert.equal(parsed.searchParams.get('langpair'),'zh|en');return response({responseStatus:200,responseData:{translatedText:'class'}});});
  assert.equal(parts.join(''),'中文课堂'.repeat(100));
});
test('API failures redact key and never silently switch providers',async()=>{
  let calls=0;await assert.rejects(translateOnline('test','en-zh',{provider:'compatible',baseUrl:'https://example.com',model:'model'},'test-secret',async()=>{calls++;return new Response(JSON.stringify({error:{message:'Invalid test-secret'}}),{status:401});}),error=>!error.message.includes('test-secret')&&error.message.includes('401'));
  assert.equal(calls,1);
});
test('quota failures, malformed responses and network failures remain visible',async()=>{
  await assert.rejects(translateOnline('test','en-zh',{provider:'mymemory'},'',async()=>response({responseStatus:403,quotaFinished:true})),/额度/);
  await assert.rejects(translateOnline('test','en-zh',{provider:'deepseek'},'',async()=>response({choices:[]})),/有效译文/);
  await assert.rejects(translateOnline('test','en-zh',{provider:'deepseek'},'',async()=>{throw new TypeError('Failed to fetch');}),/CORS/);
});
