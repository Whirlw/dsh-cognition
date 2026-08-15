// ============================================================
// NLE/dsnle 规则唯一源(nle-rules-core)
// 本文件同时服务三个消费方,规则只有这一份:
//   1. build-dsnle.mjs:读取本文件文本(strip export 后)嵌入动态插件源码
//   2. fixture-gate.mjs:import 本文件(确定性门断言)
//   3. replay.mjs:import 本文件(轨迹重放)
// 修改规则 → 只改本文件 → 重跑 node build-dsnle.mjs → 重新 define/run 插件
// 纯规则,零 import(保证可嵌入)。
// ============================================================

export const SOURCE_RE = /\.(?:js|mjs|cjs|jsx|ts|tsx|py)$/
export const SHELL_WRITE_RE = /(?:^|[;&|(]\s*)(?:Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|New-Item|sed\s+-i|tee)\b|\b(?:node\s+-e|python\s+-c)\b|>>|>\s*\S+\.\w+|\b(?:rm|del|mv|cp)\s+(?:-[\w]+\s+)?[^\s;&|]+|\bcopy\s+[^\s;&|]+/
export const SOURCE_PATH_RE = /(?:^|[\\/])(?:src|lib|handlers|scene|nle)[\\/][\w.\-]+\.(?:js|mjs|cjs|jsx|ts|tsx|py)|\.dsnle-state\.json/
export const HIGH_IMPACT = ['src/store.js', 'src/store-backup.js', 'src/index.js', 'src/slices/', 'nle/']

// 观测/检索参数(插件与离线工具共用)
export const PATCH_CAP = 800
export const MISS_CAP = 200
export const SCAN_MAX_BYTES = 1000000
// V5.3:检索扫描上限(真实项目 moment 766 文件,200 截断漏检深层目标)
export const SCAN_CAP = 2000
// V5.3:非业务目录(构建产物/工具脚本,真实项目降噪)
export const SCAN_SKIP_DIRS = ['node_modules', '.git', '.nle', 'dist', 'min', 'benchmarks', 'tasks', 'scripts', 'templates', 'docs', 'examples', 'typing-tests', 'ts3.1-typings', 'ts3.1-typing-tests', 'meteor', '.github']
// V5.3:建议候选窗(6 → 10,真实项目深层目标可进窗)
export const SUGGEST_TOP_N = 10

export const DEFAULT_ALIAS_KB = {
  '折扣': ['exp-host/src/store.js', 'exp-host/src/store-backup.js'],
  '满减': ['exp-host/src/store.js', 'exp-host/src/store-backup.js'],
  'discount': ['exp-host/src/store.js', 'exp-host/src/store-backup.js'],
  'store': ['exp-host/src/store.js', 'exp-host/src/store-backup.js'],
  '税费': ['exp-host/src/billing.js', 'exp-host/src/store.js'],
  'tax': ['exp-host/src/billing.js', 'exp-host/src/store.js'],
  '多币种': ['exp-host/src/billing.js', 'exp-host/src/store.js'],
  '货币': ['exp-host/src/billing.js', 'exp-host/src/store.js', 'exp-host/src/cart.js', 'exp-host/src/format.js'],
  'currency': ['exp-host/src/billing.js', 'exp-host/src/store.js'],
  '报表': ['exp-host/src/report.js', 'exp-host/src/format.js'],
  '小数': ['exp-host/src/report.js', 'exp-host/src/format.js'],
  '库存': ['exp-host/src/inventory.js'],
  'stock': ['exp-host/src/inventory.js'],
  '超卖': ['exp-host/src/inventory.js'],
  '促销': ['exp-host/src/promo.js'],
  'promo': ['exp-host/src/promo.js'],
  '大小写': ['exp-host/src/promo.js'],
  'cache': ['exp-host/src/cache.js', 'exp-host/src/index.js'],
  'lru': ['exp-host/src/cache.js'],
  '购物车': ['exp-host/src/cart.js', 'exp-host/src/format.js'],
  'cart': ['exp-host/src/cart.js'],
  'format': ['exp-host/src/format.js'],
  'formatting': ['exp-host/src/format.js'],
  'billing': ['exp-host/src/billing.js'],
  'inventory': ['exp-host/src/inventory.js'],
  'report': ['exp-host/src/report.js'],
}

export function fnv1a(str) {
  let h = 0x811c9dc5
  const bytes = new TextEncoder().encode(str)
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function classifyTier(task) {
  if (/([\\/][\w.\-]+\.(?:js|ts|jsx|tsx|py|mjs))/.test(task)) return 'T1'
  if (/(重构|refactor|跨模块|跨域|核心|runtime|性能|perf|store|slices|guard|mcp-server|nle\/src)/i.test(task)) return 'T3'
  return 'T2'
}

export function zhGramsOf(task) {
  const runs = task.match(/[\u4e00-\u9fff]{2,}/g) || []
  const grams = []
  for (const run of runs) {
    for (let i = 0; i < run.length - 1 && grams.length < 24; i++) grams.push(run.slice(i, i + 2))
  }
  return grams
}

export function taskKeys(task) {
  const keys = []
  for (const run of (task.match(/[\u4e00-\u9fff]{2,}/g) || [])) {
    for (let i = 0; i < run.length - 1 && keys.length < 16; i++) keys.push(run.slice(i, i + 2))
  }
  for (const t of (task.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || [])) keys.push(t.toLowerCase())
  return keys
}

export function extractImports(lines) {
  const out = []
  for (const raw of lines) {
    const line = String(raw || '').trim()
    if (!line) continue
    let m
    m = line.match(/^import\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/)
    if (m) { out.push(m[1]); continue }
    m = line.match(/^import\s*\(\s*['"]([^'"]+)['"]/)
    if (m) { out.push(m[1]); continue }
    m = line.match(/^export\s+.+?\bfrom\s+['"]([^'"]+)['"]/)
    if (m) { out.push(m[1]); continue }
    m = line.match(/^import\s+['"]([^'"]+)['"]/)
    if (m) { out.push(m[1]); continue }
    m = line.match(/=\s*require\(\s*['"]([^'"]+)['"]/)
    if (m) { out.push(m[1]); continue }
    m = line.match(/^from\s+([\w.]+)\s+import\s+[\w\s,{}*]+/)
    if (m) { out.push(m[1]); continue }
    m = line.match(/^import\s+([\w.]+)/)
    if (m) { out.push(m[1]); continue }
  }
  const seen = new Set()
  return out.map((x) => x.replace(/;$/, '')).filter((x) => {
    if (seen.has(x)) return false
    seen.add(x)
    return true
  })
}

export function remapRoot(f, root) {
  if (f.startsWith('exp-host/') && root !== 'exp-host') return root + f.slice('exp-host'.length)
  return f
}

// learned 跨副本 basename 归一化
// 审计修复:根段数错配——bench-host 根为两段(rootOfFile 特判),固定"剥一层"会让
// 跨项目 learned 重映射错位(bench-host/xxx 条目 → exp-host 时多保留一段、反向误吞 src)。
// 修复:复用 rootOfFile 判定存储根的段数,对称剥换。
export function remapLearned(f, root) {
  const nf = String(f).replace(/\\/g, '/')
  if (nf.startsWith(root + '/')) return nf
  const storedRoot = rootOfFile(nf)
  if (!storedRoot) return nf
  const storedSegs = storedRoot.split('/').length
  const parts = nf.split('/')
  if (parts.length > storedSegs) return root + '/' + parts.slice(storedSegs).join('/')
  return nf
}

// ============================================================
// P0.2 项目隔离:learned 条目按项目作用域
//   scope: 'project'(默认,仅当前项目生效)
//        | 'global'(跨项目确认后提升,见 P1)
//        | 'quarantine'(迁移无法归因/跨项目混合,不参与检索)
//   projectId = fnv1a(root)(root = 任务根,如 'exp-host' / 'bench-host/real-moment-t1')
// ============================================================

export function projectIdOf(root) {
  return fnv1a(String(root || '').replace(/\\/g, '/').replace(/\/+$/, ''))
}

// 迁移启发式:从文件路径推断任务根(root = 第一段;bench-host 下为前两段)
export function rootOfFile(f) {
  const nf = String(f || '').replace(/\\/g, '/').replace(/^\.\//, '')
  const parts = nf.split('/').filter(Boolean)
  if (parts.length === 0) return null
  if (parts[0] === 'bench-host' && parts.length > 1) return parts.slice(0, 2).join('/')
  return parts[0]
}

// 迁移:为无 projectId 的旧条目(schema 4)推断项目;跨项目混合/无文件 → quarantine
export function migrateLearnedProjectIds(learned) {
  if (!Array.isArray(learned)) return learned
  for (const e of learned) {
    if (e.projectId && e.scope) continue
    const roots = [...new Set((e.files || []).map(rootOfFile).filter(Boolean))]
    if (roots.length === 1) {
      e.projectId = projectIdOf(roots[0])
      e.scope = 'project'
    } else {
      e.projectId = null
      e.scope = 'quarantine'
    }
  }
  return learned
}

// 检索过滤:仅当前项目 + global;quarantine/异项目/retired/低置信度一律排除
export function learnedProjectFilter(learned, root) {
  if (!Array.isArray(learned)) return []
  const pid = projectIdOf(root)
  return learned.filter((e) =>
    (e.scope === 'global' || (e.projectId && e.projectId === pid)) &&
    e.scope !== 'quarantine' && e.status !== 'retired' &&
    (e.confidence ?? LEARN_PRIOR) >= LEARN_RETIRE_THRESHOLD)
}

// ============================================================
// P1:learned 置信度与技能渲染(instinct 精神移植 + skills provider 载体)
//   命中 +0.15(封顶 0.9)/ 未命中 −0.1;低于阈值 → retired(不参与检索与目录);
//   同键模式 ≥2 项目 + 置信度 ≥0.7 → 提升 global(跨项目)
// ============================================================

export const LEARN_PRIOR = 0.3
export const LEARN_HIT_DELTA = 0.15
export const LEARN_MISS_DELTA = 0.1
export const LEARN_RETIRE_THRESHOLD = 0.2
export const LEARN_MAX = 0.9
export const PROMOTE_MIN_PROJECTS = 2
export const PROMOTE_CONFIDENCE = 0.7

// 命中更新:置信度 +0.15(封顶 0.9)、evidence+1、时间刷新;返回 entry
export function learnHitUpdate(entry, keys, files, at) {
  if (!entry) return entry
  for (const f of files || []) if (!entry.files.includes(f)) entry.files.push(f)
  for (const k of keys || []) if (!entry.keys.includes(k)) entry.keys.push(k)
  entry.confidence = Math.min(LEARN_MAX, (entry.confidence ?? LEARN_PRIOR) + LEARN_HIT_DELTA)
  entry.evidence = (entry.evidence || 0) + 1
  entry.lastVerifiedAt = at
  return entry
}

// 未命中衰减:置信度 −0.1;低于阈值 → retired
export function learnMissUpdate(entry, at) {
  if (!entry) return entry
  entry.confidence = (entry.confidence ?? LEARN_PRIOR) - LEARN_MISS_DELTA
  if (entry.confidence < LEARN_RETIRE_THRESHOLD) entry.status = 'retired'
  entry.lastMissedAt = at
  return entry
}

// 跨项目提升候选:同键模式出现在 ≥2 个不同 projectId 的 project 条目
export function promoteCandidateKeys(learned) {
  const seen = new Map()
  for (const e of learned || []) {
    if (e.scope !== 'project' || !e.projectId) continue
    for (const k of e.keys || []) {
      if (!seen.has(k)) seen.set(k, new Set())
      seen.get(k).add(e.projectId)
    }
  }
  const out = []
  for (const [k, pids] of seen) if (pids.size >= PROMOTE_MIN_PROJECTS) out.push(k)
  return out
}

// 提升资格:键在跨项目候选集 且 置信度 ≥ 0.7
export function promoteEligible(learned) {
  const cand = new Set(promoteCandidateKeys(learned))
  return (learned || []).filter((e) =>
    e.scope === 'project' && (e.keys || []).some((k) => cand.has(k)) && (e.confidence ?? LEARN_PRIOR) >= PROMOTE_CONFIDENCE)
}

// 生效提升:资格条目 scope → global;返回变更数
export function applyPromotions(learned) {
  let n = 0
  for (const e of promoteEligible(learned)) {
    e.scope = 'global'
    n++
  }
  return n
}

// 活跃条目(供 skills provider 与检索):排除 quarantine/retired/低置信度
export function activeLearned(learned) {
  return (learned || []).filter((e) =>
    e.scope !== 'quarantine' && e.status !== 'retired' && (e.confidence ?? LEARN_PRIOR) >= LEARN_RETIRE_THRESHOLD)
}

// 技能名:kebab-case,nle-<slug>-<hash8>(中文键 → slug 为空则回退 learned)
export function skillNameOf(entry) {
  const base = String((entry.keys || [])[0] || 'learned')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'learned'
  const h = fnv1a((entry.projectId || 'x') + ':' + (entry.keys || []).join('+'))
  return ('nle-' + base + '-' + h).slice(0, 48)
}

// 技能渲染:description(目录摘要,≤300)+ content(正文)
export function skillRenderOf(entry, root) {
  const name = skillNameOf(entry)
  const conf = Math.round((entry.confidence ?? LEARN_PRIOR) * 100)
  const keys = (entry.keys || []).slice(0, 8).join(' / ')
  const scope = entry.scope === 'global' ? '跨项目' : '项目'
  const description = `NLE 学习:${keys};置信度 ${conf}%;命中 ${entry.evidence || 0} 次;${scope}作用域`
  const body = [
    `# NLE learned: ${name}`,
    '',
    '任务关键词命中以下文件(项目历史共现经验):',
    '',
    ...(entry.files || []).map((f) => `- \`${f}\``),
    '',
    `- 作用域:${scope}${entry.projectId ? ' (pid ' + entry.projectId + ')' : ''}`,
    `- 置信度:${conf}%(证据 ${entry.evidence || 0} 次)`,
    `- 上次验证:${entry.lastVerifiedAt || entry.at || '未知'}`,
    '',
    '注意:这是历史共现经验,不是事实;使用前必须 read 验证文件内容。',
  ].join('\n')
  return { name, description: description.slice(0, 300), content: body }
}

export function shellDeny(cmd) { return SHELL_WRITE_RE.test(cmd) && SOURCE_PATH_RE.test(cmd) }

export function aliasKeyHit(key, task) {
  return key.length <= 4 ? task.includes(key) : task.toLowerCase().includes(key.toLowerCase())
}

// ============================================================
// createRetrieve(io):唯一 suggest 检索实现(异步契约,同步侧包一层即可)
// V5.7 升级:内容打分从"contains +1/+2"升级为 BM25(词频+逆文档频率),
//   使语义相关(非字面)也能命中;offers(导出符号)精确命中 +4。
// io 接口(全部可返回 Promise):
//   scanFiles(root)     → string[](工作区相对源码路径)
//   readContent(f)      → string(全文;>1MB 由 io 决定返回 '' 仅文件名匹配)
//   driftOf(f)          → 'stale' | 'missing' | null(无 cell 或一致)
//   recent()            → string[](最近编辑文件)
//   learnedOf()         → { keys, files }[](learned 库)
//   aliasKBOf()         → { key: files[] }(别名 KB)
//   existsOf(f)         → boolean(learned 文件存在性校验)
//   offersOf(f)         → string[](文件导出的符号列表,语义标注)
// ============================================================

// 分词:英文小写词 + 中文 bigram(带 zh: 前缀以便降权;中文 bigram 区分度低)
export function tokenizeText(text) {
  const tokens = []
  for (const m of String(text).match(/[a-z0-9_]{2,}/gi) || []) tokens.push(m.toLowerCase())
  for (const run of String(text).match(/[\u4e00-\u9fff]{2,}/g) || []) {
    for (let i = 0; i < run.length - 1; i++) tokens.push('zh:' + run.slice(i, i + 2))
  }
  return tokens
}

// BM25(Okapi):queryTokens 对 docTokens 的相关性分数;中文 bigram(zh: 前缀)权重 ×0.3
export function bm25Score(queryTokens, docTokens, df, N, avgdl, dl) {
  const k1 = 1.5
  const b = 0.75
  const tf = {}
  for (const t of docTokens) tf[t] = (tf[t] || 0) + 1
  let score = 0
  for (const q of new Set(queryTokens)) {
    const f = tf[q]
    if (!f) continue
    const w = q.startsWith('zh:') ? 0.3 : 1
    const idf = Math.log(1 + (N - (df[q] || 0) + 0.5) / ((df[q] || 0) + 0.5))
    score += w * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * dl) / (avgdl || 1))))
  }
  return score
}

// offers:从源码提取顶层导出符号(类 1b 语义标注 + 类 4 依赖图节点)
export function extractOffers(text) {
  const offers = []
  const lines = String(text || '').split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    let m
    m = line.match(/^export\s+function\s+([A-Za-z_$][\w$]*)/)
    if (m) { offers.push(m[1]); continue }
    m = line.match(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/)
    if (m) { offers.push(m[1]); continue }
    m = line.match(/^export\s+class\s+([A-Za-z_$][\w$]*)/)
    if (m) { offers.push(m[1]); continue }
    m = line.match(/^export\s+default\s+function\s+([A-Za-z_$][\w$]*)/)
    if (m) { offers.push(m[1]); continue }
    m = line.match(/^export\s+default\s+class\s+([A-Za-z_$][\w$]*)/)
    if (m) { offers.push(m[1]); continue }
    m = line.match(/^export\s+default\s+([A-Za-z_$][\w$]*)/)
    if (m) { offers.push(m[1]); continue }
    m = line.match(/^export\s*\{([^}]+)\}/)
    if (m) {
      for (const n of m[1].split(',')) {
        const name = n.trim().split(/\s+as\s+/)[0].trim()
        if (name && !name.startsWith('type')) offers.push(name)
      }
    }
  }
  return [...new Set(offers)]
}

