// ============================================================
// dsnle 插件构建拼接器(模块化重构版)
// 输入:
//   experiment/nle-rules-core.mjs        (规则唯一源:常量 + 纯函数 + createRetrieve,strip export 后嵌入)
//   experiment/nle-plugin/frag-apply-*.mjs (apply 内四个片段:state/observe/tools/knowledge,按序拼接)
// 输出:
//   experiment/dsnle-host.js             (可读生成源码,node --check 可验证)
//   experiment/dsnle-pkg40-source.json   (cordis_define 快照:code.host)
// 用法:node build-dsnle.mjs [--check]
// 维护:改规则只改 nle-rules-core.mjs;改插件逻辑只改对应 frag 文件。
//       无锚点替换、无字符串手术——片段顺序即代码顺序。
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// 发布仓库布局:规则源在仓库根,build/frag/产物在本目录
const REPO_ROOT = dirname(here)
const RULES_CORE = join(REPO_ROOT, 'nle-rules-core.mjs')
const FRAG_DIR = here
const FRAG_FILES = [
  'frag-apply-state.mjs',
  'frag-apply-observe.mjs',
  'frag-apply-tools.mjs',
  'frag-apply-knowledge.mjs',
]
const OUT_HOST = join(REPO_ROOT, 'dsnle-host.js')
const OUT_SNAPSHOT = join(REPO_ROOT, 'dsnle-pkg40-source.json')
// 持久形态:常规 ESM 插件(preset 挂载行 `name: ./nle-plugin/dsnle-plugin.mjs` 或绝对路径)
// 与动态版共享同一 apply 函数体;规则经 import 引入(无内联,真正单一源)。
// 注意:dsnle-plugin.mjs 的 import 为 '../nle-rules-core.mjs'(相对本目录 → 仓库根)。
const OUT_PLUGIN = join(FRAG_DIR, 'dsnle-plugin.mjs')

const PLUGIN_TAIL = `  },
}
`

// ---------- strip export:规则源可被 fixture-gate/replay import,嵌入时去掉模块语法 ----------
// 只 strip 行首 export(正则字面量内的 'export ' 文本位于缩进行,不受影响)
function stripExports(src) {
  const stripped = src.replace(/^export\s+(?=function|const|let|var|async)/gm, '')
  if (/^export\s/m.test(stripped)) {
    console.error('FATAL: 规则源存在未识别的行首 export 形式')
    process.exit(1)
  }
  return stripped
}

// ---------- 读取片段 ----------
const rules = readFileSync(RULES_CORE, 'utf8')
const frags = FRAG_FILES.map((f) => {
  const text = readFileSync(join(FRAG_DIR, f), 'utf8')
  if (!text.trim().startsWith('// ==== DSNLE fragment')) {
    console.error('FATAL: 片段缺少标识头: ' + f)
    process.exit(1)
  }
  return text.replace(/\n+$/, '')
})

// ---------- 拼接 ----------
// apply 体内共享部分:服务获取 + 常量 + 四个 frag 片段
const APPLY_CORE = `    const fs = ctx.get('fs')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    const systemPrompt = ctx.get('systemPrompt')
    if (fs === undefined) return

    // ---------- constants ----------
    const STATE_FILE = '.dsnle-state.json'
`
const FRAGS_SRC = frags.join('\n')

// 动态形态:规则内联(无 import 约束),return {...} 函数体
const host = `// DSNLE (NLE core on DSH) — canonical plugin source(模块化构建产物,勿手改)
// 由 build-dsnle.mjs 从 nle-rules-core.mjs + nle-plugin/frag-*.mjs 拼接生成。
// 恢复序列见 dsnle-plugin.js;版本链与验收见 DSNLE_JOURNEY.md。
return {
  inject: ['timer'],
  apply(ctx) {
` + APPLY_CORE + `    // 动态形态占位:持久形态由模块级 nodeFsWrite 提供(node:fs);
    // 此处置空消除沙箱"未声明全局引用"风险(apply 内 typeof 检查变为已定义变量检查)
    const nodeFsWrite = undefined
` + stripExports(rules) + '\n' + FRAGS_SRC + '\n' + PLUGIN_TAIL

