export function externalPresentation({active=false,busy=false,working=false,captured=false,silent=false,error=false}={}){
 return {label:error?'连接失败':busy?'正在连接音频':active?(silent?'已连接 · 暂无声音':'实时翻译中'):working?'正在完成字幕':captured?'实时翻译已暂停':'尚未开始翻译',action:captured?'继续实时翻译':'开始实时翻译'};
}
export function recordingCovers(row,ranges=[]){
 let covered=row.start;
 for(const range of [...ranges].sort((a,b)=>a.start-b.start)){if(range.end<=covered)continue;if(range.start>covered+.02)return false;covered=Math.max(covered,range.end);if(covered>=row.end-.02)return true;}
 return false;
}
