// ============================================================
// DSNLE 安装脚本 —— 把插件挂载进 DSH agent preset
// 用法:
//   node install-dsnle.mjs              独立模式:创建 <dshHome>/.agent-presets/dsnle/ 预设
//                                       (插件文件随预设复制,预设可整体迁移)
//   node install-dsnle.mjs --into <id>  注入模式:把 dsnle 行追加进现有预设的
//                                       agent.cordis.yml(插件用绝对路径指向本仓库,单一源码)
//   node install-dsnle.mjs --dry-run    只打印将执行的操作,不落盘
// 幂等:重复运行安全(已存在则跳过/更新文件)。
// 回滚:注入模式会备份 agent.cordis.yml.bak-<ts>;独立模式删除 dsnle 预设目录即可。
// ============================================================
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = here
const PLUGIN_DIR = join(here, 'nle-plugin')
const RULES_CORE = join(here, 'nle-rules-core.mjs')
const PLUGIN_ENTRY = 'dsnle-plugin.mjs'
const dryRun = process.argv.includes('--dry-run')
const intoIdx = process.argv.indexOf('--into')
const intoId = intoIdx >= 0 ? process.argv[intoIdx + 1] : null

// ---------- 定位 dshHome ----------
function dshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  const home = process.env.USERPROFILE || process.env.HOME || ''
  return join(home, '.dsh')
}

const log = (msg) => console.log((dryRun ? '[dry-run] ' : '') + msg)

// ---------- 校验插件文件完整 ----------
function checkPlugin() {
  const entry = join(PLUGIN_DIR, PLUGIN_ENTRY)
  if (!existsSync(entry)) { console.error('FATAL: 缺少 ' + entry + '(先运行 node nle-plugin/build-dsnle.mjs)'); process.exit(1) }
  if (!existsSync(RULES_CORE)) { console.error('FATAL: 缺少规则源 ' + RULES_CORE); process.exit(1) }
  const src = readFileSync(entry, 'utf8')
  const ok = ['export const name = \'dsnle\'', 'export function apply(ctx)'].every((s) => src.includes(s))
  if (!ok) { console.error('FATAL: 插件入口形状异常'); process.exit(1) }
}

// ---------- 独立模式:创建 dsnle 预设 ----------
function installStandalone() {
  const presetDir = join(dshHome(), '.agent-presets', 'dsnle')
  const targetPluginDir = join(presetDir, 'nle-plugin')
  const composeFile = join(presetDir, 'agent.cordis.yml')
  const metaFile = join(presetDir, 'preset.yml')

  if (!dryRun) {
    mkdirSync(targetPluginDir, { recursive: true })
    // 规则源 → 预设根;插件与开发源 → 预设/nle-plugin/(插件 import '../nle-rules-core.mjs' 恰好命中)
    copyFileSync(RULES_CORE, join(presetDir, 'nle-rules-core.mjs'))
    for (const f of readdirSync(PLUGIN_DIR)) {
      if (f.endsWith('.mjs')) copyFileSync(join(PLUGIN_DIR, f), join(targetPluginDir, f))
    }
  }
  log('preset 目录: ' + presetDir)
  log('规则源复制: → ' + join(presetDir, 'nle-rules-core.mjs'))
  log('插件复制: nle-plugin/*.mjs → ' + targetPluginDir)

  const compose = `# DSNLE 预设 —— Neural Link Engine:agent 对项目的长期持续认知
# 由 install-dsnle.mjs 生成;插件文件随本预设复制,预设可整体迁移。
# 挂载后新会话自动生效(已运行会话保持旧组装);删除本目录即卸载。
- id: dsnle
  name: ./nle-plugin/${PLUGIN_ENTRY}
  config: {}
`
  const meta = `name: DSNLE
description: Neural Link Engine — agent 对项目的长期持续认知(约束链/观测/记忆/可靠性),附带 nle_* 工作流工具与 learned 技能。
`

  if (!dryRun) {
    writeFileSync(composeFile, compose, 'utf8')
    writeFileSync(metaFile, meta, 'utf8')
  }
  log('组装文件: ' + composeFile)
  log('说明: 在 DSH 中把默认预设切换为 dsnle(或仅对目标会话选择该预设),新会话即生效。')
}

// ---------- 注入模式:把 dsnle 行追加进现有预设 ----------
function installInto() {
  const presetDir = join(dshHome(), '.agent-presets', intoId)
  const composeFile = join(presetDir, 'agent.cordis.yml')
  if (!existsSync(composeFile)) { console.error('FATAL: 预设不存在: ' + composeFile); process.exit(1) }
  const entryAbs = join(PLUGIN_DIR, PLUGIN_ENTRY).replace(/\\/g, '/')
  const row = `\n# DSNLE (Neural Link Engine) —— 由 install-dsnle.mjs 注入;回滚见 .bak 备份\n- id: dsnle\n  name: ${entryAbs}\n  config: {}\n`

  const cur = readFileSync(composeFile, 'utf8')
  if (cur.includes('- id: dsnle')) {
    log('已注入过,跳过: ' + composeFile)
    return
  }
  if (!dryRun) {
    writeFileSync(composeFile + '.bak-' + Date.now(), cur, 'utf8')
    writeFileSync(composeFile, cur + row, 'utf8')
  }
  log('注入: ' + composeFile)
  log('备份: ' + composeFile + '.bak-<ts>')
  log('注意: 已运行会话保持旧组装;新会话才挂载 dsnle。挂载失败恢复备份即可。')
}

// ---------- 主流程 ----------
checkPlugin()
if (intoId) installInto()
else installStandalone()
console.log(dryRun ? '\n[dry-run] 未落盘;去掉 --dry-run 真实执行。' : '\n安装完成。')
