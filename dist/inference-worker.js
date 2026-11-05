let runtime; let asr; const translators = new Map(); let chain = Promise.resolve();
const send = data => self.postMessage(data);
const translationModel = direction => direction === 'en-zh' ? 'Xenova/opus-mt-en-zh' : 'Xenova/opus-mt-zh-en';
async function init(id, direction, offline, download) {
  if (!runtime) {
    runtime = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');
    runtime.env.useBrowserCache = true;
    runtime.env.backends.onnx.wasm.numThreads = 1;
  }
  runtime.env.allowLocalModels = !download;
  runtime.env.allowRemoteModels = download;
  const opts = { dtype: 'q8', device: 'wasm', local_files_only: !download, progress_callback: p => send({ id, type: 'progress', file: p.file || '', progress: p.progress, status: p.status }) };
  if (!asr) asr = await runtime.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', opts);
  if (offline && !translators.has(direction)) {
    // Keep only the active translation direction in RAM; both remain in browser cache.
    for (const [key, pipe] of translators) { await pipe.dispose(); translators.delete(key); }
    translators.set(direction, await runtime.pipeline('translation', translationModel(direction), opts));
  }
  // A warm-up exercises runtime/WASM paths before declaring offline readiness.
  await asr(new Float32Array(16000), { language: direction === 'en-zh' ? 'english' : 'chinese', task: 'transcribe', max_new_tokens: 8 });
  if (offline) await translators.get(direction)(direction === 'en-zh' ? 'Hello.' : '你好。', { max_new_tokens: 16 });
  return { ready: true };
}
async function handle(m) {
  try {
    let result;
    if (m.action === 'init') result = await init(m.id, m.direction, m.offline, m.download);
    else if (m.action === 'transcribe') {
      if (!asr) throw new Error('语音模型未准备好');
      result = await asr(m.audio, { language: m.direction === 'en-zh' ? 'english' : 'chinese', task: 'transcribe', max_new_tokens: 192 });
    } else if (m.action === 'translate') {
      const pipe = translators.get(m.direction); if (!pipe) throw new Error('当前方向的离线翻译模型未准备好');
      const out = await pipe(m.text, { max_new_tokens: 256 }); result = { text: out[0].translation_text };
    } else throw new Error('未知模型操作');
    send({ id: m.id, type: 'result', result });
  } catch (e) { send({ id: m.id, type: 'error', error: String(e.message || e) }); }
}
self.onmessage = ({ data }) => { chain = chain.then(() => handle(data)); };
