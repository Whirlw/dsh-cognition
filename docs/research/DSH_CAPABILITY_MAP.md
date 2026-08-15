# DSH 能力地图(面向 NLE 移植修复,2026-08-14)

> 来源:勘察 `@deepseek-ai/dsh`(v0.1.0-rc.6)monorepo 各包 README.zh.md + 运行时状态(`C:\Users\42427\.dsh\`)。
> 用途:移植修复前摸清 DSH 原生能力,决定"哪些机制长在 DSH 上"而非搬原版代码。
> 版本基线:dsh rc.6,动态插件 = cordis_define/run(进程内存态)。

---

## 一、现状:移植版已用 vs 未用

| 已用(移植版) | 未用(本地图新增) |
|---|---|
| `tools/pre-execute`(deny 门禁) | `ctx.skills` 技能注册表(知识层) |
| `tools/post-execute`(enrich) | `ctx.sessions` 事件溯源日志(审计层) |
| `fs/edit-intent`(版本守卫 waterfall) | `ctx.subagents`(编排/独立臂) |
| `systemPrompt.context`(每步注入) | `ctx.tokenMeter`(成本计量) |
| `sandboxPolicy`(沙盒) | `ctx.tools.restrict`(工具可见性掩码) |
| — | `agent.inject/steer/followup`(注入三模式) |
| — | `agent/pre-step` reject(步骤级门禁) |
| — | `dsh-schedule`(持久周期提醒) |
| — | `dsh-goal`(事件溯源目标状态) |
| — | `dsh-session-reference`(跨会话有界快照) |
| — | `dsh-headless`(一次性任务,实验自动化) |
| — | `sessionProjections`(跨任务统计折叠) |
| — | `cordis_inspect what:api/events`(运行时 API 查询) |

---

## 二、机制详解(按修复需求)

### A. 知识层:`ctx.skills`(@deepseek-ai/dsh-skill + dsh-skill-filesystem)

**本质**:纯 skill 注册表,`ctx.skills.registerProvider(create)` / `ctx.skills.register(skill)`;消费方 `dsh-tool-skill` 在每次 `agent/pre-step` 把**目录(name+description,默认 ≤500 字符)**渲染进模型上下文,正文经 `skill` 工具按需加载。

**对修复的意义**:
1. **项目天然隔离**:filesystem 提供方发现根 = `<projectRoot>/.dsh/skills`(rank 100)、`.agents/skills`(200)、custom、`$DSH_HOME/skills`(400)——项目根 = 最近 `.git` 祖先。**知识随仓库走,克隆=迁移**。移植版"跨项目/适配性"死穴被原生解决。
2. **零常驻 token 成本**:目录只含摘要;正文按需加载。对比移植版 systemPrompt.context 每步注入。
3. **promote/retire 天然**:注册/注销/替换目录(digest 变化触发 `<system-reminder>` 替换);正文每次加载重读文件,无 hash/修订协议——**改文件即更新**,learned 动态写入无需失效协议。
4. **注册表可编程**:`registerProvider` 的同步工厂接收 `{ signal, invalidate }`——NLE 可注册 `nle-learned` provider,从状态文件**实时渲染** learned 条目为 skill(置信度写进 description),retire = 从候选剔除。
5. **调用策略**:frontmatter `disable-model-invocation` / `user-invocable`——learned 可只对模型可见。
6. **提升路径**:项目根 skill(rank 100)→ 用户根 `$DSH_HOME/skills`(400)——对应原版 instinct project→global promotion(≥2 项目)。

**边界**:发现深度一层(`<root>/<name>/SKILL.md` 或 `<name>.md`);目录 digest 只覆盖 name/description(正文编辑不改 digest);watcher 用 chokidar + `fs/observed` 同步失效。

### B. 审计层:`ctx.sessions`(@deepseek-ai/dsh-session)

**本质**:事件溯源的仅追加会话日志 = agent 全部历史的唯一真源;LLM 消息历史由它派生。

**对修复的意义**:
1. **防篡改审计轨迹**:`session.append(type, data)` 快照+冻结;`session/event`(延后写)+`session/flush`(受等待检查点);`session/event` 可声明合并扩展自定义事件类型。guard 对账可以从"插件状态文件"升级为"会话日志事实"(工具层 tools/result + 会话层 tool/result 双冻结)。
2. **崩溃恢复**:`TOOL_NOT_STARTED` / `TOOL_OUTCOME_UNKNOWN` 合成结果——DSH 自己追踪"工具调用是否跑完",guard 的 GHOST 判定可借用。
3. **fork 谱系**:`sessions.fork(source, boundary)` 带 parentSession 元数据——每任务 fork = 实验副本原生形态。
4. **turn/step 闭合**:`dsh-session/invariant` 检查序号单调、轮次闭合、工具调用/结果配对——严格回放拒绝伪造。
5. **成本数据**:`assistant/chunk { type:'usage' }` 每步用量;`request/header` 全量快照。

**边界**:自定义事件类型在动态 JS 插件里的运行时可用性**未验证**(TS 声明合并是编译期)——Phase 0 spike 验证;验证不过则保留 `.dsnle-state.json` + NLE_STATE_TAMPER 现状。

### C. 编排层:subagents / inject / restrict / pre-step

1. **`ctx.subagents`**:registerProvider + start(startContinuable) + followup/interrupt/report + `registerContinuableSetup`(子级作用域能力)。`toolFilter`(子代理工具限制)、`persona`、`outputSchema`(结构化结果)、`depthLimit`。→ 原版 `micro-agent.js`(独立上下文相似先例学习)原生映射;**裸臂实验用子代理且与实验臂同构**(修方法学缺陷)。
2. **`agent.inject`**(不唤醒的 next-step 上下文)/ **`agent.steer`**(中途引导)/ **`agent.followup`**(新轮次)——上下文注入三模式,按需选,替代无差别每步注入。
3. **`ctx.tools.restrict(filter)`**:per-agent 工具可见性掩码——scope lock 下沉到"模型根本看不到工具",比 deny 更强。注意:是可见性组合,不是权限边界。
4. **`agent/pre-step`**:waterfall,`{kind:'reject'}` 可拒绝整个步骤(先于单工具 pre-execute)。
5. **`tools/post-execute` additionalContexts**:结果后追加有序上下文(FIFO)——preread enrich 的官方形态;`ToolRunContext.deferContext` 可把上下文推迟到工具结果抵达。

### D. 计量与实验

1. **`ctx.tokenMeter`**:replay-aware 计量;`measure()` 返回 request/surface tokens;投影 `tokenUsage`(真实用量)、`contextPressure`、`projectedTokens`、`contextBreakdown(system/tools/messages)`。→ 移植版"每步注入成本未计量"直接可测;guard 收据可带成本。
2. **`sessionProjections` 注册表**:fold + seq 门 + JSON 检查点持久化(如 tokenUsage、subagentTiming 单元)。→ 移植版 telemetry 可注册为原生投影单元;跨任务累积曲线(health-trend)用它持久化。
3. **`dsh-headless`**:`dsh --profile headless "task"`,一次性任务,最后 turn/end → exit 0/1;不挂 HTTP/浏览器。→ E1-E4 实验自动化骨架。
4. **`dsh-session-reference`**:`dsh-session:<base64url(json(id))>` URI,有界快照(≤3 源、≤64KB,untrusted 警告 framing)。→ 跨会话记忆现成通道。
5. **`dsh-goal`**:事件溯源目标状态(goal/change 全快照、revision 校验、严格回放)。→ WorkflowSession 的参考形态;单目标限制。
6. **`dsh-schedule`**:持久提醒(≥5min 周期,会话事件拥有状态)。→ 周期维护(freshness 扫描)可选;注意仅会话本地、需模型侧工具,收益未证。
7. **`cordis_inspect`**:`what:api`(服务签名)/ `what:events`(事件词汇)/ `what:client`——运行时查全部 API,修复期不再猜。

### E. 执行/文件层(已用机制的补全)

- `fs/edit-intent` waterfall:single-slot;`replaceIfVersion`/`{version}` 语义,`FS_STALE_VERSION` 错误带恢复指令("re-read the file, then retry")。
- `fs/observed`:read/write/edit 成功后的同步发后即忘事件(记录器约定)。
- 工具流水线顺序:`tools/pre-execute` → 单调 `ctx.tools.guard` → `tools/execute`(包装层)→ `tools/post-execute` → `finalizeContent` → 仅观测 `tools/result`;持久事件 `tool/result`。pre-execute 有意不允许改写 arguments(参数=日志事实)。
- 动态插件工具集:`cordis_define`(注册,不运行)/`cordis_run`(运行,更新 revision)/`cordis_stop`/`cordis_undefine`/`cordis_inspect`——**进程内存态,重启即失**,官方建议持久形态 = 写项目文件/常规插件。

---

## 三、DSH 没有的(必须自建)

| 能力 | 状态 | 结论 |
|---|---|---|
| embedding/向量检索 | 无原生 | 自建;但**原版仓库已缓存 Xenova/all-MiniLM-L6-v2 量化模型 + onnxruntime-node + 799KB 向量索引**,离线可恢复(见修复计划 Phase 2) |
| 依赖图全自动构建 | 无 | 移植版 BFS 影响半径已够用,保持 |
| 多 agent lock | 无 | 明确不做(P6) |

---

## 四、当前部署事实(勘察记录)

- 运行形态:`start-dsh.bat` → `npx @deepseek-ai/dsh web --port 3080`(rc.6,web profile)。
- `C:\Users\42427\.dsh\` 存在:profiles(web 空组合)/ sessions / skills(model-dispatch 唯一)/ storages / settings.yaml。
- dsnle-2 完全靠动态注入(cordis_define/run)活在进程里;重启需按 DEPLOYMENT.md 恢复序列重装。

## 五、结论

DSH 把原版 NLE 认知层基础设施大部分原生内置:知识(project-scoped skills)、隔离(fork + agent.ctx + tools.restrict)、审计(事件溯源日志 + 冻结工具结果 + token-meter)、编排(subagents + inject/steer + schedule)、实验(headless + projections)。**修复方向 = 让 NLE 长在 DSH 原生机制上;唯一自建 = 语义检索(有本地模型缓存)。**
