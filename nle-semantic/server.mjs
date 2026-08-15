// NLE 语义服务(独立进程,离线 embedding)
// 架构:动态插件跑在 node:vm 沙箱,不能 import 模块 → 语义检索走独立 helper 进程
// 协议:文件 spool——watchDir 下出现 <id>.req.json {text} → 嵌入 → 写 <id>.res.json {ok, vector, ms}
// 用法:node nle-semantic/server.mjs [--spool <dir>] [--once <text>] [--selfcheck]
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const MODEL = 'Xenova/all-MiniLM-L6-v2'
const DEFAULT_SPOOL = join(ROOT, 'spool')

let _embedder = null
let _init = null

async function initEmbedder() {
  if (_embedder) return _embedder
  if (_init) return _init
  _init = (async () => {
    const { pipeline } = await import('@huggingface/transformers')
    _embedder = await pipeline('feature-extraction', MODEL, { quantized: true })
    return _embedder
  })()
  return _init
}

export async function embed(text, { log = false } = {}) {
  const t0 = Date.now()
  const e = await initEmbedder()
  const out = await e(String(text || '').slice(0, 512), { pooling: 'mean', normalize: true })
  const vec = Array.from(out.data)
  if (log) console.log(`[nle-semantic] embed ${vec.length}-dim in ${Date.now() - t0}ms`)
  return vec
}

// ---------- git 历史共改(P3,类 2 修复)+ P7 键空间修复 + reflector 信号(churn/rollback) ----------
const _gitCache = new Map()
const _gitChurnCache = new Map()
const _gitRollbackCache = new Map()
const gitCacheGet = (cache, key, ttlMs) => {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.data
  return undefined
}
const gitCacheSet = (cache, key, data) => {
  cache.set(key, { at: Date.now(), data })
  return data
}