// 类 2:co-change 共改矩阵更新(同一任务内共同编辑的文件对 +1;对称)
// 这是"经验层":哪些文件总是一起改(项目惯例的沉淀,原版 git co-change 的运行时等价)
export function updateCoChange(coChange, edited) {
  if (!coChange || !edited || edited.length < 2) return
  for (let a = 0; a < edited.length; a++) {
    for (let b = a + 1; b < edited.length; b++) {
      const x = edited[a]
      const y = edited[b]
      if (x === y) continue
      if (!coChange[x]) coChange[x] = {}
      coChange[x][y] = (coChange[x][y] || 0) + 1
      if (!coChange[y]) coChange[y] = {}
      coChange[y][x] = (coChange[y][x] || 0) + 1
    }
  }
  return coChange
}

// 类 2:coChangeOf 的邻居排序(按共改次数降序,取前 N)
export function topCoChangeNeighbors(coChange, file, n = 5) {
  const nb = coChange && coChange[file]
  if (!nb) return []
  return Object.entries(nb)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([f]) => f)
}

// P2:RRF(Reciprocal Rank Fusion)融合——多通道按排名位置加权合并
// channels: [{ scores: Map<file, number> }];仅 >0 项参与排名;k 默认 60(标准值)
export function rrfFuse(channels, k = 60) {
  const acc = new Map()
  for (const ch of channels || []) {
    const scores = (ch && ch.scores) || new Map()
    const ranked = [...scores.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1])
    ranked.forEach(([f], idx) => {
      acc.set(f, (acc.get(f) || 0) + 1 / (k + idx + 1))
    })
  }
  return [...acc.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0]))
}

