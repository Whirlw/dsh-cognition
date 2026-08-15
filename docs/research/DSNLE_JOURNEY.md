# DSNLE 历程与成果总览(Neural Link Engine)

> 全称:**Neural Link Engine(神经链接引擎)**——"agent 对项目的长期持续认知"。
> 本文记录从用户质疑 → 缺陷审计 → 按类修复 → 真实项目验证 → 最终评估的完整历程。
> 技术细节见 DSNLE_LOG.md(实现日志)与 DSH_NLE_SPEC.md(机制规格);价值判定见 NLE_VALUE_ASSESSMENT.md。

---

## 一、NLE 是什么

**定义**:让 agent 对项目建立**长期持续认知**的系统——不是一次性检索工具,而是四层自洽机制:

| 层 | 回答的问题 | 核心机制 |
|----|-----------|----------|
| 感知 | 相关代码在哪 | BM25 语义检索 + offers 符号标注 + alias KB + co-change 共改矩阵 |
| 约束 | 怎么保证不乱改 | 强制链(suggest→focus→impact→edit→select)+ CON 观测 + hash 版本守卫 + shell 防护 |
| 记忆 | 认知怎么沉淀 | learned(关键词→文件)+ coChange 矩阵 + aliasKB 配置化,跨会话持久化 |
| 可靠 | 认知怎么防污染 | 存在性校验 + select 契约门(只学真实编辑)+ DSH 跨层真相对账 |

**实现形态**:DSH 动态 Cordis 插件 `dsnle-2`(host-only,per-agent 作用域),12 个 nle_* 工具 + 3 类钩子(pre/post-execute、fs 意图观测、每步上下文注入),规则单一源 `nle-rules-core.mjs`。

---

## 二、历程(一句话时间线)

```
残缺版行为实验(nle-1)        ← 用户质疑:"测的 NLE 和我想象的不相同"
        ↓
缺陷审计(REPLAY_REPORT)     ← 缺陷归属:实现缺陷(语义索引/co-change 被砍)> 原项目缺陷(方向锁定)> 共同空白
        ↓
V1-V4 完整实现(dsnle-2)     ← 强制链/观测完整/收尾/集成,独立实现不复刻旧 artifacts
        ↓
L3 行为验证 + reorient 闭环  ← 9 任务 × 2 臂 + 5063 证据推翻 scope
        ↓
真实项目验证(7 修复)        ← moment×4 + flask×1 + axios×2,官方断言 30/30
        ↓
冷启动验证                   ← axios 同副本:第 1 任务第 1 名 → 第 2 任务 learnedHit
        ↓
按类修复(用户质疑驱动)       ← 类 1+4 语义检索 → 类 2 co-change → 类 3 guard 对账
        ↓
最终评估                     ← 机制完整自洽(初步证实);"长期"维度待验证
```

---

## 三、关键转折:用户的质疑与缺陷审计

**质疑**:"怎么总感觉这些实验测的 NLE 和我想象中的 NLE 不相同"

**审计结论(REPLAY_REPORT.md)**——缺陷归属三类:

1. **实现缺陷(大头)**:原版语义索引/co-change 共改/block 语义标注被复刻时砍掉(SPEC §7 降级 + SPEC 未提遗漏)
2. **原项目缺陷**:方向锁定无推翻机制——已**超越原版**实现 nle_reorient(证据驱动重定向)
3. **共同空白**:依赖图全自动构建、观测层累积曲线验证

**应对**:按类修复,而非堆实验。用户明确拒绝 SWE-bench 式低效测试,要求真实项目验证。

---

## 四、按类修复(全部落地,2026-08-14)

| 类 | 缺陷 | 修复 | 验证证据 |
|----|------|------|----------|
| **类 1+4** | contains 检索太糙;impact 只 1-hop | BM25 语义检索(中文 bigram 降权)+ offers 导出符号标注(+4);依赖图 BFS 可达集 | fixture 122→126;flask "session cookie 签名密钥轮换" 概念词任务 → sessions.py 第 1 名 |
| **类 2** | co-change 共改矩阵被砍 | 对称共改计数 + suggest 提权(+2,强信号邻居) | **A/B 隔离对照**:learned 清空后,有 coChange cart.js 第 7 / 无 coChange 第 8,与 index.js 互换位次,+2 独立生效 |
| **类 3** | guard 盲点:插件状态自查,伪造/漏记不可自证 | **DSH 跨层对账**:tools/result(冻结结果)+ fs intent + internal/dispatch(文件层)+ 声明三源交叉;`NLE_STATE_TAMPER` 防状态篡改;select 契约门(overclaim 拒绝学习);focus 目录深度展开 | 冒烟:edit 状态文件被 deny;guard 对账零 GHOST/COVERAGE/BYPASS;select 声明未编辑文件 → contract=['NLE_SELECT_OVERCLAIM'] 且 learned 不含该文件 |

