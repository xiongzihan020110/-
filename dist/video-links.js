export function parseVideoLink(input){
  const value=String(input||'').trim();let url;try{url=new URL(value);}catch{const match=value.match(/https?:\/\/[^\s，。]+/);if(match)try{url=new URL(match[0]);}catch{}}
  if(!url||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('请粘贴完整的 YouTube 或哔哩哔哩视频链接');
  const host=url.hostname.toLowerCase().replace(/^www\./,''),parts=url.pathname.split('/').filter(Boolean);let id,provider;
  if(host==='youtu.be'){id=parts[0];provider='youtube';}
  else if(['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)){provider='youtube';id=url.searchParams.get('v')||(['embed','shorts','live'].includes(parts[0])?parts[1]:'');}
  else if(['bilibili.com','m.bilibili.com','player.bilibili.com'].includes(host)){provider='bilibili';id=parts.find(p=>/^BV[a-zA-Z0-9]{10}$/.test(p))||url.searchParams.get('bvid');if(!id){const aid=parts.find(p=>/^av\d+$/i.test(p))||url.searchParams.get('aid');if(aid)id=`av${String(aid).replace(/^av/i,'')}`;}}
  else if(host==='b23.tv')throw new Error('这是哔站短链接。请先在浏览器打开它，再复制展开后的 bilibili.com/video/BV… 完整地址');
  if(provider==='youtube'&&/^[a-zA-Z0-9_-]{11}$/.test(id||''))return {provider,id,title:`YouTube · ${id}`,url:`https://www.youtube.com/watch?v=${id}&t=${parseStart(url.searchParams.get('t')||url.searchParams.get('start'))}`,embed:`https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1`,start:parseStart(url.searchParams.get('t')||url.searchParams.get('start'))};
  if(provider==='bilibili'&&(/^(BV[a-zA-Z0-9]{10}|av\d+)$/.test(id||''))){const query=new URLSearchParams({autoplay:'0',danmaku:'0',p:String(Math.max(1,Number(url.searchParams.get('p'))||1)),t:String(parseStart(url.searchParams.get('t')))});query.set(id.startsWith('BV')?'bvid':'aid',id.startsWith('BV')?id:id.slice(2));return{provider,id,title:`哔哩哔哩 · ${id}`,url:`https://www.bilibili.com/video/${id}?p=${query.get('p')}&t=${query.get('t')}`,embed:`https://player.bilibili.com/player.html?${query}`,start:parseStart(url.searchParams.get('t'))};}
  throw new Error('无法识别视频 ID。支持 YouTube watch / shorts / youtu.be 和哔站 BV / av 完整链接');
}
function parseStart(value){if(!value)return 0;if(/^\d+$/.test(value))return Math.min(86400,Number(value));const h=Number(value.match(/(\d+)h/)?.[1]||0),m=Number(value.match(/(\d+)m/)?.[1]||0),s=Number(value.match(/(\d+)s/)?.[1]||0);return Math.min(86400,h*3600+m*60+s);}
let current=null;
export const currentVideoLink=()=>current;
export function openVideoLink(link){current=link;const frame=document.getElementById('networkPlayer');frame.src=link.provider==='youtube'?`${link.embed}&origin=${encodeURIComponent(location.origin)}&start=${link.start}`:link.embed;frame.hidden=false;document.getElementById('videoStage').classList.add('network-active');document.getElementById('stagePlaceholder').hidden=true;}
export function closeVideoLink(){current=null;const frame=document.getElementById('networkPlayer');frame.src='about:blank';frame.hidden=true;document.getElementById('videoStage').classList.remove('network-active');}

export function requestNetworkPlayback(){if(!current)return;const frame=document.getElementById('networkPlayer'),url=new URL(frame.src);url.searchParams.set('autoplay','1');frame.src=url.href;}
