# DSH-NLE 完整实现规格

> 目标:在 DSH 上完整实现 NLE core(ANSC 工作流),利用 DSH 原生机制(工具钩子、fs 意图、会话作用域、上下文注入)替代 Cursor hook + MCP,使 NLE 全部机制闭环。
> 原则:不完整实现不测试;每模块实现后做实现验证(自测),再做行为实验。
> 状态(2026-08-15 晚):**V1→V5.9 已落地;V6 修复(P0-P5)+ 部署 + P6 二十卡长期实验全部完成**(20/20 PASS、85 断言全绿、learned 45%→90%)。实现历程见 DSNLE_LOG.md,价值判定见 NLE_VALUE_ASSESSMENT.md,完整历程见 DSNLE_JOURNEY.md,修复计划见 DSNLE_REPAIR_PLAN.md,进展见 P0_PROGRESS.md,实验数据见 P6_DATA.md。

## 一、范围

- **Core(必做)**:workflow ritual(T0-T3)、scope lock、impact 审查、shell 绕行防护、suggest/focus 检索、PLO 观测、PEC 状态机、overlay 意图、CON 码全套、preread enrich、guard 收据、learn 回路、workflow session 生命周期
- **Optional(不做)**:Editor Gateway / Authoring Bridge / Browser diagnostics(bionic 宿主特定,原版亦标注非 core)
- 模型推理、IDE UI:不做(NLE 边界)

## 二、机制清单与 DSH 映射