类 3 设计前置调研发现 DSH 原生机制优于"插件自证":`tools/result`(emit,frozen)、`fs/edit-intent`(waterfall,工具显式触发)、`internal/dispatch`(官方观察手段)。过程中抓出 4 个实现 bug(tamper 位置、双斜杠、尾斜杠前缀、waterfall 短路)并修复。

---

## 五、真实项目战绩(7 个修复,官方断言 30/30)

| 项目 | 修复 | 验收 |
|------|------|------|
| moment(T1) | format 原型链 | 官方断言通过 |
| moment(T2) | weekyear dow 语义 | 官方断言通过 |
| moment(T3) | 浮点精度 | 官方断言通过 |
| moment(T4) | isValid | 官方断言通过 |
| flask(T1) | session cookie 签名密钥轮换 | 官方断言通过(3 步) |
| axios(冷启动 T1) | 同步拦截器 | 9/9 断言 |
| axios(T2) | 尾部墓碑 | 8/8 断言 |

**A/B 定位成本对照**(裸臂用独立子代理,消除主代理记忆污染):
NLE 臂平均 **0.4 read** vs 裸臂平均 **5 read**——定位成本差异真实成立,验收两臂持平。

**冷启动验证**(axios 同副本连续任务):
第 1 任务(冷启动)suggest 第 1 名 Axios.js → 9/9;第 2 任务 learnedHit=true,第 2 名 InterceptorManager.js → 8/8。认知积累曲线(短期)有实证。

---

## 六、验证栈(确定性回归)

- **L2 fixture-gate**:137 断言(检索命中表/shell 防护表/guard 判定表/BM25 单元/co-change 单元/真相对账单元/契约门单元),秒级全绿
- **verify-state**:15 项状态一致性
- **L1 replay**、**L4 telemetry-report**:五类事件埋点统计
- 真实项目官方断言脚本:7 个(30/30)

---

## 七、最终评估(诚实版)

**机制设计上:是,已经是一个完整自洽的好系统骨架,且每个核心机制都有真实项目证据。**

- 自洽性:检索(单一规则源+137 断言)、认知写入(契约门)、guard(跨层对账)——不是工具集合,是系统
- 初步证实:7 真实修复 30/30、A/B 0.4 vs 5 read、冷启动第 1 名→learnedHit

**"好系统"的完整证明还差两个维度(不夸大)**:

1. **样本量**:7 个修复、5 个 A/B 任务——方向明确,统计意义有限
2. **"长期"未被验证**:定义里最重的词是**长期**。冷启动只证了同副本 2 任务内积累;跨 20+ 任务、跨项目迁移后的**认知累积曲线**(精度随任务数变化、有害累积是否发生)无数据

**下一步**:真实项目连续多任务试点,拿到认知累积曲线数据,让"长期"真正发生。

---

## 八、V7 模块化重构 + P7 三机制(2026-08-15,拆分与薄弱点修复)

**背景**:85KB 单文件插件(模板 JSON 94KB + 30+ 锚点补丁构建)维护困难;suggest 弱项(P6 命中实现文件 5/20、reorient 依赖上游 gold);原版 NLE 的三个结论(overlay-primary ADR / micro-agent 相似先例 / reflector 反射)未被移植版吸收。

**落地**(详见 `P7_REFACTOR.md`):
- **拆分**:规则唯一源 + 4 个 apply 碎片(零 import,拼接共享作用域),build 重写为纯拼接器(无锚点补丁);行为与 pkg39 逐行 diff 等价;双形态产物(动态 103KB / 持久 74KB)。
- **P7-A precedent**:sessionQuery 非 FTS 路径(filterSessions cwd + filterEvents tool/call)实现历史相似任务先例通道——spike 实测部署 FTS 被禁(openAt never),先例走字面扫描;与 semantic 同模式降级。
- **P7-B impact 声明优先**:normalizeSpec/exactImporters 精确 1-hop 反查替代 basename 伪 BFS;nle_impact 加 declared 声明参数;HIGH_IMPACT 配置化(state.highImpact)。
- **P7-C reflect 闭合反射**:select 闭合时五信号熔合(DISCOVERY/SKILL_DEFECT/EXECUTION_LAPSE/OPTIMIZATION)进 state.reflections,渲染进 nle-learned skill 正文。
- **持久形态**:nle-plugin/dsnle-plugin.mjs(常规 ESM)挂载进 router-standard preset(agent.cordis.yml dsnle 行,备份 .bak-20260815)——新会话自动生效,进程重启不再失忆。

