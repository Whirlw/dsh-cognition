// ==== DSNLE fragment: apply-tools — 工具注册器 + 13 个 nle_* 工具 ====
    // ---------- tools ----------
    // P7 持久兼容:动态形态有 harness 全局(经 harness.defineTool 注册);
    // 持久形态(preset 挂载)无 harness——直接返回 ToolDefinition 形状,由 tools.register 消费。
    // try/catch:动态 vm 沙箱对未声明全局的策略预检可能拒绝 typeof(has trap),兜底返回 shape。
    function defineTool(def) {
      const shape = {
        name: def.name,
        description: def.description,
        parameters: { type: 'object', additionalProperties: true, properties: def.properties || {}, required: def.required || [] },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        execute: def.execute,
      }
      try {
        if (typeof harness !== 'undefined' && harness && typeof harness.defineTool === 'function') {
          return harness.defineTool(shape)
        }
      } catch (e) { /* 无 harness(持久形态)或沙箱拒绝 → shape */ }
      return shape
    }
    function register(def) {
      const tool = defineTool(def)
      ctx.effect(() => {
        let target = ctx
        try {
          const agents = ctx.get('agents')
          const agent = agents && agents.currentInitiator()
          if (agent && agent.ctx) target = agent.ctx
        } catch (e) { /* fallback */ }
        const tools = target.get('tools')
        if (tools) return tools.register(tool)
        try {
          if (typeof harness !== 'undefined' && harness && typeof harness.registerTool === 'function') {
            return harness.registerTool(target, tool)
          }
        } catch (e) { /* ignore */ }
        return undefined
      })
    }

    function resolveBlock(b) {
      let s = String(b).replace(/\\/g, '/').replace(/^\.\//, '')
      if (s.startsWith(state.root + '/')) return s
      if (s.includes('/')) return state.root + '/' + s
      return s
    }

    register({
      name: 'nle_suggest',
      description: 'NLE ritual step 1 (orient): 任务分级(T1/T2/T3)并按 cold/full/learned 模式检索相关模块,锁定任务。返回 suggested 文件(工作区相对路径)与 tier;taskId 递增;改源码前必须先调用。',
      properties: {
        task: { type: 'string', description: '任务文本(用户原话或完整症状)' },
        mode: { type: 'string', description: 'cold(文件名/内容关键词) | full(默认,别名KB+文件名) | learned(仅学习库,无命中回退 cold)' },
        root: { type: 'string', description: '项目根目录名(默认 exp-host)' },
        arm: { type: 'string', description: '观测/学习分域(默认 default)' },
      },
      required: ['task'],
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const task = String(args.task || '').trim()
        if (!task) return { ok: false, code: 'INVALID_ARGS', message: 'task 必填' }
        const mode = String(args.mode || 'full')
        const root = String(args.root || state.root).replace(/\/+$/, '')
        state.root = root
        if (typeof args.arm === 'string' && args.arm) state.arm = args.arm
        const t0Suggest = Date.now()
        const tier = classifyTier(task)
        const hits = await retrieve(task, mode, root)
        state.ritual = {
          locked: true, task, taskId: ++state.taskId, tier,
          suggested: hits.files, focus: [], allowedPaths: [], impactCovered: [],
          edits: [], selectLog: null, guardLog: null, denied: 0, openedAt: nowIso(), autoClosed: null,
          reorients: [],
          focusExpanded: [],
        }
        clearOutsideReads()
        telemetryPush({ type: 'suggest', taskId: state.ritual.taskId, tier, mode, root: state.root, learnedHit: hits.learnedHit, semantic: hits.semantic || 'off', coChangeBoosts: hits.coChangeBoosts || 0, precedent: hits.precedent && hits.precedent.state ? hits.precedent.state : 'off', suggestedCount: hits.files.length, ms: Date.now() - t0Suggest })
        persist(exec.agent)
        return {
          ok: true, taskId: state.ritual.taskId, tier, mode, root: state.root, arm: state.arm,
          suggested: hits.files.map((f) => ({ file: f, drifted: hits.drifted.includes(f) })),
          recentActive: hits.recent, learnedHit: hits.learnedHit, locked: true,
          precedent: hits.precedent || { state: 'off' }, semantic: hits.semantic || 'off',
        }
      },
    })

    register({
      name: 'nle_focus',
      description: 'NLE ritual step 1b: 用精确文件路径(工作区相对,逗号分隔)锁定编辑范围 allowedPaths;tests 目录始终允许。仅在有活动任务(suggest 后)时可用。',
      properties: {
        blocks: { type: 'string', description: '逗号分隔的文件/目录路径(工作区相对,如 exp-host/src/store.js)' },
      },
      required: ['blocks'],
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const r = state.ritual
        if (!r.locked) return { ok: false, code: 'WORKFLOW_NO_TASK', message: '先 nle_suggest 开始任务' }
        const blocks = String(args.blocks || '').split(',').map((b) => b.trim()).filter(Boolean).map(resolveBlock)
        if (!blocks.length) return { ok: false, code: 'INVALID_ARGS', message: 'blocks 必填' }
        r.focus = blocks
        r.allowedPaths = blocks
        const expanded = []
        for (const b of blocks) {
          let isDir = b.endsWith('/')
          if (!isDir) {
            try {
              const t = await fs.resolve(b, { cwd: state.hostCwdRaw })
              const info = await fs.stat(t)
              isDir = !!(info && info.type === 'directory')
            } catch (e) { /* keep false */ }
          }
          if (isDir) {
            const files = await scanDirDeep(b)
            for (const f of files) if (!expanded.includes(f)) expanded.push(f)
          } else if (!expanded.includes(b)) {
            expanded.push(b)
          }
        }
        r.focusExpanded = expanded
        persist(exec.agent)
        return { ok: true, taskId: r.taskId, allowedPaths: r.allowedPaths, focusExpanded: expanded, testsAlwaysAllowed: state.root + '/tests' }
      },
    })

    register({
      name: 'nle_reorient',
      description: 'NLE 方向重定向(证据推翻 scope):声明测试失败/证据指向的目标文件,把 focus 范围扩展/替换到证据目标。5063 场景闭环:focus 锁错文件时,用证据(测试输出/suggest 列表)重定向到正确目标;原范围保留在 reorients 审计。',
      properties: {
        target: { type: 'string', description: '证据指向的目标文件/目录(工作区相对,逗号分隔可多个)' },
        evidence: { type: 'string', description: '证据描述(测试失败输出、外部信号等,可选)' },
      },
      required: ['target'],
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const r = state.ritual
        if (!r.locked) return { ok: false, code: 'WORKFLOW_NO_TASK', message: '先 nle_suggest 开始任务' }
        const targets = String(args.target || '').split(',').map((b) => b.trim()).filter(Boolean).map(resolveBlock)
        if (!targets.length) return { ok: false, code: 'INVALID_ARGS', message: 'target 必填' }
        const prevScope = [...r.allowedPaths]
        r.reorients = r.reorients || []
        r.reorients.push({ at: nowIso(), target: targets, evidence: String(args.evidence || '').slice(0, 300), fromScope: prevScope })
        r.allowedPaths = [...new Set([...r.allowedPaths, ...targets])]
        r.focus = [...r.allowedPaths]
        for (const t of targets) {
          const h = highImpactOf(t)
          if (h !== null && !r.impactCovered.some((c) => c === t || c === h)) r.impactCovered.push(t)
        }
        persist(exec.agent)
        return { ok: true, taskId: r.taskId, reorients: r.reorients.length, target: targets, fromScope: prevScope, allowedPaths: r.allowedPaths, note: 'scope 已重定向(证据驱动);原范围保留在 reorients 审计' }
      },
    })

    register({
      name: 'nle_alias',
      description: 'NLE 别名 KB 管理(配置化):list 查看当前别名→文件映射;set 覆盖/新增一个别名(文件路径工作区相对);del 删除一个别名。改的是状态文件中的 aliasKB,持久化跨会话生效。',
      properties: {
        op: { type: 'string', description: 'list | set | del' },
        key: { type: 'string', description: '别名关键词(如 折扣/discount)' },
        files: { type: 'string', description: 'set 时:逗号分隔的文件路径(工作区相对)' },
      },
      required: ['op'],
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const op = String(args.op || '').trim()
        const key = String(args.key || '').trim()
        if (op === 'list') {
          return { ok: true, count: Object.keys(state.aliasKB).length, aliasKB: state.aliasKB }
        }
        if (!key) return { ok: false, code: 'INVALID_ARGS', message: 'key 必填(set/del)' }
        if (op === 'set') {
          // 审计修复:先 resolveBlock 归一(项目相对补 root 前缀,与 focus/reorient/select 同一约定),
          // 再转 'exp-host/' 规范形——裸 'src/store.js' 不再以非规范键进 aliasKB(检索键空间分裂)
          const files = String(args.files || '').split(',').map((b) => b.trim()).filter(Boolean).map((f) => {
            const rel = resolveBlock(f)
            if (rel && rel.startsWith(state.root + '/')) return 'exp-host/' + rel.slice(state.root.length + 1)
            return rel || f
          })
          if (!files.length) return { ok: false, code: 'INVALID_ARGS', message: 'files 必填(set)' }
          state.aliasKB[key] = files
          persist(exec.agent)
          return { ok: true, op, key, files, count: Object.keys(state.aliasKB).length }
        }
        if (op === 'del') {
          const existed = key in state.aliasKB
          delete state.aliasKB[key]
          if (existed) persist(exec.agent)
          return { ok: true, op, key, existed, count: Object.keys(state.aliasKB).length }
        }
        return { ok: false, code: 'INVALID_ARGS', message: 'op 必须为 list/set/del' }
      },
    })

    register({
      name: 'nle_impact',
      description: 'NLE 影响半径审查(T2/T3 高影响路径必做):声明即将编辑的高影响模块(store/slices/核心),返回影响半径(声明优先 + 精确 importer 反查)。declared 为 agent 自声明影响面(overlay 精神:声明与 patch 同事务,select 对账)。',
      properties: {
        name: { type: 'string', description: '高影响模块路径(工作区相对或项目相对)' },
        declared: { type: 'array', items: { type: 'string' }, description: '可选:agent 自声明的影响面文件列表(工作区相对);无可靠推理时如实声明,勿编造' },
      },
      required: ['name'],
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const r = state.ritual
        if (!r.locked) return { ok: false, code: 'WORKFLOW_NO_TASK', message: '先 nle_suggest 开始任务' }
        const name = resolveBlock(String(args.name || '').trim())
        // P7-B:配置化——highImpact 以运行时配置为准(state.highImpact 由状态文件加载)
        const hiSource = Array.isArray(state.highImpact) && state.highImpact.length ? state.highImpact : HIGH_IMPACT
        const hi = hiSource.map((h) => state.root + '/' + h)
        let covered = false
        for (const h of hi) {
          if (name === h || name.startsWith(h + '/') || h.startsWith(name)) covered = true
        }
        if (covered && !r.impactCovered.includes(name)) r.impactCovered.push(name)
        // P7-B:精确 importer 反查(1-hop)——normalizeSpec 相对路径展开后精确匹配;
        //   不再 basename 包含匹配(不同目录同名文件会误连);外部包/别名不连边。
        const inferred = exactImporters(cellStore(), name).map((x) => x.file)
        // 声明优先:agent 自声明影响面(去 ./ 规范化)标注来源,与推断结果合并去重
        const declaredRaw = Array.isArray(args.declared) ? args.declared.map((d) => resolveBlock(String(d))) : []
        const declaredFiles = declaredRaw.filter((f) => f && f !== name)
        const radiusDeclared = declaredFiles.map((f) => ({ file: f, source: 'declared' }))
        const radiusInferred = inferred.filter((f) => !declaredFiles.includes(f)).map((f) => ({ file: f, source: 'inferred' }))
        const radius = radiusDeclared.concat(radiusInferred).map((x) => x.file)
        // 声明面进 ritual(select 时与真实编辑面对账)
        for (const f of declaredFiles) if (!r.impactDeclared.includes(f)) r.impactDeclared.push(f)
        persist(exec.agent)
        return { ok: true, name, covered, impactCovered: r.impactCovered, radius, radiusDetail: radiusDeclared.concat(radiusInferred), highImpactPaths: hi }
      },
    })

    register({
      name: 'nle_mutate',
      description: 'NLE AEU: hash-bound 字面编辑(fsVersion 版本守卫,stale 拒绝)+ overlay 声明同事务(overlay_import/blast/note)。受 scope lock 约束。',
      properties: {
        file: { type: 'string', description: '目标文件(工作区相对)' },
        old_string: { type: 'string', description: '被替换字面文本(必须唯一匹配)' },
        new_string: { type: 'string', description: '替换文本' },
        overlay_import: { type: 'string', description: '本编辑新增/确认的 import 说明符' },
        blast: { type: 'string', description: '影响模块(逗号分隔,可选)' },
        note: { type: 'string', description: '意图说明(why,可选)' },
      },
      required: ['file', 'old_string', 'new_string'],
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const t0Mutate = Date.now()
        const rel = await resolveToolPath(args.file)
        if (rel === null) return { ok: false, code: 'INVALID_ARGS', message: 'file 必须在工作区内' }
        const r = state.ritual
        if (!r.locked) return { ok: false, code: 'WORKFLOW_MISSING_SUGGEST', message: '先 nle_suggest' }
        if (r.tier !== 'T1' && r.allowedPaths.length === 0) return { ok: false, code: 'WORKFLOW_MISSING_FOCUS', message: '先 nle_focus' }
        if (!withinAllowed(rel)) {
          const rt = reorientTargets()
          const hint = (r.suggested.includes(rel) || rt.includes(rel))
            ? ' — 该文件在 suggest 列表/已 reorient,请用 nle_reorient 声明证据后重定向'
            : ''
          return { ok: false, code: 'WORKFLOW_SCOPE_DRIFT', allowed: r.allowedPaths, message: rel + ' 超出 focus 范围' + hint }
        }
        if (r.tier !== 'T1' && !coveredImpact(rel)) return { ok: false, code: 'WORKFLOW_MISSING_IMPACT', message: '高影响路径 ' + highImpactOf(rel) + ' 需先 nle_impact' }
        const cells = cellStore()
        const cell = cells[rel] || { file: rel, fsVersion: null, hash: null, surfaceImports: [], declaredImports: [], overlay: [], pecState: 'confirmed', updatedAt: null }
        if (cell.fsVersion !== null && cell.fsVersion !== undefined) {
          const d = await driftCheck(rel, cell)
          if (d === 'stale' || d === 'missing') return { ok: false, code: 'CON405', message: rel + ' ' + (d === 'missing' ? '文件缺失' : 'cell stale(hash)') + ' — 先 nle_rebind 再编辑' }
        }
        try {
          const t = await targetOf(rel)
          const outcome = await fs.editText(t, { oldString: args.old_string, newString: args.new_string, replaceAll: false }, cell.fsVersion !== null && cell.fsVersion !== undefined ? { version: cell.fsVersion } : undefined, exec.signal, policyFor(exec.agent))
          // 审计修复:新文件(无既有 cell)必须写回 cells——否则 overlay 声明随临时对象丢弃,"声明与 patch 同事务"名存实亡
          cells[rel] = cell
          cell.fsVersion = outcome ? outcome.version : null
          if (args.overlay_import) {
            const note = args.blast ? (args.note ? args.note + ' [blast: ' + args.blast + ']' : '[blast: ' + args.blast + ']') : (args.note || null)
            overlayAdd(cell, args.overlay_import, 'agent', note)
            if (!cell.declaredImports.includes(args.overlay_import)) cell.declaredImports.push(args.overlay_import)
          }
          telemetryPush({ type: 'mutate', file: rel, taskId: r.taskId, ms: Date.now() - t0Mutate })
          // P7 实验修复:显式 applied 标记 + 新版本号,消除"ok 但未写入"歧义
          return { ok: true, file: rel, applied: true, version: outcome ? outcome.version : null, note: args.note || null }
        } catch (e) {
          const msg = String((e && e.message) || e)
          const code = (e && e.code) ? String(e.code) : ''
          // P7 实验修复:错误码细化——不匹配/歧义/stale/其余各自独立,不再模糊成 CON405/EDIT_FAILED
          let codeOut = 'EDIT_FAILED'
          if (/version|stale|conflict/i.test(msg) || code === 'FS_STALE_VERSION') codeOut = 'CON405'
          else if (code === 'FS_EDIT_NOT_FOUND' || /not found/i.test(msg)) codeOut = 'EDIT_NOT_FOUND'
          else if (code === 'FS_AMBIGUOUS_EDIT' || /matched .* times/i.test(msg)) codeOut = 'EDIT_AMBIGUOUS'
          return { ok: false, code: codeOut, message: msg }
        }
      },
    })

    register({
      name: 'nle_expand_import',
      description: 'NLE PEC 确认:声明 import 边为 confirmed(candidate→confirmed,或 surface 未声明 import 补入 overlay)。imports 省略时确认该文件全部待确认边。',
      properties: {
        file: { type: 'string', description: '目标文件(工作区相对)' },
        imports: { type: 'string', description: '逗号分隔的 import 说明符;省略则全部确认' },
      },
      required: ['file'],
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const rel = await resolveToolPath(args.file)
        if (rel === null) return { ok: false, code: 'INVALID_ARGS' }
        const cells = cellStore()
        const cell = cells[rel] || { file: rel, fsVersion: null, hash: null, surfaceImports: [], declaredImports: [], overlay: [], pecState: 'confirmed', updatedAt: null }
        const want = String(args.imports || '').split(',').map((s) => s.trim()).filter(Boolean)
        const pick = (s) => want.length === 0 || want.includes(s)
        const ov = cell.overlay || []
        let confirmed = 0
        for (const o of ov) {
          if (o.pecState === 'candidate' && pick(o.import)) {
            o.pecState = 'confirmed'
            o.declaredBy = 'agent'
            o.at = nowIso()
            if (!cell.declaredImports.includes(o.import)) cell.declaredImports.push(o.import)
            confirmed++
          }
        }
        for (const s of (cell.surfaceImports || [])) {
          if (pick(s) && !ov.some((o) => o.import === s)) {
            ov.push({ import: s, pecState: 'confirmed', declaredBy: 'agent', note: null, at: nowIso() })
            if (!cell.declaredImports.includes(s)) cell.declaredImports.push(s)
            confirmed++
          }
        }
        cell.overlay = ov
        cells[rel] = cell
        persist(exec.agent)
        return { ok: true, file: rel, confirmed, pecState: cellPecState(cell), remaining: (cell.overlay || []).filter((o) => o.pecState === 'candidate').map((o) => o.import) }
      },
    })

    register({
      name: 'nle_rebind',
      description: 'NLE rebind: 重读磁盘,重算 fsVersion + 内容哈希 + surface imports,清除 CON405 漂移。',
      properties: {
        file: { type: 'string', description: '目标文件(工作区相对)' },
      },
      required: ['file'],
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const rel = await resolveToolPath(args.file)
        if (rel === null) return { ok: false, code: 'INVALID_ARGS' }
        const cells = cellStore()
        const cell = cells[rel] || { file: rel, fsVersion: null, hash: null, surfaceImports: [], declaredImports: [], overlay: [], pecState: 'confirmed', updatedAt: null }
        const text = await refreshCellFacts(cell, rel)
        cell.surfaceImports = text === null ? [] : extractImports(text.split('\n'))
        cell.pecState = 'confirmed'
        cell.updatedAt = nowIso()
        cells[rel] = cell
        state.patches.push({ at: nowIso(), tool: 'nle_rebind', file: rel, added: [], removed: [], imports: cell.surfaceImports })
        if (state.patches.length > PATCH_CAP) state.patches.splice(0, state.patches.length - PATCH_CAP)
        persist(exec.agent)
        return { ok: true, file: rel, fsVersion: cell.fsVersion, hash: cell.hash, surfaceImports: cell.surfaceImports, pecState: cellPecState(cell), CON405: text === null ? 'file-missing' : 'cleared' }
      },
    })

    register({
      name: 'nle_check',
      description: 'NLE gate 检查:cell 与磁盘一致性(CON200/405)+ PEC 状态(candidate/confirmed/stale)+ 未声明 import(CON404,对齐 ADR-0011)+ ritual 状态 + learned KB 大小。',
      properties: {
        file: { type: 'string', description: '可选:精确文件(工作区相对);省略则检查全部' },
      },
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const r = state.ritual
        const cells = cellStore()
        const one = async (rel) => {
          const cell = cells[rel]
          if (!cell) return { file: rel, code: 'NONE', note: '无 cell(未观测)' }
          if (cell.hash === null || cell.hash === undefined) {
            const text = await refreshCellFacts(cell, rel)
            cell.surfaceImports = text === null ? [] : extractImports(text.split('\n'))
          }
          const d = await driftCheck(rel, cell)
          const unDeclared = unDeclaredImports(cell)
          const candidate = (cell.overlay || []).filter((o) => o.pecState === 'candidate').map((o) => o.import)
          const code = d === 'stale' || d === 'missing' ? 'CON405' : (unDeclared.length > 0 ? 'CON404' : (candidate.length > 0 ? 'CON422' : 'CON200'))
          return { file: rel, code, pecState: d === 'stale' || d === 'missing' ? 'stale' : cellPecState(cell), unDeclared, candidate, overlay: (cell.overlay || []).map((o) => ({ import: o.import, pecState: o.pecState })) }
        }
        if (args.file) {
          const rel = await resolveToolPath(args.file)
          if (rel === null) return { ok: false, code: 'INVALID_ARGS' }
          return { ok: true, ...(await one(rel)) }
        }
        const codes = { CON200: 0, CON404: 0, CON405: 0, CON422: 0, NONE: 0 }
        const stale = []
        const details = []
        for (const rel of Object.keys(cells)) {
          const res = await one(rel)
          codes[res.code] = (codes[res.code] || 0) + 1
          if (res.code === 'CON405') stale.push(rel)
          if (res.code !== 'CON200' && res.code !== 'NONE') details.push(res)
        }
        state.lastStale = stale
        persist(exec.agent)
        return {
          ok: true, taskId: r.taskId, tier: r.tier, locked: r.locked, task: r.task,
          suggested: r.suggested, allowedPaths: r.allowedPaths, impactCovered: r.impactCovered,
          denied: r.denied, edits: r.edits, selectLog: r.selectLog, guardLog: r.guardLog,
          reorients: (r.reorients || []).length, reorientLog: r.reorients || [],
          cells: Object.keys(cells).length, codes, stale, details,
          patches: state.patches.length, learned: state.learned.length, misses: state.misses.length, root: state.root, arm: state.arm,
        }
      },
    })

    register({
      name: 'nle_select',
      description: 'NLE ritual 收尾:声明实际编辑的文件,对照 suggested 做漂移审计,闭合任务(解锁),并写回 learned(关键词→文件)与 miss 记录。',
      properties: {
        edited: { type: 'string', description: '实际编辑的文件(工作区相对,逗号分隔)' },
      },
      required: ['edited'],
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const r = state.ritual
        if (!r.locked) return { ok: false, code: 'WORKFLOW_NO_TASK', message: '无活动任务' }
        const edited = String(args.edited || '').split(',').map((b) => b.trim()).filter(Boolean).map(resolveBlock)
        const suggested = r.suggested
        const rt = reorientTargets()
        const outside = edited.filter((e) => !suggested.includes(e) && !withinAllowed(e) && !rt.includes(e))
        const inside = edited.filter((e) => suggested.includes(e) || withinAllowed(e) || rt.includes(e))
        const suggestedOnly = suggested.filter((s) => !edited.includes(s))
        // V5.9 类 3:变更文件契约门——以 tools/result 真相为基准,声明仅用于审计;学习只取真实编辑
        const contract = auditContract(state.truthTools, edited, r.openedAt)
        const learnSet = [...new Set(contract.realEdited.length ? contract.realEdited : edited)]
        // 审计修复:impact 声明面对账(原版 overlay-primary "声明与 patch 同事务"的忠实实现)
        // 声明了但未编辑 → WARN;真实编辑落在高影响面但未声明 → 提示补 impact
        const impactAudit = { declared: r.impactDeclared || [], editedInDeclared: [], undeclaredHighImpact: [] }
        if (impactAudit.declared.length) {
          impactAudit.editedInDeclared = impactAudit.declared.filter((f) => edited.includes(f))
          const realHigh = edited.filter((f) => highImpactOf(f) !== null)
          impactAudit.undeclaredHighImpact = realHigh.filter((f) => !impactAudit.declared.includes(f))
        }
        learnFrom(r.task, learnSet)
        missRecord(r.task, suggested, edited)
        updateCoChange(state.coChange, learnSet)
        markLearnedConflicts(state.learned)
        // P7-C:闭合反射——五信号熔合为 observations(reflectOnTaskEnd 定义于 apply-knowledge)
        let reflections = []
        if (typeof reflectOnTaskEnd === 'function') reflections = reflectOnTaskEnd()
        // P7 修复②:git 信号反射异步补充(churn 提名 + rollback 负反馈;失败零观测)
        if (typeof reflectGitSignals === 'function') {
          try { reflections = reflections.concat(await reflectGitSignals()) } catch (e) { /* ignore */ }
        }
        telemetryPush({ type: 'select', taskId: r.taskId, editedCount: edited.length, hitCount: edited.filter((e) => suggested.includes(e)).length, truth: contract.available ? contract.realEdited.length : -1, reflections: reflections.length, impactDeclared: impactAudit.declared.length, impactUndeclaredHigh: impactAudit.undeclaredHighImpact.length })
        r.selectLog = { edited, at: nowIso(), contract: contract.issues.map((i) => i.code), impactAudit }
        r.locked = false
        clearOutsideReads()
        persist(exec.agent)
        return { ok: true, taskId: r.taskId, audit: { inside, outside, suggestedOnly, reoriented: edited.filter((e) => rt.includes(e)) }, impactAudit, closed: true, learned: state.learned.length, reflections: reflections.length, note: '任务已闭合;下次任务请重新 nle_suggest' }
      },
    })

    register({
      name: 'nle_guard',
      description: 'NLE 收尾总闸:workflow 合规(编辑后必须 select;PATCH_GAP;selectAt 时序)+ CON 状态(CON405 FAIL,CON404/422 WARN)+ 预算(≤32 文件/≤30s)+ deny 计数 → PASS/FAIL 报告。',
      properties: {},
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const r = state.ritual
        const issues = []
        const t0 = Date.now()
        if (r.locked && r.selectLog === null && r.edits.length > 0) {
          issues.push({ code: 'NLE_WORKFLOW_INCOMPLETE', severity: 'FAIL', msg: '有编辑但任务未 select 闭合' })
        }
        if (r.locked && r.edits.length === 0 && r.suggested.length > 0) {
          issues.push({ code: 'NLE_WORKFLOW_NO_EDITS', severity: 'WARN', msg: '任务已开但无编辑' })
        }
        const taskPatches = r.openedAt ? state.patches.filter((p) => String(p.at) >= String(r.openedAt)) : []
        const patched = new Set(taskPatches.map((p) => p.file))
        const gap = (r.edits || []).filter((f) => !patched.has(f))
        if (gap.length) {
          issues.push({ code: 'NLE_PATCH_GAP', severity: 'FAIL', msg: gap.length + ' 个编辑无 patch 记录: ' + gap.join(',') })
        }
        // V5.9 类 3:DSH 原生真相对账(tools/result 工具层 + fs intent 文件层 vs 声明)
        const truthAudit = auditTruth(state.truthTools, state.truthWrites, r.edits, r.openedAt)
        if (!truthAudit.available && r.locked && (r.edits || []).length > 0) {
          issues.push({ code: 'NLE_TRUTH_UNAVAILABLE', severity: 'WARN', msg: '任务窗口内无真相记录(插件重启?),对账降级' })
        }
        for (const i of truthAudit.issues) {
          issues.push({ code: i.code, severity: i.severity, msg: i.files.length + ' 个: ' + i.files.join(',') })
        }
        if (r.selectLog && r.openedAt) {
          const lastEditAt = taskPatches.map((p) => String(p.at)).sort().pop()
          if (lastEditAt && String(r.selectLog.at) < lastEditAt) {
            issues.push({ code: 'NLE_SELECT_ORDER', severity: 'FAIL', msg: 'select 早于最后编辑(selectAt=' + String(r.selectLog.at) + ' < lastEdit=' + lastEditAt + ')' })
          }
        }
        if ((r.reorients || []).length) {
          issues.push({ code: 'NLE_REORIENT', severity: 'WARN', msg: (r.reorients || []).length + ' 次证据重定向: ' + r.reorients.map((x) => x.target.join(',')).join(' | ') })
        }
        const cells = cellStore()
        let stale = 0, candidates = 0, unDeclared = 0
        for (const rel of Object.keys(cells)) {
          const cell = cells[rel]
          if (cell.hash === null || cell.hash === undefined) {
            const text = await refreshCellFacts(cell, rel)
            cell.surfaceImports = text === null ? [] : extractImports(text.split('\n'))
          }
          const d = await driftCheck(rel, cell)
          if (d === 'stale' || d === 'missing') stale++
          else {
            if (unDeclaredImports(cell).length) unDeclared++
            if ((cell.overlay || []).some((o) => o.pecState === 'candidate')) candidates++
          }
        }
        if (stale > 0) issues.push({ code: 'CON405', severity: 'FAIL', msg: stale + ' 个 cell 漂移/缺失' })
        if (unDeclared > 0) issues.push({ code: 'CON404', severity: 'WARN', msg: unDeclared + ' 个文件有未声明 import' })
        if (candidates > 0) issues.push({ code: 'CON422', severity: 'WARN', msg: candidates + ' 个文件有 candidate 边' })
        const cellCount = Object.keys(cells).length
        if (cellCount > 32) issues.push({ code: 'BUDGET_FILES', severity: 'WARN', msg: cellCount + ' 文件 > 32' })
        if (r.denied > 0) issues.push({ code: 'WORKFLOW_DENIED', severity: 'WARN', msg: r.denied + ' 次 deny' })
        const elapsedMs = Date.now() - t0
        if (elapsedMs > 30000) issues.push({ code: 'BUDGET_TIME', severity: 'WARN', msg: elapsedMs + 'ms > 30s' })
        const fail = issues.filter((i) => i.severity === 'FAIL')
        const verdict = fail.length ? 'FAIL' : 'PASS'
        telemetryPush({ type: 'guard', taskId: r.taskId, verdict, issues: issues.map((i) => i.code), ms: elapsedMs })
        // 审计修复:semantic 取最近一次 suggest 的实测值(telemetry 里最后一笔 suggest 的 semantic 标记),
        // 不再硬编码 'off'(原版健康趋势的"看似有实则空"字段)
        let lastSemantic = 'off'
        for (let i = state.telemetry.length - 1; i >= 0; i--) {
          if (state.telemetry[i].type === 'suggest') { lastSemantic = state.telemetry[i].semantic || 'off'; break }
        }
        pushTrend(state.trend, trendPoint({ timestamp: nowIso(), totalEdits: r.edits ? r.edits.length : 0, denyCount: r.denied || 0, learnedHit: (r.suggested || []).length > 0, staleCount: stale, semantic: lastSemantic, guardVerdict: verdict }))
        // P5:成本报告——ctx.tokenMeter 会话表层计量(服务未挂载 → null);V11.1:声明先于 guardLog 引用(TDZ)
        let cost = null
        try {
          const tm = ctx.get('tokenMeter')
          if (tm && typeof tm.measure === 'function' && exec.agent && exec.agent.session) {
            const m = await tm.measure(exec.agent.session)
            cost = { surfaceTokens: m.surfaceTokens, totalTokens: m.totalTokens }
          }
        } catch (e) { cost = null }
        r.guardLog = { verdict, issues, cost, at: nowIso(), elapsedMs }
        persist(exec.agent)
        return {
          ok: true, verdict, issues, cost,
          stats: { cells: cellCount, stale, candidates, unDeclared, denied: r.denied, patches: state.patches.length, learned: state.learned.length, misses: state.misses.length, elapsedMs },
          taskId: r.taskId, locked: r.locked,
        }
      },
    })

    register({
      name: 'nle_reset',
      description: 'NLE ritual 重置:解锁 scope 并清空任务状态(通常 nle_select 会自动闭合,无需手动)。',
      properties: {},
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        state.ritual = { locked: false, task: null, taskId: 0, tier: 'T2', suggested: [], focus: [], allowedPaths: [], impactCovered: [], edits: [], selectLog: null, guardLog: null, denied: 0, openedAt: null, autoClosed: null, reorients: [], focusExpanded: [] }
        clearOutsideReads()
        persist(exec.agent)
        return { ok: true, reset: true }
      },
    })

    register({
      name: 'nle_forget',
      description: 'NLE 手动弃用:把 learned 条目置为 retired(置信度 0.1),不再参与检索与技能目录;条目保留在状态文件待 revival。',
      properties: {
        file: { type: 'string', description: '弃用关联文件(工作区相对;匹配 files 包含该文件的当前项目条目)' },
      },
      required: ['file'],
      execute: async (args, exec) => {
        if (!(await gate(exec))) return { ok: false, code: 'OUTSIDE_SESSION' }
        const rel = await resolveToolPath(args.file)
        if (rel === null) return { ok: false, code: 'INVALID_ARGS', message: 'file 必须在工作区内' }
        const pidNow = projectIdOf(state.root)
        let n = 0
        for (const e of state.learned) {
          if (e.status === 'retired') continue
          if (e.scope !== 'global' && (!e.projectId || e.projectId !== pidNow)) continue
          if ((e.files || []).includes(rel)) { e.status = 'retired'; e.confidence = 0.1; n++ }
        }
        persist(exec.agent)
        return { ok: true, retired: n, file: rel }
      },
    })
