# 听课桥 / ClassBridge

Windows Chrome / Edge 上的课堂实时中英翻译网页。无需安装 npm 依赖。

## 独立网页部署

源码仓库：https://github.com/xiongzihan020110/- 。`.github/workflows/pages.yml` 在 main 分支更新后自动检查、测试并发布 `dist/` 到 GitHub Pages。首次需要在仓库 Settings → Pages 将 Source 选择为 GitHub Actions。

默认项目路径为 `https://xiongzihan020110.github.io/-/`，**是否已上线以 GitHub Actions 的实际部署结果为准**。模型和课堂记录按网站域名分别缓存；从旧网址迁移到 GitHub Pages 后需要重新下载模型，课堂记录请先导出。

## 本地启动

安装 Node.js 后，在此目录执行 `node server.mjs`，访问 http://localhost:4173 。
请勿双击 HTML 文件，麦克风、模块与离线缓存需要 localhost 或 HTTPS。

## 首次使用

1. 选择在线 / 离线模式、英译中 / 中译英。
2. 点击“准备当前模式模型”。在线模式也需要本地语音识别模型。
3. 等待模型加载及预热成功。模型由 Hugging Face 下载，运行库由 jsDelivr 加载；网络无法访问时会提示失败。
4. 点击“开始听课”，允许麦克风权限。音频按停顿或约 8 秒分段；语音识别和翻译会有计算延迟。
5. 暂停后导出双语 TXT / SRT。当前课堂自动保存在该浏览器的 localStorage，不跨设备同步。

离线模式使用 Whisper tiny + 当前方向 OPUS-MT 量化模型，通过 Transformers.js / ONNX WASM 在 Web Worker 运行。切换翻译方向需要分别下载对应模型。网页外壳、JS/WASM 运行库以及模型使用浏览器缓存；准备完成后必须在目标浏览器断网验证一次。缓存可能被系统或用户清除，私密浏览不适合保存模型。

在线模式不上传音频，仅将识别文字发送到你选择的 API。点击“在线翻译 API 设置”配置：

| 服务 | 配置方式 |
| --- | --- |
| MyMemory | 默认免费服务，无需密钥，有每日额度限制 |
| DeepSeek | 预设地址和模型，可自行修改，填写自己的 API Key |
| 硅基流动 | 预设地址，填写控制台中的模型 ID 和 API Key |
| OpenAI 兼容 / 自建代理 | 填写 Base URL、模型名称及可选密钥；使用 Chat Completions 协议 |
| LibreTranslate | 填写服务地址及可选密钥 |

兼容接口地址自动补充 `/chat/completions`；LibreTranslate 自动补充 `/translate`。可以直接填写完整路径，不会重复补充。支持 HTTPS 与本机 HTTP 服务。网页会拒绝 URL 中的账号、密码和查询参数，密钥仅放在请求头或 LibreTranslate JSON 请求体。

每个服务分别保存地址、模型、超时设置。**密钥仅保留在当前页面内存，不保存到 localStorage、sessionStorage、源码或 GitHub。刷新后需重新填写。**“测试连接与翻译”会发送一句固定英文到当前填写的服务，可能产生少量 API 费用；该按钮不修改已保存的配置。

GitHub Pages 为静态网站。浏览器直连服务必须允许跨域（CORS）；无法通过前端代码绕过 CORS。长期使用或多人分享请自行部署兼容代理，将正式密钥存储在后端。不要把正式密钥提交到仓库。项目不内置任何付费 API 密钥，也未验证你个人服务账号的额度或模型权限。

翻译失败保留原文并提供重试，不自动切换服务。MyMemory 文档：https://mymemory.translated.net/doc/spec.php 、 https://mymemory.translated.net/doc/usagelimits.php 。兼容协议参考：https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create 、 https://api-docs.deepseek.com/ 。LibreTranslate 协议参考：https://docs.libretranslate.com/api/operations/translate/ 。

电脑音频使用 getDisplayMedia，需要在共享窗口选择带音频的标签页 / 屏幕，并勾选共享音频。浏览器不提供音频轨道时会明确提示；不保证所有应用窗口均可采集。共享包含视频轨道是浏览器接口要求，应用只读取音频，视频不显示、不存储、不上传。

## 边界

- 目前是分段实时字幕，非逐字流式字幕；Whisper tiny 对远场、噪声、口音和专业术语可能不准确。
- 同时处理一个识别 / 翻译任务；积压 5 段自动暂停收音并处理剩余队列。
- 暂停保留已收集的段落继续处理。原始音频只留在内存，任务结束即释放，不提供录音回放。
- 仅保留当前课堂记录，开始新课堂前需导出；刷新时未完成的音频无法恢复。
- 未加入说话人区分或术语表；付费服务需用户自行配置账号和密钥。
- 首次交付需要用户在自己的设备上验证麦克风权限、模型完整下载和实际课堂延迟。

## 检查

`node --test tests/*.test.mjs` 验证 UTF-8 API 分段、SRT 时间戳、语音分段、重采样、多 API 请求协议、地址校验、错误处理与密钥脱敏。付费服务测试使用模拟响应，不调用真实付费接口。
`node --check dist/app.js` 检查入口语法。

界面的“使用指南 → 查看示例字幕”为显式示例，不参与导出，不冒充真实识别结果。

“使用英文示例测试”会真实运行本地识别和当前模式翻译，不使用麦克风。示例来自 Transformers.js 官方文档使用的公开 JFK 音频：https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav 。测试结果不加入课堂导出。
