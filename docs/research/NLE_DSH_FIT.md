# NLE × DSH 适配研究:V1-V4 顺序能否吃透 DSH 能力(2026-08-14)

> 依据:DSH_NLE_SPEC.md(HANDOFF 第二步要求以当前版本复核 API)+ 本次 Inspect 实测(Service/Event 目录与精确契约)。
> 范围:仅 DSH 一个 harness,不考虑 Cursor/Codex 等。
> 结论先行:**顺序成立,且 DSH 是比 Cursor 更适合 NLE 靶心(长期持续认知)的宿主;需 4 处顺序/内容调整(见 §4),全部是"提前利用 DSH 独有能力",不改变 V1→V4 主线。**

---

## 1. 20 项机制 × DSH 原生能力映射(已用 Inspect 确认,非猜测)

| # | 机制 | DSH 落点(当前版本实测契约) | 判定 |
|---|------|------------------------------|------|
| 1 | preToolUse deny(缺 orient 拒写) | `tools/pre-execute`(waterfall)→ `PreToolDecision` deny;exec = {name, 已解析 arguments, caller agent} | ✅ 原生 |
| 2 | scope lock(越界 deny) | 同一 pre-execute 监听;路径判定用 `fs.resolve`/`fs.processPath`/`fs.contains` | ✅ 原生 |
| 3 | tier T0-T3 | `nle_suggest` 返回 tier 建议 → ritual 记录 → pre-execute 按 tier 分支 | 插件逻辑(无阻力) |
| 4 | impact 审查 | 新工具 `nle_impact` + pre-execute 对高影响路径查 impactAt | 插件逻辑 |
| 5 | shell 绕行防护 | pre-execute 扫描 `pwsh` 工具 `arguments.command`(写指示符+源码路径)→ deny。**DSH 优势:所有工具统一过这一瀑布**,不只编辑器 | ✅ 原生+增强 |
| 6 | suggest 检索 | 插件工具;冷/full/learned 三模式沿用内置门;**DSH 独有:可用 `sessionQuery.searchEvents/searchSessions` 做"会话日志共变"增强;别名 KB 可存 `settings`** | ✅ 可增强 |
| 7 | focus | 插件工具 + allowedPaths;内置门已有 | ✅ 已有 |
| 8 | PLO 观测 | `tools/post-execute` 从 exec.arguments(old/new_string、contents)合成 hunk;**`fs/observed`(emit)提供权威版本观测**(present with its version)可作 cell sourceHash 源 | ✅ 原生 |
| 9 | PEC 状态机 | 插件状态机;**`fs/edit-intent` 原生版本守卫是 stale 检测的可靠触发源** | ✅ 原生支撑 |
| 10 | overlay 意图 | `nle_mutate` 工具:`fs.editText(target, edit, {version}, ..., sandboxPolicy)` + overlay 写盘,同一事务语义 | 插件逻辑 |
| 11 | CON 码全套 | `nle_check` 输出;插件逻辑 | 插件逻辑 |
| 12 | preread enrich | **`tools/post-execute` 可替换/丰富结果内容**(契约原文:"Accept, replace, enrich, or block")——read 结果前注入 CON404 等提示,确认可行 | ✅ 原生 |
| 13 | guard 收据 | `nle_guard` 工具:ritual 合规 + CON + 预算(≤30s/≤32 文件/1 命令);shell 验证走 `subprocess`(带 AbortSignal) | 插件逻辑 |
| 14 | select 审计 | `nle_select` 工具:声明实际改动 vs suggested(漂移审计)+ learned 写回 | 插件逻辑 |
| 15 | learn 回路 | select 写回 learned(状态文件或 settings);miss 记录;跨会话检索可用 sessionQuery | 插件逻辑 |
| 16 | session 生命周期 | **`agent/session-start`(emit)开任务;`agent/turn-stopping`(serial)或 `agent/disposed` 自动闭合;`agent/pre-step` 可注入提醒** | ✅ 原生 |
| 17 | 会话隔离 | **scope-filtered dispatch 是原生特性**:通过 agent 作用域注册监听器只收宿主调用,配合 session.id/cwd 判定后代,不再依赖不可靠的 isOwnedBy 链(修 HANDOFF 教训) | ✅ 原生 |
| 18 | 持久化 | 状态文件 `fs.writeText(..., sandboxPolicy)`(需 sessionPolicy,已确认);或 `storageDomain`/`sessionPersistence.append` | 插件选择 |
| 19 | Edit Lease | **`fs/edit-intent`:single-slot,首个返回的 {version} 守卫生效——所有 editText(不只 nle_mutate)都被版本约束,内核级不可绕过** | ✅ 原生 |
| 20 | block 粒度 | 文件粒度(规格已降级 P2) | 维持 |

