// DSNLE 规则核心冒烟测试(发布版验证,无文件依赖)
// 用法:node smoke-test.mjs —— 全绿即规则源与插件产物同步一致。
// 说明:完整 fixture-gate(245 断言)依赖实验仓库文件,见研究附录。
import {
  fnv1a, classifyTier, shellDeny, taskKeys, extractImports, remapRoot, remapLearned,
  projectIdOf, rootOfFile, migrateLearnedProjectIds, learnedProjectFilter,
  learnHitUpdate, learnMissUpdate, promoteCandidateKeys, applyPromotions, activeLearned,
  skillNameOf, skillRenderOf, tokenizeText, bm25Score, extractOffers, updateCoChange,
  topCoChangeNeighbors, rrfFuse, cosineSim, parseGitNameOnly, coChangeFromFileSets,
  jaccardNeighbors, remapGitSets, isLearnedAged, markLearnedConflicts, trendPoint, pushTrend,
  judgeGuard, auditTruth, auditContract, normalizeSpec, exactImporters, skillStateRenderOf,
  isEditCallText, inPrecedentProject, taskSimilarity, precedentHit,
  SHELL_WRITE_RE, SOURCE_PATH_RE, SOURCE_RE, HIGH_IMPACT, SUGGEST_TOP_N, DEFAULT_ALIAS_KB,
  LEARN_PRIOR, LEARN_HIT_DELTA, LEARN_MISS_DELTA, LEARN_MAX, LEARN_RETIRE_THRESHOLD,
} from './nle-rules-core.mjs'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
let pass = 0
let fail = 0
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; if (!ok) console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) }

// ---- 1. 与持久插件产物一致:插件 import 的规则源就是本文件,且规则符号在插件源码中可见 ----
const pluginSrc = readFileSync(join(here, 'nle-plugin', 'dsnle-plugin.mjs'), 'utf8')
check('smoke: 插件产物 import 规则源', pluginSrc.includes("from '../nle-rules-core.mjs'"))
check('smoke: 插件产物含 P7 三机制', ['precedentOf', 'exactImporters', 'reflectOnTaskEnd'].every((s) => pluginSrc.includes(s)))
check('smoke: 插件产物无手改告警残留', pluginSrc.includes('生成,勿手改'))

