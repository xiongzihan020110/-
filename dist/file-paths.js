import { database } from './media-store.js';
let importDirectory,exportDirectory;
export const safeName=name=>{let result=String(name||'课堂').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,160);if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result))result='_'+result;return result||'课堂';};
async function remember(id,handle){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('preferences','readwrite');tx.objectStore('preferences').put({id,handle});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function read(id){const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('preferences').objectStore('preferences').get(id);req.onsuccess=()=>resolve(req.result?.handle);req.onerror=()=>reject(req.error);});}
export async function restoreDirectories(){importDirectory=await read('importDirectory');exportDirectory=await read('exportDirectory');return directoryNames();}
export function directoryNames(){return {import:importDirectory?.name||'每次选择文件',export:exportDirectory?.name||'每次另存为 / 浏览器下载目录'};}
export async function chooseDirectory(kind){if(!window.showDirectoryPicker)throw new Error('当前浏览器不支持固定目录，请使用 Windows Chrome / Edge；仍可每次选择文件或另存为');const handle=await window.showDirectoryPicker({id:`classbridge-${kind}`,mode:kind==='export'?'readwrite':'read'});if(kind==='export')exportDirectory=handle;else importDirectory=handle;await remember(`${kind}Directory`,handle);return directoryNames();}
export async function clearDirectories(){importDirectory=exportDirectory=undefined;await remember('importDirectory',null);await remember('exportDirectory',null);return directoryNames();}
export async function pickMediaFile(subtitles=false){if(!window.showOpenFilePicker)return null;const handles=await window.showOpenFilePicker({id:subtitles?'classbridge-subtitles':'classbridge-media',multiple:false,...(importDirectory?{startIn:importDirectory}:{}),types:subtitles?[{description:'字幕文件',accept:{'text/plain':['.srt','.vtt','.txt'],'application/json':['.json']}}]:[{description:'音视频文件',accept:{'audio/*':['.mp3','.wav','.m4a','.ogg','.flac'],'video/*':['.mp4','.webm','.mkv','.mov']}}]});return handles[0].getFile();}
export async function saveToDisk(blob,name){
  name=safeName(name);
  if(exportDirectory){let permission=await exportDirectory.queryPermission({mode:'readwrite'});if(permission!=='granted')permission=await exportDirectory.requestPermission({mode:'readwrite'});if(permission!=='granted')throw new Error('未获得导出目录写入权限，请重新选择目录');
    // New exports always get a unique name; previous files are never silently overwritten.
    const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,extension=dot>0?name.slice(dot):'';let target=name,index=1;while(true){try{await exportDirectory.getFileHandle(target);target=`${stem} (${index++})${extension}`;}catch(e){if(e.name==='NotFoundError')break;throw e;}}
    const handle=await exportDirectory.getFileHandle(target,{create:true}),writable=await handle.createWritable();try{await writable.write(blob);await writable.close();}catch(e){await writable.abort().catch(()=>{});throw e;}return `${exportDirectory.name}/${target}`;
  }
  if(window.showSaveFilePicker){const handle=await window.showSaveFilePicker({suggestedName:name});const writable=await handle.createWritable();try{await writable.write(blob);await writable.close();}catch(e){await writable.abort().catch(()=>{});throw e;}return handle.name;}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return '浏览器下载目录';
}
