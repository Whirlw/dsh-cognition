// ==== DSNLE fragment: apply-knowledge — skills provider + 语义/git spool 客户端 ====
    // P1:learned → DSH skills provider(nle-learned)——模型目录可见摘要,正文按需加载,零常驻 token 成本
    let invalidateSkills = null
    function skillsDirty() {
      if (invalidateSkills) { try { invalidateSkills() } catch (e) { /* ignore */ } }
    }
    const skillsSvc = ctx.get('skills')
    if (skillsSvc && typeof skillsSvc.registerProvider === 'function') {
      try {
        skillsSvc.registerProvider((control) => {
          invalidateSkills = control.invalidate
          return {
            name: 'nle-learned',
            list: async (options) => {
              const pidNow = projectIdOf(state.root)
              const entries = activeLearned(state.learned).filter((e) => (e.scope === 'global' || (e.projectId && e.projectId === pidNow)) && !isLearnedAged(e, Date.now()))
              const candidates = entries.map((e) => {
                const r = skillRenderOf(e, state.root)
                return {
                  name: r.name,
                  description: r.description,
                  whenToUse: (e.keys || []).slice(0, 4).join(' '),
                  invocation: { modelInvocable: true, userInvocable: false },
                  source: 'runtime',
                  provider: 'nle-learned',
                  rank: 250,
                  locator: e,
                }
              })
              return { candidates, complete: true }
            },
            get: async (candidate) => {
              const e = candidate && candidate.locator
              if (!e) return undefined
              const r = skillRenderOf(e, state.root)
              // P7-C:反射观测摘要追加到 learned 正文(最近 5 条,仅本任务相关条目也可见全局趋势)
              const refl = (state.reflections || []).slice(-5)
              let content = r.content
              if (refl.length) {
                content += '\n\n## 最近反射观测(P7-C)\n\n' + refl.map((x) => `- [${x.type}] #${x.taskId} ${x.detail}`).join('\n') + '\n'
              }
              return {
                name: r.name, description: r.description, content,
                invocation: { modelInvocable: true, userInvocable: false },
                source: 'runtime', provider: 'nle-learned', locator: e,
              }
            },
          }
        })
      } catch (e) { console.error('[dsnle] skills provider failed', e) }
    }

    // P2:语义通道——独立进程 spool 客户端(server: experiment/nle-semantic/server.mjs --spool <workspace>/.nle-semantic)
    // 插件跑在 node:vm 沙箱,不能 import 模型;语义检索经文件 spool 委托独立 helper 进程
    const semSpoolDir = () => (state.hostCwdRaw ? norm(state.hostCwdRaw) + '/.nle-semantic' : null)
    const semQuery = async (text) => {
      const dir = semSpoolDir()
      if (!dir || !state.hostCwdRaw) return null
      const id = fnv1a(String(text)) + '-' + Date.now().toString(36)
      try {
        try { telemetryPush({ type: 'semDiag', phase: 'semQuery-call', head: String(text).slice(0, 40) }) } catch (e) {}
        // V8:fs.resolve 返回 FsTarget 对象,不能字符串拼接;用相对路径 resolve 目标并直传
        // V10-FIX3:显式传 state.lastPolicy(带会话时由 gate 刷新;agentless 由 persist 构造)
        const reqT = await fs.resolve('.nle-semantic/' + id + '.req.json', { cwd: state.hostCwdRaw })
        await fs.writeText(reqT, JSON.stringify({ text }), undefined, undefined, state.lastPolicy)
        const resT = await fs.resolve('.nle-semantic/' + id + '.res.json', { cwd: state.hostCwdRaw })
        const deadline = Date.now() + 8000
        while (Date.now() < deadline) {
          try {
            const r = await fs.readText(resT)
            if (r !== null && r !== undefined) {
              const j = JSON.parse(String(r).replace(/^\uFEFF/, ''))
              return j.ok && Array.isArray(j.vector) ? j.vector : null
            }
          } catch (e) { /* not ready yet */ }
          await new Promise((r) => ctx.timeout(r, 150))
        }
        return null
      } catch (e) { try { telemetryPush({ type: 'semDiag', phase: 'semQuery-err', err: String((e && e.message) || e) }) } catch (e2) {} return null }
    }
    const semHeadCache = new Map()
    const semOf = async (f) => {
      if (semHeadCache.has(f)) return semHeadCache.get(f)
      const text = await readHead(f)
      const v = text ? await semQuery(String(text).slice(0, 512)) : null
      semHeadCache.set(f, v)
      if (semHeadCache.size > 200) {
        for (const k of [...semHeadCache.keys()].slice(0, 100)) semHeadCache.delete(k)
      }
      return v
    }

    // P3:git 历史共改客户端(同 spool;缓存 60s;失败回退运行时矩阵)
    // P7 修复①:req 带 prefix(state.root)——服务端把 git 输出键重写为 root 前缀路径,与检索文件同空间
    const gitCCache = new Map()
    const semGitCoChange = async () => {
      if (!state.hostCwdRaw || !state.root) return null
      const key = state.root
      const hit = gitCCache.get(key)
      if (hit && Date.now() - hit.at < 60000) return hit.data
      const dir = semSpoolDir()
      if (!dir) return null
      const id = 'git-' + fnv1a(key) + '-' + Date.now().toString(36)
      try {
        // V8:FsTarget 对象直传;V10-FIX3:显式传 state.lastPolicy
        const reqT = await fs.resolve('.nle-semantic/' + id + '.req.json', { cwd: state.hostCwdRaw })
        await fs.writeText(reqT, JSON.stringify({ kind: 'gitcochange', root: norm(state.hostCwdRaw) + '/' + key, prefix: key }), undefined, undefined, state.lastPolicy)
        const resT = await fs.resolve('.nle-semantic/' + id + '.res.json', { cwd: state.hostCwdRaw })
        const deadline = Date.now() + 15000
        while (Date.now() < deadline) {
          try {
            const r = await fs.readText(resT)
            if (r !== null && r !== undefined) {
              const j = JSON.parse(String(r).replace(/^\uFEFF/, ''))
              const data = j.ok ? { matrix: j.matrix, touched: j.touched, commits: j.commits } : null
              gitCCache.set(key, { at: Date.now(), data })
              return data
            }
          } catch (e) { /* retry */ }
          await new Promise((r) => ctx.timeout(r, 200))
        }
        gitCCache.set(key, { at: Date.now(), data: null })
        return null
      } catch (e) { return null }
    }

    // P7 修复②:git churn/rollback 客户端(reflector 信号源)——spool 请求,缓存 5min,超时/失败降级 null
    const gitSignalSpool = async (kind, extra = {}) => {
      if (!state.hostCwdRaw || !state.root) return null
      const dir = semSpoolDir()
      if (!dir) return null
      const id = kind + '-' + fnv1a(state.root) + '-' + Date.now().toString(36)
      try {
        const reqT = await fs.resolve('.nle-semantic/' + id + '.req.json', { cwd: state.hostCwdRaw })
        await fs.writeText(reqT, JSON.stringify(Object.assign({ kind, root: norm(state.hostCwdRaw) + '/' + state.root, prefix: state.root }, extra)), undefined, undefined, state.lastPolicy)
        const resT = await fs.resolve('.nle-semantic/' + id + '.res.json', { cwd: state.hostCwdRaw })
        const deadline = Date.now() + 15000
        while (Date.now() < deadline) {
          try {
            const r = await fs.readText(resT)
            if (r !== null && r !== undefined) {
              const j = JSON.parse(String(r).replace(/^\uFEFF/, ''))
              return j.ok ? j : null
            }
          } catch (e) { /* retry */ }
          await new Promise((rr) => ctx.timeout(rr, 200))
        }
        return null
      } catch (e) { return null }
    }
    const gitSignalCache = new Map()
    const gitSignalCached = async (kind, extra, ttlMs) => {
      const key = kind + '|' + state.root
      const hit = gitSignalCache.get(key)
      if (hit && Date.now() - hit.at < ttlMs) return hit.data
      const data = await gitSignalSpool(kind, extra)
      gitSignalCache.set(key, { at: Date.now(), data })
      return data
    }

    // ============================================================
    // P7-A:precedent 先例通道——sessionQuery 非 FTS 路径(FTS 部署级禁用,契约已实测)
    //   1. filterSessions({kind:'cwd'}) 收敛本项目历史会话(按 createdAt 取最近 N)
    //   2. 每会话 filterEvents({kind:'type', values:['tool/call']}) 读工具调用轨迹
    //   3. 任务关键词命中 + file_path 提取 → 文件支持度
    //   6s 总 deadline + 60s 会话列表缓存;任何失败 → { state:'off' } 零影响
    // ============================================================
    const PRECEDENT_SESSION_CAP = 12
    const PRECEDENT_DEADLINE_MS = 6000
    const precedentSessCache = { at: 0, data: null }
    const precedentSessions = async () => {
      if (!state.hostCwdRaw) return []
      const sq = ctx.get('sessionQuery')
      if (!sq || typeof sq.filterSessions !== 'function') return []
      const now = Date.now()
      if (precedentSessCache.data && now - precedentSessCache.at < 60000) return precedentSessCache.data
      try {
        const list = await sq.filterSessions([{ kind: 'cwd', values: [state.hostCwdRaw] }])
        const sorted = (list || [])
          .filter((s) => s && s.header && s.header.id)
          .sort((a, b) => ((b.header.createdAt || 0) - (a.header.createdAt || 0)))
          .slice(0, PRECEDENT_SESSION_CAP)
          .map((s) => s.header.id)
        precedentSessCache.at = now
        precedentSessCache.data = sorted
        return sorted
      } catch (e) {
        precedentSessCache.at = now
        precedentSessCache.data = []
        return []
      }
    }
    const precedentOf = async (task) => {
      const sq = ctx.get('sessionQuery')
      if (!sq || typeof sq.filterEvents !== 'function') return { state: 'off', files: [], support: {}, sessions: 0, scanned: 0 }
      const keys = taskKeys(String(task || '')).slice(0, 8)
      if (!keys.length) return { state: 'off', files: [], support: {}, sessions: 0, scanned: 0 }
      const ids = await precedentSessions()
      if (!ids.length) return { state: 'off', files: [], support: {}, sessions: 0, scanned: 0 }
      const support = {}
      let scanned = 0
      const deadline = Date.now() + PRECEDENT_DEADLINE_MS
      for (const sid of ids) {
        if (Date.now() > deadline) break
        // P7 实验修复:排除当前会话——本会话对装置目录(experiment/)的编辑是自指噪声,不是先例
        if (sid === state.hostSessionId) continue
        try {
          const docs = await sq.filterEvents(sid, [{ kind: 'type', values: ['tool/call'] }])
          for (const doc of docs || []) {
            if (Date.now() > deadline) break
            const text = String(doc.text || '')
            // 只收编辑类调用(edit/write/nle_mutate)——read/grep 等不产生编辑先例
            if (!isEditCallText(text)) continue
            // 审计修复⑨:token 重叠相似度(≥0.22)替代 binary includes——召回与精度同时改善
            const sim = precedentHit(keys, text)
            if (!sim.hits) continue
            scanned++
            // tool/call 文本 = 工具名 + 换行 + JSON 参数;file_path 出现在 edit/write 调用的参数里
            const m = text.match(/file_path["']?\s*[:=]\s*["']([^"']+)["']/)
            if (!m) continue
            // 审计修复:去 ./ 后再 norm——过滤(inPrecedentProject)与支持度键必须同空间,防 './x' 与 'x' 键分裂
            const f = norm(String(m[1]).replace(/^\.\//, ''))
            if (!f) continue
            // 项目过滤:先例文件必须属于当前任务项目(排除装置目录与跨项目噪声)
            if (!inPrecedentProject(f, state.root)) continue
            support[f] = (support[f] || 0) + 1
          }
        } catch (e) { continue }
      }
      const files = Object.entries(support).sort((a, b) => b[1] - a[1]).map(([f]) => f)
      return { state: files.length ? 'on' : 'off', files, support, sessions: ids.length, scanned }
    }

    // ============================================================
    // P7-C:reflect 闭合反射——任务闭合时五信号熔合为 observations(原版 reflector 精神)
    //   输出追加 state.reflections(封顶 100),并渲染进 nle-learned skill 正文。
    //   信号全部来自任务窗口内已有事实(零新采集成本):
    //   1. suggest miss→编辑(DISCOVERY)     2. suggest 命中未编辑(SKILL_DEFECT 候选)
    //   3. deny≥3(EXECUTION_LAPSE)          4. reorient≥2(OPTIMIZATION)
    //   5. impact 声明 vs 实际编辑(声明质量)
    // ============================================================
    const reflectOnTaskEnd = () => {
      const r = state.ritual
      if (!r.taskId) return []
      const out = []
      const push = (type, detail, file) => {
        out.push({ type, at: nowIso(), taskId: r.taskId, task: String(r.task || '').slice(0, 120), detail, file: file || null })
      }
      const edited = r.edits || []
      const suggested = r.suggested || []
      // 1. DISCOVERY:suggest 未列出但真实编辑的文件(learnFrom 已建 learned 条目,此处留观测)
      const discovered = edited.filter((f) => !suggested.includes(f))
      if (discovered.length) push('DISCOVERY', 'suggest 未命中但实际编辑 ' + discovered.length + ' 文件;learned 已沉淀', discovered.join(', '))
      // 2. SKILL_DEFECT 候选:suggest 命中但本任务未编辑(触发 missRecord 降权,观测留痕)
      if (suggested.length && edited.length) {
        const unused = suggested.filter((f) => !edited.includes(f))
        if (unused.length >= 2) push('SKILL_DEFECT', 'suggest 命中 ' + unused.length + ' 文件未被采用(置信度已衰减)', unused.slice(0, 5).join(', '))
      }
      // 3. EXECUTION_LAPSE:deny 高发(同任务 ≥3 次)
      if ((r.denied || 0) >= 3) push('EXECUTION_LAPSE', '任务内 deny ' + r.denied + ' 次(workflow 摩擦高,考虑提前 orient/focus)')
      // 4. OPTIMIZATION:方向锁定反复被推翻
      const reorientCount = (r.reorients || []).length
      if (reorientCount >= 2) push('OPTIMIZATION', '任务内 reorient ' + reorientCount + ' 次(方向锁定反复推翻,suggest 先验可能需要修正)')
      // 5. 声明质量:impactDeclared 与实际编辑面差距
      const decl = r.impactDeclared || []
      if (decl.length && edited.length) {
        const covered = decl.filter((f) => edited.includes(f)).length
        if (covered === 0) push('OPTIMIZATION', 'impact 声明面 ' + decl.length + ' 文件与实际编辑面零交集(声明质量低)')
      }
      // 6. 审计修复⑩:CON 观测接入——上次 check 的漂移计数(原版 reflector Signal 1 的 DSH 版)
      if (Array.isArray(state.lastStale) && state.lastStale.length) {
        push('SKILL_DEFECT', '上次 nle_check 发现 ' + state.lastStale.length + ' 个 CON405 漂移 cell(认知与磁盘不一致,建议 rebind)', state.lastStale.slice(0, 5).join(', '))
      }
      // 7. 审计修复⑩:deny 归因——区分 workflow 摩擦(未 orient)与 scope 误拦
      if ((r.denied || 0) > 0 && (r.denied || 0) < 3) {
        push('EXECUTION_LAPSE', '任务内 deny ' + r.denied + ' 次(轻微摩擦,注意 orient/focus 时机)')
      }
      if (out.length) {
        state.reflections.push(...out)
        if (state.reflections.length > 100) state.reflections.splice(0, state.reflections.length - 100)
      }
      return out
    }

    // ============================================================
    // P7 修复②:git 信号反射(异步,select 内 await)——原版 reflector Signal 5 的 DSH 版
    //   信号 6:git 全历史 churn 热点 → 冷启动提名(热点文件不在 learned/aliasKB → OPTIMIZATION)
    //   信号 7:近期回滚(revert)提交 → 负反馈(涉及本任务编辑文件 → OPTIMIZATION)
    //   失败/超时 → 零观测,不阻塞主链(与 semantic/precedent 同模式)
    // ============================================================
    const reflectGitSignals = async () => {
      const r = state.ritual
      if (!r.taskId || !state.hostCwdRaw || !state.root) return []
      const out = []
      const push = (type, detail, file) => {
        out.push({ type, at: nowIso(), taskId: r.taskId, task: String(r.task || '').slice(0, 120), detail, file: file || null })
      }
      // 信号 6:churn 热点提名(冷启动——全历史高频文件未入认知)
      try {
        const churn = await gitSignalCached('gitchurn', {}, 300000)
        const known = new Set([
          ...Object.values(state.aliasKB || {}).flat(),
          ...(state.learned || []).flatMap((e) => e.files || []),
        ])
        const top = (churn && churn.files) ? churn.files.slice(0, 5) : []
        const gaps = top.filter((x) => !known.has(x.file) && inPrecedentProject(x.file, state.root))
        if (gaps.length) {
          push('OPTIMIZATION', 'git 全历史高频文件未入认知(冷启动提名,可考虑 alias/highImpact): ' + gaps.map((x) => x.file + '×' + x.count).join(', '), gaps.map((x) => x.file).join(', '))
        }
      } catch (e) { /* ignore */ }
      // 信号 7:近期回滚负反馈
      try {
        const rb = await gitSignalCached('gitrollback', {}, 300000)
        const edited = new Set(r.edits || [])
        const hits = []
        for (const x of (rb && rb.rollbacks) || []) {
          for (const f of (x.files || [])) {
            if (edited.has(f) && !hits.includes(f)) hits.push(f)
          }
        }
        if (hits.length) {
          push('OPTIMIZATION', '本任务编辑文件近期被回滚过(git revert),认知/理解可能欠规约: ' + hits.join(', '), hits.join(', '))
        }
      } catch (e) { /* ignore */ }
      if (out.length) {
        state.reflections.push(...out)
        if (state.reflections.length > 100) state.reflections.splice(0, state.reflections.length - 100)
      }
      return out
    }

    // ============================================================
    // P7-C:learned 状态技能文件落盘——`.dsh/skills/nle-reflections/SKILL.md`
    //   内容由 rules-core skillStateRenderOf 生成(可 fixture 测试);
    //   写盘由宿主侧 nodeFsWrite 执行——持久形态(build 注入 node:fs 实现)可写,
    //   动态形态无宿主 fs → typeof 检查跳过(降级:仅 runtime provider 渲染,已知边界)。
    //   节流:persist 后 5s 合并写(状态高频落盘,文件写低频)。
    // ============================================================
    let skillsWriteScheduled = false
    const writeLearnedSkillsNow = () => {
      if (!state.hostCwdRaw || !state.loaded) return
      if (typeof nodeFsWrite !== 'function') return
      try {
        const content = skillStateRenderOf(activeLearned(state.learned), state.reflections, state.root)
        nodeFsWrite(norm(state.hostCwdRaw) + '/.dsh/skills/nle-reflections/SKILL.md', content)
      } catch (e) {
        try { telemetryPush({ type: 'skillsWriteDiag', err: String((e && e.message) || e) }) } catch (e2) {}
      }
    }
    const scheduleSkillsWrite = () => {
      if (skillsWriteScheduled) return
      skillsWriteScheduled = true
      try {
        ctx.timeout(() => {
          skillsWriteScheduled = false
          writeLearnedSkillsNow()
        }, 5000)
      } catch (e) { skillsWriteScheduled = false }
    }
