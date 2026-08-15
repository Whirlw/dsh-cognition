// ==== DSNLE fragment: apply-state — state 定义 + 生命周期/持久化辅助 ====
    // ---------- state (schema 4 + outsideReads + reorients + aliasKB 配置化) ----------
    const state = {
      schema: 5,
      enrolledSessions: [],
      hostCwd: null,
      hostCwdRaw: null,
      hostSessionId: null,
      taskId: 0,
      root: 'exp-host',
      arm: 'default',
      ritual: {
        locked: false, task: null, taskId: 0, tier: 'T2',
        suggested: [], focus: [], allowedPaths: [], impactCovered: [],
        edits: [], selectLog: null, guardLog: null, denied: 0, openedAt: null, autoClosed: null,
        reorients: [],
        focusExpanded: [],
        // P7-B:impact 声明面(select 时与真实编辑面对账)
        impactDeclared: [],
      },
      cellsByArm: {},
      learned: [],
      misses: [],
      patches: [],
      lastStale: [],
      outsideReads: {},
      loaded: false,
      telemetry: [],
      coChange: {},
      truthWrites: [],
      truthTools: [],
      trend: [],
      // P7-C:reflect 观测记录(五信号熔合,任务闭合时写入)
      reflections: [],
      aliasKB: JSON.parse(JSON.stringify(DEFAULT_ALIAS_KB)),
      // P7-B:高影响路径配置化——状态文件可覆盖;缺省退回规则默认 HIGH_IMPACT
      highImpact: null,
      updatedAt: null,
    }
    let loadDone = null

    // ---------- helpers ----------
    const nowIso = () => new Date().toISOString()
    const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '')
    const inProject = (rel) => rel !== null && rel.startsWith(state.root + '/')

    

    async function gate(exec) {
      let cwd = null
      try {
        const agent = exec && exec.agent
        cwd = agent && agent.session && agent.session.header && agent.session.header.cwd
      } catch (e) { /* ignore */ }
      if (!cwd) return false
      if (state.hostCwd === null) {
        state.hostCwd = norm(cwd)
        state.hostCwdRaw = cwd
        try { state.hostSessionId = exec.agent.session.id } catch (e) {}
        await loadChain()
        const r = state.ritual
        if (r.locked && r.edits.length === 0 && r.selectLog === null) {
          r.locked = false
          r.autoClosed = 'stale-lock-cleared'
          persist(exec.agent)
        }
      }
      // V6-FIX:opt-in 门控——只有主动调用 nle_* 的会话被纳入;共享工作区的其他会话完全放行
      let sid = null
      try { sid = exec.agent.session.id } catch (e) {}
      if (!sid) return false
      if (String(exec.name || '').startsWith('nle_') && !state.enrolledSessions.includes(sid)) state.enrolledSessions.push(sid)
      if (!state.enrolledSessions.includes(sid)) return false
      state.lastPolicy = policyFor(exec.agent)
      return true
    }

    function toRel(p) {
      if (!p) return null
      const s = String(p).replace(/\\/g, '/').replace(/^\.\//, '')
      const base = state.hostCwdRaw ? norm(state.hostCwdRaw).toLowerCase() : ''
      const lower = s.toLowerCase()
      if (base && lower.startsWith(base + '/')) return s.slice(norm(state.hostCwdRaw).length + 1)
      if (base && lower === base) return ''
      if (/^[a-z]:\//i.test(s)) return null
      // 审计修复:显式拒绝路径遍历段(原版 path-confinement 精神;工作区内路径不应含 ..)
      if (s.split('/').includes('..')) return null
      return s
    }

    // 审计修复(教训 7 另一半):工具路径解析统一——工作区相对优先,项目相对按磁盘存在性裁决补 root 前缀。
    // focus 侧(resolveBlock)接受项目相对输入,mutate/rebind/check 侧(toRel)原样透传 → 双轨误拦 SCOPE_DRIFT。
    // 规则:toRel 结果不以 root 开头且含 '/' 时,若磁盘上补 root 的路径存在 → 采用补 root 版本。
    async function resolveToolPath(p) {
      const rel = toRel(p)
      if (rel === null) return null
      if (!rel || rel.startsWith(state.root + '/')) return rel
      if (!rel.includes('/')) return rel
      const withRoot = state.root + '/' + rel
      try {
        const t = await fs.resolve(withRoot, { cwd: state.hostCwdRaw })
        const info = await fs.stat(t)
        if (info) return withRoot
      } catch (e) { /* fall through */ }
      return rel
    }

    const isSource = (rel) => rel !== null && SOURCE_RE.test(rel)

    function rootRel(rel) {
      if (rel === null) return null
      const root = state.root + '/'
      if (rel.startsWith(root)) return rel.slice(root.length)
      return rel
    }
    function highImpactOf(rel) {
      const pr = rootRel(rel)
      if (pr === null) return null
      // P7-B:配置化——state.highImpact(状态文件/工具设置)优先,缺省 HIGH_IMPACT
      const hi = Array.isArray(state.highImpact) && state.highImpact.length ? state.highImpact : HIGH_IMPACT
      for (const h of hi) {
        if (pr === h || pr.startsWith(h) || h.startsWith(pr)) return h
      }
      return null
    }
    function withinAllowed(rel) {
      if (rel === null) return false
      if (rel.startsWith(state.root + '/tests/') || rel.startsWith(state.root + '/test/')) return true
      for (const p of state.ritual.allowedPaths) {
        const np = String(p).replace(/\/+$/, '')
        if (rel === p || rel === np || rel.startsWith(np + '/')) return true
      }
      return false
    }
    function coveredImpact(rel) {
      const h = highImpactOf(rel)
      if (h === null) return true
      const ws = state.root + '/' + h
      for (const c of state.ritual.impactCovered) {
        if (h === c || h.startsWith(c + '/') || c.startsWith(h)) return true
        if (ws === c || ws.startsWith(c + '/') || c.startsWith(ws)) return true
      }
      return false
    }
    function cellStore() {
      if (!state.cellsByArm[state.arm]) state.cellsByArm[state.arm] = {}
      return state.cellsByArm[state.arm]
    }
    function cellFor(rel) { return cellStore()[rel] || null }

    async function targetOf(rel) {
      return fs.resolve(rel, { cwd: state.hostCwdRaw || undefined })
    }
    async function statVersion(rel) {
      try {
        const t = await targetOf(rel)
        const info = await fs.stat(t)
        return info ? info.version : null
      } catch (e) { return null }
    }
    async function readContent(rel) {
      try {
        const t = await targetOf(rel)
        return await fs.readText(t)
      } catch (e) { return null }
    }
    function policyFor(agent) {
      // V10-FIX3:agentless 分支——事件回调/persist(null) 无会话时,
      // 以插件实际工作区为根构造 policy,不能依赖 resolve({}) 的部署默认根(可能是服务器 cwd)
      if (!agent || !agent.session) {
        if (state.hostCwdRaw) return { mode: 'workspace-write', workspaceRoot: norm(state.hostCwdRaw) }
        return undefined
      }
      if (!sandboxPolicy) return undefined
      try {
        return sandboxPolicy.resolve({ session: agent.session })
      } catch (e) { return undefined }
    }

    async function driftCheck(rel, cell) {
      if (!cell || cell.fsVersion === null || cell.fsVersion === undefined) return null
      const v = await statVersion(rel)
      if (v === null) return 'missing'
      if (v === cell.fsVersion) return null
      const text = await readContent(rel)
      if (text === null) return 'missing'
      const h = fnv1a(text)
      if (h === cell.hash) {
        cell.fsVersion = v
        return null
      }
      return 'stale'
    }

    function overlayAdd(cell, spec, declaredBy, note) {
      const ov = cell.overlay || []
      const ex = ov.find((o) => o.import === spec)
      if (ex) {
        ex.pecState = 'confirmed'
        ex.declaredBy = declaredBy
        if (note) ex.note = note
      } else {
        ov.push({ import: spec, pecState: 'confirmed', declaredBy, note: note || null, at: nowIso() })
      }
      cell.overlay = ov
    }
    function overlayRemove(cell, spec) {
      const ov = cell.overlay || []
      const i = ov.findIndex((o) => o.import === spec)
      if (i >= 0) ov.splice(i, 1)
      cell.overlay = ov
      const di = (cell.declaredImports || []).indexOf(spec)
      if (di >= 0) cell.declaredImports.splice(di, 1)
    }
    function cellPecState(cell) {
      if (!cell) return null
      if (cell.pecState === 'stale') return 'stale'
      const cand = (cell.overlay || []).some((o) => o.pecState === 'candidate')
      return cand ? 'candidate' : 'confirmed'
    }
    function unDeclaredImports(cell) {
      const declared = new Set((cell.overlay || []).map((o) => o.import))
      return (cell.surfaceImports || []).filter((s) => !declared.has(s))
    }
    function clearOutsideReads() {
      state.outsideReads = {}
    }
    function reorientTargets() {
      return (state.ritual.reorients || []).flatMap((x) => x.target || [])
    }

    function learnFrom(task, edited) {
      if (!task || !edited.length) return
      // V5.2:脏数据防护——过滤非源码路径("(无编辑" 占位等历史脏项)
      edited = edited.filter((f) => SOURCE_RE.test(f))
      if (!edited.length) return
      const keys = taskKeys(task)
      if (!keys.length) return
      // P0.2:项目隔离——学习条目按项目作用域;同键跨项目不再合并(防污染)
      const curPid = projectIdOf(state.root)
      let entry = state.learned.find((e) => (e.scope === 'global' || (e.projectId && e.projectId === curPid)) && e.keys.some((k) => keys.includes(k)))
      if (entry) {
        for (const f of edited) if (!entry.files.includes(f)) entry.files.push(f)
        for (const k of keys) if (!entry.keys.includes(k)) entry.keys.push(k)
        entry.at = nowIso()
        learnHitUpdate(entry, keys, edited, nowIso())
      } else {
        state.learned.push({ keys, files: [...edited], at: nowIso(), projectId: projectIdOf(state.root), scope: 'project', confidence: LEARN_PRIOR, evidence: 1, lastVerifiedAt: nowIso() })
      }
    }
    function missRecord(task, suggested, edited) {
      // P1:未命中衰减——suggest 给出但未编辑的项目条目置信度 −0.1(低于阈值自动 retired)
      const missKeys = taskKeys(String(task || ''))
      if (missKeys.length) {
        const pidNow = projectIdOf(state.root)
        for (const e of state.learned) {
          if (e.status === 'retired') continue
          if (e.scope !== 'global' && (!e.projectId || e.projectId !== pidNow)) continue
          if (e.keys.some((k) => missKeys.includes(k)) && !(e.files || []).some((f) => edited.includes(f))) learnMissUpdate(e, nowIso())
        }
      }
      const hit = edited.filter((e) => suggested.includes(e)).length
      state.misses.push({ task: String(task || '').slice(0, 200), suggested, edited, hit, at: nowIso() })
      if (state.misses.length > MISS_CAP) state.misses.splice(0, state.misses.length - MISS_CAP)
    }

    function loadChain() {
      if (loadDone) return loadDone
      loadDone = (async () => {
        try {
          const t = await targetOf(STATE_FILE)
          const info = await fs.stat(t)
          if (!info) { state.loaded = true; return }
          const text = await fs.readText(t)
          const data = JSON.parse(text)
          if (!data || typeof data !== 'object') return
          if (data.ritual) {
            Object.assign(state.ritual, data.ritual)
            if (!Array.isArray(state.ritual.reorients)) state.ritual.reorients = []
            if (!Array.isArray(state.ritual.impactDeclared)) state.ritual.impactDeclared = []
          }
          if (data.cellsByArm) {
            for (const arm of Object.keys(data.cellsByArm)) {
              for (const rel of Object.keys(data.cellsByArm[arm])) {
                const c = data.cellsByArm[arm][rel]
                if (c.fsVersion === undefined && c.version !== undefined) c.fsVersion = c.version
                if (c.hash === undefined) c.hash = null
                if (c.overlay === undefined) c.overlay = []
              }
            }
            state.cellsByArm = data.cellsByArm
          }
          if (Array.isArray(data.learned)) {
            state.learned = data.learned
            // P0.2:schema 5 迁移——旧条目推断 projectId;跨项目混合 → quarantine(不参与检索)
            migrateLearnedProjectIds(state.learned)
          }
          if (Array.isArray(data.misses)) state.misses = data.misses
          if (Array.isArray(data.patches)) state.patches = data.patches.slice(-PATCH_CAP)
          if (Array.isArray(data.lastStale)) state.lastStale = data.lastStale
          if (Array.isArray(data.telemetry)) state.telemetry = data.telemetry.slice(-2000)
          if (data.coChange && typeof data.coChange === 'object') state.coChange = data.coChange
          if (Array.isArray(data.trend)) state.trend = data.trend.slice(-500)
          if (Array.isArray(data.reflections)) state.reflections = data.reflections.slice(-100)
          markLearnedConflicts(state.learned)
          // 改进 1:ALIAS_KB 配置化——状态文件中 aliasKB 存在则整体替换默认
          if (data.aliasKB && typeof data.aliasKB === 'object') state.aliasKB = data.aliasKB
          // P7-B:highImpact 配置化——状态文件数组存在则整体替换默认
          if (Array.isArray(data.highImpact)) state.highImpact = data.highImpact
          if (typeof data.taskId === 'number') state.taskId = data.taskId
          if (typeof data.root === 'string') state.root = data.root
          if (typeof data.arm === 'string') state.arm = data.arm
          state.updatedAt = data.updatedAt || null
          state.loaded = true
        } catch (e) {
          console.error('[dsnle] load failed', e)
        }
      })()
      return loadDone
    }

    function persist(agent) {
      if (state.hostCwdRaw === null) return
      if (!state.loaded) return
      state.lastPolicy = policyFor(agent)
      if (typeof skillsDirty === 'function') skillsDirty()
      // P7-C:节流调度 learned 状态技能文件落盘(5s 合并;动态形态无宿主 fs 时内部降级)
      if (typeof scheduleSkillsWrite === 'function') scheduleSkillsWrite()
      let snapshot
      try {
        snapshot = JSON.stringify({
          schema: state.schema, taskId: state.taskId, root: state.root, arm: state.arm,
          ritual: {
            locked: state.ritual.locked, task: state.ritual.task, taskId: state.ritual.taskId,
            tier: state.ritual.tier, suggested: state.ritual.suggested, focus: state.ritual.focus,
            allowedPaths: state.ritual.allowedPaths, impactCovered: state.ritual.impactCovered,
            edits: state.ritual.edits, selectLog: state.ritual.selectLog, guardLog: state.ritual.guardLog,
            denied: state.ritual.denied, openedAt: state.ritual.openedAt, autoClosed: state.ritual.autoClosed,
            reorients: state.ritual.reorients,
            focusExpanded: state.ritual.focusExpanded || [],
            impactDeclared: state.ritual.impactDeclared || [],
          },
          cellsByArm: state.cellsByArm, learned: state.learned, misses: state.misses,
          patches: state.patches, lastStale: state.lastStale, aliasKB: state.aliasKB, highImpact: state.highImpact, telemetry: state.telemetry.slice(-2000), coChange: state.coChange, trend: state.trend, reflections: state.reflections.slice(-100), updatedAt: nowIso(),
        })
      } catch (pfErr) {
        // V11.6-FIX:persist 同步函数内「局部变量赋值 = 函数调用」在 vm 沙箱中触发
        // "X(...) is not a function"(不被 try/catch 包裹时);包裹后正常。见 experiment/dsnle-fix-history.md
        throw pfErr
      }
      // V11.3-FIX:删除死代码 `const policy = policyFor(agent)`——该行在沙箱中触发
      // "policyFor(...) is not a function",且 policy 从未被使用;详见 dsnle-fix-history.md
      // V10:去掉 writeChain 串行队列(卡死会阻塞后续全部落盘);直接 await + 失败重试一次 + 诊断
      (async () => {
        try {
          const t = await targetOf(STATE_FILE)
          await fs.writeText(t, snapshot, undefined, undefined, policyFor(agent))
        } catch (e) {
          console.error('[dsnle] persist failed', e)
          try { telemetryPush({ type: 'persistDiag', err: String((e && e.message) || e), at: nowIso() }) } catch (e2) {}
          try {
            await new Promise((r) => ctx.timeout(r, 500))
            const t = await targetOf(STATE_FILE)
            await fs.writeText(t, snapshot, undefined, undefined, policyFor(agent))
          } catch (e3) { console.error('[dsnle] persist retry failed', e3) }
        }
      })()
    }

