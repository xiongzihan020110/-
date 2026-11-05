# GitHub Pages 部署

目标仓库：https://github.com/xiongzihan020110/-

1. 将本目录内容上传到 main 分支。
2. 在仓库 Settings → Pages 中，将 Source 设置为 GitHub Actions。
3. 打开 Actions → Test and deploy ClassBridge，运行工作流或重新运行。
4. 以工作流返回的 page_url 为准，确认发布成功后再使用链接。

预计地址：https://xiongzihan020110.github.io/-/ （发布成功前不可视为可用）

网页内容位于 dist，采用相对路径，支持 /-/ 子目录。无需 npm install。
所有密钥由用户在页面中自行填写，刷新即清除。切勿把课堂记录、模型缓存、.env 或 API Key 上传到仓库。