**结论:20 项里 12 项有原生落点直接支撑,8 项是纯插件逻辑(无 DSH 阻力)。没有任何一项需要 workaround。**

---

## 2. DSH 独有能力(Cursor/Codex 给不了,规格应吃透)

| # | 能力 | 机制 | 对 NLE 靶心的意义 |
|---|------|------|--------------------|
| A | **每步上下文注入** | `agent/pre-step`(可替换进入步骤的消息)+ `systemPrompt.context`(每步动态上下文)+ `systemPrompt.section`(常驻规则段) | 观测信号(漂移/最近活跃/ritual 状态)从"被动等 agent 读"变成"每步主动可见"——**这是"持续认知"保鲜机制的最强形态,Cursor 只有 beforeSubmitPrompt,远弱于此** |
| B | **全工具统一闸门** | pre/post-execute 覆盖 read/write/edit/glob/grep/pwsh/subprocess 全部工具 | shell 绕行防护真正可执行(不只编辑器路径);观测无死角 |
| C | **内核级 Edit Lease** | fs/edit-intent 对每一次 editText 强制版本 | stale 检测不可绕过;外部改动即刻暴露 |
| D | **作用域过滤分发** | 按 agent 作用域注册监听器 | 宿主/子代理门控原生解决,修掉 HANDOFF 的 isOwnedBy 坑 |
| E | **跨会话检索** | `sessionQuery.searchEvents/traceSession`、`sessionPersistence` | learn 回路可用"会话日志共变"(历史任务一起改过哪些文件)增强 suggest;教训知识天然跨会话——**"长期"的检索面是原生的** |
| F | **配置/知识可进 settings** | `settings.register(ns, schema)`(有 UI、可持久化、revision 并发控制) | 别名 KB、tier 配置不再裸 JSON |
| G | **双保险硬闸** | `tools.guard`(pre-execute 瀑布之后的同步单调守卫)+ `sandboxPolicy`(OS 级纵深,与 scope lock 正交) | 防止插件瀑布被第三方 listener 覆盖;shell 绕过有第二、三层兜底 |
| H | **自动挂载部署** | agent preset / 宿主组成行:插件随会话自动挂载;作用域注册可**影子覆盖**宿主内置 nle_* 工具(tools.register "Scoped tools shadow globals") | "长期"的部署前提:新会话不用手动 cordis_define。Cursor 需手动装,DSH 一个 preset 全局生效 |

---

## 3. V1-V4 顺序评估

### V1 强制链 —— 顺序正确,杠杆最大
直接修 5063 三根因(无强制 orient / suggest 糙 / 无 shell 防护),且 V1 五项在 DSH 上全部是 pre-execute 分支,无技术风险。要点:
- tier 分级由 suggest 返回,ritual.tier 记录;
- preread enrich 用 post-execute 替换 read 结果(已确认可行);
- shell 防护扫 pwsh 的 arguments.command。

### V2 观测完整 —— 正确,且 DSH 让它更可靠
PEC 的 stale 触发源用 fs/edit-intent(版本不符即 stale),CON404 不再是"事后比对"而是"写前拦截";fs/observed 可作权威版本源。overlay 扩展(declaredImports→数组)为纯数据模型扩展。

### V3 收尾 —— 正确,需补两件事
guard/learn/持久化之外:
1. **定"最终部署形态"**:状态文件位置(建议工作区根 `.dsnle-state.json`,跨会话延续)+ 插件 preset 化准备(代码结构上把"会话级动态插件"与"可挂载 preset"解耦,见 §5);
2. learned KB 优先进 settings(有 UI,可人工修 alias)。