**验证**:fixture-gate 207(原 194 + P7-B 13 项)、verify-state 15、replay PASS、install 自检 10/10、双形态语法检查。

**当前状态(2026-08-15 深夜)**:拆分 + P7 三机制全部落地;持久挂载行就绪(待下次新会话确认);动态 define/run 运行时验证进行中。

---

## 九、V6 修复(2026-08-15,移植缺陷恢复)

**背景**:用户指出本目录实验测的 NLE 与想象不同 → 对照原版(`D:\42427\T1\stick-man-local\Neural-Link-Engine`)逐机制审计 →
结论:移植版砍掉了原版的 **embedding 检索 / git 历史 co-change / instinct 置信度与弃用 / freshness 与矛盾 / health-trend**,保留的只有约束层。

**修复原则**:让 NLE 长在 DSH 原生机制上(勘察见 DSH_CAPABILITY_MAP.md),原版代码只作机制参照;计划见 DSNLE_REPAIR_PLAN.md,进展见 P0_PROGRESS.md。

| 阶段 | 修复 | 状态 |
|------|------|------|
| P0 | 服务注入 spike(动态插件可注入 skills/tokenMeter 等服务)、projectId 项目隔离(schema 5,真实状态文件迁移 4 归因/1 quarantine)、文档表述更正 | ✅ 194 断言全绿 |
| P1 | learned → `ctx.skills` provider(nle-learned)+ 置信度(命中+0.15/未命中−0.1→retired)+ `nle_forget` + 跨项目提升 | ✅ |
| P2 | **恢复真 embedding**:MiniLM-L6-v2 本地缓存(离线 384 维验证)+ 独立 helper 进程(spool 协议,12ms/query)+ RRF 融合 + top-40 语义重排 | ✅ |
| P3 | **恢复 git 历史 co-change**:Jaccard 矩阵(real-moment 3055 commits/1434 文件实测)+ 失败回退遥测矩阵 | ✅ |
| P4 | freshness(30 天 aged)+ 矛盾标记 + health-trend(guard 每任务趋势点,累积曲线数据) | ✅ |
| P5 | guard 收据带 tokenMeter 成本报告 | ✅ |
| P6 | 长期累积实验:协议 + **20 张真实 moment 修复任务卡(全部"修复树 PASS/父树 FAIL"验证)** + run-p6.cmd + 离线 ESM 转换器 | ✅ 完成(20/20) |

**当前状态(2026-08-15 晚)**:P0–P5 修复 + 部署 + **P6 二十卡实验全部完成**。
离线回归全绿(fixture 194 / verify-state 15 / replay / 自检 9/9);P6 数据见 P6_DATA.md(learned 45%→90%、reorient 15 次证据重定向)。

---

## 九、产出物地图(2026-08-15 更新)

- 插件:dsnle-2(pkg-19→52,V1→V5.9;V6 修复版 = build-dsnle.mjs 生成,`dsnle-pkg39-source.json`,85KB)
- 规则单一源:experiment/nle-rules-core.mjs;生成器:experiment/build-dsnle.mjs
- 语义服务:experiment/nle-semantic/(transformers.js + MiniLM 缓存,独立进程 spool 协议;start-semantic.cmd)
- 验证:experiment/fixture-gate.mjs(**194**)、verify-moment-t{1..4}.mjs、verify-flask-t1.py、verify-axios-t{1,2}.mjs、telemetry-report.mjs、**verify-p6-t1..20.mjs(P6 任务卡验收)**
- 项目副本:bench-host/real-{moment,flask,axios}{,-t*,-sub*,-cs}
- 文档:DSH_NLE_SPEC.md(机制)、DSNLE_LOG.md(实现日志)、NLE_VALUE_ASSESSMENT.md(价值)、REPLAY_REPORT.md(缺陷归属)、L3_REPORT.md(行为)、FINAL_VERIFICATION.md(真实项目+冷启动)、DEPLOYMENT.md(部署形态)、**DSH_CAPABILITY_MAP.md(DSH 能力)、DSNLE_REPAIR_PLAN.md(修复计划)、P0_PROGRESS.md(进展)、DEPLOY_V6.md(部署)、P6_LONG_TERM_PROTOCOL.md(实验协议)、P6_TASKS.md(20 任务卡)**
