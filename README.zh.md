# DSNLE — DeepSeek Harness 的项目记忆与认知层

> **DSNLE(Neural Link Engine)** 是运行在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh`)上的
> **agent 项目记忆层**:让 coding agent 对项目建立**长期持续认知**——不是一次性检索工具,
> 而是四层自洽机制,全部长在 DSH 原生能力上(全工具闸门、内核级版本守卫、skills 知识层、会话事件溯源):
>
> **约束 → 观测 → 记忆 → 可靠**
>
> 状态:**研究原型 + 可用实现**。47 个真实仓库修复(官方断言验收)、245 项确定性回归、
> 去 gold 化连续 20 卡实验全过(20/20)。诚实边界见 [docs/research/](docs/research/)。

[English](README.md)

---

## 快速开始(3 步)

```bash
git clone <this-repo> dsnle && cd dsnle
node install-dsnle.mjs            # 创建 dsnle agent preset(或 --into <现有预设id> 注入)
```

然后在 DSH 中**新建会话**并选择 `dsnle` 预设(注入模式下直接新开会话)。
新会话自动获得 `nle_*` 工具与 `nle-learned`/`nle-reflections` 技能。

**前置**:DSH 运行时,agent 预设组装启用(`~/.dsh/.agent-presets/`)。
**卸载**:删除 `~/.dsh/.agent-presets/dsnle/`(注入模式恢复 `agent.cordis.yml.bak-*`)。

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