// P2:余弦相似度(单位向量输入容错)
export function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

// ============================================================
// P3:git 历史共改(类 2 真正修复)——commit 共现 + Jaccard
//   数据源:`git log --name-only --pretty=format:`(每次提交后跟变更文件,空行分隔)
// ============================================================

// 解析 git log --name-only 输出 → 文件集数组(每次提交一个集合)
export function parseGitNameOnly(logText) {
  const sets = []
  let cur = []
  for (const raw of String(logText || '').split('\n')) {
    const line = raw.trim()
    if (!line) { if (cur.length) { sets.push(cur); cur = [] } continue }
    cur.push(line)
  }
  if (cur.length) sets.push(cur)
  return sets
}

// P7 修复①:git 共改键空间重写——git log 输出是仓库相对路径(src/lib/...),
// 而 suggest 检索文件是 root 前缀路径(bench-host/real-moment-t1/src/lib/...)。
// 键错配导致 git 通道矩阵永远查不中(20 卡零贡献的根因)。
// 重命名提交({old => new} / 含 => 的路径)保守剔除,不参与共改计数。
export function remapGitSets(sets, prefix) {
  const p = String(prefix || '').replace(/\/+$/, '')
  return (sets || [])
    .map((s) => (s || []).filter((f) => !String(f).includes('=>')).map((f) => (p ? p + '/' + f : f)))
    .filter((s) => s.length > 0)
}

