import {prepareNative} from './native-translation.js';
import { PROVIDERS, normalizeConfig, validateConfig, endpointFor, translateOnline } from './translation-api.js';
const STORAGE = 'classbridge-api-settings-v1';
const $ = id => document.getElementById(id);
let profiles = {}, selected = 'native', draftProvider = 'native';
const keys = new Map();
try { const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); for (const [id, config] of Object.entries(saved.profiles || {})) if (Object.hasOwn(PROVIDERS, id)) profiles[id] = normalizeConfig({ ...config, provider:id }); if (Object.hasOwn(PROVIDERS, saved.selected)) selected = saved.selected; } catch { /* Default remains usable. */ }
export function useNativeProvider(){selected='native';profiles.native=normalizeConfig({provider:'native'});try{localStorage.setItem(STORAGE,JSON.stringify({selected,profiles}));}catch{}}
export const getOnlineConfig = () => normalizeConfig(profiles[selected] || { provider:selected });
export const getApiKey = provider => keys.get(provider) || '';
export function apiLabel(config = getOnlineConfig()) { return PROVIDERS[config.provider]?.label || '在线 API'; }
export function onlineHint() { if(selected==='native')return '文字由 Chrome 内置模型在本机翻译，免费免 Key；首次需要准备语言包。语音识别方式在下方选择。';return `音频在本机识别，文字发送至 ${apiLabel()}。${selected === 'mymemory' ? '有免费额度限制。' : '费用及额度由所选服务商决定。'}`; }
export function initializeApiSettings(onChange, notify) {
  const selector = $('apiProvider'); for (const [id, provider] of Object.entries(PROVIDERS)) selector.add(new Option(provider.label, id));
  function load(id) {
    draftProvider = id; const config = normalizeConfig(profiles[id] || { provider:id });
    selector.value = id; $('apiBaseUrl').value = config.baseUrl; $('apiModel').value = config.model; $('apiTimeout').value = config.timeout; $('apiKey').value = keys.get(id) || '';
    const protocol = PROVIDERS[id].protocol;
    $('apiAdvanced').open = ['compatible','libretranslate','siliconflow'].includes(id); $('apiAdvanced').hidden = ['mymemory','native'].includes(protocol);
    $('apiModelField').hidden = protocol !== 'chat'; $('apiUrlField').hidden = ['mymemory','google','native'].includes(protocol); $('apiKeyField').hidden = ['mymemory','native'].includes(protocol);
    $('apiResult').textContent = protocol === 'mymemory' ? '默认免费服务，无需密钥。存在每日额度限制。' : '填写后可发送一句示例文字，检查连接和翻译结果。';
    if(protocol==='native')$('apiResult').textContent='无需 Key、无需绑卡。点击“测试并使用”检测并准备当前方向的语言包，首次下载需要联网。文字在本机翻译；不支持时会明确提示。';
    if(protocol==='google')$('apiResult').textContent='谷歌官方文字翻译：只填 Google Cloud API Key 即可；需启用 Cloud Translation API 和计费，费用与免费额度按谷歌规则计算。它不负责语音识别。';
    $('apiKey').placeholder=protocol==='google'?'填写 Google Cloud API Key（不是 Gemini Key）':'填写你自己的密钥，或留空使用无鉴权代理';
    $('apiKeyState').textContent = keys.has(id) ? '本页已填写密钥，刷新后清除。' : (protocol==='google'?'需要对应 Google Cloud 项目的 API Key。':'未填写密钥；无鉴权的自建服务可留空。');
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
      if(['google','openai','deepseek','siliconflow'].includes(config.provider)&&!key)throw new Error('请先填写所选服务商的 API Key。');
      $('apiResult').textContent=config.provider==='native'?'正在检测并准备浏览器翻译语言包…':'正在测试连接与翻译…';
      if(config.provider==='native')await prepareNative($('direction').value,p=>$('apiResult').textContent=`语言包准备进度 ${p}%`);
      await translateOnline($('direction').value==='en-zh'?'Hello.':'你好。', $('direction').value, config, key);
      profiles[config.provider] = config; selected = config.provider;
      if (key) keys.set(selected, key); else keys.delete(selected);
      try { localStorage.setItem(STORAGE, JSON.stringify({ selected, profiles })); } catch { notify('API 配置已在本页应用，但浏览器无法持久保存配置。', true); }
      $('apiDialog').close(); $('apiKey').value = ''; onChange(); notify(`在线服务已切换为 ${apiLabel()}。${['mymemory','native'].includes(selected) ? '' : `请求地址：${endpointFor(config)}。`}`);
    } catch (e) { $('apiResult').textContent = `未应用配置：${e.message}`; } finally { $('apiSave').disabled=false; }
  };
  $('apiTest').onclick = async () => {
    let config; try { config = draft(); } catch(e) { $('apiResult').textContent = e.message; return; }
    for (const id of ['apiSave','apiTest','apiProvider','apiBaseUrl','apiModel','apiTimeout','apiKey','clearApiKey']) $(id).disabled = true;
    $('apiResult').textContent = config.provider==='native'?'正在检测并准备浏览器翻译语言包…':`正在向 ${new URL(endpointFor(config)).host} 发送英文示例（可能产生少量 API 费用）…`;
    try {
      if(config.provider==='native')await prepareNative($('direction').value,p=>$('apiResult').textContent=`语言包准备进度 ${p}%`);
      const text = await translateOnline($('direction').value==='en-zh'?'Today we will learn how data helps us make better decisions.':'今天我们学习如何利用数据做出更好的决定。', $('direction').value, config, $('apiKey').value);
      $('apiResult').textContent = `连接成功 · 测试译文：${text}`;
    } catch (e) { $('apiResult').textContent = `连接失败：${e.message}`; }
    finally { for (const id of ['apiSave','apiTest','apiProvider','apiBaseUrl','apiModel','apiTimeout','apiKey','clearApiKey']) $(id).disabled = false; }
  };
}