| # | NLE 机制 | 原版实现 | DSH 实现(本插件) | 状态 |
|---|----------|----------|-------------------|------|
| 1 | preToolUse deny(缺 orient 拒写) | workflow-gate.js preToolUse | `tools/pre-execute` 检查 ritual:无 suggest → deny `WORKFLOW_MISSING_SUGGEST`;无 focus → `WORKFLOW_MISSING_FOCUS` | ✅ 已有 |
| 2 | scope lock(越界 deny) | allowedPaths | pre-execute 路径检查 | ✅ 已有 |
| 3 | tier T0-T3 | workflow-tier.js | 任务分级:编辑前按 tier 要求强制步骤;T2/T3 强制 suggest→focus;T3 加 impact | ✅ 已有 |
| 4 | impact 审查 | nle_impact + getImpactRadius | nle_impact 工具:高影响路径(store/slices/核心)必须 impact 覆盖否则 deny;V5.7 升级依赖图 BFS 可达集 | ✅ 已有(增强) |
| 5 | shell 绕行防护 | SHELL_WRITE_INDICATORS + git backstop | pre-execute 对 pwsh 命令扫写指示符+源码路径 → deny `WORKFLOW_SHELL_WRITE` | ✅ 已有 |
| 6 | suggest 检索 | 关键词+中文域映射+别名集群+RRF | V5.7 语义检索:BM25(中文 bigram 降权)+ offers 符号标注(+4)+ alias KB(+5)+ learned(+6)+ co-change 提权(+2);cold/full/learned 三模式 | ✅ 已有(超越原版 RRF 降级) |
| 7 | focus | blocks+深度 | focus:精确范围(文件/目录);V5.9 目录递归展开为文件级列表(focusExpanded) | ✅ 已有 |
| 8 | PLO 观测 | surface-extractor | post-execute hunk→import 面→cell | ✅ 已有 |
| 9 | PEC 状态机 | pec-fsm.js | cell.pecState:candidate→confirmed→stale,CON422 门槛 | ✅ 已有 |
| 10 | overlay 意图 | overlay-store | declaredImports + overlay 记录(扩展) | ✅ 已有 |
| 11 | CON 码 | CON200/403/404/422/405 | check 输出全套 | ✅ 已有 |
| 12 | preread enrich | preread-enrich.js | tools/pre-execute 对 read/grep 注入 cell 状态提示(CON404 等) | ✅ 已有 |
| 13 | guard 收据 | local-guard + guard-plan | nle_guard:收尾总闸(workflow 合规+CON 检查+预算);V5.9 增加 DSH 原生真相对账(GHOST/COVERAGE/BYPASS) | ✅ 已有(增强) |
| 14 | select 审计 | nle_select | select:意图 vs 实际;V5.9 契约门(声明 vs 真实编辑,overclaim 拒绝学习) | ✅ 已有 |
| 15 | learn 回路 | instinct/miss_report | select 写回 learned + miss 记录;V5.2 脏数据过滤;V5.9 只学真实编辑 | ✅ 已有(完整) |
| 16 | session 生命周期 | workflow-session.js | 任务开合自动清理 | ✅ 已有 |
| 17 | 会话隔离 | — | session 门控(仅宿主+后代)+ arm 分域 | ✅ 已有 |
| 18 | 持久化 | .nle/ JSONL | 状态文件(扩展 schema 4:ritual/cells/learned/patches/aliasKB/telemetry/coChange) | ✅ 已有 |
| 19 | Edit Lease(hash 编辑) | mutate-bridge | nle_mutate hash-bound 编辑(fsVersion 版本守卫)+ fs/edit-intent | ✅ 已有 |
| 20 | block 粒度 | blocks.js | 文件粒度(block 注册表成本高,列为 P2 可选) | 降级 |
| 21 | 语义索引 | 原版 MiniLM embedding | V5.7 BM25 过渡 → **V6 恢复真 embedding(all-MiniLM-L6-v2 本地缓存)+ RRF 融合** | ✅ V6(待部署) |
| 22 | co-change 共改 | git-analyzer(Jaccard) | V5.8 遥测矩阵过渡 → **V6 恢复 git 历史 Jaccard(helper 通道,真实仓库 3055 commits 验证)** | ✅ V6(待部署) |
| 23 | guard 信任边界 | 原版(内部自查) | V5.9 DSH 跨层对账:tools/result(工具层冻结)+ fs intent/internal-dispatch(文件层)+ 声明,三源交叉(类 3) | ✅ 已有(超越原版) |
| 24 | 依赖图 | 原版(1-hop) | V5.7 nle_impact BFS 可达集(直接+间接 importers) | ✅ 已有(超越) |
| 25 | 状态防篡改 | 原版(无) | V5.9 `NLE_STATE_TAMPER` deny:状态文件只由插件 persist 写入 | ✅ 已有(新增) |
| 26 | learned 项目隔离 | 原版 instinct project_id | V6 `projectId(fnv1a(root))` + scope(project/global/quarantine);真实状态文件迁移:4 归因/1 quarantine | ✅ V6 |
| 27 | learned 置信度/弃用 | 原版 Bayesian + retire | V6 命中 +0.15 封顶 0.9 / 未命中 −0.1 → retired;`nle_forget` 手动弃用 | ✅ V6 |
| 28 | learned → 技能目录 | 原版无 | V6 `ctx.skills` provider(nle-learned,rank 250):目录摘要零常驻成本,正文按需加载 | ✅ V6(待部署) |
| 29 | 认知新鲜度/矛盾 | 原版 freshness/contradicts | V6 `isLearnedAged`(30 天)+ `markLearnedConflicts`(组内/跨 global 重叠) | ✅ V6 |
| 30 | 健康趋势 | 原版 health-trend | V6 `trendPoint/pushTrend`,guard 每任务追加(累积曲线数据) | ✅ V6 |
| 31 | 成本计量 | 原版无 | V6 guard 收据 `cost { surfaceTokens, totalTokens }`(ctx.tokenMeter) | ✅ V6(待部署) |

## 三、数据模型

```text
WorkflowSession { taskId, tier, status(open/oriented/editing/closed), task, openedAt, closedAt }
Ritual(per session) { locked, task, tier, suggested[], focus[], allowedPaths[], impactCovered[], edits[], selectLog, guardLog, denyCount }
Cell(per arm, per file) { file, sourceHash, surfaceImports[], declaredImports[], pecState, overlay[], updatedAt }
Learned(per arm) { keys[], files[] } + MissRecord { task, suggested[], actuallyEdited[], at }
```

## 四、工具集(完整)