// 由文件集构建对称共改矩阵 + 每文件出现次数(touched)
export function coChangeFromFileSets(sets) {
  const matrix = {}
  const touched = {}
  for (const files of sets) {
    for (const f of files) touched[f] = (touched[f] || 0) + 1
    for (let a = 0; a < files.length; a++) {
      for (let b = a + 1; b < files.length; b++) {
        const x = files[a]
        const y = files[b]
        if (x === y) continue
        if (!matrix[x]) matrix[x] = {}
        matrix[x][y] = (matrix[x][y] || 0) + 1
        if (!matrix[y]) matrix[y] = {}
        matrix[y][x] = (matrix[y][x] || 0) + 1
      }
    }
  }
  return { matrix, touched }
}

// Jaccard 邻居排序(minJaccard 过滤,先 jaccard 后 coCount)
export function jaccardNeighbors(matrix, touched, file, n = 5, minJaccard = 0.12) {
  const nb = matrix && matrix[file]
  if (!nb) return []
  const totalA = touched[file] || 0
  const out = []
  for (const [f, coCount] of Object.entries(nb)) {
    const totalB = touched[f] || 0
    const union = totalA + totalB - coCount
    const jac = union > 0 ? coCount / union : 0
    if (jac >= minJaccard) out.push({ file: f, coCount, jaccard: Math.round(jac * 100) / 100 })
  }
  return out.sort((a, b) => b.jaccard - a.jaccard || b.coCount - a.coCount).slice(0, n)
}