// ---- 2. 规则核心(纯函数,无文件依赖) ----
check('fnv1a 确定性', fnv1a('x') === fnv1a('x') && fnv1a('a') !== fnv1a('b'))
check('tier 分级', classifyTier('改 src/a.js') === 'T1' && classifyTier('重构核心') === 'T3' && classifyTier('普通修复') === 'T2')
check('shell 防护', shellDeny("Set-Content -Path 'exp-host/src/store.js' -Value 'x'") && !shellDeny("Get-Content 'exp-host/src/store.js'"))
check('taskKeys', taskKeys('折扣 bug format').includes('format') && taskKeys('').length === 0)
check('extractImports 分支', extractImports(["import x from './a'", "from pkg import y", "const z = require('./c')"]).length === 3)
check('remapLearned 段数(审计修复)', remapLearned('bench-host/real-moment-t1/src/store.js', 'exp-host') === 'exp-host/src/store.js')
check('项目隔离 filter', learnedProjectFilter([{ projectId: projectIdOf('exp-host'), scope: 'project', files: [] }], 'exp-host').length === 1)
check('learned 命中/衰减', (() => { const e = { projectId: 'p', scope: 'project', keys: ['k'], files: [], confidence: LEARN_PRIOR }; learnHitUpdate(e, ['k'], ['a'], 't'); const afterHit = e.confidence === LEARN_PRIOR + LEARN_HIT_DELTA; learnMissUpdate(e, 't2'); return afterHit && e.confidence === LEARN_PRIOR + LEARN_HIT_DELTA - LEARN_MISS_DELTA } )())
check('promote 跨项目', (() => { const l = [{ projectId: 'p1', scope: 'project', keys: ['k'], files: [], confidence: 0.8 }, { projectId: 'p2', scope: 'project', keys: ['k'], files: [], confidence: 0.8 }]; return applyPromotions(l) === 2 } )())
check('skill 渲染', skillRenderOf({ projectId: 'p', scope: 'project', keys: ['折扣'], files: ['a'], confidence: 0.6, evidence: 3, at: 't' }, 'exp-host').description.includes('60%'))
check('BM25 有相关性分高', bm25Score(['format'], ['format', 'format', 'x'], { format: 10 }, 100, 50, 50) > 0)
check('offers 提取', extractOffers('export function foo() {}').includes('foo'))
check('co-change 矩阵', (() => { const c = {}; updateCoChange(c, ['a', 'b']); return c.a.b === 1 && c.b.a === 1 } )())
check('RRF 融合', rrfFuse([{ scores: new Map([['a', 3], ['b', 2]]) }, { scores: new Map([['b', 5]]) }])[0][0] === 'b')
check('余弦', cosineSim([1, 0], [1, 0]) === 1 && cosineSim([1], [1, 0]) === 0)
check('git sets 解析与键重写', (() => { const sets = remapGitSets(parseGitNameOnly('src/a.js\n\nsrc/b.js'), 'root'); return sets.length === 2 && sets[0][0] === 'root/src/a.js' } )())
check('jaccard 邻居', (() => { const { matrix, touched } = coChangeFromFileSets([['a', 'b'], ['a', 'b'], ['a']]); return jaccardNeighbors(matrix, touched, 'a')[0].file === 'b' } )())
check('freshness', isLearnedAged({ lastVerifiedAt: '2020-01-01T00:00:00Z' }, Date.now()) && !isLearnedAged({}, Date.now()))
check('conflicts 标记', markLearnedConflicts([{ projectId: 'p', scope: 'project', keys: ['k'], files: [], confidence: 0.9 }, { projectId: 'p', scope: 'project', keys: ['k'], files: [], confidence: 0.4 }]) === 1)
check('trend', pushTrend([], trendPoint({})).length === 1)
check('guard 判定', judgeGuard({ locked: true, selectLog: null, edits: ['a'], openedAt: null }, []).includes('NLE_PATCH_GAP'))
check('truth 对账', auditTruth([{ at: 't', file: 'a' }], [{ at: 't', file: 'a' }], ['a'], null).available === true)
check('contract 门', auditContract([{ at: 't', file: 'a' }], ['a'], null).available === true)
check('normalizeSpec', normalizeSpec('./u', 'r/src/a.js') === 'r/src/u' && normalizeSpec('pkg', 'r/a.js') === null)
check('exactImporters 不误连', exactImporters({ 'r/src/a.js': { surfaceImports: ['./u'] } }, 'r/src/u.js').length === 1 && exactImporters({ 'r/other/a.js': { surfaceImports: ['./u'] } }, 'r/src/u.js').length === 0)
check('precedent 过滤', isEditCallText('edit\n{}') && !isEditCallText('read\n{}') && inPrecedentProject('r/src/a.js', 'r') && !inPrecedentProject('experiment/x', 'r'))
check('precedent 相似度', precedentHit(['format', 'era'], 'fix format logic').hits === true && precedentHit(['zz', 'yy', 'xx'], 'nothing').hits === false)
check('skillState 渲染', skillStateRenderOf([], [], 'r').includes('nle-reflections'))
check('常量契约', SOURCE_RE.test('a.js') && HIGH_IMPACT.length >= 3 && SUGGEST_TOP_N === 10 && LEARN_HIT_DELTA === 0.15 && LEARN_MISS_DELTA === 0.1 && LEARN_MAX === 0.9 && LEARN_RETIRE_THRESHOLD === 0.2)

console.log(`\n=== DSNLE smoke: ${pass} pass, ${fail} fail ===`)
process.exit(fail ? 1 : 0)
