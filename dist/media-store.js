let opening;
export function database() {
  return opening ||= new Promise((resolve,reject)=>{
    const req=indexedDB.open('classbridge-library',1);
    req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('sessions',{keyPath:'id'});const assets=db.createObjectStore('assets',{keyPath:'id'});assets.createIndex('sessionId','sessionId');};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>{opening=null;reject(req.error);};
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