// 持久形态:常规 ESM 插件(preset 挂载)。规则经 import 引入——同一份规则源,零内联。
const exportNames = [...new Set([...rules.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]).concat(
  [...rules.matchAll(/^export\s+const\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
))]
const importLine = "import {\n  " + exportNames.join(',\n  ') + ",\n} from '../nle-rules-core.mjs'\n"
const pluginSrc = `// DSNLE 持久形态插件(常规 ESM,preset 挂载)——由 build-dsnle.mjs 生成,勿手改
// 挂载:agent preset 组装文件加一行
//   - id: dsnle
//     name: <绝对路径>/nle-plugin/dsnle-plugin.mjs
// 与动态版(cordis_define 形态)共享 apply 函数体与规则源;规则经 import 单一源。
${importLine}
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// P7-C:learned 状态技能文件落盘(仅持久形态)——动态形态无宿主 fs,apply 内 typeof 检查降级
const nodeFsWrite = (filePath, content) => {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

export const name = 'dsnle'
export const inject = ['timer']

export function apply(ctx) {
` + APPLY_CORE + FRAGS_SRC + '\n}\n'

// ---------- 泄漏检查(拼接后不应出现任何 import/require;export 仅残留 strip 后的合法标识符场景) ----------
if (/^\s*import\s/m.test(host)) {
  console.error('FATAL: 拼接产物含 import 语句')
  process.exit(1)
}
if (/^\s*export\s+(?=function|const|let|var|async)/m.test(host)) {
  console.error('FATAL: 拼接产物含残留 export 语句')
  process.exit(1)
}
if (/\brequire\s*\(/.test(host)) {
  console.error('FATAL: 拼接产物含 require 调用')
  process.exit(1)
}
// 关键符号就位检查(无锚点补丁后,这些必须来自 rules-core)
for (const sym of ['const SOURCE_RE', 'function createRetrieve', 'function judgeGuard', 'function auditContract']) {
  if (!host.includes(sym)) {
    console.error('FATAL: 缺失规则符号: ' + sym)
    process.exit(1)
  }
}
// apply 内关键闭包就位检查(来自 frag)
for (const sym of ['const state = {', 'async function preExec', "name: 'nle_suggest'", 'name: \'nle-learned\'']) {
  if (!host.includes(sym)) {
    console.error('FATAL: 缺失 apply 符号: ' + sym)
    process.exit(1)
  }
}

// ---------- 输出(先写盘,持久形态检查依赖真实文件解析) ----------
writeFileSync(OUT_HOST, host, 'utf8')
writeFileSync(OUT_PLUGIN, pluginSrc, 'utf8')

// ---------- 语法检查(包函数壳:顶层 return 在函数体内才合法) ----------
import { spawnSync } from 'node:child_process'
const checkSrc = 'function __dsnle_check() {\n' + host + '\n}\n__dsnle_check\n'
const check = spawnSync(process.execPath, ['--check', '--input-type=module'], {
  input: checkSrc,
  encoding: 'utf8',
})
if (check.status !== 0) {
  console.error('FATAL: 拼接产物语法检查失败')
  console.error(check.stderr || check.stdout)
  process.exit(1)
}
// 持久形态语法检查(ESM import 需真实模块解析)
const checkPersist = spawnSync(process.execPath, ['--check', OUT_PLUGIN], { encoding: 'utf8' })
if (checkPersist.status !== 0) {
  console.error('FATAL: 持久插件语法检查失败')
  console.error(checkPersist.stderr || checkPersist.stdout)
  process.exit(1)
}

const snapshot = {
  plugin: { kind: 'new', idPrefix: 'dsnle' },
  name: 'DSNLE V7(模块化重构)',
  purpose: 'P7 机制:precedent 先例通道 / impact 声明优先 / reflect 闭合反射;源码拆分为 5 模块 + 拼接构建。',
  code: { host },
}
writeFileSync(OUT_SNAPSHOT, JSON.stringify(snapshot), 'utf8')

console.log('[build] OK')
console.log('  rules-core: ' + rules.length + ' chars / exports: ' + exportNames.length)
frags.forEach((f, i) => console.log('  ' + FRAG_FILES[i] + ': ' + f.length + ' chars'))
console.log('  output: ' + host.length + ' chars → dsnle-host.js + dsnle-pkg40-source.json')
console.log('  persist: ' + pluginSrc.length + ' chars → nle-plugin/dsnle-plugin.mjs')
