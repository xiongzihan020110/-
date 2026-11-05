import { PROVIDERS, normalizeConfig, validateConfig, endpointFor, translateOnline } from './translation-api.js';
const STORAGE = 'classbridge-api-settings-v1';
const $ = id => document.getElementById(id);
let profiles = {}, selected = 'mymemory', draftProvider = 'mymemory';
const keys = new Map();
try { const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); for (const [id, config] of Object.entries(saved.profiles || {})) if (Object.hasOwn(PROVIDERS, id)) profiles[id] = normalizeConfig({ ...config, provider:id }); if (Object.hasOwn(PROVIDERS, saved.selected)) selected = saved.selected; } catch { /* Default remains usable. */ }
export const getOnlineConfig = () => normalizeConfig(profiles[selected] || { provider:selected });
export const getApiKey = provider => keys.get(provider) || '';
export function apiLabel(config = getOnlineConfig()) { return PROVIDERS[config.provider]?.label || '在线 API'; }
export function onlineHint() { return `音频在本机识别，文字发送至 ${apiLabel()}。${selected === 'mymemory' ? '有免费额度限制。' : '费用及额度由所选服务商决定。'}`; }
export function initializeApiSettings(onChange, notify) {
  const selector = $('apiProvider'); for (const [id, provider] of Object.entries(PROVIDERS)) selector.add(new Option(provider.label, id));
  function load(id) {
    draftProvider = id; const config = normalizeConfig(profiles[id] || { provider:id });
    selector.value = id; $('apiBaseUrl').value = config.baseUrl; $('apiModel').value = config.model; $('apiTimeout').value = config.timeout; $('apiKey').value = keys.get(id) || '';
    const protocol = PROVIDERS[id].protocol;
    $('apiAdvanced').open = ['compatible','libretranslate','siliconflow'].includes(id); $('apiAdvanced').hidden = protocol === 'mymemory';
    $('apiModelField').hidden = protocol !== 'chat'; $('apiUrlField').hidden = protocol === 'mymemory'; $('apiKeyField').hidden = protocol === 'mymemory';
    $('apiResult').textContent = protocol === 'mymemory' ? '默认免费服务，无需密钥。存在每日额度限制。' : '填写后可发送一句示例文字，检查连接和翻译结果。';
    $('apiKeyState').textContent = keys.has(id) ? '本页已填写密钥，刷新后清除。' : '未填写密钥；无鉴权的自建服务可留空。';
  }
  const draft = () => validateConfig({ provider:selector.value, baseUrl:$('apiBaseUrl').value, model:$('apiModel').value, timeout:$('apiTimeout').value });
  $('apiSettings').onclick = () => { load(selected); $('apiDialog').showModal(); };
  selector.onchange = () => load(selector.value);
  $('apiClose').onclick = () => { $('apiKey').value = ''; $('apiDialog').close(); };
  $('apiDialog').addEventListener('close', () => { $('apiKey').value = ''; });
  $('clearApiKey').onclick = () => { keys.delete(draftProvider); $('apiKey').value = ''; $('apiKeyState').textContent = '当前服务的本页密钥已清除。'; };
  $('apiSave').onclick = async () => {
    $('apiSave').disabled=true;
    try {
      const config = draft(); const key = $('apiKey').value.trim();
      if(['openai','deepseek','siliconflow'].includes(config.provider)&&!key)throw new Error('请先填写该服务商的 API Key。ChatGPT 登录不会自动提供密钥。');
      $('apiResult').textContent='正在测试连接与翻译…';
      await translateOnline('Hello.', 'en-zh', config, key);
      profiles[config.provider] = config; selected = config.provider;
      if (key) keys.set(selected, key); else keys.delete(selected);
      try { localStorage.setItem(STORAGE, JSON.stringify({ selected, profiles })); } catch { notify('API 配置已在本页应用，但浏览器无法持久保存配置。', true); }
      $('apiDialog').close(); $('apiKey').value = ''; onChange(); notify(`在线服务已切换为 ${apiLabel()}。${selected === 'mymemory' ? '' : `请求地址：${endpointFor(config)}。`}`);
    } catch (e) { $('apiResult').textContent = `未应用配置：${e.message}`; } finally { $('apiSave').disabled=false; }
  };
  $('apiTest').onclick = async () => {
    let config; try { config = draft(); } catch(e) { $('apiResult').textContent = e.message; return; }
    for (const id of ['apiSave','apiTest','apiProvider','apiBaseUrl','apiModel','apiTimeout','apiKey','clearApiKey']) $(id).disabled = true;
    $('apiResult').textContent = `正在向 ${new URL(endpointFor(config)).host} 发送英文示例（可能产生少量 API 费用）…`;
    try {
      const text = await translateOnline('Today we will learn how data helps us make better decisions.', 'en-zh', config, $('apiKey').value);
      $('apiResult').textContent = `连接成功 · 测试译文：${text}`;
    } catch (e) { $('apiResult').textContent = `连接失败：${e.message}`; }
    finally { for (const id of ['apiSave','apiTest','apiProvider','apiBaseUrl','apiModel','apiTimeout','apiKey','clearApiKey']) $(id).disabled = false; }
  };
}
