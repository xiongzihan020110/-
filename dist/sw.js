const SHELL='classbridge-shell-v28',RUNTIME='classbridge-runtime-v1';
const FILES=['./','./index.html','./bootstrap.js?v=0.5.1','./startup.js?v=0.5.1','./style.css?v=0.5.1','./app.js?v=0.5.1','./workflow.js?v=0.5.1','./core.js?v=0.5.1','./speech-core.js?v=0.5.1','./caption-state.js?v=0.5.1','./capture-audio.js?v=0.5.1','./cloud-speech.js?v=0.5.1','./file-paths.js?v=0.5.1','./subtitles.js?v=0.5.1','./video-links.js?v=0.5.1','./media-core.js?v=0.5.1','./media-store.js?v=0.5.1','./media-library.js?v=0.5.1','./file-import.js?v=0.5.1','./browser-speech.js?v=0.5.1','./translation-api.js?v=0.5.1','./api-settings.js?v=0.5.1','./native-translation.js?v=0.5.1','./inference-worker.js?v=0.5.1','./audio-worklet.js?v=0.5.1','./manifest.webmanifest','./icon.svg','./sample.wav'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 try{const cache=await caches.open(SHELL);await Promise.allSettled(FILES.map(async file=>{const request=new Request(file,{cache:'reload'});const response=await fetch(request,{signal:AbortSignal.timeout(10000)});if(response.ok)await cache.put(request,response);}));}catch{}
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 try{const keys=await caches.keys();await Promise.allSettled(keys.filter(key=>key.startsWith('classbridge-shell-')&&key!==SHELL).map(key=>caches.delete(key)));}catch{}
 await self.clients.claim();
})()));
async function cached(request,cacheName=SHELL){try{return await(await caches.open(cacheName)).match(request);}catch{return undefined;}}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET')return;
 if(url.origin===self.location.origin){event.respondWith((async()=>{
  if(event.request.mode==='navigate'){try{return await fetch(event.request);}catch(error){const fallback=await cached('./index.html');if(fallback)return fallback;throw error;}}
  return await cached(event.request)||fetch(event.request);
 })());}
 else if(url.hostname==='cdn.jsdelivr.net'){event.respondWith((async()=>{const hit=await cached(event.request,RUNTIME);if(hit)return hit;const response=await fetch(event.request);if(response.ok)try{await(await caches.open(RUNTIME)).put(event.request,response.clone());}catch{}return response;})());}
});
