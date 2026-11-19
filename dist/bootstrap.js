// Load the application only after the service worker for this release controls
// the document. This prevents new HTML from importing stale cached modules.
const workerUrl=new URL('./sw.js?v=0.4.5',location.href).href;
try{
 if('serviceWorker' in navigator&&navigator.serviceWorker.controller?.scriptURL!==workerUrl){
  document.getElementById('notice').textContent='正在更新程序，请稍候…';
  await navigator.serviceWorker.register(workerUrl);
  if(navigator.serviceWorker.controller?.scriptURL!==workerUrl)await new Promise((resolve,reject)=>{
   const changed=()=>{if(navigator.serviceWorker.controller?.scriptURL===workerUrl){clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();}};
   const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(new Error('更新尚未完成，请联网刷新页面'));},30000);
   navigator.serviceWorker.addEventListener('controllerchange',changed);changed();
  });
 }
 await import('./app.js');
 if(document.getElementById('notice').textContent==='正在更新程序，请稍候…')document.getElementById('notice').textContent='程序已更新。点击“免 Key 听课”准备语言包，然后开始听课。';
}catch(e){document.getElementById('notice').textContent=`程序未启动：${e.message}。请联网后刷新；课堂记录不会被清除。`;}
