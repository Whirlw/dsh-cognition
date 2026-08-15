# DSNLE — 给你的 DSH agent 一份项目记忆

> **DSNLE** 让你的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agent
> **记住你的项目**。
>
> 新任务自动带上你修过的历史:相似任务的历史编辑作为先例出现,越界修改被 scope 锁拦下,
> 认知跨会话持续积累——全部由 DSH 原生机制执行(全工具闸门、内核级版本守卫、skills 知识层、
> 会话事件溯源),不是提示词技巧。
>
> **诚实状态**:研究原型,但实现可用——47 次真实仓库修复通过上游测试验收、去 gold 化连续
> 20 任务 20/20、245 项确定性回归;边界公开([docs/research/](docs/research/))。

[English](README.md)

---

## 快速开始(3 步)

需要:Node.js ≥ 22 + DeepSeek Harness(运行中)。

```bash
git clone https://github.com/scd13150/dsh-cognition.git && cd dsnle
node install-dsnle.mjs --set-default     # 创建 dsnle 预设并设为 DSH 默认(自动备份原配置)
```

**然后重新打开 DSH(或新建一个会话)**,新会话应看到:

- 工具列表里有 `nle_suggest` / `nle_focus` / `nle_mutate` / `nle_select` / `nle_guard` 等
- 技能目录出现 `nle-learned-*` 与 `nle-reflections`

**验证**:新会话里跑一次 `nle_check`(无参数),返回 `ok: true` 即安装成功。

### 其他安装方式

- **不想改全局默认**:去掉 `--set-default`,装完在 DSH 设置页把默认预设(agent-presets → default)手动改为 `dsnle`;或仅对特定会话选择该预设
- **加进你现有的预设**(如 router-standard):`node install-dsnle.mjs --into router-standard`(自动备份 agent.cordis.yml)
- **查看将做什么**:任何命令加 `--dry-run`

### 卸载 / 回滚

- 独立模式:删除 `~/.dsh/.agent-presets/dsnle/`;若改过默认预设,恢复 `~/.dsh/settings.yaml.bak-*`
- 注入模式:恢复 `~/.dsh/.agent-presets/<预设>/agent.cordis.yml.bak-*`

### 故障排查

| 现象 | 处理 |
|---|---|
| 新会话没有 nle_* 工具 | 确认会话用的是 dsnle 预设(设置页查看);**已运行会话不会自动获得新预设**,必须新开会话 |
| 新会话起不来(挂载失败) | 恢复上述备份,然后到本仓库开 issue(附上 `agent.cordis.yml` 与报错) |
| 有工具但技能目录空 | 不影响核心链路;检查 `.dsh/skills/nle-reflections/SKILL.md` 是否在持续更新 |

## 它能做什么

**记忆**(社区呼声最高的能力):
- **learned**:任务关键词 → 相关文件的共现记忆,带置信度(命中 +0.15 / 未命中 −0.1)、衰减、弃用、跨项目提升;以 DSH skill 形式呈现,随项目作用域隔离
- **precedent 先例**:检索本项目历史会话里"相似任务的真实编辑轨迹",新任务直接拿到先例文件
- **git 信号**:全历史共改矩阵、高频热点(churn)、近期回滚(revert)——冷启动也有依据
- 全部落盘 `.dsh/skills/nle-reflections/SKILL.md` 与状态文件,跨会话、跨进程存续

**约束**(防止乱改):
- 强制工作流:`nle_suggest → nle_focus →(nle_impact)→ 编辑 → nle_select → nle_guard`,
  未定向的源码编辑被 `WORKFLOW_MISSING_SUGGEST` 等 deny 拦截
- scope 锁 + 证据推翻机制(`nle_reorient`,测试失败/先例可重定向)
- shell 绕行防护(全工具统一闸门,不只编辑器)

**观测**:内容哈希 cell、CON 码(CON200/404/405/422)、写前版本守卫(stale 拒绝)、
工具层 + 文件层双真相交叉对账(编辑说谎会被 guard 抓出)。

**可靠**:变更文件契约门(声明 vs 真相)、guard 总闸(PATCH_GAP/时序/预算)、
状态防篡改、闭合反射(五信号熔合成 observations,修正 learned)。

## 语义通道(可选)

语义检索是**可选增强**,不启用自动降级 BM25 + 符号/先例/共改检索,主链路不受影响:

```bash
node nle-semantic/server.mjs --spool <工作区>/.nle-semantic
```

- 模型:[Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2)(quantized,~90MB),**不随仓库分发**,transformers.js 首次运行自动下载
- 离线:有网机器先跑 `node nle-semantic/server.mjs --selfcheck` 生成缓存再迁移;或不用语义通道
- 自检:`node nle-semantic/server.mjs --selfcheck` → `{"ok":true,"dim":384}`

## 已知边界(诚实声明)

- **"长期"是初步证据**:连续 20 卡(单仓库单日)累积有实证;跨仓库、跨月、有害累积无数据——期待真实使用补上
- 中文任务对英文代码库召回弱(learned/alias 兜底)
- 插件是 agent 平面工具,**不提供安全隔离**;scope 锁是工作流约束,不是权限边界
- DSH 处于 developer preview,官方声明会有兼容性破坏——本插件会跟着适配

## 研究附录(docs/research/)

40 卡实验逐卡数据(P6/P7_DATA)、四角度审计裁定(AUDIT_ADJUDICATION)、机制规格
(DSH_NLE_SPEC / NLE_DSH_FIT)、价值评估与实验纪律(NLE_VALUE_ASSESSMENT / HANDOFF)——全部保留,可核查。

## 开发

```
nle-rules-core.mjs        规则唯一源(仓库根,插件经 import 引入)
nle-plugin/
  dsnle-plugin.mjs        [生成] 持久插件(preset 挂载入口,勿手改)
  frag-apply-*.mjs ×4     apply 函数体碎片(改插件逻辑改这里)
  build-dsnle.mjs         纯拼接构建器
nle-semantic/server.mjs   语义/git 信号 helper(可选)
install-dsnle.mjs         安装脚本(standalone / --into 两模式)
```

改代码 → `node nle-plugin/build-dsnle.mjs` → 重跑安装脚本 → 新会话生效。
回归:`node smoke-test.mjs`(无文件依赖纯函数断言,32 项)。

## License

[MIT](LICENSE)
