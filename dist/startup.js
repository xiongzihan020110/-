// Offline caching must never prevent the application from becoming interactive.
export function startApplication(loadApplication,prepareOfflineCache=()=>false){
 const application=Promise.resolve().then(loadApplication);
 void Promise.resolve().then(prepareOfflineCache).catch(()=>false);
 return application;
}
export function registerOfflineCache(serviceWorker,url){
 if(!serviceWorker?.register)return Promise.resolve(false);
 try{return Promise.resolve(serviceWorker.register(url)).then(()=>true,()=>false);}
 catch{return Promise.resolve(false);}
}
