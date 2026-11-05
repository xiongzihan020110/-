import { Segmenter, resample, stamp, toSrt } from './core.js';
import { translateOnline, validateConfig } from './translation-api.js';
import { getOnlineConfig, getApiKey, apiLabel, onlineHint, initializeApiSettings } from './api-settings.js';
import { saveSession, getSession, listSessions, sessionAssets } from './media-store.js';
import { beginRecording, recordSamples, finishRecording, playRange, initializePlayer, exportRecording, keepFile, stopPlayback,previewFile } from './media-library.js';
import { sentenceRanges } from './media-core.js';
import { processFile } from './file-import.js';
import { browserSpeech, speechSupported } from './browser-speech.js';
import { restoreDirectories,directoryNames,chooseDirectory,clearDirectories,pickMediaFile,saveToDisk } from './file-paths.js';
import { parseSubtitles } from './subtitles.js';
import { cloudConfig,validateCloud,saveCloud,clearCloudKey,recognizeCloud } from './cloud-speech.js';
import { parseVideoLink,openVideoLink,closeVideoLink,currentVideoLink } from './video-links.js';
const $ = id => document.getElementById(id);
const KEY = 'classbridge-session-v1';
let rows = [], elapsed = 0, active = false, initializing = false, preparing = false, draining = false;
let stream, context, capture, segmenter, startClock, offset = 0, sequence = 0, queue = [], workers = new Map();
let liveSource, runDirection, runMode, runApiConfig, pending = new Map(), requestId = 0, fontSize = 23;
let modelReady = new Set();
let sessionId=crypto.randomUUID(),createdAt=Date.now(),persistChain=Promise.resolve(),importing=false,importAbort,speech,runEngine,translationQueue=[],translationRunning=0,liveDraft='',lastLatency=0,stopping=false,flushCapture;
let sourceLink=null;
let selectedRowId=null,draftTranslation='',draftTimer,draftRequest=false,draftEpoch=0,lastDraftSent='';
try { const data = JSON.parse(localStorage.getItem(KEY) || '{}'); rows = (data.rows || []).filter(r => r && typeof r.original === 'string' && Number.isFinite(r.start) && Number.isFinite(r.end)).slice(-5000); elapsed = Number.isFinite(data.elapsed) ? data.elapsed : 0; if (typeof data.course === 'string') $('course').value = data.course; for (const r of rows) if (r.state === 'pending') { r.state = 'failed'; r.error = '上次处理已中断，可重试翻译'; } } catch { /* A corrupt record must not prevent starting a new class. */ }
function notify(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');if(saved.sessionId)sessionId=saved.sessionId;if(saved.createdAt)createdAt=saved.createdAt;if(typeof saved.sourceLink==='string')sourceLink=saved.sourceLink;}catch{}
sequence=Math.max(0,...rows.map(r=>Number(r.id)||0));
function save() { const data={id:sessionId,sessionId,createdAt,updatedAt:Date.now(),rows:rows.filter(r=>!r.demo),elapsed,course:$('course').value,sourceLink};try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { notify('浏览器存储空间不足，请导出当前课堂记录。', true); } const snapshot=structuredClone(data);persistChain=persistChain.then(()=>saveSession(snapshot)).catch(e=>notify(`课堂本地保存失败：${e.message}`,true)); }
function currentKey() { return `${$('mode').value}:${$('direction').value}`; }
function controls() {
  const busy = initializing || preparing; const working=draining||translationRunning>0||translationQueue.length>0; const locked = active || busy || working || importing||stopping;
  for (const id of ['onlineTab','offlineTab','direction','source','device','prepare','newSession','demo','testAudio','apiSettings','engine','latency','keepRecording','importFile','loadSession','savedSessions','previewTranslation','loadVideoLink','recognizeLink','importSubtitleButton','fastRealtime','localSpeedTest','saveCloudConfig','clearCloudKey','cloudUrl','cloudModel','cloudKey']) $(id).disabled = locked;
  $('start').disabled = busy || importing || (working && !active);
  $('start').textContent = busy ? '正在准备…' : active ? '■ 暂停听课' : working ? '处理剩余字幕…' : '● 开始听课';
  $('statusDot').classList.toggle('on', active);
  $('captureState').textContent = importing ? '导入处理' : active ? '正在收音' : working ? '处理字幕' : '准备就绪';
  $('modelState').textContent = busy ? '准备中' : modelReady.has(currentKey()) ? '已就绪' : '待准备';
  $('device').disabled = locked || $('source').value === 'system'||$('engine').value==='browser';
  $('cancelImport').hidden=!importing;
  $('liveDraft').textContent=liveDraft;
  for(const id of ['playPause','previousSentence','nextSentence','seekBar'])$(id).disabled=active||importing||((id==='playPause'||id==='seekBar')&&!!currentVideoLink());
  $('stagePlaceholder').hidden=!!$('practicePlayer').getAttribute('src')||active||!!currentVideoLink();const fileMode=rows.some(r=>r.mediaId);$('historyNav').classList.toggle('active',fileMode);$('liveNav').classList.toggle('active',!fileMode);$('practicePlayer').controls=!active&&!importing;
  $('pipelineState').textContent=`识别待处理 ${queue.length} · 翻译待处理 ${translationQueue.length+translationRunning}${lastLatency?` · 最近一段识别 ${lastLatency.toFixed(1)}s`:''}`;
}
function render() {
  const container = $('captions'); container.replaceChildren();
  if (!rows.length) { container.append(emptyTemplate.cloneNode(true)); }
  const query=$('subtitleSearch').value.toLowerCase().trim();
  for (const [index,r] of rows.entries()) {
    if(query&&!`${r.original} ${r.translation||''}`.toLowerCase().includes(query))continue;
    const row = document.createElement('article'); row.className = 'caption-row';
    row.dataset.rowId=r.id;row.tabIndex=0;row.onclick=e=>{if(!e.target.closest('button'))void selectSentence(r);};row.onkeydown=e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();void selectSentence(r);}};
    const meta = document.createElement('div'); meta.className = 'row-meta';
    const time = document.createElement('span'); time.textContent = `${index+1} · ${stamp(r.start)}`;
    const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = r.demo ? '示例 · 非实时' : r.mode === 'offline' ? '本地离线' : '在线翻译';
    meta.append(time, tag);
    const original = document.createElement('p'); original.className = 'original'; original.textContent = r.original || '正在识别这一段语音…';
    const translated = document.createElement('p'); translated.className = `translation${r.state === 'failed' ? ' failed' : ''}`; translated.textContent = r.translation || (r.state === 'failed' ? `翻译未完成：${r.error || '请重试'}` : '正在翻译…');
    row.append(meta, original, translated);
    if(r.original&&!r.demo){const actions=document.createElement('div');actions.className='sentence-actions';const play=document.createElement('button');play.className='retry';play.textContent='▶ 逐句精听';play.disabled=active||importing;play.onclick=()=>selectSentence(r);actions.append(play);if(r.approximate){const note=document.createElement('span');note.textContent='时间约';actions.append(note);}row.append(actions);}
    if (r.state === 'failed' && r.original&&!r.unrecognized) { const retry = document.createElement('button'); retry.className = 'retry'; retry.textContent = '↻ 重试翻译'; retry.disabled = active || initializing || preparing || draining||importing||translationRunning>0; retry.onclick = () => retryRow(r); row.append(retry); }
    container.append(row);
  }
  $('recordCount').textContent = rows.filter(r => !r.demo && r.original).length;
  $('recordSummary').textContent = rows.some(r => r.demo) ? '当前为示例测试，不会保存或加入课堂导出。' : rows.length ? `${rows.filter(r => !r.demo && r.original).length} 段课堂字幕 · 已在本机自动保存` : '字幕会自动保存，课后也能继续回顾。';
  $('timer').textContent = stamp(elapsed);
  updateSelection();if ($('follow').checked&&$('practicePlayer').paused) container.scrollTop = container.scrollHeight;
}
function updateSelection(){const selected=rows.find(r=>String(r.id)===String(selectedRowId));for(const element of $('captions').querySelectorAll('.caption-row'))element.classList.toggle('active-row',element.dataset.rowId===String(selectedRowId));$('overlayOriginal').textContent=active&&liveDraft?liveDraft:selected?.original||'';$('overlayTranslation').textContent=active&&liveDraft?draftTranslation:selected?.translation||'';}
async function selectSentence(row){if(active||importing)return;if(currentVideoLink()){closeVideoLink();controls();}selectedRowId=row.id;updateSelection();try{await playRange(row,sessionId);}catch(e){notify(e.message,true);}}
const emptyTemplate = $('empty').cloneNode(true);
function getWorker(role='asr') {
  if (!workers.has(role)) {
    const worker = new Worker('./inference-worker.js', { type: 'module' });workers.set(role,worker);
    worker.onmessage = ({ data }) => {
      const task = pending.get(data.id); if (!task) return;
      if (data.type === 'progress') { $('progress').hidden = false; if (Number.isFinite(data.progress)) { $('progress').value = data.progress; $('progress').max = 100; } else $('progress').removeAttribute('value'); $('modelInfo').textContent = `${data.file || '加载模型'}${Number.isFinite(data.progress) ? ` · ${Math.round(data.progress)}%` : ''}`; return; }
      pending.delete(data.id); clearTimeout(task.timer);
      if (data.type === 'error') task.reject(new Error(data.error)); else task.resolve(data.result);
    };
    worker.onerror = event => { event.preventDefault(); resetWorker(new Error('模型运行失败，请检查网络、浏览器内存后重新准备。')); };
  }
  return workers.get(role);
}
function resetWorker(error) { for(const worker of workers.values())worker.terminate();workers.clear(); for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); } pending.clear(); modelReady.clear(); }
function model(action, data = {}, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = ++requestId; const role=action==='translate'||data.role==='translation'?'translation':'asr';const w = getWorker(role);
    const timer = setTimeout(() => resetWorker(new Error('模型处理超时，请检查下载连接或换用性能更好的设备。')), action === 'init' ? 20 * 60 * 1000 : 3 * 60 * 1000);
    pending.set(id, { resolve, reject, timer }); w.postMessage({ id, action, ...data }, transfer);
  });
}
async function cacheShell() {
  if (!('serviceWorker' in navigator)) throw new Error('浏览器不支持离线缓存，请使用 Chrome 或 Edge。');
  await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('离线缓存尚未接管页面，请刷新后再试。')), 10000); navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, { once: true }); });
}
async function prepare(download = true) {
  await cacheShell();
  const offline = $('mode').value === 'offline'; const direction = $('direction').value;
  notify(download ? '正在准备语音识别和翻译模型。请保持页面打开；首次下载可能需要数分钟。' : '正在从本机缓存加载模型…');
  const tasks=[model('init', { direction, offline:false, download,role:'asr' })];if(offline)tasks.push(model('init',{direction,offline:true,download,role:'translation'}));await Promise.all(tasks);
  modelReady.clear(); modelReady.add(currentKey());
  $('progress').hidden = true;
  $('modelInfo').textContent = offline ? '识别与当前方向翻译模型已加载。请断网试用一次，确认缓存完整。' : '本地语音识别已就绪。在线翻译需要联网。';
  notify(offline ? '离线模型已准备好。可以开始听课，音频和文字均在本机处理。' : `准备完成。音频在本机识别，文字将发送至 ${apiLabel()} 翻译。`);
  if (download) navigator.storage?.persist?.().catch(() => {});
}
$('prepare').onclick = async () => { preparing = true; controls(); try { if (!navigator.onLine) throw new Error('下载模型需要联网。已有缓存时可直接点击开始听课。'); await prepare(true); } catch (e) { notify(`模型准备失败：${e.message}。可检查 Hugging Face / jsDelivr 的访问情况后重试。`, true); $('progress').hidden = true; } finally { preparing = false; controls(); } };
$('testAudio').onclick = async () => {
  if ($('direction').value !== 'en-zh') { notify('示例音频为英语，请先切换到 English → 简体中文。'); return; }
  if (rows.some(r => !r.demo)) { notify('请先导出当前课堂记录并创建新课堂，再测试示例音频。'); return; }
  preparing = true; controls(); let decoder;
  try {
    if (!modelReady.has(currentKey())) await prepare(false);
    notify('正在用本机示例音频运行真实识别与翻译…');
    const response = await fetch('./sample.wav'); if (!response.ok) throw new Error('示例音频读取失败');
    decoder = new AudioContext({ sampleRate: 16000 }); const audio = await decoder.decodeAudioData(await response.arrayBuffer());
    const samples = resample(audio.getChannelData(0), audio.sampleRate); const started = performance.now();
    const result = await model('transcribe', { audio: samples, direction: 'en-zh' }, [samples.buffer]);
    if (!result.text.trim()) throw new Error('示例音频未识别出文字');
    const translation = await translate(result.text, 'en-zh', $('mode').value);
    rows = [{ start:0, end:audio.duration, original:result.text.trim(), translation, state:'done', demo:true }]; render();
    notify(`示例音频实测完成：${audio.duration.toFixed(1)} 秒语音，识别与翻译共耗时 ${((performance.now()-started)/1000).toFixed(1)} 秒。此字幕为真实模型输出。`);
  } catch (e) { notify(`示例测试失败：${e.message}`, true); }
  finally { await decoder?.close().catch(() => {}); preparing = false; controls(); }
};
async function devices() { try { const all = await navigator.mediaDevices.enumerateDevices(); const previous = $('device').value; $('device').replaceChildren(new Option('系统默认麦克风', '')); all.filter(x => x.kind === 'audioinput' && x.deviceId !== 'default').forEach((d, i) => $('device').add(new Option(d.label || `麦克风 ${i + 1}`, d.deviceId))); if ([...$('device').options].some(o => o.value === previous)) $('device').value = previous; } catch { notify('无法读取音频设备，请使用 localhost 或 HTTPS，并检查浏览器权限。', true); } }
$('refreshDevices').onclick = devices;
async function start() {
  if (active) { await stop(); return; }
  if (rows.some(r => r.demo)) { rows = []; elapsed = 0; render(); }
  initializing = true; controls();
  try {
    if (!window.isSecureContext || !navigator.mediaDevices) throw new Error('收音需要 HTTPS 或 localhost 地址');
    if ($('mode').value === 'online' && !navigator.onLine) throw new Error('在线模式需要网络，请切换到已准备好的离线模式');
    if ($('mode').value === 'online') runApiConfig = validateConfig(getOnlineConfig());
    runEngine=$('engine').value;if(runEngine==='cloud'){if($('mode').value!=='online')throw new Error('云端语音识别必须使用在线模式');validateCloud();}
    if(runEngine==='browser'&&($('mode').value!=='online'||$('source').value!=='mic'))throw new Error('浏览器极速识别仅支持在线模式的默认麦克风；电脑音频与文件导入请使用本地识别');
    if(runEngine==='browser'&&!speechSupported())throw new Error('此浏览器不支持极速在线识别，请选择本地识别');
    // Request capture inside the click gesture before long model work (required for display sharing).
    liveSource = $('source').value;
    if (liveSource === 'system') {
      stream = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:{suppressLocalAudioPlayback:false}, preferCurrentTab:true, selfBrowserSurface:'include' });
      if (!stream.getAudioTracks().length) throw new Error('没有共享音频，请重新选择浏览器标签页并勾选“共享音频”');
      stream.getVideoTracks().forEach(track => { track.onended = () => { if (active) stop(); }; });
    } else stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: runEngine!=='browser'&&$('device').value ? { exact: $('device').value } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
    if((await sessionAssets(sessionId).catch(()=>[])).some(a=>a.kind==='file'))await resetCurrent('实时课堂');
    if (runEngine==='local'&&!modelReady.has(currentKey())) await prepare(false);
    if (stream.getAudioTracks().every(t => t.readyState !== 'live')) throw new Error('音频共享已结束，请重新开始');
    runDirection = $('direction').value; runMode = $('mode').value;
    context = new AudioContext({ sampleRate: 16000 }); await context.resume();
    await context.audioWorklet.addModule('./audio-worklet.js');
    capture = new AudioWorkletNode(context, 'classbridge-capture');
    offset = elapsed;
    await beginRecording(sessionId,offset,$('keepRecording').checked,message=>notify(message,true));
    const maxSeconds=Number($('latency').value);
    segmenter = new Segmenter(segment => { queue.push({ ...segment, start: segment.start + offset, end: segment.end + offset, direction: runDirection, mode: runMode,engine:runEngine, apiConfig:runMode === 'online' ? runApiConfig : undefined }); if (queue.length >= 5 && active) { notify('电脑处理速度暂时跟不上讲话，已暂停收音。录音与已收集的语音会保留，请等处理完成后继续。', true); stop(); } void drain(); },16000,{maxSeconds,pauseSeconds:maxSeconds<=3?.3:.5,minSeconds:.65});
    capture.port.onmessage = ({ data }) => {if(data.flushed){flushCapture?.();flushCapture=null;return;} if (!active) return;const samples=resample(data,context.sampleRate);recordSamples(samples);let rms;if(runEngine==='browser'){let sum=0;for(const x of samples)sum+=x*x;rms=Math.sqrt(sum/samples.length);}else rms=segmenter.push(samples); $('meter').style.width = `${Math.min(100, rms * 1000)}%`; };
    const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())); source.connect(capture); capture.connect(context.destination);
    stream.getAudioTracks().forEach(track => { track.onended = () => { if (active) { notify('音频输入已断开，已暂停收音。', true); stop(); } }; });
    active = true; startClock = performance.now();
    if(runEngine==='browser')speech=browserSpeech({language:runDirection==='en-zh'?'en-US':'zh-CN',clock:()=>active?offset+(performance.now()-startClock)/1000:elapsed,onInterim:updateLiveDraft,onFinal:result=>addRecognized({text:result.text},{...result,direction:runDirection,mode:runMode,apiConfig:runApiConfig,approximate:true}),onError:e=>{notify(e.message,true);void stop();}});
    $('audioStatus').textContent = liveSource === 'mic' ? '正在聆听麦克风' : '正在聆听电脑音频';
    notify(runEngine==='cloud'?`正在使用云端语音 API（${new URL(cloudConfig().url).host}），音频片段会上传，识别与文字翻译均可能产生费用。`:runEngine==='browser'?'正在使用浏览器在线语音服务，音频会发送给浏览器的识别服务。临时原文持续更新，确认后生成译文。':`正在本机收音与识别。短暂停顿或最多 ${maxSeconds} 秒即提交一段，翻译与下一段识别并行。`);
    void devices();save(); render();
  } catch (e) {
    active=false;speech?.abort();speech=null;await finishRecording();
    await releaseCapture();
    const messages = { NotAllowedError: '未获得收音权限，请在浏览器地址栏允许麦克风或屏幕音频共享。', NotFoundError: '未找到可用麦克风，请连接设备后刷新列表。', NotReadableError: '音频设备无法使用，可能被其他程序占用。' };
    notify(messages[e.name] || `无法开始：${e.message}。首次使用请先点击“准备当前模式模型”。`, true);
  } finally { initializing = false; controls(); }
}
async function releaseCapture() { capture?.disconnect(); capture = null; stream?.getTracks().forEach(t => t.stop()); stream = null; if (context) { await context.close().catch(() => {}); context = null; } $('meter').style.width = '0%'; }
async function stop() { if (!active||stopping) return;stopping=true;try{if(capture)await new Promise(resolve=>{const timer=setTimeout(resolve,500);flushCapture=()=>{clearTimeout(timer);resolve();};capture.port.postMessage('flush');});elapsed = offset + (performance.now() - startClock) / 1000; active = false; await speech?.stop();speech=null;liveDraft='';if(runEngine!=='browser')segmenter?.flush();await finishRecording(); await releaseCapture(); $('audioStatus').textContent = '已暂停收音'; save();await refreshLibrary(); controls();}finally{stopping=false;controls();} }
$('start').onclick = start;
async function translate(text, direction, mode, apiConfig = getOnlineConfig()) {
  if (mode === 'offline') return (await model('translate', { text, direction })).text;
  if (!navigator.onLine) throw new Error('网络已断开；原文已保留，联网后可重试');
  const output = await translateOnline(text, direction, apiConfig, getApiKey(apiConfig.provider));
  if (apiConfig.provider === 'mymemory') { const decoder = document.createElement('textarea'); decoder.innerHTML = output; return decoder.value; }
  return output;
}
async function drain() {
  if (draining) return; draining = true; controls();
  try {
    while (queue.length) {
      const job = queue.shift();
      try {
        const started=performance.now();
        const output = job.engine==='cloud'?await recognizeCloud(job.audio,job.direction):await model('transcribe', { audio: job.audio, direction: job.direction,timestamps:false }, [job.audio.buffer]);
        lastLatency=(performance.now()-started)/1000;if(active&&job.engine!=='cloud'&&segmenter){const floor=Number($('latency').value);segmenter.maxSeconds=Math.min(8,Math.max(floor,lastLatency*1.25));}addRecognized(output,job);
      } catch (e) { rows.push({id:++sequence,start:job.start,end:job.end,direction:job.direction,mode:job.mode,original:'[这一段语音识别失败]',unrecognized:true,state:'failed',error:e.message});notify(`处理失败：${e.message}。已保存的录音可以继续精听。`, true); }
      finally { save(); render(); }
    }
  } finally { draining = false; controls(); render(); }
}
function addRecognized(output,job){
  const text=(output.text||'').trim();if(!text||/^\[.*\]$/.test(text))return;
  const chunks=output.chunks?.filter(c=>c.text?.trim())||[];const pieces=chunks.length?chunks.flatMap(c=>{const from=job.start+Math.max(0,Number(c.timestamp?.[0])||0),to=Math.min(job.end,job.start+(Number(c.timestamp?.[1])||job.end-job.start));return sentenceRanges(c.text,from,Math.max(from+.1,to)).map(r=>({...r,approximate:!!job.approximate||/[.!?。！？].+[^\s]/.test(c.text)}));}):sentenceRanges(text,job.start,job.end);
  for(const piece of pieces){const row={...piece,id:++sequence,direction:job.direction,mode:job.mode,apiConfig:job.apiConfig,mediaId:job.mediaId,translation:'',state:'pending'};rows.push(row);translationQueue.push(row);if(active)selectedRowId=row.id;}save();render();pumpTranslations();
  if(translationQueue.length>20&&active){notify('翻译队列积压，已暂停收音；原文和录音已保留。可换用更快的翻译 API。',true);void stop();}
}
function pumpTranslations(){
  const limit=$('mode').value==='offline'?1:2;
  while(translationRunning<limit&&translationQueue.length){const row=translationQueue.shift();translationRunning++;void(async()=>{try{row.translation=await translate(row.original,row.direction,row.mode,row.apiConfig);row.state='done';}catch(e){row.state='failed';row.error=e.message;notify(`翻译失败：${e.message}，原文与录音保留。`,true);}finally{translationRunning--;save();render();pumpTranslations();controls();}})();}controls();
}
async function waitTranslations(){while(translationRunning||translationQueue.length)await new Promise(resolve=>setTimeout(resolve,100));}
async function retryRow(row) {
  if (row.unrecognized) { notify('这一段原始语音已释放，无法恢复识别，请重新收音。', true); return; }
  preparing = true; controls();
  try { if (row.mode === 'offline' && !modelReady.has(`offline:${row.direction}`)) { await model('init', { direction: row.direction, offline: true, download: false,role:'translation' }); modelReady.clear(); modelReady.add(`offline:${row.direction}`); } row.state = 'pending'; render(); row.translation = await translate(row.original, row.direction, row.mode); row.state = 'done'; delete row.error; }
  catch (e) { row.state = 'failed'; row.error = e.message; notify(e.message, true); }
  finally { preparing = false; save(); controls(); render(); }
}
function setMode(mode) { $('mode').value = mode; $('onlineTab').classList.toggle('selected', mode === 'online'); $('offlineTab').classList.toggle('selected', mode === 'offline'); $('modeHint').textContent = mode === 'online' ? ($('engine').value==='cloud'?`片段音频发送至你配置的云端语音 API，原文发送至 ${apiLabel()} 翻译。`:$('engine').value==='browser'?`麦克风音频发送至浏览器语音识别服务，确认文字发送至 ${apiLabel()} 翻译。`:onlineHint()) : '音频与文字均在本机处理。首次需要联网下载当前方向模型，完成后请断网试用。'; $('apiSettings').hidden = mode !== 'online'; controls(); }
$('onlineTab').onclick = () => setMode('online'); $('offlineTab').onclick = () => setMode('offline');
$('direction').onchange = controls; $('source').onchange = () => { controls(); if ($('source').value === 'system') notify('开始后选择播放课程的浏览器标签页，并勾选“共享音频”。系统声音采集以浏览器提供的选项为准。'); };
async function resetCurrent(title='我的课堂'){closeVideoLink();save();await persistChain;stopPlayback();$('practicePlayer').removeAttribute('src');$('practicePlayer').load();rows=[];elapsed=0;sourceLink=null;selectedRowId=null;sessionId=crypto.randomUUID();createdAt=Date.now();$('course').value=title;save();render();await refreshLibrary();controls();}
$('newSession').onclick = async()=>{await resetCurrent();notify('新课堂已准备好，之前的字幕与录音保留在本地课堂库。');};
$('course').onchange = save;
async function refreshLibrary(){try{const all=(await listSessions()).sort((a,b)=>b.updatedAt-a.updatedAt);$('savedSessions').replaceChildren(new Option('选择已保存的课堂',''));for(const item of all)$('savedSessions').add(new Option(`${item.course||'我的课堂'} · ${new Date(item.createdAt).toLocaleString('zh-CN')} · ${item.rows?.length||0} 句`,item.id));if(all.some(s=>s.id===sessionId))$('savedSessions').value=sessionId;}catch(e){notify(`本地课堂库不可用：${e.message}`,true);}}
$('loadSession').onclick=async()=>{const id=$('savedSessions').value;if(!id)return;save();await persistChain;const data=await getSession(id);if(!data)return;closeVideoLink();stopPlayback();sessionId=data.id;sourceLink=typeof data.sourceLink==='string'?data.sourceLink:null;createdAt=data.createdAt;rows=data.rows||[];elapsed=data.elapsed||0;$('course').value=data.course||'我的课堂';for(const row of rows)if(row.state==='pending'){row.state='failed';row.error='处理已中断，可以重试翻译';}sequence=Math.max(0,...rows.map(r=>Number(r.id)||0));selectedRowId=null;save();render();$('libraryDialog').close();const media=(await sessionAssets(sessionId)).find(a=>a.kind==='file');if(media)await previewFile(media.id);else{$('practicePlayer').removeAttribute('src');$('practicePlayer').load();if(sourceLink)openVideoLink(parseVideoLink(sourceLink));}controls();notify('已打开本地课堂，点击字幕可定位原声并逐句精听。');};
$('exportAudio').onclick=async()=>{try{const path=await exportRecording(sessionId,$('course').value);notify(`录音已导出至：${path}`);}catch(e){if(e.name!=='AbortError')notify(e.message,true);}};
$('hideTranslations').onchange=()=>document.body.classList.toggle('hide-translations',$('hideTranslations').checked);
async function importMedia(file){if(!file)return;closeVideoLink();if(file.size>1024*1024*1024){notify('文件超过 1GB，请先分段后导入。',true);return;}
  importing=true;importAbort=new AbortController();controls();
  try{
    if($('mode').value==='online')validateConfig(getOnlineConfig());if(!modelReady.has(currentKey()))await prepare(false);
    const space=await navigator.storage?.estimate?.();if(space?.quota&&space.quota-space.usage<file.size*1.15)throw new Error('浏览器可用空间不足，请释放空间后再导入');
    save();await persistChain;rows=[];elapsed=0;sourceLink=null;sessionId=crypto.randomUUID();createdAt=Date.now();$('course').value=file.name.replace(/\.[^.]+$/,'');stopPlayback();save();render();
    const mediaId=await keepFile(file,sessionId);await previewFile(mediaId);const direction=$('direction').value,mode=$('mode').value,apiConfig=mode==='online'?getOnlineConfig():undefined;
    await processFile(file,async job=>{if(importAbort.signal.aborted)throw new DOMException('已取消','AbortError');const started=performance.now();const output=await model('transcribe',{audio:job.audio,direction},[job.audio.buffer]);lastLatency=(performance.now()-started)/1000;addRecognized(output,{...job,mediaId,direction,mode,apiConfig});if(translationQueue.length>4)await waitTranslations();},(position,duration,stage)=>{elapsed=position;$('importProgress').hidden=false;$('importProgress').value=position;$('importProgress').max=duration;notify(`${stage}：${stamp(position)} / ${stamp(duration)}，已生成 ${rows.length} 句字幕。`);},importAbort.signal);
    await waitTranslations();save();notify('音视频翻译完成，原始文件已保存在本机。点击逐句精听可按字幕回放。');
  }catch(e){notify(e.name==='AbortError'?'已取消后续导入，原文件及已完成的字幕保留在本地课堂库。':`导入失败：${e.message}`,e.name!=='AbortError');save();}
  finally{importing=false;importAbort=null;$('importProgress').hidden=true;await refreshLibrary();render();controls();}
};
$('importFile').onchange=event=>{const file=event.target.files?.[0];event.target.value='';void importMedia(file);};
async function chooseMedia(){if($('importFile').disabled)return;try{if(window.showOpenFilePicker)await importMedia(await pickMediaFile());else $('importFile').click();}catch(e){if(e.name!=='AbortError')notify(e.message,true);}}
$('importFile').parentElement.addEventListener('click',event=>{if(window.showOpenFilePicker){event.preventDefault();void chooseMedia();}});
$('cancelImport').onclick=()=>{importAbort?.abort();notify('正在停止导入；当前模型计算结束后会保留已完成结果。');};
$('engine').onchange=()=>{setMode($('mode').value);if($('engine').value==='browser')notify('极速在线识别会将麦克风音频发送给浏览器语音服务，使用系统默认麦克风。仅在线模式可用；不可保证所有 Chrome / Edge 环境都支持。');};
async function download(type) {
  const actual=rows.filter(r=>!r.demo&&r.original);if(!actual.length){notify('还没有可导出的字幕。');return;}
  const text=type==='json'?JSON.stringify({course:$('course').value,rows:actual.map(r=>({start:r.start,end:r.end,original:r.original,translation:r.translation||'',approximate:!!r.approximate}))},null,2):type==='srt'?toSrt(actual):`${$('course').value}\n\n`+actual.map(r=>`[${stamp(r.start)}]\n${r.original}\n${r.translation||'[译文未完成]'}\n`).join('\n');
  try{const path=await saveToDisk(new Blob(['\ufeff',text],{type:type==='json'?'application/json':'text/plain;charset=utf-8'}),`${$('course').value||'课堂'}.${type}`);notify(`字幕已导出至：${path}`);}catch(e){if(e.name!=='AbortError')notify(`导出失败：${e.message}`,true);}
}
$('exportTxt').onclick=()=>download('txt');$('exportSrt').onclick=()=>download('srt');$('exportJson').onclick=()=>download('json');
$('smaller').onclick = () => { fontSize = Math.max(16, fontSize - 2); document.documentElement.style.setProperty('--caption', `${fontSize}px`); };
$('larger').onclick = () => { fontSize = Math.min(44, fontSize + 2); document.documentElement.style.setProperty('--caption', `${fontSize}px`); };
$('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('.workspace').requestFullscreen(); } catch { notify('当前浏览器不允许进入全屏。'); } };
$('historyNav').onclick=chooseMedia;$('liveNav').onclick=()=>{$('settingsDialog').showModal();};
$('help').onclick = () => $('helpDialog').showModal(); for (const id of ['closeHelp','doneHelp']) $(id).onclick = () => $('helpDialog').close();
$('demo').onclick = () => { if (rows.length) { notify('请先导出记录并创建新课堂，再查看示例。'); $('helpDialog').close(); return; } rows = [{ start: 0, end: 5, original: 'Today, we are going to explore how data helps us make better decisions.', translation: '今天，我们将探讨数据如何帮助我们做出更好的决策。', state: 'done', demo: true }, { start: 5, end: 12, original: 'The first step is to ask the right question, before we look at the numbers.', translation: '在查看数字之前，第一步是提出正确的问题。', state: 'done', demo: true }]; render(); $('helpDialog').close(); notify('当前为界面示例，并非实时识别。点击开始听课会清除示例。'); };
function network() { $('connection').textContent = navigator.onLine ? '● 网络已连接' : '○ 当前已断网'; if (!navigator.onLine && active && runMode === 'online') { notify('网络已断开，已暂停收音。已识别原文会保留，失败的翻译可稍后重试。', true); stop(); } }
window.addEventListener('online', network); window.addEventListener('offline', network);
window.addEventListener('beforeunload', event => { save(); if (active || draining || preparing || initializing||importing||translationRunning||translationQueue.length) { event.preventDefault(); event.returnValue = ''; } });
setInterval(() => { if (active) { elapsed = offset + (performance.now() - startClock) / 1000; $('timer').textContent = stamp(elapsed); } }, 1000);
setInterval(() => { if (active) save(); }, 10000);
$('sessionDate').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
$('settingsOpen').onclick=$('settingsQuick').onclick=()=> $('settingsDialog').showModal();
$('closeSettings').onclick=()=> $('settingsDialog').close();
$('libraryOpen').onclick=()=>{void refreshLibrary();$('libraryDialog').showModal();};
$('closeLibrary').onclick=()=> $('libraryDialog').close();
$('importAgain').onclick=chooseMedia;
$('subtitleSearch').oninput=render;
$('playPause').onclick=async()=>{const p=$('practicePlayer');try{if(!p.getAttribute('src')){const first=rows.find(r=>!r.demo);if(first)await selectSentence(first);else notify('先导入音视频，或录制一段课堂音频。');}else if(p.paused)await p.play();else p.pause();}catch(e){notify(e.message,true);}};
function stepSentence(delta){const playable=rows.filter(r=>r.original&&!r.demo);if(!playable.length)return;let index=playable.findIndex(r=>r.id===selectedRowId);index=index<0?(delta>0?0:playable.length-1):Math.max(0,Math.min(playable.length-1,index+delta));void selectSentence(playable[index]);}
$('previousSentence').onclick=()=>stepSentence(-1);$('nextSentence').onclick=()=>stepSentence(1);
$('seekBar').oninput=()=>{const p=$('practicePlayer');if(Number.isFinite(p.duration)&&p.duration>0)p.currentTime=p.duration*Number($('seekBar').value)/1000;};
const player=$('practicePlayer');
player.addEventListener('loadedmetadata',()=>{$('stagePlaceholder').hidden=true;$('playerDuration').textContent=Number.isFinite(player.duration)?stamp(player.duration):'--:--';});
player.addEventListener('emptied',()=>{$('stagePlaceholder').hidden=active;$('playerTime').textContent='00:00';$('playerDuration').textContent='00:00';$('seekBar').value=0;});
player.addEventListener('play',()=>{$('playPause').textContent='Ⅱ';});player.addEventListener('pause',()=>{$('playPause').textContent='▶';});
player.addEventListener('timeupdate',()=>{$('playerTime').textContent=stamp(player.currentTime);if(Number.isFinite(player.duration)&&player.duration>0)$('seekBar').value=player.currentTime/player.duration*1000;});
document.addEventListener('classbridge-playback',event=>{const time=event.detail.time;const row=rows.find(r=>time>=r.start&&time<r.end);if(!row){selectedRowId=null;updateSelection();}else if(row.id!==selectedRowId){selectedRowId=row.id;updateSelection();if($('follow').checked)$('captions').querySelector('.active-row')?.scrollIntoView({block:'center',behavior:'smooth'});}});
function updateLiveDraft(text){liveDraft=text;$('liveDraft').textContent=text?'临时原文：'+text:'';if(!text){draftTranslation='';draftEpoch++;lastDraftSent='';}updateSelection();if(!text){clearTimeout(draftTimer);draftTimer=null;}else if($('previewTranslation').checked&&!draftTimer)draftTimer=setTimeout(()=>{draftTimer=null;void previewLiveTranslation();},500);}
async function previewLiveTranslation(){if(draftRequest||!active||runMode!=='online'||!liveDraft||liveDraft===lastDraftSent||!$('previewTranslation').checked)return;const text=liveDraft,epoch=draftEpoch;lastDraftSent=text;draftRequest=true;try{const output=await translate(text,runDirection,runMode,runApiConfig);if(active&&epoch===draftEpoch&&liveDraft.startsWith(text)){draftTranslation=output;updateSelection();}}catch{}finally{draftRequest=false;if(active&&liveDraft!==text)draftTimer=setTimeout(()=>{draftTimer=null;void previewLiveTranslation();},400);}}
function panelState(state){document.body.classList.toggle('panel-hidden',state==='closed');document.body.classList.toggle('panel-collapsed',state==='collapsed');$('collapsePanel').textContent=state==='collapsed'?'⇤':'⇥';$('panelToggle').textContent=state==='open'?'隐藏侧栏':'打开字幕侧栏';try{localStorage.setItem('classbridge-panel-state',state);}catch{}}
$('panelToggle').onclick=()=>panelState(document.body.classList.contains('panel-hidden')||document.body.classList.contains('panel-collapsed')?'open':'closed');$('closePanel').onclick=()=>panelState('closed');$('collapsePanel').onclick=()=>panelState(document.body.classList.contains('panel-collapsed')?'open':'collapsed');
try{panelState(localStorage.getItem('classbridge-panel-state')||'open');}catch{panelState('open');}
$('showVideoSubtitles').onchange=()=>document.body.classList.toggle('overlay-off',!$('showVideoSubtitles').checked);
$('continuousPlay').onchange=()=>{const row=rows.find(r=>r.id===selectedRowId);if(row&&!active&&!importing)void selectSentence(row);};
function showDirectories(names=directoryNames()){$('directoryStatus').textContent=`导入目录：${names.import}\n录音与字幕导出目录：${names.export}`;}
for(const [id,kind] of [['chooseImportDirectory','import'],['chooseExportDirectory','export']])$(id).onclick=async()=>{try{showDirectories(await chooseDirectory(kind));}catch(e){if(e.name!=='AbortError')notify(e.message,true);}};
$('resetDirectories').onclick=async()=>showDirectories(await clearDirectories());void restoreDirectories().then(showDirectories).catch(e=>{showDirectories();notify(e.message,true);});
async function importSubtitle(file){if(!file)return;try{if(file.size>10*1024*1024)throw new Error('字幕文件超过 10MB');const parsed=parseSubtitles(await file.text(),file.name.split('.').at(-1));if(rows.length&&!confirm('导入字幕会替换当前字幕，请确认已导出需要保留的内容。继续吗？'))return;const asset=(await sessionAssets(sessionId)).find(a=>a.kind==='file');rows=parsed.map(r=>({...r,id:++sequence,mediaId:asset?.id,direction:$('direction').value,mode:$('mode').value,state:r.translation?'done':'failed',error:r.translation?undefined:'此字幕没有译文，可重试翻译'}));elapsed=Math.max(elapsed,...rows.map(r=>r.end));selectedRowId=null;save();render();await refreshLibrary();notify(`已导入 ${rows.length} 句字幕，可与当前媒体同步播放。`);}catch(e){notify(`字幕导入失败：${e.message}`,true);}};
$('importSubtitleButton').onclick=async()=>{try{if(window.showOpenFilePicker)await importSubtitle(await pickMediaFile(true));else $('subtitleFile').click();}catch(e){if(e.name!=='AbortError')notify(e.message,true);}};$('subtitleFile').onchange=event=>{const file=event.target.files?.[0];event.target.value='';void importSubtitle(file);};
$('fastRealtime').onclick=()=>{if(!speechSupported()){notify('此浏览器不支持流式在线识别，可选择 1.8 秒本地分段；建议使用 Windows Chrome。',true);return;}$('engine').value='browser';$('source').value='mic';setMode('online');$('settingsDialog').showModal();notify('已选择极速在线麦克风，音频会发送到浏览器语音服务；点击“开始听课”后可持续显示临时原文和译文。');};
$('linkOpen').onclick=()=>{$('linkStatus').textContent='';if(sourceLink)$('videoUrl').value=sourceLink;$('linkDialog').showModal();};$('closeLink').onclick=()=>$('linkDialog').close();
$('loadVideoLink').onclick=async()=>{try{if(active||importing)throw new Error('请先暂停当前识别或导入');const link=parseVideoLink($('videoUrl').value);$('openOriginalVideo').href=link.url;$('openOriginalVideo').hidden=false;await resetCurrent(link.title);stopPlayback();sourceLink=link.url;openVideoLink(link);save();$('linkDialog').close();controls();notify('外链播放器已载入。点击视频播放；若要识别，请在“粘贴链接”中选择共享标签页音频。平台网络、登录和站外播放限制由平台决定。');}catch(e){$('linkStatus').textContent=e.message;}};
$('closeNetworkVideo').onclick=()=>{closeVideoLink();sourceLink=null;save();controls();$('linkDialog').close();};
$('recognizeLink').onclick=()=>{if(!currentVideoLink()){$('linkStatus').textContent='请先载入一个视频链接';return;}$('source').value='system';if($('engine').value==='browser')$('engine').value='local';$('linkDialog').close();notify('请选择当前听课桥标签页并勾选共享音频，然后播放视频。');void start();};
$('localSpeedTest').onclick=async()=>{preparing=true;controls();let decoder;try{await cacheShell();await model('init',{direction:'en-zh',offline:false,download:false,role:'asr'});decoder=new AudioContext({sampleRate:16000});const response=await fetch('./sample.wav');const buffer=await decoder.decodeAudioData(await response.arrayBuffer());const samples=resample(buffer.getChannelData(0),buffer.sampleRate).slice(0,32000);const started=performance.now();await model('transcribe',{audio:samples,direction:'en-zh',timestamps:false},[samples.buffer]);const seconds=(performance.now()-started)/1000;notify(`本机测试：2 秒语音，识别耗时 ${seconds.toFixed(2)} 秒（不含翻译与分段等待）。${seconds>=1.8?'本机 CPU 难以跟上 1.8 秒分段，建议极速在线或云端语音 API。':'本机识别耗时低于当前最快分段，仍需加上翻译与网络等待。'}`);}catch(e){notify(`速度测试失败：${e.message}。请先准备本地识别模型。`,true);}finally{await decoder?.close().catch(()=>{});preparing=false;controls();}};
$('cloudUrl').value=cloudConfig().url;$('cloudModel').value=cloudConfig().model;$('saveCloudConfig').onclick=()=>{try{saveCloud({url:$('cloudUrl').value,model:$('cloudModel').value},$('cloudKey').value);$('cloudKey').value='';$('cloudStatus').textContent='语音 API 配置已应用，密钥仅留在本页内存；请再选择“云端语音 API”引擎。';}catch(e){$('cloudStatus').textContent=e.message;}};$('clearCloudKey').onclick=()=>{clearCloudKey();$('cloudKey').value='';$('cloudStatus').textContent='语音密钥已清除。';};
initializeApiSettings(() => setMode($('mode').value), notify);
try{const preferences=JSON.parse(localStorage.getItem('classbridge-view-preferences')||'{}');for(const id of ['showVideoSubtitles','hideTranslations','continuousPlay','loopSentence'])if(typeof preferences[id]==='boolean')$(id).checked=preferences[id];document.body.classList.toggle('overlay-off',!$('showVideoSubtitles').checked);document.body.classList.toggle('hide-translations',$('hideTranslations').checked);}catch{}
for(const id of ['showVideoSubtitles','hideTranslations','continuousPlay','loopSentence'])$(id).addEventListener('change',()=>{try{localStorage.setItem('classbridge-view-preferences',JSON.stringify(Object.fromEntries(['showVideoSubtitles','hideTranslations','continuousPlay','loopSentence'].map(name=>[name,$(name).checked]))));}catch{}});
initializePlayer();void refreshLibrary();void(async()=>{const asset=(await sessionAssets(sessionId)).find(a=>a.kind==='file');if(asset)await previewFile(asset.id);else if(sourceLink)openVideoLink(parseVideoLink(sourceLink));controls();})().catch(e=>notify(`媒体恢复失败：${e.message}`,true));
setMode('online'); network(); controls(); render(); void devices(); cacheShell().catch(e => notify(e.message, true));