// ============================================================
// P4:可靠层——learned 新鲜度 / 矛盾标记 / 健康趋势
// ============================================================

// 陈旧判定:超过 maxAgeMs(默认 30 天)未验证 → aged(技能目录剔除;suggest 仍走存在性校验)
export function isLearnedAged(entry, now, maxAgeMs = 30 * 24 * 3600 * 1000) {
  const last = entry.lastVerifiedAt || entry.at
  if (!last) return false
  const t = Date.parse(last)
  if (Number.isNaN(t)) return false
  return now - t > maxAgeMs
}

// 矛盾标记:同键条目冲突——组内(同项目/global)多条目 或 项目组与 global 组重叠时,
// 除最高置信度者外全部标 conflicts
export function markLearnedConflicts(learned) {
  const byKey = new Map()
  for (const e of learned || []) {
    if (e.scope === 'quarantine') continue
    for (const k of e.keys || []) {
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k).push(e)
    }
  }
  let n = 0
  const mark = (losers, k) => {
    for (const e of losers) {
      if (!(e.conflicts || []).includes(k)) {
        e.conflicts = e.conflicts || []
        e.conflicts.push(k)
        n++
      }
    }
  }
  for (const [k, entries] of byKey) {
    if (entries.length < 2) continue
    const groups = new Map()
    for (const e of entries) {
      const g = e.scope === 'global' ? 'global' : (e.projectId || '?')
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g).push(e)
    }
    const multi = [...groups.values()].filter((x) => x.length > 1)
    if (multi.length) {
      // 组内多条目:该组除最高置信度外全部标记
      for (const g of multi) {
        g.sort((a, b) => (b.confidence ?? LEARN_PRIOR) - (a.confidence ?? LEARN_PRIOR))
        mark(g.slice(1), k)
      }
    } else if (groups.has('global')) {
      // 项目组与 global 组重叠(不同组各一条):除最高置信度者外全部标记
      const all = [...groups.values()].flat().sort((a, b) => (b.confidence ?? LEARN_PRIOR) - (a.confidence ?? LEARN_PRIOR))
      mark(all.slice(1), k)
    }
  }
  return n
}

// 健康趋势点:每任务追加(数据形态对齐原版 health-trend.json)
export function trendPoint(point) {
  return {
    timestamp: point.timestamp || new Date().toISOString(),
    totalEdits: point.totalEdits || 0,
    denyCount: point.denyCount || 0,
    learnedHit: !!point.learnedHit,
    staleCount: point.staleCount || 0,
    semantic: point.semantic || 'off',
    guardVerdict: point.guardVerdict || null,
  }
}

// 追加趋势点(封顶)
export function pushTrend(trend, point, cap = 500) {
  trend.push(point)
  if (trend.length > cap) trend.splice(0, trend.length - cap)
  return trend
}

