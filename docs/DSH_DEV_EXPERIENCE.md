# DSH 深度开发经验(Deep Dive:Building Plugins on DeepSeek Harness)

> 本文提炼自 DSNLE 项目在 DSH(v0.1.0-rc.6,developer preview)上从零到"85KB 持久插件 + 40 卡实验"的
> 全部实战踩坑。**面向所有 DSH 插件开发者**,与 NLE 本体无关的部分刻意独立成文。
> 注意:DSH 处于 developer preview,官方声明会有 compatibility-breaking changes——以下内容以 rc.6 实测为准。

---

## 1. 动态插件(cordis_define/run)的真实边界

**动态包是"实验形态",不是部署形态。** 官方文档原话:动态包只存在于进程内存,**不能自动转为正式插件**,
重启即失、以会话为界。DSNLE 的教训:

| 现象 | 根因/事实 |
|---|---|
| `cordis_run` 报 `policyFor(...) is not a function`,残留 "running" 僵尸 | 插件代码(工具执行链可达处)引用**未声明全局**(如 `setTimeout`)→ 运行版策略预检拒绝,错误被包装成看似无关的 policyFor。**一律用 `inject: ['timer']` + `ctx.timeout/ctx.interval`** |
| 大插件(85KB+)define 完全可行 | 语法预检 + 单次粘贴;102KB 级别实测通过(CRLF 会被统一为 LF,语义不变) |
| `ctx` façade 不公开 `effect()` | 动态包用 `ctx.on`/`provide`/`tools.register` 作清理路径;常规插件才有完整 Context |
| 多动态包可协作 | 所有动态包在同一 `cordis-dynamic` group fiber 下求值;inspect 报告有"提供和等待的服务"列,provide/inject 是设计内功能 |
| spawn 子代理的插件不进主进程 | spawn provider 是**独立进程**;子代理 define 的插件随其进程退出而消失。要在主进程生效,只能在主会话 define 或走持久形态 |

## 2. fs 服务的五参契约与 FsTarget

- `fs.resolve(path)` 返回 **FsTarget 对象**,不是字符串——**禁止字符串拼接路径**;把 resolve 结果直传 readText/writeText/editText
- 写入必须显式五参:`fs.writeText(t, content, undefined, undefined, policy)` /
  `fs.editText(t, edit, version, signal, policy)`——不传 policy 时隐式解析可能退化为 read-only(工作区写入被拒)
- **无会话调用**(事件回调、persist(null))必须以插件工作区为根自构 policy:
  `{ mode: 'workspace-write', workspaceRoot: <宿主工作区> }`——`sandboxPolicy.resolve({})` 的部署默认根可能是服务器 cwd,踩过(FS_SANDBOX_DENIED)
- 编辑失败的语义是**抛异常**(`FS_EDIT_NOT_FOUND`/`FS_AMBIGUOUS_EDIT`/`FS_STALE_VERSION`/`FS_NOT_TEXT`),
  不是返回错误对象——工具实现里 catch 并按 `e.code` 细分错误码,不要只按 message 正则猜

## 3. 工具管线的可用事件(按价值排序)

| 事件 | 用途实测 |
|---|---|
| `tools/pre-execute`(waterfall) | deny 硬闸:未 orient 拒写、scope 锁、shell 写命令拦截(扫描 pwsh/bash 的 `arguments.command`)、状态文件防篡改 |
| `tools/result`(emit,冻结) | **审计真源**:最终结果不可篡改,guard 用它做"声明 vs 真相"对账 |
| `fs/edit-intent` / `fs/write-intent`(waterfall,single-slot) | 内核级版本守卫:每一次写都过版本检查,外部改动即刻暴露(`FS_STALE_VERSION` 带恢复指令) |
| `tools/post-execute`(waterfall) | read 结果追加 CON 提示(preread enrich);edit 后记录 patch 观测 |
| `agent/turn-stopping`(serial) | 任务自动闭合、状态落盘的安全时机 |
| `internal/dispatch` | fs 层写意图的统一观测口(与工具层双真源) |
| `systemPrompt.context` | **每步上下文注入**——观测信号每步主动可见,这是 Cursor 系给不了的"持续认知保鲜"形态 |

关键认知:**pre-execute 是 waterfall 且有顺序**;多插件监听同一事件时顺序敏感,硬闸插件要确保注册序在前。

## 4. skills 知识层的两个形态

- **runtime provider**(`ctx.skills.registerProvider`):目录每次 assemble 可见,摘要零常驻 token;`control.invalidate` 是主动失效钩子(状态变化后调用,目录即时刷新)
- **文件形态**(skill-filesystem):发现根 rank 100 = `<projectRoot>/.dsh/skills`(最近 .git 祖先)、rank 400 = `<dshHome>/skills`;
  **正文每次加载重读文件——改文件即更新,无 hash/修订协议**;这是"知识随仓库走"的官方路径,插件可写
  `SKILL.md` 落盘(持久形态有 node:fs 可 mkdir;动态形态无宿主 fs,只能 provider)
