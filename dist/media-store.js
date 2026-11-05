let opening;
export function database() {
  return opening ||= new Promise((resolve,reject)=>{
    const req=indexedDB.open('classbridge-library',2);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('sessions'))db.createObjectStore('sessions',{keyPath:'id'});if(!db.objectStoreNames.contains('assets')){const assets=db.createObjectStore('assets',{keyPath:'id'});assets.createIndex('sessionId','sessionId');}if(!db.objectStoreNames.contains('preferences'))db.createObjectStore('preferences',{keyPath:'id'});};
    req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();opening=null;};resolve(req.result);};req.onblocked=()=>{opening=null;reject(new Error('请关闭其他旧版听课桥标签页后重试，以升级本地课堂库'));};req.onerror=()=>{opening=null;reject(req.error);};
  });
}
async function transaction(store,mode,action){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);let result;const req=action(tx.objectStore(store));if(req)req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('本地存储已中断'));});}
export const saveSession = data => transaction('sessions','readwrite',s=>s.put(data));
export const getSession = id => transaction('sessions','readonly',s=>s.get(id));
export const listSessions = () => transaction('sessions','readonly',s=>s.getAll());
export const saveAsset = data => transaction('assets','readwrite',s=>s.put(data));
export const getAsset = id => transaction('assets','readonly',s=>s.get(id));
export const sessionAssets = sessionId => transaction('assets','readonly',s=>s.index('sessionId').getAll(sessionId));
export async function deleteSession(id){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(['sessions','assets'],'readwrite');tx.objectStore('sessions').delete(id);const cursor=tx.objectStore('assets').index('sessionId').openCursor(IDBKeyRange.only(id));cursor.onsuccess=()=>{const c=cursor.result;if(c){c.delete();c.continue();}};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
