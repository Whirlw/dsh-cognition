# DSNLE 四角度深度审计裁定(2026-08-15 深夜)

> 四角度:①原版对照机制审计 ②拼接一致性审计 ③修复闭环审计 ④fixture 覆盖审计。
> 本文件是**裁定记录**:哪些修了、哪些裁定不修及理由——防止同一"遗漏"被反复提出。

---

## 一、已修复(本轮,fixture 227→245 全绿)

| # | 来源 | 问题 | 修复 |
|---|---|---|---|
| 1 | ②[高] | remapLearned 根段数错配(bench-host 两段根 vs 固定剥一层)→ 跨项目 learned 重映射错位 | 复用 rootOfFile 段数判定,对称剥换 |
| 2 | ②[中] | precedent 支持度键与过滤键空间分裂('./x' vs 'x') | 提取后统一去 ./ 再 norm |
| 3 | ②[中] | nle_alias set 裸路径不归一 → 非规范键进 aliasKB | 先 resolveBlock 归一再转 exp-host 规范形 |
| 4 | ③[中] | 路径双轨(focus 补前缀/mutate 透传)→ 项目相对输入被 SCOPE_DRIFT 误拦(HANDOFF 教训 7 另一半) | 新增 resolveToolPath(磁盘存在性裁决),mutate/rebind/expand_import/check/forget 五处接入 |
| 5 | ③[低] | writeChain 死变量残留 | 删除 |
| 6 | ①[高] | nle_mutate 新文件 cell 不写回 → overlay 声明静默丢失 | editText 后 `cells[rel] = cell` + 版本更新 |
| 7 | ①[高] | nle_impact declared 只收集不对账("声明与 patch 同事务"名存实亡) | select 增加 impactAudit 对账(声明未编辑/高影响未声明),入 selectLog 与返回 |
| 8 | ①[中] | health-trend semantic 硬编码 'off'(空字段) | 取最近 suggest telemetry 的实测 semantic 值 |
| 9 | ①[高] | micro-agent 相似度被降级为 binary includes(precedent 零贡献原因之一) | taskSimilarity/precedentHit 纯函数(overlap 阈值 0.22)接入 precedentOf |
| 10 | ①[高] | Reflector 原版信号源未接入 | 接入 CON405 漂移计数(Signal 1 的 DSH 版)+ deny 轻摩擦归因 |
| 11 | ①[中] | path-confinement 缺失 | toRel 显式拒绝 `..` 遍历段 |
| 12 | ④ | taskKeys/extractImports/常量快照/aliasKeyHit 零直测 | fixture 补直测断言(+18 项) |

## 二、裁定不修(记录在案,勿再当"遗漏"重提)

### 已由 DSH 原生机制覆盖/超越(自建=重复造轮子)

| 原版机制 | 裁定理由 |
|---|---|
| append-only 哈希链 session 事件 + workflow-trust 反伪造 | **DSH 事件溯源会话日志本身就是防篡改 append-only**;tools/result 冻结 + auditTruth 三源对账已是更强实现;.dsnle-state.json 是缓存非审计源,NLE_STATE_TAMPER deny 已防直改 |
| world freshness 四类漂移 | fs/edit-intent 内核版本守卫 + CON405 已覆盖"写前 stale"核心价值;overlay baseHash/双门/收据是原版边图模型概念,DSNLE 的 per-cell overlay 模型不等价也不应硬搬 |
| PEC-FSM 转移表 | candidate/confirmed/stale + CON422 检查存在;FSM 形式化对当前三态无实质增益 |
| CON421 跨域 import 拒绝 | inProject 门控 + SOURCE_PATH_RE + 沙盒纵深已覆盖;DSNLE 语境跨域 import 非主要风险 |
| runtime provenance 边(layer_runtime) | 原版为浏览器 vite 宿主设计;DSNLE 无浏览器运行时场景,无意义 |
| browser 运行时诊断(Signal 2) | 同上,宿主不适用 |
| CDP capability-score / HFAT ROI 评分 | 实验装置层评分,非运行时机制;telemetry 已足,评估留在实验脚本 |
| guard-run-ingest / receipt-ingest | DSH 会话日志 + telemetry 已承担;per-run report.json 是原版文件侧产物,无消费方 |

### 架构性刻意不做(ADR/成本裁定)

| 原版机制 | 裁定理由 |
|---|---|
| AST 解析器(calls/complexity/stores/writes) | **ADR-0012 已否决**:overlay 声明优先于推断式解析;原版自己也弃用(rollback-only) |
| evolver / budget knapsack / block 模型 | DSNLE 无 block 模型(刻意简化);learned 条目 + 文件键模型够用 |
| instinct 指纹/action/防重放全量 | 部分吸收(置信度+衰减+promote 已有);trigger 指纹与 action 待 learned 条目加 action 字段时一并评估(候选,非必做) |
| micro-agent 独立上下文 subagent 化 | precedent 通道插件内直做;量级上来再迁 ctx.subagents(成本门控) |
| preread-enrich 富上下文(capabilities/deps/lessons) | 依赖 block 模型;DSNLE 以每步快照注入 + CON405 注入承担 |
| observation next_actions/error_recovery sentinel | DSNLE 工作流驱动靠每步上下文注入(DSH 独有),next_actions 是原版对宿主弱的补偿 |
| git notes / blame / lastModified | 边际价值低;`log -S` pickaxe 列为候选(见下) |
| deinit / editor-boundary | host 特定(vite editor gateway),DSNLE 无对应宿主 |

## 三、候选清单(明确未做,按价值排序,进入下一轮)

1. **git pickaxe(`log -S`)**:bug 引入历史是定位金矿;server.mjs 加 kind,建议做成 nle_pickaxe 工具(agent 主动查)而非反射信号。
2. **focus 自动含 1-hop 依赖**:exactImporters 已有,可让 nle_focus 目录输入时自动并入直接依赖文件(原版 computeAllowedPaths 精神,DSNLE 版无 AST 依赖图故限 1-hop)。
3. **learned 条目 action 字段**:instinct 的 trigger→action 残片;需先有 action 消费方(skill 渲染 + suggest 输出),当前无消费方故搁置。
4. **semantic 持久向量缓存**:内存 cache 200 条重启重嵌;量大时再考虑持久索引。

## 四、验证基线(本轮结束时)

fixture-gate **245 pass, 0 fail**;verify-state 15/15;install 自检 10/10;双形态语法检查通过;持久插件已重建(84KB),下一个新会话自动生效。
