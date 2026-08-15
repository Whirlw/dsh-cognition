# DSH-NLE 交接文档(换会话用)

> 用户目标:**在 DSH 上完整实现 NLE**(基于 DSH 独特优势),实现完成前不做行为实验。
> 教训:"不完整实现测试就是白测"——之前的实验反复失败源于实现不完整 + 管道污染。

## 一、必读文件

| 文件 | 内容 |
|------|------|
| `<workspace>/experiment/DSH_NLE_SPEC.md` | **完整实现规格**(机制清单、DSH 映射、数据模型、工具集、强制链 L0-L4、实现阶段 V1-V4、验收标准) |
| 本文件 | 交接、资产、教训 |
| `<workspace>/experiment/SWE_MICROBENCH.md` | 上一个实验的结论(5063 暴露 scope 锁方向风险) |
| `<workspace>/experiment/COGNITION_ROUND2.md` | 认知实验结论(观测层 drifted 场景有效) |

## 二、环境事实(重要)

- 工作区根:`<workspace>`;会话工作区 = 此目录
- DSH 插件机制:动态 Cordis 插件(`cordis_define`/`cordis_run`),host 代码纯 JS,无 import;工具经 `harness.defineTool` + `harness.registerTool(ctx, tool)`;事件经 `ctx.on`
- **插件是会话级**:换会话后旧插件(nle-1)不存在,需在新会话重新 `cordis_define`(新 pluginId)。状态文件 `.nle-poc-state.json` 在工作区根,旧数据可读但建议新实现用新文件名(如 `.dsnle-state.json`)
- 关键 DSH API(已查证):
  - `tools/pre-execute`(exec, next) → `{kind:'deny', reason}` 硬拦;`tools/post-execute`(exec, result, next) 采集
  - `fs/edit-intent`/`fs/write-intent`(target, actor, next) → 返回 `{version}` / `{kind:'replaceIfVersion', version}` 守卫
  - `sandboxPolicy.resolve({session})` 给 fs 调用传正确沙盒策略(插件直接 fs 写会被拒)
  - 相对路径基准:`sessionCwd`(exec.agent.session.header.cwd)优先于 sandboxPolicy.workspaceRoot
  - 会话门控:`exec.agent.session.id` + 工作区 cwd 判定宿主与子代理(agents.isOwnedBy 不可靠,子代理 owner 链不通)
  - `ctx.get('fs')` / `ctx.get('sandboxPolicy')` 用可选获取,undefined 检查

## 三、资产清单(磁盘)

- `exp-host/` + `exp-host-pristine/`:合成宿主(13 模块 27 测试;pristine 为基线模板)
- `bench-host/picomatch`、`picomatch-a/c`:JS 真实实例(已用 3 个 bug)
- `bench-host/flask-bench`、`flask-bench-5063-{c,a}`、`flask-bench-4045-{c,a}`:SWE-bench 真实实例(venv 依赖已 pin:werkzeug==2.3.7、pytest==7.4.4)
- `experiment/verify-*.mjs/py`:隐藏验收脚本
- `experiment/evaluate_instance.py`:SWE-bench 评估脚本(官方 F2P/P2P 判定,PYTHONPATH 指向副本 src)
- `experiment/swe/flask-{4992,5063,4045}/`:**官方 test_patch/gold/F2P/P2P(私有,勿放回项目工作区)**
- `experiment/LOG.md`、`COLD_START_REPORT.md`、`FINAL_SUMMARY.md`、`COGNITION_FRAMEWORK.md`、`COGNITION_RESULTS.md`、`COGNITION_ROUND2.md`、`SWE_MICROBENCH.md`、`DSH_NLE_SPEC.md`

## 四、教训清单(防重蹈覆辙,每一条都是真金白银)

1. **评估文件泄漏**:gold/test_patch 绝不能放在 agent 可见的工作区(裸组读过 gold diff 直接复刻)。评估物一律放 `experiment/swe/` 私有目录。
2. **共享工作区污染**:并行臂必须独立工作区副本;同一目录并行 = 后到者基于先到者产物(4992 两次失败)。
3. **venv junction 陷阱**:editable 安装记录绝对路径,共享 venv 会让 pytest import 兄弟目录源码。测试/评估必须 `PYTHONPATH=<副本>/src` 或各自独立 venv。
4. **test_patch 时序**:post 评估前必须确保 test_patch 已应用(pre 模式做);agent 改过测试文件会导致 apply 冲突——评估时先 `git checkout -- tests/` 再 apply 官方 test_patch。
5. **PowerShell 编码**:GBK 读 UTF-8 会乱码;用 python 脚本读写测试清单。
6. **git 命令**:`git checkout --hard` 不存在(用 `git reset --hard` 或 `git checkout -f`);`git checkout -- <file>` 还原单文件。
7. **路径解析噪音**:focus 相对项目根、mutate 相对工作区根(不一致)→ v19 必须统一(建议都按"工作区相对路径"解析)。
8. **失败率**:并行 3+ subagent 会话级失败率高(~31%),多在收尾;产物完整性检查(测试+验收)可补验。
9. **外部取证**:SWE-bench 下 agent 可访问 GitHub 找到官方 commit(合法但削弱独立性);严格实验应禁网。
10. **验收时序**:任务验收必须在恢复/下一任务前执行。

