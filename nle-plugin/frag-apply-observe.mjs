// ==== DSNLE fragment: apply-observe — 扫描/观测/钩子(truth/recordPatch/preExec/postExec/事件) ====
    async function scanFiles(root) {
      const out = []
      const queue = [root]
      let guard = 0
      while (queue.length && guard++ < 120) {
        const dir = queue.shift()
        let entries
        try {
          const t = await fs.resolve(dir, { cwd: state.hostCwdRaw })
          entries = await fs.listDir(t)
        } catch (e) { continue }
        for (const e of entries) {
          const child = dir + '/' + e.name
          if (e.type === 'directory') {
            if (SCAN_SKIP_DIRS.includes(e.name)) continue
            queue.push(child)
          } else if (e.type === 'file' && isSource(child) && out.length < SCAN_CAP) {
            out.push(child)
          }
        }
      }
      return out
    }

    async function scanDirDeep(dir) {
      dir = String(dir).replace(/\/+$/, '')
      const out = []
      const queue = [dir]
      let guard = 0
      while (queue.length && guard++ < 120) {
        const cur = queue.shift()
        let entries
        try {
          const t = await fs.resolve(cur, { cwd: state.hostCwdRaw })
          entries = await fs.listDir(t)
        } catch (e) { continue }
        for (const e of entries) {
          const child = cur + '/' + e.name
          if (e.type === 'directory') {
            if (SCAN_SKIP_DIRS.includes(e.name)) continue
            queue.push(child)
          } else if (e.type === 'file' && isSource(child)) {
            out.push(child)
          }
        }
      }
      return out
    }

    async function readHead(f) {
      try {
        const t = await fs.resolve(f, { cwd: state.hostCwdRaw })
        const info = await fs.stat(t)
        if (!info) return ''
        const size = info.size === undefined || info.size === null ? 0 : Number(info.size)
        if (size > SCAN_MAX_BYTES) return ''
        const text = await fs.readText(t)
        return text
      } catch (e) { return '' }
    }

    

    

    function telemetryPush(e) {
      state.telemetry.push(Object.assign({ at: nowIso() }, e))
      if (state.telemetry.length > 2000) state.telemetry.splice(0, state.telemetry.length - 2000)
    }

    function truthWrite(rel) {
      const w = state.truthWrites.find((x) => x.file === rel)
      if (w) { w.count++; w.at = nowIso() } else state.truthWrites.push({ file: rel, count: 1, at: nowIso() })
      if (state.truthWrites.length > 2000) state.truthWrites.splice(0, state.truthWrites.length - 2000)
    }

    function recentActive() {
      const seen = []
      for (let i = state.patches.length - 1; i >= 0 && seen.length < 5; i--) {
        if (!seen.includes(state.patches[i].file)) seen.push(state.patches[i].file)
      }
      return seen
    }

    const retrieve = createRetrieve({
    scanFiles,
    coChangeOf: async (f) => {
      const g = await semGitCoChange()
      if (g && g.matrix) return jaccardNeighbors(g.matrix, g.touched, f).map((x) => x.file)
      return topCoChangeNeighbors(state.coChange, f)
    },
    offersOf: async (f) => {
      const cell = cellFor(f)
      if (cell && Array.isArray(cell.offers)) return cell.offers
      const text = await readHead(f)
      return text ? extractOffers(text) : []
    },
    existsOf: async (f) => {
      try {
        const t = await fs.resolve(f, { cwd: state.hostCwdRaw })
        const info = await fs.stat(t)
        return !!info
      } catch (e) { return false }
    },
    readContent: readHead,
    driftOf: async (f) => {
      const cell = cellFor(f)
      if (!cell) return null
      return driftCheck(f, cell)
    },
    recent: () => recentActive(),
    learnedOf: () => state.learned,
    aliasKBOf: () => state.aliasKB,
    // P7-A:precedent 先例通道(实现于 apply-knowledge;sessionQuery 不可用/超时 → 内部降级)
    precedentOf: async (task) => (typeof precedentOf === 'function' ? await precedentOf(task) : { state: 'off', files: [], support: {}, sessions: 0, scanned: 0 }),
    embedQuery: async (task) => { try { telemetryPush({ type: 'semDiag', phase: 'embedQuery-call', head: String(task || '').slice(0, 40) }) } catch (e) {} return semQuery(String(task || '').slice(0, 512)) },
    semanticOf: (f) => semOf(f),
  })

    async function refreshCellFacts(cell, rel) {
      cell.fsVersion = await statVersion(rel)
      const text = await readContent(rel)
      cell.hash = text === null ? null : fnv1a(text)
      if (text !== null) cell.offers = extractOffers(text)
      return text
    }

    async function recordPatch(exec, result) {
      const name = exec.name
      const args = exec.arguments || {}
      const rel = toRel(args.file_path || args.file)
      if (rel === null || !isSource(rel) || !inProject(rel)) return
      const added = (name === 'edit' || name === 'nle_mutate')
        ? String(args.new_string || '').split('\n')
        : String(args.content || '').split('\n')
      const removed = (name === 'edit' || name === 'nle_mutate')
        ? String(args.old_string || '').split('\n')
        : []
      const imports = extractImports(added)
      const removedImports = extractImports(removed)
      const cells = cellStore()
      const cell = cells[rel] || { file: rel, fsVersion: null, hash: null, surfaceImports: [], declaredImports: [], overlay: [], pecState: 'confirmed', updatedAt: null }
      await refreshCellFacts(cell, rel)
      const merged = new Set(cell.surfaceImports || [])
      for (const r of removedImports) merged.delete(r)
      for (const i of imports) merged.add(i)
      cell.surfaceImports = [...merged]
      for (const r of removedImports) overlayRemove(cell, r)
      const declared = new Set((cell.overlay || []).map((o) => o.import))
      for (const i of imports) {
        if (!declared.has(i)) {
          ;(cell.overlay || (cell.overlay = [])).push({ import: i, pecState: 'candidate', declaredBy: 'plo', note: null, at: nowIso() })
        }
      }
      cell.pecState = 'confirmed'
      cell.updatedAt = nowIso()
      cells[rel] = cell
      state.patches.push({ at: nowIso(), tool: name, file: rel, added: added.slice(0, 40), removed: removed.slice(0, 40), imports })
      if (state.patches.length > PATCH_CAP) state.patches.splice(0, state.patches.length - PATCH_CAP)
      if (!state.ritual.edits.includes(rel)) state.ritual.edits.push(rel)
      persist(exec.agent)
    }

    async function enrichTarget(exec, result, rel) {
      if (rel === null || !inProject(rel)) return null
      const cell = cellFor(rel)
      if (!cell) return null
      const d = await driftCheck(rel, cell)
      if (d === null) return null
      const note = d === 'missing' ? '文件缺失' : 'stale(hash)'
      return {
        kind: 'accept',
        content: (Array.isArray(result.content) ? result.content : []).concat([
          { type: 'text', text: '[NLE] CON405: ' + rel + ' ' + note + ' — cell 与磁盘不一致,先 nle_rebind 再编辑' },
        ]),
      }
    }
    async function enrichRead(exec, result) {
      const args = exec.arguments || {}
      return enrichTarget(exec, result, toRel(args.file_path))
    }
    async function enrichSearch(exec, result) {
      const args = exec.arguments || {}
      const rel = toRel(args.path)
      if (rel === null) return null
      const cell = cellFor(rel)
      if (!cell) return null
      return enrichTarget(exec, result, rel)
    }

    function noteOutsideRead(rel) {
      const r = state.ritual
      if (!r.locked || rel === null || !inProject(rel) || !isSource(rel)) return
      if (r.suggested.includes(rel) || withinAllowed(rel)) return
      state.outsideReads[rel] = (state.outsideReads[rel] || 0) + 1
    }

    // ---------- hooks ----------
    async function preExec(exec, next) {
      if (!(await gate(exec))) return next()
      const name = exec.name
      const args = exec.arguments || {}
      if (name === 'pwsh' || name === 'bash' || name === 'sh' || name === 'cmd') {
        const cmd = String(args.command || '')
        if (state.ritual.locked && SHELL_WRITE_RE.test(cmd) && SOURCE_PATH_RE.test(cmd)) {
          state.ritual.denied++
          telemetryPush({ type: 'deny', code: 'WORKFLOW_SHELL_WRITE', file: null, taskId: state.ritual.taskId })
          persist(exec.agent)
          return { kind: 'deny', reason: 'WORKFLOW_SHELL_WRITE: 检测到 shell 写源码命令(绕过 NLE 编辑管道),请用 edit/nle_mutate 修改源码' }
        }
        return next()
      }
      const isWrite = name === 'edit' || name === 'write' || name === 'nle_mutate'
      if (!isWrite) return next()
      const rel = toRel(args.file_path || args.file)
      if (rel !== null && rel === STATE_FILE) {
        state.ritual.denied++
        telemetryPush({ type: 'deny', code: 'NLE_STATE_TAMPER', file: rel, taskId: state.ritual.taskId })
        persist(exec.agent)
        return { kind: 'deny', reason: 'NLE_STATE_TAMPER: 状态文件 ' + STATE_FILE + ' 只由 NLE 持久化写入,禁止直接编辑' }
      }
      if (rel === null || !isSource(rel) || !inProject(rel)) return next()
      const r = state.ritual
      const deny = (code, msg) => {
        r.denied++
        telemetryPush({ type: 'deny', code, file: rel || null, taskId: r.taskId })
        persist(exec.agent)
        return { kind: 'deny', reason: code + ': ' + msg }
      }
      const cell = cellFor(rel)
      if (cell && cell.fsVersion !== null && cell.fsVersion !== undefined) {
        const d = await driftCheck(rel, cell)
        if (d === 'stale' || d === 'missing') return deny('CON405', rel + ' ' + (d === 'missing' ? '文件缺失' : 'cell stale(hash)') + ' — 先 nle_rebind 再编辑')
      }
      if (!r.locked) return deny('WORKFLOW_MISSING_SUGGEST', '任务未开始 orient:先调用 nle_suggest')
      if (r.tier !== 'T1' && r.suggested.length === 0) return deny('WORKFLOW_MISSING_SUGGEST', 'tier=' + r.tier + ' 任务必须先 nle_suggest')
      if (r.tier === 'T1' && r.suggested.length === 0 && r.allowedPaths.length === 0) return deny('WORKFLOW_MISSING_SUGGEST', 'T1 任务需要 nle_focus 或 nle_suggest')
      if (r.tier !== 'T1' && r.allowedPaths.length === 0) return deny('WORKFLOW_MISSING_FOCUS', 'tier=' + r.tier + ' 任务必须先 nle_focus 锁定范围')
      if (!withinAllowed(rel)) {
        const rt = reorientTargets()
        const inSuggest = r.suggested.includes(rel)
        const hint = (inSuggest || rt.includes(rel))
          ? ' — 该文件在 suggest 列表中,若证据指向它请用 nle_reorient 重定向 scope'
          : ' — 如需修改请 nle_focus 扩展范围'
        return deny('WORKFLOW_SCOPE_DRIFT', rel + ' 超出 focus 范围(允许: ' + (r.allowedPaths.join(', ') || '仅 tests') + ')' + hint)
      }
      if (r.tier !== 'T1' && !coveredImpact(rel)) return deny('WORKFLOW_MISSING_IMPACT', '高影响路径 ' + highImpactOf(rel) + ' 需先 nle_impact(当前 tier=' + r.tier + ')')
      return next()
    }

    async function postExec(exec, result, next) {
      if (!(await gate(exec))) return next()
      if (result.isError) return next()
      const name = exec.name
      if (name === 'read') {
        const args = exec.arguments || {}
        noteOutsideRead(toRel(args.file_path))
        const enriched = await enrichRead(exec, result)
        if (enriched) return enriched
        return next()
      }
      if (name === 'grep' || name === 'glob') {
        const enriched = await enrichSearch(exec, result)
        if (enriched) return enriched
        return next()
      }
      if (name === 'edit' || name === 'write' || name === 'nle_mutate') {
        await recordPatch(exec, result)
      }
      return next()
    }

    ctx.on('tools/pre-execute', (exec, next) => preExec(exec, next))
    ctx.on('tools/post-execute', (exec, result, next) => postExec(exec, result, next))

    // V5.9 类 3:DSH 原生真相观测——fs 层写意图(任何写必经)+ 工具层冻结结果(不可篡改)
    const observeFsIntent = (mode, eventName, args) => {
      if (eventName !== 'fs/edit-intent' && eventName !== 'fs/write-intent') return
      try {
        const target = args && args[0]
        const rel = toRel(fs.processPath(target))
        if (rel !== null && isSource(rel) && inProject(rel)) truthWrite(rel)
      } catch (e) { /* ignore */ }
    }
    ctx.on('internal/dispatch', observeFsIntent)
    ctx.on('fs/edit-intent', (target, actor, next) => {
      observeFsIntent('waterfall', 'fs/edit-intent', [target])
      return next()
    })
    ctx.on('fs/write-intent', (target, actor, next) => {
      observeFsIntent('waterfall', 'fs/write-intent', [target])
      return next()
    })
    ctx.on('tools/result', (exec, result) => {
      if (!result || result.isError) return
      const name = exec && exec.name
      if (name !== 'edit' && name !== 'write' && name !== 'nle_mutate') return
      const args = (exec && exec.arguments) || {}
      const rel = toRel(args.file_path || args.file)
      if (rel === null || !isSource(rel) || !inProject(rel)) return
      state.truthTools.push({ at: nowIso(), name, file: rel })
      if (state.truthTools.length > 2000) state.truthTools.splice(0, state.truthTools.length - 2000)
    })

    ctx.on('agent/turn-stopping', (payload) => {
      const r = state.ritual
      if (state.hostCwd !== null && r.locked && r.edits.length === 0 && r.selectLog === null) {
        r.locked = false
        r.autoClosed = 'turn-stopping-auto-unlock'
        persist(null)
      }
    })

    if (systemPrompt) {
      ctx.effect(() => systemPrompt.context({
        name: 'dsnle-snapshot',
        order: 1000,
        text: (ctx) => {
          if (state.hostCwd === null) return ''
          let ctxSid = null
          try { ctxSid = ctx && ctx.agent && ctx.agent.session && ctx.agent.session.id } catch (e) {}
          if (!ctxSid || !(state.enrolledSessions || []).includes(ctxSid)) return ''
          const r = state.ritual
          const lines = []
          if (r.locked) {
            lines.push('[NLE] 任务#' + r.taskId + ' tier=' + r.tier + ': ' + (r.task || ''))
            if (r.suggested.length) lines.push('[NLE] suggested: ' + r.suggested.join(', '))
            if (r.allowedPaths.length) lines.push('[NLE] scope: ' + r.allowedPaths.join(', '))
            if (r.impactCovered.length) lines.push('[NLE] impact: ' + r.impactCovered.join(', '))
            if ((r.reorients || []).length) lines.push('[NLE] reorients: ' + r.reorients.map((x) => x.target.join(',')).join(' | '))
          } else {
            lines.push('[NLE] 无活动任务;改源码前先 nle_suggest')
          }
          const recent = recentActive()
          if (recent.length) lines.push('[NLE] recentActive: ' + recent.join(', '))
          if (state.lastStale.length) lines.push('[NLE] drifted: ' + state.lastStale.join(', '))
          const outside = Object.entries(state.outsideReads || {}).filter(([, n]) => n >= 2).map(([f]) => f)
          if (outside.length) {
            const suggestHits = outside.filter((f) => r.suggested.includes(f))
            if (suggestHits.length) lines.push('[NLE] 重定向: 反复阅读范围外 ' + suggestHits.join(', ') + ' — 该文件在 suggest 列表,若证据(测试失败等)指向它,请用 nle_reorient 重定向 scope')
            else lines.push('[NLE] 重定向: 反复阅读范围外 ' + outside.join(', ') + ' — 如需修改请 nle_focus 扩展范围')
          }
          if (r.denied > 0) lines.push('[NLE] denied=' + r.denied)
          return lines.join('\n')
        },
      }))
    }
