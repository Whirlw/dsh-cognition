# 社区文章稿:DSH 插件开发实录(发布操作物)

> 用途:发到 deepseek-ai/deepseek-harness 的 GitHub Discussions(分类:Show and tell / General)+ 可选掘金/知乎。
> 发布时把本文件标题与正文直接粘贴即可。文末链接记得换成真实仓库地址。

---

## 标题(选择一个)

1. **在 DeepSeek Harness 上写插件:从 0 到 85KB 持久插件的 10 个坑(实测)**
2. **DSH 插件开发实录:我踩过的 10 个坑,附现象与根因**
3. **给 DSH 写第一个深度插件之前,先看这份踩坑清单**

## 正文

DeepSeek Harness(dsh)发布 5 天,10.8 万 star,插件生态刚开始。我们做了第一个"吃透 DSH 原生机制"的深度插件——给 agent 一份项目记忆(仓库:https://github.com/scd13150/dsh-cognition)。以下是全过程踩坑实录,每条都标了现象、根因、正确做法,基于 rc.6 实测;官方已声明 developer preview 会有破坏性变更,以下内容以 rc.6 为准。

### 1. 动态插件(cordis_define/run)的三个边界

**坑 1:cordis_run 报 `policyFor(...) is not a function`,还残留 "running" 僵尸。**
根因:插件代码(工具执行链可达处)引用了未声明全局,比如 `setTimeout`——运行版策略预检拒绝,错误被包装成看似无关的 policyFor。正确做法:一律 `inject: ['timer']` + `ctx.timeout/ctx.interval`,不要用裸 setTimeout。

**坑 2:动态包是实验形态,不是部署形态。** 它只存在于进程内存,重启即失、以会话为界,官方明说"不能自动转为正式插件"。要做长期能力,直接上 agent preset + 常规 ESM 插件文件(见第 4 节)。

**坑 3:spawn 子代理里 define 的插件,主进程看不到。** spawn provider 是独立进程,子代理的 define 随其进程退出消失。要在主进程生效,只能在主会话 define 或走持久形态。

### 2. fs 服务的五参契约与 FsTarget

`fs.resolve(path)` 返回 **FsTarget 对象**,不是字符串——**禁止字符串拼接路径**,把 resolve 结果直传 readText/writeText/editText。

写入必须显式五参:`fs.writeText(t, content, undefined, undefined, policy)`——不传 policy 时隐式解析可能退化为只读,工作区写入被拒。**无会话调用**(事件回调、persist(null))必须以插件工作区为根自构 policy:`{ mode: 'workspace-write', workspaceRoot: <宿主工作区> }`,不能用 `sandboxPolicy.resolve({})` 的部署默认根(可能是服务器 cwd,踩过 FS_SANDBOX_DENIED)。

编辑失败是**抛异常**(FS_EDIT_NOT_FOUND/FS_AMBIGUOUS_EDIT/FS_STALE_VERSION),不是返回错误对象——catch 后按 `e.code` 细分错误码,别只按 message 正则猜。

### 3. 工具管线:哪些事件值得监听

按价值排序,我们实测:

| 事件 | 用途 |
|---|---|
| `tools/pre-execute`(waterfall) | deny 硬闸:未定向拒写、scope 锁、shell 写命令拦截(扫描 pwsh/bash 的 arguments.command) |
| `tools/result`(emit,冻结) | **审计真源**:最终结果不可篡改,对账"声明 vs 真相" |
| `fs/edit-intent`(waterfall) | 内核级版本守卫:每一次写都过版本检查,外部改动即刻暴露 |
| `tools/post-execute`(waterfall) | read 结果追加提示、edit 后记录 patch 观测 |
| `agent/turn-stopping`(serial) | 任务自动闭合、状态落盘的安全时机 |
| `systemPrompt.context` | **每步上下文注入**——观测信号每步主动可见,这是 Cursor 系给不了的 |

注意:pre-execute 是 waterfall 且有顺序,多插件监听时硬闸插件要保证注册序在前。

### 4. agent preset:持久插件挂载的正确姿势(最容易绕晕的一节)

- preset = 目录 + `agent.cordis.yml`(插件行列表)+ 可选 `preset.yml`
- **插件行支持相对路径**:`name: ./my-plugin.mjs` 从 preset 目录解析——插件文件放进 preset 目录,预设可整体迁移
- **代际语义(必懂)**:preset 以组装文件 mtime/size 为 stamp。**已运行会话保持旧代际,只有新会话挂新代际**——改 agent.cordis.yml 不影响任何在跑会话;挂载失败会回滚会话创建,备份 agent.cordis.yml 是标准操作
- 子代理走 `composeFrom()` 认父——**加入的是父方正在运行的组装,不是新代际**;spawn 子代理永远看不到父会话之后改的 preset
- 服务行必须放 `cordis:group` + `isolate` realm(否则发布进根 realm 被挂载审计拒绝);只注册工具/监听事件的行不需要
- 常规 ESM 插件导出形状:命名导出 `name`/`inject`/`apply`,**无默认导出**(默认导出会丢 inject)

### 5. sessionQuery:全文搜索可能被部署禁用

`searchSessions/searchEvents`(FTS)在 `openAt: "never"` 的部署下抛 `SESSION_QUERY_SEARCH_DISABLED`——**部署差异是常态,客户端必须做降级**。

禁用时的替代路径(filterSessions + filterEvents 字面扫描)实测够用:
- 会话记录形状:`{ header: { id, cwd, createdAt, agentPreset }, live, persisted }`——**cwd 在 header 里**
- SessionResultFilter 是判别联合:`{kind:'cwd', values:[...]}`、`{kind:'created-at', from, to}`——字段名不是直觉的 `{cwd: x}`
- `tool/call` 的语义文本 = 工具名 + `\n` + JSON 参数——**file_path 可以直接从文本正则提取**,这是"历史会话先例检索"的合法路径

### 6. skills 知识层的两个形态

- runtime provider(`ctx.skills.registerProvider`):目录每次 assemble 可见,零常驻 token;`control.invalidate` 是主动失效钩子
- 文件形态(skill-filesystem):发现根 rank 100 = `<projectRoot>/.dsh/skills`;**正文每次加载重读文件,改文件即更新,无 hash/修订协议**——"知识随仓库走"的官方路径
- frontmatter 必填 `name`(kebab-case)与 `description`;格式错误会被静默排除(无诊断,排查时注意)

### 7. 通用工程纪律(血泪)

1. **路径键空间统一是第一优先**:同一数据(文件路径)在多处做键,必须同空间(root 前缀/反斜杠/`./` 前缀)。我们踩过三次:git 矩阵键、先例支持度键、focus/mutate 双轨解析。修复是把规范化函数下沉为唯一入口并配断言。
2. **生成代码的 TDZ**:跨文件引用后置 const 定义,只有异步回调才调用时安全——fixture 若不覆盖该路径,TDZ 会漏到生产。给每个"通道 on/off/异常"配集成断言。
3. **镜像修复纪律**:同一逻辑在多个产物(动态版/持久版/碎片)重复时,修一处必须 grep 全部镜像点——我们有"修复没镜像,持久形态复现老 bug"的事故。
4. **观测字段别硬编码**:趋势/埋点字段若写死默认值,该字段就是"看似有实则空"。

### 8. 结尾

完整版(含沙盒事实、更多细节)在仓库 `docs/DSH_DEV_EXPERIENCE.md`。我们用它建成的插件是 **DSNLE(dsh-cognition)**:给 DSH agent 一份项目记忆——历史先例检索、scope 锁、跨会话认知积累,全部 DSH 原生机制实现,47 次真实修复上游验收、去 gold 化 20/20,边界全公开。

仓库:https://github.com/scd13150/dsh-cognition
安装:clone 后 `node install-dsnle.mjs --set-default`,新会话即生效。

欢迎 star、issue、以及指出文中任何与你的 rc.6 体验不符的地方(开发者预览,一切以实测为准)。
