export function parseClock(value){const normalized=String(value).trim().replace(',','.');const parts=normalized.split(':').map(Number);if(parts.length<2||parts.length>3||parts.some(n=>!Number.isFinite(n)||n<0))throw new Error('字幕时间格式不正确');return parts.reduce((n,p)=>n*60+p,0);}
export function parseSubtitles(text,extension='srt'){
  let rows=[];text=String(text).replace(/^\uFEFF/,'').replace(/\r/g,'');
  if(extension.toLowerCase()==='json'){const data=JSON.parse(text);rows=Array.isArray(data)?data:data.rows;if(!Array.isArray(rows))throw new Error('JSON 中没有字幕 rows');}
  else if(extension.toLowerCase()==='txt'){
    const parts=[...text.matchAll(/\[(\d+(?::\d+){1,2}(?:[.,]\d+)?)\]\s*\n([\s\S]*?)(?=\n\[\d+(?::\d+){1,2}|$)/g)];rows=parts.map((part,i)=>{const lines=part[2].trim().split('\n');const start=parseClock(part[1]);return{start,end:i+1<parts.length?parseClock(parts[i+1][1]):start+5,original:lines[0],translation:lines.slice(1).join('\n'),approximate:true};});
  }else{
    for(const block of text.split(/\n\s*\n/)){const lines=block.trim().split('\n');const index=lines.findIndex(line=>line.includes('-->'));if(index<0)continue;const times=lines[index].split('-->');const body=lines.slice(index+1).map(line=>line.replace(/<[^>]*>/g,'')).filter(Boolean);if(!body.length)continue;const firstChinese=/[\u3400-\u9fff]/.test(body[0]);let split=body.findIndex((line,i)=>i>0&&/[\u3400-\u9fff]/.test(line)!==firstChinese);if(split<0)split=body.length;rows.push({start:parseClock(times[0]),end:parseClock(times[1].trim().split(/\s/)[0]),original:body.slice(0,split).join('\n'),translation:body.slice(split).join('\n')});}
  }
  if(!rows.length)throw new Error('没有找到有效字幕。支持 SRT、VTT、JSON 和本软件导出的 TXT');if(rows.length>10000)throw new Error('字幕超过 10000 句，请先分段');
  return rows.map(r=>{if(!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.start<0||r.end<=r.start||typeof r.original!=='string')throw new Error('字幕包含无效时间或原文');return {start:r.start,end:r.end,original:r.original.slice(0,20000),translation:typeof r.translation==='string'?r.translation.slice(0,20000):'',approximate:!!r.approximate};}).sort((a,b)=>a.start-b.start);
}
