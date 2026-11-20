// Manual browser regression: the service-worker script is intentionally stalled
// for 45 seconds. The page must become interactive without waiting for it.
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {resolve,sep,extname} from 'node:path';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/sw.js'){const timer=setTimeout(()=>res.writeHead(503).end('Intentional cache-worker failure'),45000);res.on('close',()=>clearTimeout(timer));return;}
 try{const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}
}).listen(4175,'127.0.0.1',()=>console.log('Fault test: http://127.0.0.1:4175/ (cache worker delayed 45 seconds)'));
