# nle-semantic — 语义/git 信号 helper(可选)

独立进程服务,经文件 spool 协议与 DSNLE 插件通信。**不启用时插件自动降级 BM25 + 符号/先例/共改检索,主链路不受影响。**

## 启动

```bash
node server.mjs --spool <工作区>/.nle-semantic
```

- 启动后监听 `<spool>/*.req.json`,写 `<id>.res.json` 应答
- 三种请求 kind:
  - `{ text }` → embedding(384 维)
  - `{ kind: 'gitcochange', root, prefix }` → 仓库共改矩阵(键带 root 前缀)
  - `{ kind: 'gitchurn' | 'gitrollback', root, prefix, sinceDays? }` → 高频文件 / revert 提交(反射信号)

## 模型(不随仓库分发)

- 模型:**Xenova/all-MiniLM-L6-v2**(quantized,~90MB)
- 获取方式:transformers.js **首次运行自动下载**到 HF 缓存(通常 `~/.cache/huggingface` 或 `~/.huggingface`);本仓库**不打包模型文件**
- 离线:在有网机器先跑 `node server.mjs --selfcheck` 生成缓存,把缓存目录随环境迁移;或直接不用语义通道
- 自检:`node server.mjs --selfcheck` → `{"ok":true,"dim":384,"model":"Xenova/all-MiniLM-L6-v2"}`
- 依赖:`@huggingface/transformers`(在实验仓库 node_modules 中;本仓库使用者自装 `npm i @huggingface/transformers`)