### V4 集成 —— 正确,需加一项验收
工具链闭环 + exp-host-pristine 回归之外,加:**新会话自动挂载 + 状态文件跨会话延续的验收**(这是"在 DSH 上完美生效"的最后一环,原规格未写)。

---

## 4. 顺序调整(4 处,全部是"提前吃 DSH 独有能力")

| # | 调整 | 理由 |
|---|------|------|
| 1 | **把"每步上下文注入"(能力 A)提前进 V1** | 规格的 DSH 映射把"上下文注入"列为一等机制,但它被隐性地放到了后期。实现成本低(一个 systemPrompt.context 注册 + 状态快照序列化),收益却是"观测信号每步可见"——这是 DSH 相对 Cursor 的最大差异点,应该最早用、尽早验证 |
| 2 | **V2 的 PEC 与 fs/edit-intent 联动** | stale 检测从"check 时比对"升级为"写前版本守卫"(能力 C),这是 V2 观测完整性的 DSH 版本,不是可选项 |
| 3 | **V3 增加持久化位置决策 + preset 化准备** | "长期"的物理前提是状态文件跨会话 + 插件自动挂载(能力 H);拖到 V4 之后会让"长期"永远停留在演示层 |
| 4 | **V4 增加跨会话验收项** | 新会话(或 subagent)自动挂载、旧状态文件被新会话读到、影子覆盖内置门生效 |

其余保持 V1→V4 主线不动。

---

## 5. 最终形态(让"长期"成立)

```text
1. 开发期:动态 Cordis 插件(cordis_define/run),V1-V4 快速迭代 —— 会话级,状态文件在工作区根
2. 交付期:同一套代码以 agent preset / 宿主组成行挂载(editing-cordis-compositions skill 流程)
   → 每个新会话自动生效,工具以作用域注册影子覆盖宿主内置 nle_* 七件套(缺 guard/impact 的版本)
   → .dsnle-state.json 跨会话延续:cells/learned/ritual 全部真实累积
   → "长期持续认知"的部署闭环:preset(自动挂载)+ 状态文件(跨会话记忆)+ pre-step 注入(每步保鲜)
```

**影子覆盖是 DSH 独有的优雅点**:内置门(宿主全局注册的七件套)不用动,新实现以作用域注册同名工具即自动优先(Cursor 没有"作用域 shadow"概念,升级 NLE 要改安装产物)。

---

## 6. 实现时待验证点(不阻塞顺序决策)

| # | 待验证 | 影响 |
|---|--------|------|
| 1 | post-execute 替换 read 结果的 PostToolDecision 精确字段 | preread enrich 写法 |
| 2 | pre-execute 对 subagent 调用的 exec.agent 形态;scoped 监听器与后代判定的组合 | 会话门控实现 |
| 3 | fs/editText 版本不符的失败语义(冲突码)与 post-execute 错误结果形态 | PEC stale 触发链 |
| 4 | fs/edit-intent 的 actor 参数内容(可据此区分工具/插件) | Edit Lease 判据 |
| 5 | 状态文件写盘的 sandboxPolicy(sessionPolicy)在插件上下文的确切取法 | 持久化 |
| 6 | 动态插件里 `settings.register` 是否可用(需查 Builtin/依赖注入面) | learned 存 settings 的可行性 |
| 7 | 动态插件注册工具的正规路径:handoff 记的 `harness.defineTool` vs `ctx.tools.register`(后者自带 guard/scope 语义) | 工具注册写法 |

---

## 7. 一句话结论

V1→V4 顺序**成立且无需重排主线**;DSH 对 NLE 不是"又一个能跑的宿主",而是**靶心(长期持续认知)的最优宿主**——版本守卫内核级、观测信号每步可注入、跨会话检索原生、preset 自动挂载让"长期"成为部署事实。需做的不是改顺序,而是把 §4 的 4 处"提前吃独有能力"并入对应阶段。
