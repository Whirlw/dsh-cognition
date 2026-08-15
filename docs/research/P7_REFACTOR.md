# DSNLE V7:模块化重构 + P7 三机制(2026-08-15)

> 背景:85KB 单文件插件问题 + suggest 弱项(命中实现文件 5/20、reorient 依赖 gold)+ 原版 NLE 三机制未被吸收。
> 结论:拆"源码组织"(碎片 + 拼接构建),不拆"运行时插件";P7 三机制全部落地;持久形态(preset 挂载)就绪。

---

## 一、拆分架构

```
experiment/
  nle-rules-core.mjs          ← 规则唯一源(常量+纯函数+createRetrieve+guard/审计,P7-B 新增 normalizeSpec/exactImporters)
  nle-plugin/
    frag-apply-state.mjs      ← state 定义 + gate/toRel/highImpactOf(配置化)/loadChain/persist
    frag-apply-observe.mjs    ← 扫描/观测/preExec/postExec/事件注册/快照注入/retrieve 接线
    frag-apply-tools.mjs      ← defineTool/register(双形态兼容)+ 13 个 nle_* 工具
    frag-apply-knowledge.mjs  ← skills provider + 语义/git spool + P7-A precedentOf + P7-C reflectOnTaskEnd
    dsnle-plugin.mjs          ← [生成] 持久形态:常规 ESM 插件,import 规则源,preset 挂载
  build-dsnle.mjs             ← [重写] 纯拼接器:无锚点补丁、无字符串手术;strip export → 两种形态产物
  dsnle-host.js / dsnle-pkg40-source.json  ← [生成] 动态形态产物
```

要点:
- 旧 build 是 30+ 锚点字符串补丁(模板 JSON 94KB + cutBlock 手术);新 build 是**按序拼接**,片段顺序即代码顺序。
- 碎片零 import,靠拼接共享作用域;规则源 strip export 后内联(动态)或 import(持久)——单一源不破。
- 行为等价性:与 pkg39 快照逐行 diff,仅删 2 个重复函数(taskKeys/extractImports)+ 新增注释。
- 双形态兼容:defineTool/register 检测 harness(动态 vm 注入)存在与否,持久形态走 tools.register 原生路径。

## 二、P7 三机制

### P7-A precedent 先例通道(治 suggest 弱项 1)

- spike 实测:部署级 FTS 禁用(`openAt: "never"`),`searchSessions/searchEvents` 不可用;
  但 `filterSessions`(cwd 过滤,本项目 127 会话)+ `filterEvents`(type=tool/call,字面文本)+ `readSession` 全可用。
- 实现:`filterSessions({kind:'cwd'})` 取最近 12 会话 → 每会话 `filterEvents({kind:'type',values:['tool/call']})`
  → 任务关键词命中 + file_path 提取 → 文件支持度 → retrieve 提权(2×支持度,封顶 6,与 learned 同级)。
- 降级:6s deadline / 60s 缓存 / sessionQuery 缺失 → `precedent:'off'`,与 semantic 同模式零影响。
- 意义:先例 = agent 自己历史里合法可得的证据,是"去 gold 化 reorient"的证据源。

### P7-B impact 声明优先(落实原版 ADR-0012)

- `normalizeSpec`:import specifier 相对路径展开(./ ../ 展开、外部包/别名 null);
  `exactImporters`:精确 1-hop 反查(目录 import 双向匹配),**替代 basename 包含匹配伪 BFS**(不同目录同名文件不再误连)。
- `nle_impact` 增加 `declared` 参数:agent 自声明影响面(标注 declared/inferred 来源),声明面进 ritual,select 对账。
- HIGH_IMPACT 写死黑名单 → state.highImpact(状态文件配置化,缺省规则默认)。

### P7-C reflect 闭合反射(原版 reflector 的 DSH 版)

- 时机:select 闭合时,五信号(任务窗口内已有事实,零新采集)熔合为 observations:
  DISCOVERY(suggest 未命中但编辑)/ SKILL_DEFECT(命中未采用)/ EXECUTION_LAPSE(deny≥3)/
  OPTIMIZATION(reorient≥2、impact 声明零交集)。
- 产出:state.reflections(封顶 100,持久化)+ 最近 5 条渲染进 nle-learned skill 正文(模型按需加载可见)。
- **learned 状态技能文件落盘**:persist 后 5s 节流写 `<项目根>/.dsh/skills/nle-reflections/SKILL.md`
  (内容 = rules-core `skillStateRenderOf` 生成,frontmatter name=nle-reflections,skill-filesystem 发现根 rank 100)。
  持久形态经模块级 `nodeFsWrite`(node:fs mkdirSync recursive)落盘;动态形态无宿主 fs → 占位 undefined 降级(仅 provider 渲染)。
  已验证:持久模块真实 import 加载(name/inject/apply 形状正确);渲染函数 5 项 fixture 断言。

## 三、验证矩阵

| 层 | 结果 |
|---|---|
| fixture-gate | **212 pass, 0 fail**(原 194 + P7-B 13 项 + P7-C 5 项) |
| verify-state | 15/15 |
| replay 5063 场景 | PASS |
| install-dsnle 自检 | 10/10 |
| 构建语法 | 动态(函数壳 --check)+ 持久(真实 ESM --check)双过 |
| 持久模块冒烟 | 真实 import 加载成功(name=dsnle / inject=[timer] / apply=function) |
| 动态运行时 | 旧版(无 P7-C 落盘/双形态块)在子代理进程 define/run 干净执行;最新版源码完整性核对(103346 字符、四符号齐);主进程 define 留待需时(110KB 粘贴) |
| 行为等价 diff | 对 pkg39 快照仅预期差异(删重复函数+注释) |

