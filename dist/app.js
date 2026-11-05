import { Segmenter, resample, stamp, toSrt } from './core.js';
import { translateOnline, validateConfig } from './translation-api.js';
import { getOnlineConfig, getApiKey, apiLabel, onlineHint, initializeApiSettings } from './api-settings.js';
const $ = id => document.getElementById(id);
const KEY = 'classbridge-session-v1';
let rows = [], elapsed = 0, active = false, initializing = false, preparing = false, draining = false;
let stream, context, capture, segmenter, startClock, offset = 0, sequence = 0, queue = [], worker;
let liveSource, runDirection, runMode, runApiConfig, pending = new Map(), requestId = 0, fontSize = 23;
let modelReady = new Set();
try { const data = JSON.parse(localStorage.getItem(KEY) || '{}'); rows = (data.rows || []).filter(r => r && typeof r.original === 'string' && Number.isFinite(r.start) && Number.isFinite(r.end)).slice(-5000); elapsed = Number.isFinite(data.elapsed) ? data.elapsed : 0; if (typeof data.course === 'string') $('course').value = data.course; for (const r of rows) if (r.state === 'pending') { r.state = 'failed'; r.error = '上次处理已中断，可重试翻译'; } } catch { /* A corrupt record must not prevent starting a new class. */ }
function notify(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function save() { try { localStorage.setItem(KEY, JSON.stringify({ rows: rows.filter(r => !r.demo), elapsed, course: $('course').value })); } catch { notify('浏览器存储空间不足，请导出当前课堂记录。', true); } }
function currentKey() { return `${$('mode').value}:${$('direction').value}`; }
function controls() {
  const busy = initializing || preparing; const locked = active || busy || draining;
  for (const id of ['onlineTab','offlineTab','direction','source','device','prepare','newSession','demo','testAudio','apiSettings']) $(id).disabled = locked;
  $('start').disabled = busy || (draining && !active);
  $('start').textContent = busy ? '正在准备…' : active ? '■ 暂停听课' : draining ? '处理剩余字幕…' : '● 开始听课';
  $('statusDot').classList.toggle('on', active);
  $('captureState').textContent = active ? '正在收音' : draining ? '处理字幕' : '准备就绪';
  $('modelState').textContent = busy ? '准备中' : modelReady.has(currentKey()) ? '已就绪' : '待准备';
  $('device').disabled = locked || $('source').value === 'system';
}
function render() {
  const container = $('captions'); container.replaceChildren();
  if (!rows.length) { container.append(emptyTemplate.cloneNode(true)); }
  for (const r of rows) {
    const row = document.createElement('article'); row.className = 'caption-row';
    const meta = document.createElement('div'); meta.className = 'row-meta';
    const time = document.createElement('span'); time.textContent = stamp(r.start);
    const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = r.demo ? '示例 · 非实时' : r.mode === 'offline' ? '本地离线' : '在线翻译';
    meta.append(time, tag);
    const original = document.createElement('p'); original.className = 'original'; original.textContent = r.original || '正在识别这一段语音…';
    const translated = document.createElement('p'); translated.className = `translation${r.state === 'failed' ? ' failed' : ''}`; translated.textContent = r.translation || (r.state === 'failed' ? `翻译未完成：${r.error || '请重试'}` : '正在翻译…');
    row.append(meta, original, translated);
    if (r.state === 'failed' && r.original) { const retry = document.createElement('button'); retry.className = 'retry'; retry.textContent = '↻ 重试翻译'; retry.disabled = active || initializing || preparing || draining; retry.onclick = () => retryRow(r); row.append(retry); }
    container.append(row);
  }
  $('recordCount').textContent = rows.filter(r => !r.demo && r.original).length;
  $('recordSummary').textContent = rows.some(r => r.demo) ? '当前为示例测试，不会保存或加入课堂导出。' : rows.length ? `${rows.filter(r => !r.demo && r.original).length} 段课堂字幕 · 已在本机自动保存` : '字幕会自动保存，课后也能继续回顾。';
  $('timer').textContent = stamp(elapsed);
  if ($('follow').checked) container.scrollTop = container.scrollHeight;
}
const emptyTemplate = $('empty').cloneNode(true);
function getWorker() {
  if (!worker) {
    worker = new Worker('./inference-worker.js', { type: 'module' });
    worker.onmessage = ({ data }) => {
      const task = pending.get(data.id); if (!task) return;
      if (data.type === 'progress') { $('progress').hidden = false; if (Number.isFinite(data.progress)) { $('progress').value = data.progress; $('progress').max = 100; } else $('progress').removeAttribute('value'); $('modelInfo').textContent = `${data.file || '加载模型'}${Number.isFinite(data.progress) ? ` · ${Math.round(data.progress)}%` : ''}`; return; }
      pending.delete(data.id); clearTimeout(task.timer);
      if (data.type === 'error') task.reject(new Error(data.error)); else task.resolve(data.result);
    };
    worker.onerror = event => { event.preventDefault(); resetWorker(new Error('模型运行失败，请检查网络、浏览器内存后重新准备。')); };
  }
  return worker;
}
function resetWorker(error) { worker?.terminate(); worker = null; for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); } pending.clear(); modelReady.clear(); }
function model(action, data = {}, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = ++requestId; const w = getWorker();
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
  await model('init', { direction, offline, download });
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
    // Request capture inside the click gesture before long model work (required for display sharing).
    liveSource = $('source').value;
    if (liveSource === 'system') {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (!stream.getAudioTracks().length) throw new Error('没有共享音频，请重新选择浏览器标签页并勾选“共享音频”');
      stream.getVideoTracks().forEach(track => { track.onended = () => { if (active) stop(); }; });
    } else stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: $('device').value ? { exact: $('device').value } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
    if (!modelReady.has(currentKey())) await prepare(false);
    if (stream.getAudioTracks().every(t => t.readyState !== 'live')) throw new Error('音频共享已结束，请重新开始');
    runDirection = $('direction').value; runMode = $('mode').value;
    context = new AudioContext({ sampleRate: 16000 }); await context.resume();
    await context.audioWorklet.addModule('./audio-worklet.js');
    capture = new AudioWorkletNode(context, 'classbridge-capture');
    offset = elapsed;
    segmenter = new Segmenter(segment => { queue.push({ ...segment, start: segment.start + offset, end: segment.end + offset, direction: runDirection, mode: runMode, apiConfig:runMode === 'online' ? runApiConfig : undefined }); if (queue.length >= 5 && active) { notify('电脑处理速度暂时跟不上讲话，已暂停收音。正在保留并处理已收集的语音，请等处理完成后继续。', true); stop(); } void drain(); });
    capture.port.onmessage = ({ data }) => { if (!active) return; const rms = segmenter.push(resample(data, context.sampleRate)); $('meter').style.width = `${Math.min(100, rms * 1000)}%`; };
    const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())); source.connect(capture); capture.connect(context.destination);
    stream.getAudioTracks().forEach(track => { track.onended = () => { if (active) { notify('音频输入已断开，已暂停收音。', true); stop(); } }; });
    active = true; startClock = performance.now();
    $('audioStatus').textContent = liveSource === 'mic' ? '正在聆听麦克风' : '正在聆听电脑音频';
    notify('正在收音。字幕会在短暂停顿或约 8 秒后生成；翻译需要额外处理时间。');
    void devices(); render();
  } catch (e) {
    await releaseCapture();
    const messages = { NotAllowedError: '未获得收音权限，请在浏览器地址栏允许麦克风或屏幕音频共享。', NotFoundError: '未找到可用麦克风，请连接设备后刷新列表。', NotReadableError: '音频设备无法使用，可能被其他程序占用。' };
    notify(messages[e.name] || `无法开始：${e.message}。首次使用请先点击“准备当前模式模型”。`, true);
  } finally { initializing = false; controls(); }
}
async function releaseCapture() { capture?.disconnect(); capture = null; stream?.getTracks().forEach(t => t.stop()); stream = null; if (context) { await context.close().catch(() => {}); context = null; } $('meter').style.width = '0%'; }
async function stop() { if (!active) return; elapsed = offset + (performance.now() - startClock) / 1000; active = false; segmenter?.flush(); await releaseCapture(); $('audioStatus').textContent = '已暂停收音'; save(); controls(); }
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
      const job = queue.shift(); const row = { id: ++sequence, start: job.start, end: job.end, direction: job.direction, mode: job.mode, apiConfig:job.apiConfig, original: '', translation: '', state: 'pending' }; rows.push(row); render();
      try {
        const output = await model('transcribe', { audio: job.audio, direction: job.direction }, [job.audio.buffer]);
        row.original = output.text.trim();
        if (!row.original || /^\[.*\]$/.test(row.original)) { rows.splice(rows.indexOf(row), 1); continue; }
        save(); render(); row.translation = await translate(row.original, row.direction, row.mode, row.apiConfig); row.state = 'done';
      } catch (e) { row.state = 'failed'; row.error = e.message; if (!row.original) { row.original = '[这一段语音识别失败]'; row.unrecognized = true; } notify(`处理失败：${e.message}。已保留可用原文。`, true); }
      finally { save(); render(); }
    }
  } finally { draining = false; controls(); render(); }
}
async function retryRow(row) {
  if (row.unrecognized) { notify('这一段原始语音已释放，无法恢复识别，请重新收音。', true); return; }
  preparing = true; controls();
  try { if (row.mode === 'offline' && !modelReady.has(`offline:${row.direction}`)) { await model('init', { direction: row.direction, offline: true, download: false }); modelReady.clear(); modelReady.add(`offline:${row.direction}`); } row.state = 'pending'; render(); row.translation = await translate(row.original, row.direction, row.mode); row.state = 'done'; delete row.error; }
  catch (e) { row.state = 'failed'; row.error = e.message; notify(e.message, true); }
  finally { preparing = false; save(); controls(); render(); }
}
function setMode(mode) { $('mode').value = mode; $('onlineTab').classList.toggle('selected', mode === 'online'); $('offlineTab').classList.toggle('selected', mode === 'offline'); $('modeHint').textContent = mode === 'online' ? onlineHint() : '音频与文字均在本机处理。首次需要联网下载当前方向模型，完成后请断网试用。'; $('apiSettings').hidden = mode !== 'online'; controls(); }
$('onlineTab').onclick = () => setMode('online'); $('offlineTab').onclick = () => setMode('offline');
$('direction').onchange = controls; $('source').onchange = () => { controls(); if ($('source').value === 'system') notify('开始后选择播放课程的浏览器标签页，并勾选“共享音频”。系统声音采集以浏览器提供的选项为准。'); };
$('newSession').onclick = () => { if (rows.length && !confirm('开始新课堂会清空当前记录，请确认已导出。继续吗？')) return; rows = []; elapsed = 0; $('course').value = '我的课堂'; save(); render(); notify('新课堂已准备好。'); };
$('course').onchange = save;
function download(type) {
  const actual = rows.filter(r => !r.demo && r.original); if (!actual.length) { notify('还没有课堂字幕可以导出。示例字幕不会加入导出。'); return; }
  const text = type === 'srt' ? toSrt(actual) : `${$('course').value}\n\n` + actual.map(r => `[${stamp(r.start)}]\n${r.original}\n${r.translation || '[译文未完成]'}\n`).join('\n');
  const blob = new Blob(['\ufeff', text], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${($('course').value || '课堂').replace(/[\\/:*?"<>|]/g, '_')}.${type}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('exportTxt').onclick = () => download('txt'); $('exportSrt').onclick = () => download('srt');
$('smaller').onclick = () => { fontSize = Math.max(16, fontSize - 2); document.documentElement.style.setProperty('--caption', `${fontSize}px`); };
$('larger').onclick = () => { fontSize = Math.min(44, fontSize + 2); document.documentElement.style.setProperty('--caption', `${fontSize}px`); };
$('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('.classroom').requestFullscreen(); } catch { notify('当前浏览器不允许进入全屏。'); } };
$('historyNav').onclick = () => $('records').scrollIntoView({ behavior: 'smooth' }); $('liveNav').onclick = () => document.querySelector('.workspace').scrollIntoView({ behavior: 'smooth' });
$('help').onclick = () => $('helpDialog').showModal(); for (const id of ['closeHelp','doneHelp']) $(id).onclick = () => $('helpDialog').close();
$('demo').onclick = () => { if (rows.length) { notify('请先导出记录并创建新课堂，再查看示例。'); $('helpDialog').close(); return; } rows = [{ start: 0, end: 5, original: 'Today, we are going to explore how data helps us make better decisions.', translation: '今天，我们将探讨数据如何帮助我们做出更好的决策。', state: 'done', demo: true }, { start: 5, end: 12, original: 'The first step is to ask the right question, before we look at the numbers.', translation: '在查看数字之前，第一步是提出正确的问题。', state: 'done', demo: true }]; render(); $('helpDialog').close(); notify('当前为界面示例，并非实时识别。点击开始听课会清除示例。'); };
function network() { $('connection').textContent = navigator.onLine ? '● 网络已连接' : '○ 当前已断网'; if (!navigator.onLine && active && runMode === 'online') { notify('网络已断开，已暂停收音。已识别原文会保留，失败的翻译可稍后重试。', true); stop(); } }
window.addEventListener('online', network); window.addEventListener('offline', network);
window.addEventListener('beforeunload', event => { save(); if (active || draining || preparing || initializing) { event.preventDefault(); event.returnValue = ''; } });
setInterval(() => { if (active) { elapsed = offset + (performance.now() - startClock) / 1000; $('timer').textContent = stamp(elapsed); } }, 1000);
setInterval(() => { if (active) save(); }, 10000);
$('sessionDate').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
initializeApiSettings(() => setMode($('mode').value), notify);
setMode('online'); network(); controls(); render(); void devices(); cacheShell().catch(e => notify(e.message, true));
