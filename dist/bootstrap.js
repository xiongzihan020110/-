import {startApplication,registerOfflineCache} from './startup.js?v=0.5.2';
try{
 await startApplication(()=>import('./app.js?v=0.5.2'),()=>registerOfflineCache(navigator.serviceWorker,new URL('./sw.js?v=0.5.2',location.href).href));
}catch(e){document.getElementById('notice').textContent=`程序文件加载失败：${e.message}。请联网刷新页面；课堂记录不会被清除。`;}