## 五、v19 实现要点(按规格 V1-V4)

**V1 强制链(先做,直接修 5063 暴露的问题):**
1. pre-execute 检查:任务未 open(suggest 未调)时 deny 源码编辑 → `WORKFLOW_MISSING_SUGGEST`;focus 未调(T2+)→ `WORKFLOW_MISSING_FOCUS`
2. tier 分级:suggest 返回 tier 建议(T1 单文件/T2 默认/T3 高影响);ritual.tier 记录;T3 要求 impact
3. `nle_impact(name)`:高影响路径清单(可配置:store 类/核心模块)→ T3 必须覆盖否则 deny
4. **shell 绕行防护**:pre-execute 对 pwsh/bash 工具参数(command)扫写指示符(`Set-Content|Add-Content|Out-File|>>|>|sed -i|tee|node -e|python -c|Remove-Item|mv|rm`)+ 源码路径 → deny `WORKFLOW_SHELL_WRITE`
5. preread enrich:pre-execute 对 read 工具,若目标文件有 cell 且 drifted → 在结果前注入提示(用 post-execute?read 是只读工具,enrich 可在 pre-execute 返回 deny 以外的机制?实际做法:post-execute 对 read 的 content 追加一行 [NLE] 提示——DSH 的 post-execute 可替换 content)
6. suggest 增强:冷模式加符号/注释关键词扫描(源文件内容里找问题文本 token),降低锁错概率

**V2 观测完整:**
- PEC:candidate→confirmed→stale;mutate 后 confirmed;rebind 后 confirmed;外部漂移 stale(CON404);新 import 无 overlay → candidate(CON422)
- CON 全套输出:CON200/403/404/422
- overlay 扩展:declaredImports → overlay 记录数组(import/blast/note)

**V3 收尾:**
- `nle_guard()`:检查 workflow 合规(有 suggest+focus+select)+ CON 状态 + deny 计数 → PASS/FAIL 报告
- learn miss 记录:select 时 uncovered/drift 记入 miss 记录
- 持久化扩展:新 schema 写 `.dsnle-state.json`

**V4 集成冒烟:**
- 工具链全流程自测(suggest→focus→impact→mutate→check→select→guard)
- 合成宿主回归(仅验证实现正确,不做行为实验)

## 六、技术参考(DSH API 确认记录)

- 动态工具:`harness.defineTool({name, description, parameters:{type:'object',additionalProperties:true,properties}, output:{schema:{type:'object',additionalProperties:true}, render}, execute})`;output schema 必须显式 additionalProperties
- pre-execute 返回 deny 前注意:对 edit/write 之外的工具(tool name)做分支
- `exec.arguments` 是已解析 JSON 对象;`exec.agent.session.id` 会话 id;`exec.agent.session.header.cwd` 工作区
- fs 服务:`fs.resolve(path)`→target;`fs.processPath(target)`→绝对路径;`fs.stat(target)`→{version};`fs.readText`;`fs.editText(target,{oldString,newString,replaceAll:false},{version},undefined,sandboxPolicy)`
- 插件状态持久化:fs.writeText 到工作区根,带 sessionPolicy,否则被沙盒拒
- 会话门控建议:`hostCwd` 捕获后,所有钩子先查 `agent.session.header.cwd === hostCwd` 或 agent===hostAgent,否则放行

## 七、下一步动作序列(新会话)

1. 读 `DSH_NLE_SPEC.md` + 本文件
2. `cordis_inspect_list`/`cordis_inspect_query` 复核关键 API(工具注册、事件签名,以当前版本为准)
3. `cordis_define` 新建插件(idPrefix 如 `dsnle`),实现 **V1**(建议一个包内完成 V1,代码预计 800-1200 行)
4. `cordis_run` 激活;用 exp-host-pristine 副本做 V1 自测:每个 deny 分支(缺 suggest/缺 focus/越界/缺 impact/shell 写)触发正确 code;shell 命令样本表逐一验证
5. V1 自测通过后 → V2、V3 同法
6. V4 集成冒烟
7. 实现全部完成后,才考虑行为实验(且必须:独立工作区、官方判定、禁外部取证、每轮恢复)