export function createRetrieve(io) {
  return async function retrieve(task, mode = 'full', root = 'exp-host') {
    const tokens = [...new Set((task.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || []).map((t) => t.toLowerCase()))]
    const queryTokens = tokenizeText(task)
    const aliasKB = io.aliasKBOf ? await io.aliasKBOf() : DEFAULT_ALIAS_KB
    const aliasFiles = []
    const useAlias = mode === 'full' || mode === 'learned'
    if (useAlias) {
      for (const key of Object.keys(aliasKB)) {
        if (aliasKeyHit(key, task)) for (const f of aliasKB[key]) aliasFiles.push(remapRoot(f, root))
      }
    }
    // 改进(V5.1):learned 默认融合——full 模式也叠加 learned 分数(长期认知默认生效);
    // learned 模式保持"仅学习库,无命中回退 cold"语义;cold 模式完全不用。
    // 改进(V5.3):learned 文件存在性校验——remap 后文件不存在则跳过(防跨项目污染,真实项目暴露)
    let learnedHit = false
    const learnedFiles = []
    if (mode !== 'cold') {
      const learnedRaw = io.learnedOf ? await io.learnedOf() : []
      // P0.2:项目隔离——只使用当前项目/global 的学习条目(schema 4 旧条目经 migrateLearnedProjectIds 归因)
      const learned = learnedProjectFilter(learnedRaw, root)
      for (const e of learned) {
        for (const k of (e.keys || [])) {
          if (task.toLowerCase().includes(String(k).toLowerCase())) {
            learnedHit = true
            for (const f of (e.files || [])) {
              const mapped = remapLearned(f, root)
              if (io.existsOf) {
                const exists = await io.existsOf(mapped)
                if (!exists) continue
              }
              learnedFiles.push(mapped)
            }
            break
          }
        }
      }
    }
    // ============================================================
    // P7-A:precedent 先例通道——sessionQuery 检索历史相似任务的真实编辑文件提权
    //   原版 micro-agent 精神的 DSH 版:先例来自本项目历史会话的 tool/call 轨迹,
    //   不是上游 gold(去 gold 化的 reorient 证据源);不可用 → precedent:'off' 零影响。
    // io.precedentOf(task) → { files: string[], support: {file: count}, state, sessions, scanned }
    // ============================================================
    let precedentFiles = []
    let precedent = { state: 'off', sessions: 0, scanned: 0 }
    if (mode !== 'cold' && io.precedentOf) {
      try {
        const p = await io.precedentOf(task)
        if (p && p.state === 'on' && Array.isArray(p.files)) {
          const support = (p && p.support) || {}
          const cands = []
          for (const x of p.files) {
            const f = typeof x === 'string' ? x : (x && x.file)
            if (!f) continue
            if (io.existsOf) {
              const exists = await io.existsOf(f)
              if (!exists) continue
            }
            cands.push(f)
          }
          if (cands.length) {
            precedent = { state: 'on', sessions: p.sessions || 0, scanned: p.scanned || 0, support }
            for (const f of cands) precedentFiles.push(f)
          }
        }
      } catch (e) { precedent = { state: 'off', sessions: 0, scanned: 0 } }
    }
    const score = new Map()
    const add = (f, s) => score.set(f, (score.get(f) || 0) + s)
    for (const f of precedentFiles) add(f, Math.min(6, 2 * ((precedent.support || {})[f] || 1)))
    const scanned = (mode === 'learned' && !learnedHit) ? [] : await io.scanFiles(root)
    for (const f of aliasFiles) add(f, 5)
    for (const f of learnedFiles) add(f, 6)
    for (const f of scanned) {
      const base = f.split('/').pop().replace(/\.(?:js|mjs|jsx|ts|tsx|py)$/i, '').toLowerCase()
      for (const t of tokens) {
        if (base.includes(t)) add(f, 3)
        else if (f.toLowerCase().includes(t)) add(f, 1)
      }
    }
    // V5.7:BM25 内容打分(替代 contains +1/+2;语义相关可命中)
    const docTokens = new Map()
    const df = {}
    let totalLen = 0
    for (const f of scanned) {
      const content = await io.readContent(f)
      if (!content) continue
      const toks = tokenizeText(content)
      docTokens.set(f, toks)
      totalLen += toks.length
      for (const t of new Set(toks)) df[t] = (df[t] || 0) + 1
    }
    const N = docTokens.size || 1
    const avgdl = N ? totalLen / N : 1
    for (const [f, toks] of docTokens) {
      const s = bm25Score(queryTokens, toks, df, N, avgdl, toks.length)
      if (s > 0) add(f, Math.min(15, Math.round(s * 10)))
    }
    // V5.7:offers 精确命中(文件导出的符号在任务文本中 → +4)
    if (io.offersOf) {
      for (const f of scanned) {
        const offers = await io.offersOf(f)
        if (!offers || !offers.length) continue
        for (const o of offers) {
          if (queryTokens.includes(String(o).toLowerCase())) add(f, 4)
        }
      }
    }
    // V5.8 类 2:co-change 提权——候选与"强信号文件"(alias/learned 命中)有共改关系 → +2
    // (经验:这个项目里改 X 通常也改 Y;沉淀自同一任务共同编辑的文件对)
    // P7 修复③:coChangeBoosts 计数——git/运行时通道是否真实触发,telemetry 可观测
    let coChangeBoosts = 0
    if (io.coChangeOf) {
      const strong = new Set([...aliasFiles, ...learnedFiles])
      for (const f of scanned) {
        if (strong.has(f)) continue
        const neighbors = await io.coChangeOf(f)
        if (!neighbors || !neighbors.length) continue
        for (const n of neighbors) {
          if (strong.has(n) || (score.get(n) || 0) >= 4) {
            add(f, 2)
            coChangeBoosts++
            break
          }
        }
      }
    }
    let ranked = [...score.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, SUGGEST_TOP_N).map(([f]) => f)
    // P2:语义重排(RRF 融合)——embedding 通道对 top-40 候选做余弦重排;
    //   语义不可用(无 embedQuery/semanticOf/模型未起/超时)→ semantic:'off' 原样返回
    let semantic = 'off'
    if (mode === 'full' && io.embedQuery && io.semanticOf) {
      try {
        const qv = await io.embedQuery(task)
        if (qv && Array.isArray(qv) && qv.length > 0) {
          const pool = [...score.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([f]) => f)
          const sem = new Map()
          for (const f of pool) {
            const v = await io.semanticOf(f)
            if (v && Array.isArray(v) && v.length === qv.length) {
              const cos = cosineSim(qv, v)
              if (cos > 0.3) sem.set(f, cos)
            }
          }
          if (sem.size) {
            semantic = 'on'
            const fused = rrfFuse([{ scores: score }, { scores: sem }])
            ranked = fused.slice(0, SUGGEST_TOP_N).map(([f]) => f)
          }
        }
      } catch (e) { semantic = 'off' }
    }
    const drifted = []
    for (const f of ranked) {
      const d = io.driftOf ? await io.driftOf(f) : null
      if (d === 'stale' || d === 'missing') drifted.push(f)
    }
    const recent = io.recent ? await io.recent() : []
    return { files: ranked, drifted, recent, learnedHit, semantic, precedent, coChangeBoosts }
  }
}