export async function gitCoChange(rootDir, prefix) {
  const key = String(rootDir || '')
  const cached = gitCacheGet(_gitCache, key, 60000)
  if (cached !== undefined) return cached
  const { execFileSync } = await import('node:child_process')
  const { parseGitNameOnly, coChangeFromFileSets, remapGitSets } = await import('../nle-rules-core.mjs')
  let out = ''
  try {
    out = execFileSync('git', ['log', '--name-only', '--pretty=format:'], { cwd: key, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    return gitCacheSet(_gitCache, key, null)
  }
  // P7 修复①:键空间重写——git 输出仓库相对路径 → 补 root 前缀,与 suggest 检索文件键同空间
  const sets = remapGitSets(parseGitNameOnly(out), prefix || '')
  const { matrix, touched } = coChangeFromFileSets(sets)
  const data = { commits: sets.length, matrix, touched }
  return gitCacheSet(_gitCache, key, data)
}

// P7 修复②:git 全历史 churn 热点(近 90 天改动频率)——reflector 冷启动信号
// 返回 { files: [{ file, count }] } 按 count 降序,文件为 root 前缀路径
export async function gitChurn(rootDir, prefix, sinceDays = 90) {
  const key = String(rootDir || '') + '|churn|' + sinceDays
  const cached = gitCacheGet(_gitChurnCache, key, 300000)
  if (cached !== undefined) return cached
  const { execFileSync } = await import('node:child_process')
  let out = ''
  try {
    out = execFileSync('git', ['log', '--name-only', '--pretty=format:', '--since=' + sinceDays + ' days ago'], { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    return gitCacheSet(_gitChurnCache, key, null)
  }
  const counts = {}
  const p = String(prefix || '').replace(/\/+$/, '')
  for (const raw of out.split('\n')) {
    const t = raw.trim()
    if (!t || t.includes('=>')) continue
    const f = p ? p + '/' + t : t
    counts[f] = (counts[f] || 0) + 1
  }
  const files = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([file, count]) => ({ file, count }))
  return gitCacheSet(_gitChurnCache, key, { files })
}

// P7 修复②:近期回滚检测(近 30 天 revert 提交)——reflector 负反馈信号
// 返回 { rollbacks: [{ commit, files: string[] }] }
export async function gitRollbacks(rootDir, prefix, sinceDays = 30) {
  const key = String(rootDir || '') + '|rollback|' + sinceDays
  const cached = gitCacheGet(_gitRollbackCache, key, 300000)
  if (cached !== undefined) return cached
  const { execFileSync } = await import('node:child_process')
  let out = ''
  try {
    out = execFileSync('git', ['log', '--since=' + sinceDays + ' days ago', '--grep=revert', '-i', '--pretty=format:%H %s'], { cwd: rootDir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  } catch (e) {
    return gitCacheSet(_gitRollbackCache, key, null)
  }
  const rollbacks = []
  const p = String(prefix || '').replace(/\/+$/, '')
  for (const line of out.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const [commit, ...rest] = t.split(' ')
    if (!commit) continue
    let files = []
    try {
      const fout = execFileSync('git', ['show', '--name-only', '--pretty=format:', commit], { cwd: rootDir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      files = fout.split('\n').map((x) => x.trim()).filter((x) => x && !x.includes('=>')).map((f) => (p ? p + '/' + f : f))
    } catch (e) { /* skip files */ }
    rollbacks.push({ commit, subject: rest.join(' ').slice(0, 120), files })
  }
  return gitCacheSet(_gitRollbackCache, key, { rollbacks })
}

// ---------- 文件 spool 服务 ----------
export async function serveSpool(spoolDir = DEFAULT_SPOOL, { pollMs = 200 } = {}) {
  mkdirSync(spoolDir, { recursive: true })
  console.log(`[nle-semantic] spool watching: ${spoolDir}`)
  await initEmbedder()
  console.log('[nle-semantic] model ready')
  const seen = new Set()
  for (;;) {
    let entries = []
    try { entries = readdirSync(spoolDir) } catch { /* retry */ }
    for (const name of entries) {
      if (!name.endsWith('.req.json')) continue
      const reqPath = join(spoolDir, name)
      const key = name
      if (seen.has(key)) continue
      seen.add(key)
      const id = name.slice(0, -'.req.json'.length)
      const resPath = join(spoolDir, id + '.res.json')
      try {
        const req = JSON.parse(readFileSync(reqPath, 'utf8').replace(/^\uFEFF/, ''))
        const t0 = Date.now()
        if (req.kind === 'gitcochange') {
          const g = await gitCoChange(req.root, req.prefix)
          if (!g) {
            writeFileSync(resPath, JSON.stringify({ ok: false, error: 'git unavailable', ms: Date.now() - t0 }))
          } else {
            writeFileSync(resPath, JSON.stringify({ ok: true, commits: g.commits, matrix: g.matrix, touched: g.touched, ms: Date.now() - t0 }))
          }
        } else if (req.kind === 'gitchurn') {
          const c = await gitChurn(req.root, req.prefix, req.sinceDays || 90)
          if (!c) {
            writeFileSync(resPath, JSON.stringify({ ok: false, error: 'git unavailable', ms: Date.now() - t0 }))
          } else {
            writeFileSync(resPath, JSON.stringify({ ok: true, files: c.files, ms: Date.now() - t0 }))
          }
        } else if (req.kind === 'gitrollback') {
          const r = await gitRollbacks(req.root, req.prefix, req.sinceDays || 30)
          if (!r) {
            writeFileSync(resPath, JSON.stringify({ ok: false, error: 'git unavailable', ms: Date.now() - t0 }))
          } else {
            writeFileSync(resPath, JSON.stringify({ ok: true, rollbacks: r.rollbacks, ms: Date.now() - t0 }))
          }
        } else {
          const vector = await embed(req.text)
          writeFileSync(resPath, JSON.stringify({ ok: true, vector, ms: Date.now() - t0 }))
        }
        rmSync(reqPath, { force: true })
      } catch (e) {
        try { writeFileSync(resPath, JSON.stringify({ ok: false, error: String((e && e.message) || e) })) } catch {}
        rmSync(reqPath, { force: true })
      }
    }
    await new Promise((r) => setTimeout(r, pollMs))
    // 清理:超过 10 分钟的 res 文件(客户端不删,防堆积)
    try {
      const now = Date.now()
      for (const n of readdirSync(spoolDir)) {
        if (!n.endsWith('.res.json')) continue
        const p = join(spoolDir, n)
        try { if (now - statSync(p).mtimeMs > 10 * 60 * 1000) rmSync(p, { force: true }) } catch {}
      }
    } catch {}
  }
}

// ---------- 入口 ----------
if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  const args = process.argv.slice(2)
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
  if (args.includes('--selfcheck')) {
    const v = await embed('discount tax store currency')
    console.log(JSON.stringify({ ok: v.length === 384, dim: v.length, model: MODEL }))
    process.exit(v.length === 384 ? 0 : 1)
  }
  if (args.includes('--once')) {
    const v = await embed(args[args.indexOf('--once') + 1])
    console.log(JSON.stringify({ ok: true, dim: v.length, sample: v.slice(0, 3) }))
    process.exit(0)
  }
  await serveSpool(flag('--spool') || DEFAULT_SPOOL)
}