## 四、部署

- 动态:读 dsnle-pkg40-source.json 的 code.host → cordis_define → cordis_run(install-dsnle.mjs 输出指令)。
- 持久:已挂载 `C:\Users\42427\.dsh\.agent-presets\router-standard\agent.cordis.yml` 的 dsnle 行
  (绝对路径 → nle-plugin/dsnle-plugin.mjs)。**新会话自动生效**;挂载失败回滚备份即可。
- 注意:preset 代际以组装文件 stamp 为键——本会话(旧代际)不会变,新会话才挂新行。

## 五、已知边界(诚实保留)

- precedent 是词召回 + 字面扫描:中文任务对英文日志召回弱;FTS 恢复(部署改 openAt)后可直接升级为 searchSessions。
- precedent 文件提取依赖 tool/call 文本里的 file_path 字段;历史会话的旧工具格式可能提取失败(空支持度 → off)。
- skills 文件落盘仅在持久形态生效(动态形态无宿主 fs,降级为 runtime provider 渲染);持久挂载行未经真实新会话验证(需要下一次会话确认;失败回滚路径已备)。
- 主进程最新版动态 define 未执行(110KB 粘贴成本);动态版可跑性由子代理进程旧版运行验证 + 最新版完整性/符号核对组合覆盖。

## 六、P7 实验后更新(2026-08-15,持久挂载实测 + 去 gold 化实验)

**挂载确认**:持久挂载在真实新会话生效(工具/技能/状态/运行时全部在线;fixture-gate 212、verify-state 15 全绿;P7-C 技能文件落盘确认)。过程中暴露并修复三处此前未被任何验证栈覆盖的问题:

1. **V11.3/V11.6 修复未镜像进碎片**:`policyFor(...) is not a function` 在持久形态复现(guard/check 全挂)——碎片 frag-apply-state.mjs 的 persist 仍带死代码行 `const policy = policyFor(agent)` 与裸 `const snapshot = JSON.stringify(...)`。已将动态版已验证的修复形状(try 包裹 + 删除死行 + ctx.timeout 替换 3 处 setTimeout)镜像进碎片并重建。
2. **createRetrieve precedent 分支 TDZ**:rules-core 中 `add` 先使用后声明,precedent 一旦召回文件即抛 `Cannot access 'add' before initialization`(fixture-gate 无此分支覆盖)。已修复并新增离线探针。
3. **suggest 观测缺口**:precedent 状态原本不进 suggest 返回值/telemetry,去 gold 化实验无法测量判据 2。已补字段。

**去 gold 化实验结论**(详见 P7_DATA.md):20/20 卡全部 PASS,与 P6 持平;reorient 15→10 次且证据全部改为失败测试输出 + 代码定位(0 gold);suggest 直接命中实现文件 5→10/20,**提升全部来自 learned 跨会话累积**;**precedent 通道 20/20 卡 state=on 但先例文件进入 suggested = 0/20——support 提取到的是当前会话对 experiment/ 目录编辑的自指噪声,历史实现文件轨迹未被召回**。这是"五、已知边界"第 2 条的具体实证,并新增一条边界:precedent 候选未按项目过滤(scan 范围外的文件也能带 support 进提权循环,虽最终进不了 ranked,但浪费 deadline 并制造噪声);去自指(排除当前会话/非项目文件)应进下一轮修复清单。闭环成立靠的是失败测试输出 + learned 累积 + 代码定位,而非 precedent。

**实验后修复(主会话,2026-08-15)**:按实验暴露的边界落地三刀——
1. precedent 去自指:排除当前会话(hostSessionId)、只收编辑类调用(`isEditCallText`)、项目前缀过滤(`inPrecedentProject` 两个纯函数进 rules-core);
2. nle_mutate 反馈细化:成功返回显式 `applied:true`+version,失败错误码独立(EDIT_NOT_FOUND/EDIT_AMBIGUOUS/CON405/EDIT_FAILED),消除 T20 的"ok 但未写入"歧义;
3. fixture 补 9 项回归(假 precedentOf 通道集成 + 过滤单元 + TDZ 路径)→ **221 全绿**;双形态重建,持久插件文件已更新(**下一个新会话自动挂载新版**,当前运行会话不受影响)。
下一轮实验待测:precedent 修复后通道真实贡献(重跑 5–20 卡)。

**git 通道修复(主会话,2026-08-15,原版三信号补齐)**:
- 根因:`git log --name-only` 输出仓库相对路径(`src/lib/...`)为矩阵键,而 suggest 检索文件是 root 前缀路径——键空间错配,git 共改通道 20 卡全空(此前的"零贡献"是管道没接上,不是信号弱)。
- 修复①:服务端按请求 prefix 重写键(`remapGitSets` 纯函数,重命名提交保守剔除);真实仓库冒烟 3055 commits/1434 键全带前缀、jaccard 命中正常。
- 修复②:补齐原版 reflector 的 git 信号——`gitchurn`(全历史高频文件,冷启动提名)与 `gitrollback`(近期 revert 提交,负反馈),经 spool 协议接入 `reflectGitSignals`(select 时异步补充,失败零观测);实测通道通(考古仓库数据量小属仓库特性)。
- 修复③:telemetry 观测——suggest 埋点带 `coChangeBoosts`(提权计数)与 precedent 状态,下一轮实验可直接读通道贡献,不用再猜。
- 回归:fixture-gate **227 全绿**(+6 项 git 回归:键重写/重命名剔除/键空间一致性/提权生效/计数观测)。
