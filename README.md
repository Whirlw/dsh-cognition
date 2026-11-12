# DSNLE — A project memory for your DSH agent

> **DSNLE** gives your [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agent
> **a memory of your project**.
>
> New tasks start with what you already did: edits from similar past tasks surface as
> precedents, out-of-scope edits get blocked, and knowledge keeps accumulating across sessions —
> enforced by DSH's native mechanisms (per-tool gates, kernel-level version guards, the skills
> knowledge layer, session event sourcing), not by prompt tricks.
>
> **Honest status**: a research prototype with a *working* implementation — 47 real-repo fixes
> verified by upstream test suites, a gold-free 20-task continuous run (20/20), 245 deterministic
> regression assertions — and openly documented boundaries ([docs/research/](docs/research/)).

> **This is a fork** — [Whirlw/dsh-cognition](https://github.com/Whirlw/dsh-cognition), forked from
> [scd13150/dsh-cognition](https://github.com/scd13150/dsh-cognition) at `500caf2`. Three commits fix
> what broke on DSH 0.2.1: the bundle install registered **no tools at all**, the git channels crashed,
> and C# was not treated as source. **Install steps differ from upstream** — see
> [What this fork changes](#what-this-fork-changes).

[中文](README.zh.md)

---

## What this fork changes

Fork of [scd13150/dsh-cognition](https://github.com/scd13150/dsh-cognition) at `500caf2`, plus three
commits (`git log 500caf2..main`). The ritual chain, opt-in gating, learned/precedent memory, `root`
semantics and the preset installer are upstream, untouched. Everything below is this fork.
Everything was verified on DSH `0.2.1-rc.3`, Windows desktop profile.

### 1. The bundle install registers tools again — `fix(load)`

Installed as a bundle (`dsh plugin add`), upstream loads cleanly and registers **zero** tools, with no
error anywhere. On DSH 0.2.x `fs` and `tools` are **agent-scoped** services: a profile-level entry sees
`ctx.get('fs') === undefined`, and `apply()` returns before the tool table is built. Upstream only ever
mounts per agent (via `install-dsnle.mjs` → preset), which is why the author never hit this.

`nle-plugin/dsnle-agent-mount.mjs` listens for `agent/created` (payload `{ agent, source, signal }`) and
mounts the plugin into each agent's `ctx`; `cordis.patch.yml` now inserts only the mounter. Verified: 13
tools per agent, and `~/.dsh/logs/nle-apply.log` ends with `{"phase":"apply-ready","tools":13}`.

### 2. Semantic helper: one instance, and it autostarts — `fix(semantic)`

- **`server.pid` lock, taken before the model loads.** A DSH restart leaves the previous ~1.2 GB helper
  alive; without the lock the next spawn added a second one. A stale pid is taken over.
- **Autostart, no supervision.** The mounter spawns the helper (detached, output to
  `<workspace>/.nle-semantic/server.log`) for a workspace that already has `.dsnle-state.json`.
  `NLE_SEMANTIC=off` disables it, `NLE_SEMANTIC=on` forces it for any workspace. One helper per
  workspace; the lock rejects duplicates, so restarting DSH never stacks processes.
- **git channels fixed.** Three real defects: a full `git log --name-only` blew V8's string limit
  (`Invalid string length`) so *every* co-change request failed; a project root below the repo root
  produced doubly-prefixed keys so co-change never matched; Unity repos inflated the payload to ~2.5 MB
  with `.meta`/`.prefab` noise. Now bounded with `-n`, prefix derived from
  `git rev-parse --show-toplevel`, source paths only.

### 3. C# / ShaderLab / HLSL are source — `feat(rules)`

`SOURCE_RE` listed only `js|mjs|cjs|jsx|ts|tsx|py`, so on a Unity project `nle_suggest` returned
**nothing** — the plugin was blind to the code it was meant to remember. Extensions and source-dir
segments are now shared constants (`SOURCE_EXTS`, `SOURCE_DIRS`; adding `uxml|uss` is one line), the five
inline extension regexes reuse them, and `SCAN_SKIP_DIRS` covers
`Library/Temp/obj/Logs/UserSettings/PackageCache/TextMesh Pro/…` — the scanner walks at most **120
directories**, and Unity artefacts ate the whole budget.

### Install this fork

```bash
git clone https://github.com/Whirlw/dsh-cognition
dsh plugin --profile <profile> add link:/path/to/dsh-cognition
# or without cloning:
dsh plugin --profile <profile> add github:Whirlw/dsh-cognition
```

Point the profile at the **clone or the git repo**. There is no npm release of this fork, and the fixes
live in the package files: installing a copy without them silently reverts to *installed, no tools*.
Restart DSH (new JS modules need a new process), then run `nle_check` in a fresh session.

Upstream's preset route (`node install-dsnle.mjs`) still works and needs none of this — it already
mounts per agent.

### Where the data lives

| Path | What | Notes |
|---|---|---|
| `<workspace>/.dsnle-state.json` | the memory: `root`, ritual lock, cells, `learned`, `aliasKB`, `highImpact` | per workspace; the only file worth backing up |
| `<workspace>/.dsh/skills/nle-reflections/SKILL.md` | `learned` snapshot exposed as a skill | regenerated |
| `<workspace>/.nle-semantic/` | helper spool: `server.pid`, `server.log`, transient `*.req/res.json` | safe to delete |
| `~/.dsh/logs/nle-apply.log` | this fork's load/autostart diagnostics | a few lines per session |

Reinstalling the plugin never touches the memory. Changing `root` orphans `learned`: entries carry
`projectId = fnv1a(root)`.

### Semantic channel (this fork)

```bash
cd nle-semantic && npm i @huggingface/transformers   # once; ~550 MB with onnxruntime
node server.mjs --selfcheck                          # downloads the 87 MB model → {"ok":true,"dim":384}
```

After that the mounter starts it automatically. If the dependency is missing, the spawn exits and only
`<workspace>/.nle-semantic/server.log` records why. Semantics **re-rank** an existing candidate pool —
they cannot rescue a zero-candidate query, so Chinese-only tasks still need `aliasKB` or accumulated
`learned`.

### Known limits of this fork

- The 120-directory scan budget is why `root` stays narrow (reference setup: `Assets/Game`, 118
  directories, 490 `.cs` files, queue drained). A wider `root` silently scans less.
- `learned` is per workspace and shared through one file: two sessions running NLE tasks in the same
  workspace clobber each other on the last write.
- The mounter attaches on `agent/created`, so sessions already open when you install keep their old tool
  list until a new session or a restart.
- One helper per NLE-initialised workspace: ~180 MB after load, ~1.2 GB after heavy embedding.

---

## Quick start(3 steps)

Requires: Node.js ≥ 22 + a running DeepSeek Harness.

> Upstream's preset route: it still works in this fork as-is. What the three commits fix is the
> **bundle** route in [Install this fork](#install-this-fork) — on DSH 0.2.x prefer it.

```bash
git clone https://github.com/scd13150/dsh-cognition.git && cd dsnle
node install-dsnle.mjs --set-default    # creates the dsnle preset and makes it DSH's default (backs up your config)
```

**Then restart DSH (or open a new session)** — the new session should show:

- `nle_suggest` / `nle_focus` / `nle_mutate` / `nle_select` / `nle_guard` … in your tools
- `nle-learned-*` and `nle-reflections` in your skill catalog

**Verify**: run `nle_check` (no args) in the new session — `ok: true` means installed.

### Other install modes / uninstall / troubleshooting

- Keep your global default untouched: omit `--set-default`, then set the default preset in DSH settings (agent-presets → default), or pick `dsnle` per session
- Inject into an existing preset: `node install-dsnle.mjs --into <preset-id>` (backs up agent.cordis.yml)
- Dry-run any command with `--dry-run`
- Uninstall: delete `~/.dsh/.agent-presets/dsnle/` (+ restore `settings.yaml.bak-*` if you changed the default); injected mode: restore `agent.cordis.yml.bak-*`
- **No tools in a new session?** The session must use the dsnle preset (check settings); **running sessions never pick up new presets — always open a fresh session**

## 怎么工作

每个任务走一条可审计的 ritual 链(强制,乱序改码会被 deny):

```
nle_suggest(定位检索)→ nle_focus(锁 scope)→ [nle_impact(高影响声明)]→ 编辑
→ [nle_reorient(证据推翻 scope)]→ nle_select(对账收尾)→ nle_guard(总闸)
```

| 层 | 机制 | DSH 原生落点 |
|---|---|---|
| 约束 | 强制链 + scope 锁 + shell 绕行防护 + 版本守卫 | `tools/pre-execute` 瀑布、`fs/edit-intent` 内核版本守卫 |
| 观测 | 内容哈希 cell + CON 码(CON200/404/405/422)+ 真相对账 | `tools/result` 冻结结果、`fs` 意图观测 |
| 记忆 | learned(关键词→文件,置信度/衰减/跨项目提升)+ precedent(历史会话先例)+ git 共改/churn/rollback | `skills` provider、`sessionQuery` 会话检索 |
| 可靠 | 契约门(声明 vs 真相)、guard 总闸、状态防篡改、反射观测 | 事件溯源日志、`tokenMeter` 成本报告 |

完整工具说明:调用 `nle_suggest` 等工具的 schema 即自带描述;机制规格见
[docs/research/DSH_NLE_SPEC.md](docs/research/DSH_NLE_SPEC.md)。

## 语义通道(可选)

语义检索(embedding 重排)是**可选增强**,不启用时自动降级为 BM25 + 符号/先例/共改检索,主链路不受影响。

启用:运行独立 helper 进程(transformers.js 首次运行自动下载模型,~90MB,缓存于 HF 缓存目录):

```bash
node nle-semantic/server.mjs --spool <工作区>/.nle-semantic
```

- 模型:[Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2)(quantized),384 维,**不随本仓库分发**,由 transformers.js 自动下载或从 HF 缓存复用
- 离线环境:预先在有网机器跑一次 `node nle-semantic/server.mjs --selfcheck` 生成缓存再迁移;或干脆不用语义通道
- 自检:`node nle-semantic/server.mjs --selfcheck` → `{"ok":true,"dim":384}`

**For DSH plugin developers**: this repo also ships
[docs/DSH_DEV_EXPERIENCE.md](docs/DSH_DEV_EXPERIENCE.md) — battle-tested deep-dive notes
(dynamic-plugin sandbox traps, fs five-arg contract, preset generations, sessionQuery
deployment differences, tool-pipeline events) distilled from building DSNLE on `dsh`.
**For DSH 插件开发者**:仓库另附 [docs/DSH_DEV_EXPERIENCE.md](docs/DSH_DEV_EXPERIENCE.md)
——从零到 85KB 持久插件的全部踩坑提炼(动态插件沙箱陷阱、fs 五参契约、preset 代际语义、
sessionQuery 部署差异、工具管线事件),与 NLE 本体无关,可独立阅读。

## 已知边界(诚实声明)

- **"长期"是初步证据**:连续 20 卡(单仓库单日)累积曲线有实证;跨仓库、跨月、有害累积无数据——这正是开源想从真实使用中获得的
- 中文任务对英文代码库召回弱(learned/alias 兜底)
- 语义通道依赖独立 helper 进程;FTS 全文检索若部署禁用(`openAt: "never"`),precedent 走字面扫描降级
- 插件注册为 agent-plane 工具,**不提供安全隔离**;作用域锁是 workflow 约束而非权限边界

## 研究附录(docs/research/)

| 文档 | 内容 |
|---|---|
| DSNLE_JOURNEY.md | 全程历程与版本链 |
| P7_REFACTOR.md | 模块化重构 + P7 三机制 + 实验后修复 |
| P6_DATA.md / P7_DATA.md | 40 卡实验逐卡数据(含去 gold 化 20 卡) |
| AUDIT_ADJUDICATION.md | 四角度深度审计裁定(修了什么/裁定不修什么及理由) |
| NLE_DSH_FIT.md / DSH_NLE_SPEC.md | 机制规格与 DSH 契合论证 |
| NLE_VALUE_ASSESSMENT.md / REPLAY_REPORT.md / HANDOFF.md | 价值评估、轨迹重放、实验纪律 |

## 开发

```
nle-plugin/
  nle-rules-core.mjs      ← 仓库根(规则唯一源,插件经 import 引入)
  dsnle-plugin.mjs        ← [生成] 持久插件(preset 挂载入口,勿手改)
  frag-apply-*.mjs ×4     ← apply 函数体碎片(改插件逻辑改这里)
  build-dsnle.mjs         ← 纯拼接构建器
nle-semantic/server.mjs   ← 语义/git 信号 helper(可选)
install-dsnle.mjs         ← 安装脚本(standalone / --into 两模式)
```

改代码 → `node nle-plugin/build-dsnle.mjs` → 重跑安装脚本(覆盖 preset 内副本)→ 新会话生效。
规则层回归:`node smoke-test.mjs`(无文件依赖纯函数断言)。
实验装置完整回归(fixture-gate 245 断言)依赖实验仓库,不在本仓库分发。

In this fork `nle-plugin/dsnle-plugin.mjs` also writes load diagnostics to `~/.dsh/logs/nle-apply.log`
(`apply-enter` / `early-return` / `register-skipped` / `apply-ready`). `build-dsnle.mjs` regenerates that
file from `frag-apply-*.mjs`, so a rebuild drops the diagnostics; `nle-plugin/dsnle-agent-mount.mjs` is a
standalone file and survives.

## License

[MIT](LICENSE)
