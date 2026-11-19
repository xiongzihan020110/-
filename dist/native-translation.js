const sessions=new WeakMap();
export function nativePrepared(direction,host=globalThis){return !!sessions.get(host)?.has(direction);}
const unsupported='当前浏览器不支持内置翻译。请使用最新版桌面 Chrome；不会自动调用收费服务。';
function options(direction){if(direction==='en-zh')return {sourceLanguage:'en',targetLanguage:'zh'};if(direction==='zh-en')return {sourceLanguage:'zh',targetLanguage:'en'};throw new Error('不支持的翻译方向');}
export async function nativeAvailability(direction,host=globalThis){const pair=options(direction);if(!host.Translator?.create||!host.Translator?.availability)return 'unsupported';try{return await host.Translator.availability(pair);}catch{return 'unavailable';}}
export function prepareNative(direction,onProgress=()=>{},host=globalThis){
 const pair=options(direction);if(!host.Translator?.create)return Promise.reject(new Error(unsupported));
 let cache=sessions.get(host);if(!cache){cache=new Map();sessions.set(host,cache);}if(cache.has(direction))return cache.get(direction);
 let creation;
 // Invoke create in the click handler, before awaiting anything: language-pack downloads need user activation.
 try{creation=host.Translator.create({...pair,monitor(m){m.addEventListener('downloadprogress',e=>onProgress(Math.round(e.loaded*100)));}});}catch(e){creation=Promise.reject(e);}
 const pending=Promise.resolve(creation).then(translator=>{if(typeof translator?.translate!=='function')throw Error('浏览器没有返回可用的翻译器');return translator;}).catch(e=>{cache.delete(direction);throw new Error(e.name==='NotAllowedError'?'请点击“开始翻译”，或在翻译服务设置中点击“测试并使用”准备语言包。':`${unsupported} ${e.message||''}`);});
 cache.set(direction,pending);return pending;
}
export async function translateNative(text,direction,host=globalThis){options(direction);const pending=sessions.get(host)?.get(direction);if(!pending)throw new Error('免费免 Key 翻译尚未准备好。请点击“开始翻译”，或在设置中准备当前方向的语言包。');const translator=await pending;const output=await translator.translate(text);if(typeof output!=='string'||!output.trim())throw new Error('浏览器未返回有效译文');return output.trim();}