nle_suggest(task, mode, root, arm) → 建议+tier 建议+锁定(语义通道:embedding RRF 重排 + git 共改,经独立 helper 进程)
nle_focus(blocks) → 精确范围(仅 after suggest)
nle_impact(name) → 影响半径审查(T3 强制)
nle_mutate(file, old, new, overlay_import, note) → hash-bound 编辑
nle_rebind(file) → 磁盘重读
nle_check(file?) → CON 码+ritual 状态
nle_select(edited) → 审计+学习+闭合
nle_guard() → 收尾总闸(workflow/CON/预算/**成本报告 cost**)
nle_reset() → 手动清理
nle_forget(file) → learned 手动弃用(V6 新增)
(+ nle_expand_import P1 可选;语义/git 通道:experiment/nle-semantic 独立进程,spool 协议)

## 五、强制链(对应原版 L0-L4)

- L0:任务开始必须 suggest(suggest 返回 tier 建议)
- L1:pre-execute 硬拦——无 orient 拒写;越界拒写;T3 未 impact 拒写;shell 写源码拒写
- L2:post-execute 记录——patch→cell;preread enrich 注入
- L3:nle_check / nle_select 审计
- L4:nle_guard 总闸 PASS/FAIL

## 六、实现阶段与验收

| 阶段 | 内容 | 验收(实现验证) |
|------|------|----------------|
| V1 强制链 | tier 分级、缺 orient deny、impact、shell 防护、preread enrich | 单测:每 deny 分支触发正确 code;shell 命令样本被拦 |
| V2 观测完整 | PEC 状态机、CON 全套、overlay 扩展 | 单测:PEC 迁移、CON422/405 输出 |
| V3 收尾 | nle_guard 总闸、learn miss 记录、持久化扩展 | 单测:guard PASS/FAIL 分支 |
| V4 集成 | 全工具链闭环 + 合成宿主回归(防回归,非行为实验) | 全机制冒烟 |

## 七、明确的"不做/降级"(历史决策,当前状态)

- block 粒度(文件粒度,P2)——仍降级
- **语义检索:过渡状态**——原版 MiniLM embedding 检索未移植(受限环境无网络下载模型,BM25 为过渡替代,此前误标"类 1 修复",已更正);**恢复计划见 DSNLE_REPAIR_PLAN.md P2(本地模型缓存已找到,离线可恢复)**
- **co-change:过渡状态**——原版 git 历史 co-change(git-analyzer Jaccard)未移植,此前审计误判为"原版遗漏"并自建遥测矩阵替代;**恢复计划见 DSNLE_REPAIR_PLAN.md P3**
- Editor/Authoring Gateway、浏览器诊断——不做
- 多 agent lock(P6)——不做

## 八、按类修复记录(2026-08-14,用户质疑驱动)

用户质疑"实验测的 NLE 与想象中的不相同"→ 缺陷审计 → 三类实现缺陷按类修复,全部落地:

| 类 | 缺陷 | 修复 | 版本 |
|----|------|------|------|
| 类 1 | 原版 embedding 检索被复刻替换(contains/BM25,环境无网络下载模型) | BM25(中文 bigram 降权)+ offers 符号标注(+4)为**过渡替代**;真实 MiniLM embedding + RRF 融合恢复计划见 DSNLE_REPAIR_PLAN.md P2 | V5.7(过渡)→ 修复中 |
| 类 4 | impact 只 1-hop | 依赖图 BFS 可达集 | V5.7 |
| 类 2 | 原版 git 历史 co-change 未移植(审计时误判"原版遗漏",实为移植遗漏) | 对称矩阵 + suggest 提权(+2)为**过渡替代**;git-analyzer(Jaccard)移植计划见 DSNLE_REPAIR_PLAN.md P3 | V5.8(过渡)→ 修复中 |
| 类 3 | guard 盲点(状态自查可伪造/漏记) | DSH 跨层真相对账(tools/result + fs intent + internal/dispatch)+ NLE_STATE_TAMPER + select 契约门 + focus depth 展开 | V5.9 |

缺陷归属结论(2026-08-14 修正):实现缺陷大头 = 原版语义索引(embedding)/co-change(git 历史)被复刻砍掉或未移植——**此前以"修复/补遗漏"名义表述失实,已更正为"过渡替代 + 修复计划"**;原项目缺陷 = 方向锁定无推翻机制(已超越原版做 reorient);共同空白 = 依赖图全自动构建、观测层累积曲线验证。

## 九、与"测试白测"教训的对应

之前 5063 失败暴露:无强制 orient(agent 可跳过仪式直接动手)+ suggest 糙(锁错文件)+ 无 shell 防护。V1 直接修这三个根因。后续实验(如果有)必须在 V4 完整实现后做,且每轮用独立工作区、官方判定、禁外部取证。
