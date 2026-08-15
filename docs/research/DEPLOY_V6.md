# dsnle 插件部署指南(P0-P5 修复版,2026-08-15)

> 前置:本会话无 cordis_* 工具(tool-cordis 不在 web 组合中)→ 部署经 GUI 的 :ordis 面板或 profile 补丁后自助部署。
> 语义服务(独立进程)已由 `start-semantic.cmd` 管理;当前已在运行(spool=experiment/nle-semantic/spool)。

## 方式 A:GUI :ordis 面板(立即可用,无需重启)

1. 打开 DSH 页面(127.0.0.1:3080),找到 :ordis 插件面板(设置 → 插件 或 /cordis 命令)。
2. 选择"新建插件"(define):
   - pluginId:`dsnle-2`(kind=existing 时)
   - name:`DSNLE V6(修复版)`
   - purpose:`P0-P5 修复:P0.2 项目隔离 / P1 skills+置信度 / P2 embedding / P3 git 共改 / P4 趋势 / P5 成本`
   - host 代码:读 `experiment/dsnle-pkg39-source.json` 的 `code.host` 字段全文粘贴
3. 运行(启动该插件)。验证:
   - `nle_check` → cells/learned 计数恢复,schema=5
   - `nle_alias list` → ≥26 键
   - 技能目录出现 `nle-*` 条目(learned → skills provider)
   - `nle_suggest`(任意任务)→ telemetry semantic 标记(on=语义生效)

## 方式 B:profile 补丁自助部署(重启后 agent 可自部署)

把 `tool-cordis` 加进 `::\Users\42427\.dsh\profiles\web\cordis.patch.yml`:

```yaml
- insert:
    - id: tool-cordis
      name: '@deepseek-ai/dsh-tool-cordis'
```

重启 DSH(start-dsh.bat)。重启后所有会话获得 cordis_inspect/define/run/stop/undefine,
此后 agent 可按 install-dsnle.mjs 的输出自助部署。**注意:修改后若组合报错,GUI 将无法启动——回滚该文件即可。**

## 语义服务生命周期

- 启动:`start-semantic.cmd`(或手动 `node experiment/nle-semantic/server.mjs --spool <workspace>/.nle-semantic`)
- 协议:插件向 `<workspace>/.nle-semantic/` 写 `<id>.req.json` → 服务嵌入/git 分析 → 写 `<id>.res.json`
- 自检:`node experiment/nle-semantic/server.mjs --selfcheck`(384 维)
- 失败降级:suggest 超时 8s → semantic:'off',检索回退 BM25;git 通道失败 → 回退运行时 co:hange 矩阵

## 回归基线(部署前后各跑一次)

```
node experiment/fixture-gate.mjs    # 194 断言
node experiment/verify-state.mjs    # 15 项
node experiment/replay.mjs experiment/traces/scenario-5063.trace.json
node experiment/install-dsnle.mjs   # 自检 9 项
```

## 已知边界与踩坑(部署必读)

1. **动态插件禁用 `setTimeout` 等未声明全局**(2026-08-15 事故,详见 DSNLE_LOG.md V10 节):
   - 症状:`cordis_run` 报 `policyFor(...) is not a function`,插件残留 "running" 僵尸;
   - 根因:插件代码(工具执行链可达处)引用 `setTimeout` → 运行版 guard 策略预检拒绝,错误被包装成 policyFor;
   - 修复:一律用 `ctx.timeout(ms)` / `ctx.interval(...)`(插件已 `inject: ['timer']`);
   - 排查法:先 `cordis_stop` 清僵尸 → 对照极简插件二分定位。
2. **fs 写入显式传 sandboxPolicy**(5 参契约):`fs.writeText(t, content, undefined, undefined, policy)` /
   `fs.editText(t, edit, version, signal, policy)`;不传时隐式解析可能退化为 read-only(工作区写入被拒)。
   **无会话调用(persist(null)/事件回调)必须以插件工作区为根构造 policy**(`{ mode:'workspace-write',
   workspaceRoot: <宿主工作区> }`),不能依赖 `sandboxPolicy.resolve({})` 的部署默认根(2026-08-15
   V10-FIX3 事故:turn-stopping 自动解锁落盘被 FS_SANDBOX_DENIED,详见 DSNLE_LOG.md)。
3. **fs.resolve 返回 FsTarget 对象**(V8 起):不能字符串拼接路径,须把 resolve 结果直传 writeText/readText。
4. **进程重启后动态插件全部丢失**:部署链按 DSNLE_LOG.md V6-V10 节重建;快照上下文名需避开 harness 残留
   (`dsnle-snapshot` 等已占用名)。
5. 语义/git spool 通道依赖独立进程(`experiment/nle-semantic/server.mjs`);未启动时 suggest 自动降级
   (semantic:'off'、co-change 回退运行时矩阵),不影响主链路。