- frontmatter 必填 `name`(kebab-case)与 `description`;`disable-model-invocation`/`user-invocable` 控制可见性;格式错误会被静默排除(无诊断)

## 5. sessionQuery:全文与字面双路径

- **FTS 可能被部署禁用**:`searchSessions/searchEvents` 在 `openAt: "never"` 时抛
  `SESSION_QUERY_SEARCH_DISABLED`——**部署差异是常态,客户端必须做降级**
- 禁用时的替代:`filterSessions`(元数据)+ `filterEvents`(字面文本扫描)——实测可用且够用:
  - 会话记录形状:`{ header: { id, cwd, createdAt, agentPreset }, live, persisted }`,**cwd 在 header 里**
  - SessionResultFilter 是判别联合:`{kind:'cwd', values:[...]}`、`{kind:'created-at', from, to}`、`{kind:'availability', values:['live','persisted']}` 等——**字段名不是直觉的 `{cwd: x}`**,实测过
  - EventFilter:`{kind:'type', values:['tool/call']}`、`{kind:'text', ...}`;文档字段 `{sessionId, seq, type, time, surface, text}`
  - `tool/call` 的语义文本 = 工具名 + `\n` + JSON 参数——**file_path 可直接从文本正则提取**(历史会话先例检索的官方合法路径)

## 6. agent presets:持久插件挂载的正确姿势

- preset = 目录 + `agent.cordis.yml`(插件行列表)+ 可选 `preset.yml`(展示元数据)
- **插件行支持相对路径**:`name: ./my-plugin.mjs` 从 preset 目录解析——把插件文件放进 preset 目录,预设即可整体迁移(自带依赖同理)
- **代际语义(必懂)**:preset 以组装文件 mtime/size 为 stamp;**已运行会话保持旧代际,只有新会话挂新代际**;
  改 `agent.cordis.yml` 不影响任何在跑会话;挂载失败会回滚会话创建,备份 `agent.cordis.yml` 是标准操作
- 子代理走 `composeFrom()` 认父——**加入的是父方正在运行的组装,不是新代际**;spawn 子代理永远看不到父会话之后改的 preset
- 服务行必须放 `cordis:group` + `isolate` realm(否则发布进根 realm 被挂载审计拒绝);只注册工具/监听事件的行不需要 realm
- 常规 ESM 插件的导出形状:命名导出 `name`/`inject`/`apply`,**无默认导出**(默认导出会丢 inject,官方 postmortem 有记录)

## 7. 沙盒与工作区事实

- 动态插件 vm 沙箱隔离全局变量但**不是安全边界**(官方:当作 bash 访问对待);`vmTimeoutMs` 只约束同步求值,async 函数体可逃逸
- `sandboxPolicy.workspaceRoot` 是权威工作区根;会话 cwd 优先于部署默认(路径解析统一用会话 cwd)
- PowerShell + GBK:UTF-8 文件用 `Get-Content -Raw -Encoding UTF8` 读,否则中文乱码且不可信;Windows 下 node ESM import 绝对路径要 `pathToFileURL`

## 8. 通用工程教训(DSNLE 血泪)

1. **路径键空间统一是第一优先**:同一数据(文件路径)在多处做键,必须同空间(root 前缀/反斜杠/`./` 前缀)。
   DSNLE 踩过三次:git 矩阵键(仓库相对 vs root 前缀)、precedent 支持度键(`./x` vs `x`)、focus/mutate 双轨解析。
   **修复不是打补丁,是把规范化函数下沉为唯一入口并配断言。**
2. **拼接/生成代码的 TDZ**:跨文件引用后置 `const` 定义,只有异步回调才调用时安全——fixture 若没覆盖该路径,TDZ 会漏网到生产。
   给每个"通道 on/off/异常"都配集成断言。
3. **镜像修复的纪律**:同一逻辑在多个产物(动态版/持久版/碎片)里重复时,修一处必须 grep 全部镜像点;
   历史上有"V11 修复没镜像进碎片,持久形态复现老 bug"的事故。
4. **观测字段别硬编码**:趋势/埋点字段若写死默认值('off'),该字段就是"看似有实则空"——取真实数据源的值。
5. **实验装置的噪声会被误读为产品 bug**:重置装置造成 CON405 漂移、guard GHOST_EDIT——实验协议要先声明装置副作用,否则审计成本爆炸。
6. **诚实审计值千金**:四角度对照审计(原版对照/产物一致性/修复闭环/测试覆盖)一次揪出 12 项真问题;
   裁定记录(修什么/不修什么及理由)防止同一"遗漏"被反复提出。

---

## 附:可复用资产

- 本仓库 `install-dsnle.mjs`:preset 安装脚本的参考实现(standalone 复制 / --into 注入 / 幂等 / 备份)
- 本仓库 `nle-plugin/build-dsnle.mjs`:无锚点纯拼接构建器(碎片化单文件插件、strip export、双形态产物)的可复用模式
- 实验仓库研究附录 `docs/research/AUDIT_ADJUDICATION.md`:四角度审计方法与裁定模板