export function judgeGuard(ritual, patches) {
  const issues = []
  if (ritual.locked && ritual.selectLog === null && ritual.edits.length > 0) issues.push('NLE_WORKFLOW_INCOMPLETE')
  const taskPatches = ritual.openedAt ? patches.filter((p) => String(p.at) >= String(ritual.openedAt)) : []
  const patched = new Set(taskPatches.map((p) => p.file))
  const gap = (ritual.edits || []).filter((f) => !patched.has(f))
  if (gap.length) issues.push('NLE_PATCH_GAP')
  if (ritual.selectLog && ritual.openedAt) {
    const lastEditAt = taskPatches.map((p) => String(p.at)).sort().pop()
    if (lastEditAt && String(ritual.selectLog.at) < lastEditAt) issues.push('NLE_SELECT_ORDER')
  }
  return issues
}

// V5.9 类 3:DSH 原生真相对账——guard 用(工具层 tools/result + fs 层 intent vs 声明 edits)
// 输入 truthTools/truthWrites 为 [{ at, file, ... }] 数组;openedAt 为任务开始 ISO;null 表示无窗口(全量)
export function auditTruth(truthTools, truthWrites, edits, openedAt) {
  const winT = openedAt ? (truthTools || []).filter((x) => String(x.at) >= String(openedAt)) : (truthTools || [])
  const winW = openedAt ? (truthWrites || []).filter((x) => String(x.at) >= String(openedAt)) : (truthWrites || [])
  const truthEdited = [...new Set(winT.map((x) => x.file))]
  const truthWritten = [...new Set(winW.map((x) => x.file))]
  const available = truthEdited.length > 0 || truthWritten.length > 0
  if (!available) return { available: false, issues: [], truthEdited: [], truthWritten: [] }
  const issues = []
  const ghost = (edits || []).filter((f) => !truthWritten.includes(f))
  if (ghost.length) issues.push({ code: 'NLE_GHOST_EDIT', severity: 'FAIL', files: ghost })
  const covGap = truthEdited.filter((f) => !(edits || []).includes(f))
  if (covGap.length) issues.push({ code: 'NLE_COVERAGE_GAP', severity: 'FAIL', files: covGap })
  const bypass = truthWritten.filter((f) => !truthEdited.includes(f) && !(edits || []).includes(f))
  if (bypass.length) issues.push({ code: 'NLE_BYPASS_WRITE', severity: 'FAIL', files: bypass })
  return { available: true, issues, truthEdited, truthWritten }
}

// V5.9 类 3:变更文件契约门——select 用(声明 edited vs 真实成功编辑;learned/coChange 只从真相学习)
export function auditContract(truthTools, selected, openedAt) {
  const winT = openedAt ? (truthTools || []).filter((x) => String(x.at) >= String(openedAt)) : (truthTools || [])
  const truthEdited = [...new Set(winT.map((x) => x.file))]
  if (truthEdited.length === 0) {
    return { available: false, issues: [{ code: 'NLE_TRUTH_UNAVAILABLE', severity: 'WARN', files: [] }], realEdited: [...(selected || [])] }
  }
  const issues = []
  const overclaim = (selected || []).filter((e) => !truthEdited.includes(e))
  if (overclaim.length) issues.push({ code: 'NLE_SELECT_OVERCLAIM', severity: 'FAIL', files: overclaim })
  const underclaim = truthEdited.filter((e) => !(selected || []).includes(e))
  if (underclaim.length) issues.push({ code: 'NLE_SELECT_UNDERCLAIM', severity: 'WARN', files: underclaim })
  return { available: true, issues, realEdited: truthEdited }
}

// ============================================================
// P7-B:impact 声明优先——精确 spec 解析(替代 basename 包含匹配伪 BFS)
//   原伪 BFS:`s.includes(curBase)` 会把不同目录的同名文件误连;
//   精确解析:import specifier 按相对路径展开后与目标精确匹配,外部包/别名不连边。
// ============================================================

