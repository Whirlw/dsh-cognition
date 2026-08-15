# L1 离线轨迹重放报告(2026-08-14)

> 方法:sessionQuery.readSession 提取真实轨迹 → replay.mjs 按 dsnle pkg-26 规则重放 → 干预序列审计。
> 工具:experiment/replay.mjs;轨迹:experiment/traces/*.trace.json;输出:experiment/traces/replay-*.json。

## 一、真实轨迹审计(session-53e9e868,518 事件)

| 指标 | 值 | 说明 |
|------|-----|------|
| 源码编辑 | 20 | 全部为 exp-host 创建/测试写入 |
| 完整版干预 | **20/20 deny(WORKFLOW_MISSING_SUGGEST)** | 该轨迹是残缺版时代轨迹(无仪式习惯),完整版规则 100% 拦截未 orient 编辑——干预确定性、可复现 |
| shell 调用 | 158 | 1 例被拦 |
| **真实误报案例** | seq 364479 | `node -e "import('./src/store.js')..."` **只读验证**被 shell 防护拦下(`node -e`+src 路径)——真实轨迹里的误报证据,非自测 |
| suggest 检索 | 3 次 suggest,命中与 exp-host 结构吻合 | store 系/config/inventory/promo |

## 二、5063 场景审计(构造轨迹,真实磁盘检索)

场景:复刻 SWE_MICROBENCH 记录的 5063 失败结构(误导任务文本 + focus app.py + 改错文件),重放完整版规则。

| 事件 | 完整版判定 | 含义 |
|------|-----------|------|
| suggest("flask routes 命令输出应包含 subdomain 和 host 列") | **suggested 全是 tests 文件,cli.py 未命中** | **局限 1:suggest 检索深度不足**——cli.py 的 routes_command 在 988 行,超出检索的头 1500 字符窗口,漏掉真实目标。误导在完整版下依然存在 |
| focus(app.py) | 允许 | agent 可自由锁错方向(规则不纠错) |
| edit(app.py 加 routes 方法) | **allow** | 方向错误不被规则拦截(在 focus 内) |
| read(cli.py) | 注入提示(READ_OUTSIDE_SUGGEST) | 每步注入显示"读的文件不在 suggested" |
| edit(cli.py 真实目标) | **deny WORKFLOW_SCOPE_DRIFT** | **局限 2:方向锁定强化在完整版依然存在**——没有"scope 可被证据推翻"机制(SWE_MICROBENCH 建议的纠正机制未实现),agent 改真实目标被拦 |
| select + guard | **PASS** | **局限 3:guard 盲点**——select 声明了被 deny 的编辑,guard 只查 selectLog 存在即 PASS,不核查 deny 事件与声明的一致性 |

## 三、结论

1. **L1 方法成立**:真实轨迹 + 确定性规则重放,几分钟得到可复现、零 token 的干预审计;发现真实误报(只读 node -e 被拦)不需要任何行为实验。
2. **完整版对 5063 场景的干预 = 诚实暴露 3 个真实局限**:
   - 检索深度(头 1500 字符)可能漏掉真实目标——误导不被纠正;
   - focus 方向锁定后,改真实目标被 SCOPE_DRIFT 拦(5063 根因未完全修复);
   - guard 不核查 deny 记录,select 声明即 PASS(收据有盲点)。
3. 这三点是"修复有效性"最早的可复现证据,指向明确的改进项:
   - suggest 检索:扩大内容窗口(头 1500 字符 → 更大或全文件 token 索引);
   - 重定向机制:检测"suggested 与 focus 冲突 + 多次 read 范围外文件"时提示重新 focus(5063 建议的"scope 可被证据推翻"的轻量版);
   - guard:交叉核查 ritual.denied 与 selectLog(有 deny 无对应说明 → WARN)。

## 四、产物

- experiment/replay.mjs(重放器,规则移植自 pkg-26)
- experiment/traces/session-53e9e868.trace.json(真实轨迹 518 事件)
- experiment/traces/scenario-5063.trace.json(构造场景)
- experiment/traces/replay-53e9e868.json / replay-5063.json(审计报告)

## 五、缺陷归属判定(对照原件代码,2026-08-14)

| 缺陷 | 判定 | 依据(原件代码) |
|------|------|----------------|
| 检索深度不足(头 1500 字符漏 cli.py) | **复刻不完全** | 原版 suggest(`micro-agent.js`)基于 blocks **全文件注册表**(关键词/offers/requires,blocks.js 全文件建块)+ **语义向量索引**(semantic-index.js 嵌入全文件,RRF 融合)+ git co-change——无"头 N 字符"窗口;1500 字符窗口是 dsnle 自创简化。原版检索自身有精度问题(tavern 21 块/7 期望),但"深度窗口漏目标"是复刻产物 |
| 方向锁定强化(SCOPE_DRIFT 拦真实目标) | **NLE 自身缺陷** | 原版 workflow-gate.js 同为 allowedPaths 越界 deny;"scope 可被证据推翻"是 SWE_MICROBENCH 实验后的**建议,原版没有**;5063 失败本身发生在原版系插件上。原版仅多 focus depth 展开(给更多上下文),锁定+deny 机制相同——设计层缺陷,非移植问题 |
| guard 盲点 | **混合,各半** | 原版 local-guard.js 核查面远大于 dsnle:detectPatchGaps(PATCH_GAP)、evaluateWorkflowCompliance(含 selectAt 时序)、auditWorkflowStateTrust(workflow-trust 防状态伪造)、auditWorkflowEditCoverage、auditChangedFilesContractGate——**dsnle 全部简化掉(复刻不完全)**;"select 声明与 deny 记录不一致"这一具体场景原版也无直接机制(workflow-trust 防 hook 状态篡改,非防 select 谎报)→ **NLE 自身空白** |

**结论**:一复刻简化(检索深度)、一设计天花板(方向锁定)、一"复刻缺原版核查件 + 原版自身空白"(guard)。修复优先级:guard 补 PATCH_GAP+selectAt 时序(原版已有,直接移植)→ 检索去头窗口(复刻欠账)→ 重定向机制(原版也没有,做出来即超越原版)。

## 六、改进记录(pkg-27,全部完成并验证)

| 改进 | 实现 | 验证 |
|------|------|------|
| guard 补 NLE_PATCH_GAP + NLE_SELECT_ORDER | 任务窗口(openedAt 后)内 edits 无 patch 记录 → FAIL;selectAt 早于最后编辑 → FAIL | ✅ 5063 场景重放(正常流程无 gap/时序正确,逻辑就位) |
| 检索去头窗口 | readHead 全文扫描(>1MB 跳过内容,仅文件名) | ✅ **5063 场景重放:suggested 含 src/flask/cli.py(前 3)——局限 1 修复的直接证据** |
| 重定向机制 | postExec 记录范围外 read(outsideReads ≥2 次),snapshot 注入"重定向:反复阅读范围外 X,如需修改请 nle_focus 扩展范围";suggest/focus/select/reset 清空 | ✅ 真实会话读 promo.js 两次 → 快照出现重定向提示 |

改进后 5063 场景干预序列:suggest 命中 cli.py(正确指引)→ agent 仍 focus app.py → 改 app.py 放行 → 改 cli.py 被 SCOPE_DRIFT 拦(方向锁定仍在,但 agent 已有双重纠正信号:suggested 含 cli.py + 范围外读提示)→ guard 时序/PATCH_GAP 就位。

**局限 2(方向锁定)的处置**:设计层缺陷(原版同款),本次以"显性化"缓解(检索命中 + 重定向提示),不做自动推翻——自动重定向留待行为验证后决策。
