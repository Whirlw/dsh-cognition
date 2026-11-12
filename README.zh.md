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

> **这是 fork** —— [Whirlw/dsh-cognition](https://github.com/Whirlw/dsh-cognition),上游
> [scd13150/dsh-cognition](https://github.com/scd13150/dsh-cognition) 的 `500caf2` 加三个 commit。
> 修的是在 DSH 0.2.1 上坏掉的三件事:**bundle 安装一个工具都不注册**、git 通道崩溃、C# 不算源码。
> **安装方式与上游不同**,见[本 fork 的差异](#本-fork-的差异)。

[English](README.md)

---

## 本 fork 的差异

上游 [scd13150/dsh-cognition](https://github.com/scd13150/dsh-cognition) 的 `500caf2` + 三个 commit
(`git log 500caf2..main`)。仪式链、opt-in 门控、learned/先例、`root` 语义、preset 安装脚本都是上游原样;
下面是本 fork 的改动,全部在 DSH `0.2.1-rc.3`(Windows 桌面)实测。

### 1. bundle 安装重新能注册工具 —— `fix(load)`

用 `dsh plugin add` 装上游,插件会**正常装载、但一个工具都不注册**,而且哪里都不报错。原因是 0.2.x 里
`fs` 与 `tools` 是 **agent 作用域**服务:profile 层的入口 `ctx.get('fs')` 是 undefined,`apply()` 在建表
之前就 return 了。上游只走 preset 安装(本身就是 per-agent),所以作者没遇到过。

新增 `nle-plugin/dsnle-agent-mount.mjs` 监听 `agent/created`(载荷 `{ agent, source, signal }`),把插件
挂进每个 agent 的 `ctx`;`cordis.patch.yml` 改成只挂这个挂载器。实测:每个 agent 13 个工具,
`~/.dsh/logs/nle-apply.log` 末尾是 `{"phase":"apply-ready","tools":13}`。

### 2. 语义 helper:单实例 + 自启动 —— `fix(semantic)`

- **`server.pid` 单实例锁,在加载模型之前判定**:DSH 重启后旧 helper 还活着,没锁就会叠出第二份 1.2GB 进程;陈旧 pid 会被接管
- **自启动、不监管**:挂载器为「已有 `.dsnle-state.json`」的工作区以 detached 方式拉起 helper(输出到
  `<工作区>/.nle-semantic/server.log`)。`NLE_SEMANTIC=off` 关、`NLE_SEMANTIC=on` 强制开;每个工作区一份,锁挡重复
- **git 通道修好**:全量 `git log --name-only` 撑爆 V8 字符串上限(`Invalid string length`),共改请求全部失败;
  子目录 root 会双写前缀导致永远查不中;Unity 仓库里 `.meta`/`.prefab` 把载荷撑到 2.5MB。现在加了 `-n` 上限、
  用 `git rev-parse --show-toplevel` 反推前缀、只保留源码路径

### 3. C# / ShaderLab / HLSL 算源码 —— `feat(rules)`

`SOURCE_RE` 只有 `js|mjs|cjs|jsx|ts|tsx|py`,在 Unity 工程上 `nle_suggest` 返回空——插件对自己该记的代码
视而不见。扩展名与源码目录段抽成共享常量(`SOURCE_EXTS` / `SOURCE_DIRS`,以后加 `uxml|uss` 只改一行),
5 处内联正则统一引用;`SCAN_SKIP_DIRS` 补 `Library/Temp/obj/Logs/UserSettings/PackageCache/TextMesh Pro/…`,
因为扫描器每轮最多走 **120 个目录**,Unity 产物会把预算吃光。

### 装本 fork

```bash
git clone https://github.com/Whirlw/dsh-cognition
dsh plugin --profile <profile> add link:/path/to/dsh-cognition
# 或免克隆:
dsh plugin --profile <profile> add github:Whirlw/dsh-cognition
```

必须指向**克隆目录或 git 仓库**:本 fork 没有 npm 发布,修复都在包文件里,装一份不含修复的副本就会退回
「装了但没工具」。装完重启 DSH,新会话跑 `nle_check`。上游的 preset 安装(`node install-dsnle.mjs`)照样可用。

### 数据在哪

| 路径 | 内容 | 说明 |
|---|---|---|
| `<工作区>/.dsnle-state.json` | 记忆本体:`root`、任务锁、cells、`learned`、`aliasKB`、`highImpact` | 按工作区隔离;唯一值得备份的文件 |
| `<工作区>/.dsh/skills/nle-reflections/SKILL.md` | `learned` 的技能快照 | 自动重写 |
| `<工作区>/.nle-semantic/` | helper spool:`server.pid`、`server.log`、瞬时 `*.req/res.json` | 可随便删 |
| `~/.dsh/logs/nle-apply.log` | 本 fork 的装载/自启动诊断 | 每会话几行 |

重装插件不动记忆;改 `root` 会让 `learned` 失效(条目带 `projectId = fnv1a(root)`)。

### 语义通道(本 fork)

```bash
cd nle-semantic && npm i @huggingface/transformers   # 一次性,含 onnxruntime 约 550MB
node server.mjs --selfcheck                          # 下载 87MB 模型 → {"ok":true,"dim":384}
```

之后由挂载器自动拉起。依赖缺失时 spawn 会退出,只在 `<工作区>/.nle-semantic/server.log` 留痕。
语义只做**重排**,不能把 0 候选救回来——纯中文任务仍需 `aliasKB` 或已积累的 `learned`。

### 本 fork 的已知限制

- 120 目录扫描预算,所以 `root` 要保持窄(参考:`Assets/Game`,118 目录 / 490 个 `.cs`,队列跑空);`root` 放太宽会静默少扫
- `learned` 按工作区隔离但共用一个文件:同一工作区两个会话同时跑 NLE 任务,后写的覆盖前者
- 挂载器在 `agent/created` 时挂载,所以安装前已开着的会话要等新会话或重启才看到工具
- 每个初始化过 NLE 的工作区一份 helper:装载后约 180MB,重活后约 1.2GB

---

## 快速开始(3 步)

需要:Node.js ≥ 22 + DeepSeek Harness(运行中)。

> 下面是上游的 preset 路线,在本 fork 里照样可用。三个 commit 修的是**bundle 路线**
> (见[装本 fork](#装本-fork)),0.2.x 上建议走那条。

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

本 fork 的 `nle-plugin/dsnle-plugin.mjs` 还会把装载诊断写到 `~/.dsh/logs/nle-apply.log`
(`apply-enter` / `early-return` / `register-skipped` / `apply-ready`)。该文件由 `build-dsnle.mjs` 从
`frag-apply-*.mjs` 重新生成,所以重建会丢掉这段诊断;`nle-plugin/dsnle-agent-mount.mjs` 是独立文件,不受影响。

## License

[MIT](LICENSE)