// 规范化 import specifier:
//   './foo'(相对 fromRel 所在目录)→ 展开为规范化相对路径(无扩展名)
//   '../lib/bar'               → 同级展开
//   外部包/别名(不以 ./ 或 ../ 开头)→ null(不参与精确连边)
export function normalizeSpec(spec, fromRel) {
  const s = String(spec || '').trim().replace(/^['"](.*)['"]$/, '$1')
  if (!s) return null
  if (!s.startsWith('.') && !s.startsWith('/')) return null
  const dir = fromRel && fromRel.includes('/') ? fromRel.slice(0, fromRel.lastIndexOf('/')) : ''
  const stack = dir ? dir.split('/') : []
  for (const p of s.split('/')) {
    if (p === '.' || p === '') continue
    if (p === '..') stack.pop()
    else stack.push(p)
  }
  const joined = stack.join('/')
  return joined || null
}

// 精确 importer 反查:谁的 surfaceImports(经 normalizeSpec)指向 targetRel
// cells: { rel: { surfaceImports: string[] } }
// 返回 [{ file, via }];目录 import('./utils' → utils/index.js)双向匹配。
export function exactImporters(cells, targetRel) {
  const t = String(targetRel).replace(/\.(?:js|mjs|cjs|jsx|ts|tsx|py)$/i, '')
  const out = []
  for (const [f, cell] of Object.entries(cells || {})) {
    if (f === targetRel) continue
    for (const spec of cell.surfaceImports || []) {
      const n = normalizeSpec(spec, f)
      if (n === null) continue
      const base = n.replace(/\.(?:js|mjs|cjs|jsx|ts|tsx|py)$/i, '')
      if (base === t || base + '/index' === t || base === t + '/index') {
        out.push({ file: f, via: spec })
        break
      }
    }
  }
  return out
}

// ============================================================
// P7-A 补充:precedent 先例过滤(自指噪声修复,P7 实验暴露)
//   P7 实验(20 卡)实测:precedent state=on 但零贡献——support 全为当前会话对
//   experiment/ 装置目录的自指噪声。三刀:排除当前会话、只收编辑类调用、项目前缀过滤。
// ============================================================

// 判定 tool/call 语义文档首行是否为编辑类工具(doc.text = 工具名 + '\n' + JSON 参数)
// 只把真实编辑先例计为支持度;read/grep/pwsh 等调用不产生编辑先例。
export function isEditCallText(text) {
  const head = String(text || '').slice(0, 60)
  return /^(edit|write|nle_mutate)\b/.test(head)
}

// P7 审计修复⑨:micro-agent 相似度——token 重叠相似度替代 binary includes
// 原版:overlap/min(size) 阈值 0.22,高置信 ≥0.6 领先;binary 匹配是 precedent 零贡献的原因之一。
export function taskSimilarity(queryKeys, text, minOverlap = 0.22) {
  const keys = (queryKeys || []).map((k) => String(k).toLowerCase())
  if (!keys.length) return 0
  const lower = String(text || '').toLowerCase()
  let overlap = 0
  for (const k of keys) if (lower.includes(k)) overlap++
  const base = Math.min(keys.length, 8)
  return overlap / (base || 1)
}

// 相似度筛选:返回 { hits: boolean, score }——score ≥ minOverlap 才计入先例
export function precedentHit(queryKeys, text, minOverlap = 0.22) {
  const score = taskSimilarity(queryKeys, text)
  return { hits: score >= minOverlap, score }
}

// 先例文件必须属于当前任务项目(root 前缀)——排除装置目录(experiment/ 等)与跨项目噪声
export function inPrecedentProject(f, root) {
  const nf = String(f || '').replace(/\\/g, '/').replace(/^\.\//, '')
  const rr = String(root || '').replace(/\/+$/, '')
  if (!nf || !rr) return false
  return nf === rr || nf.startsWith(rr + '/')
}

// ============================================================
// P7-C:learned 状态技能文件渲染——`.dsh/skills/nle-reflections/SKILL.md` 内容生成
//   落盘由宿主侧 nodeFsWrite 执行(持久形态);动态形态无宿主 fs → 降级(仅 runtime provider 渲染)。
//   模型经 skill 工具按需加载;skill-filesystem 提供方发现(rank 100,项目根)。
// ============================================================
export function skillStateRenderOf(entries, reflections, root) {
  const items = (entries || []).slice(0, 30)
  const refl = (reflections || []).slice(-10)
  const lines = [
    '---',
    'name: nle-reflections',
    'description: NLE 长期认知状态快照:learned 条目(关键词→文件共现)与最近反射观测;自动生成,勿手改(改动会被覆盖)。',
    'whenToUse: 定位相似历史任务编辑过的文件、了解 suggest 反复失误的模式与 learned 置信度变化。',
    '---',
    '# NLE 状态快照(自动生成)',
    '',
    '> 由 DSNLE 插件在任务闭合时写入;根: ' + String(root || ''),
    '',
    '## learned 条目(活跃,前 30)',
    '',
  ]
  if (!items.length) lines.push('(暂无)')
  for (const e of items) {
    const conf = Math.round((e.confidence ?? LEARN_PRIOR) * 100)
    lines.push('- `' + (e.keys || []).slice(0, 5).join(' / ') + '` → ' + (e.files || []).slice(0, 6).join(', ') + '(置信度 ' + conf + '%,证据 ' + (e.evidence || 0) + ' 次)')
  }
  lines.push('', '## 最近反射观测(前 10)', '')
  if (!refl.length) lines.push('(暂无)')
  for (const x of refl) {
    lines.push('- [' + x.type + '] #' + x.taskId + ' ' + (x.detail || ''))
  }
  lines.push('', '注意:这是历史共现经验,不是事实;使用前必须 read 验证文件内容。')
  return lines.join('\n')
}
