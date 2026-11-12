// DSNLE 持久形态插件(常规 ESM,preset 挂载)——由 build-dsnle.mjs 生成,勿手改
// 挂载:agent preset 组装文件加一行
//   - id: dsnle
//     name: <绝对路径>/nle-plugin/dsnle-plugin.mjs
// 与动态版(cordis_define 形态)共享 apply 函数体与规则源;规则经 import 单一源。
// [本地诊断 2026-11-12] 装载自检:apply 是否进入、agent 作用域服务是否可见、工具注册是否被跳过。
// 写 ~/.dsh/logs/nle-apply.log(不进工作区)。背景:profile 层挂载时 fs/tools 不可见,
// 本插件会静默不装载 —— 没有这行日志就只能看到「装了但没有 nle_* 工具」。
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join as nleJoin, dirname as nleDirname } from 'node:path'
const NLE_LOG = nleJoin(process.env.DSH_HOME || nleJoin(homedir(), '.dsh'), 'logs', 'nle-apply.log')
const NLE_DIAG = (o) => { try { mkdirSync(nleDirname(NLE_LOG), { recursive: true }); appendFileSync(NLE_LOG, new Date().toISOString() + ' ' + JSON.stringify(o) + '\n') } catch {} }
import {
  fnv1a,
  classifyTier,
  zhGramsOf,
  taskKeys,
  extractImports,
  remapRoot,
  remapLearned,
  projectIdOf,
  rootOfFile,
  migrateLearnedProjectIds,
  learnedProjectFilter,
  learnHitUpdate,
  learnMissUpdate,
  promoteCandidateKeys,
  promoteEligible,
  applyPromotions,
  activeLearned,
  skillNameOf,
  skillRenderOf,
  shellDeny,
  aliasKeyHit,
  tokenizeText,
  bm25Score,
  extractOffers,
  updateCoChange,
  topCoChangeNeighbors,
  rrfFuse,
  cosineSim,
  parseGitNameOnly,
  remapGitSets,
  coChangeFromFileSets,
  jaccardNeighbors,
  isLearnedAged,
  markLearnedConflicts,
  trendPoint,
  pushTrend,
  createRetrieve,
  judgeGuard,
  auditTruth,
  auditContract,
  normalizeSpec,
  exactImporters,
  isEditCallText,
  taskSimilarity,
  precedentHit,
  inPrecedentProject,
  skillStateRenderOf,
  SOURCE_RE,
  SHELL_WRITE_RE,
  SOURCE_PATH_RE,
  HIGH_IMPACT,
  PATCH_CAP,
  MISS_CAP,
  SCAN_MAX_BYTES,
  SCAN_CAP,
  SCAN_SKIP_DIRS,
  SUGGEST_TOP_N,
  DEFAULT_ALIAS_KB,
  LEARN_PRIOR,
  LEARN_HIT_DELTA,
  LEARN_MISS_DELTA,
  LEARN_RETIRE_THRESHOLD,
  LEARN_MAX,
  PROMOTE_MIN_PROJECTS,
  PROMOTE_CONFIDENCE,
} from '../nle-rules-core.mjs'

import { writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// P7-C:learned 状态技能文件落盘(仅持久形态)——动态形态无宿主 fs,apply 内 typeof 检查降级
const nodeFsWrite = (filePath, content) => {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

export const name = 'dsnle'
export const inject = ['timer']

export function apply(ctx) {
    const fs = ctx.get('fs')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    const systemPrompt = ctx.get('systemPrompt')
    let diagTools = 'n/a', diagInitiator = 'n/a'
    try { diagTools = typeof ctx.get('tools') } catch (e) { diagTools = 'ERR:' + e.message }
    try { const ag = ctx.get('agents'); diagInitiator = ag ? (typeof ag.currentInitiator === 'function' ? String(!!ag.currentInitiator()) : 'no-currentInitiator') : 'no-agents' } catch (e) { diagInitiator = 'ERR:' + e.message }
    NLE_DIAG({ phase: 'apply-enter', fs: typeof fs, sandboxPolicy: typeof sandboxPolicy, systemPrompt: typeof systemPrompt, tools: diagTools, initiator: diagInitiator })
    if (fs === undefined) { NLE_DIAG({ phase: 'apply-early-return', reason: 'no fs service' }); return }

    // ---------- constants ----------
    const STATE_FILE = '.dsnle-state.json'
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
﻿// ==== DSNLE fragment: apply-tools — 工具注册器 + 13 个 nle_* 工具 ====
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
    let nleToolCount = 0
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
        if (tools) { nleToolCount++; return tools.register(tool) }
        NLE_DIAG({ phase: 'register-skipped', tool: tool.name, reason: 'no tools service in scope' })
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
    NLE_DIAG({ phase: 'apply-ready', tools: nleToolCount, root: state.root })
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
}
