// DSNLE agent-scope mounter  +  语义 helper 自启动
// ---------------------------------------------------------------------------
// 为什么需要挂载层(2026-11-12 实测根因):
//   在 dsh 0.2.x 里 `fs` 与 `tools` 都是 **agent 作用域**服务。插件本体若挂在 profile 层,
//   apply() 里 `ctx.get('fs')` 是 undefined,于是第 90 行 `if (fs === undefined) return`
//   直接静默返回 —— 整张 nle_* 工具表不注册,而且没有任何报错(只能看到「装了但没工具」)。
//   作者把插件设计成挂 agent preset,正是这个原因。
// 本挂载器让 bundle 安装方式等价于 preset 安装:
//   profile 层监听 `agent/created`(载荷 {agent,source,signal})→ 把插件挂到该 agent 的 ctx。
//   每个会话一个实例(内存态各自独立,共享同一个工作区状态文件)。
//
// 语义 helper 自启动(2026-11-12 追加):
//   第一次见到某个工作区的 agent 时,若该工作区已初始化过 NLE(.dsnle-state.json 存在),
//   就在 `<工作区>/.nle-semantic` 上以 detached 方式拉起 nle-semantic/server.mjs。
//   拉起来就不管了:不监管、不重启,DSH 退出后继续存活(旧进程靠单实例锁挡住重复拉起)。
//   开关:NLE_SEMANTIC=off 关闭;NLE_SEMANTIC=on 强制(即使工作区没初始化过 NLE)。
// 诊断日志:~/.dsh/logs/nle-apply.log;helper 自身输出:<工作区>/.nle-semantic/server.log
// ---------------------------------------------------------------------------
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dsnle from './dsnle-plugin.mjs'

export const name = 'dsnle-agent-mount'
export const inject = ['agents']

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER = join(HERE, '..', 'nle-semantic', 'server.mjs')
const LOG = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'logs', 'nle-apply.log')
const note = (s) => { try { mkdirSync(dirname(LOG), { recursive: true }); appendFileSync(LOG, new Date().toISOString() + ' ' + s + '\n') } catch { /* ignore */ } }

/**
 * 用哪个可执行文件跑 helper。
 * 桌面端 process.execPath 是 Electron 本体 —— 带 ELECTRON_RUN_AS_NODE 也能跑 node 脚本,
 * 但进程会显示成第二个「DeepSeek Harness.exe」,任务管理器里没法辨认。
 * 所以优先用安装自带的 plain node.exe,找不到才退回 Electron 本体。
 */
function nodeBinary() {
  if (!process.versions.electron) return { bin: process.execPath, extraEnv: {} }
  const bundled = process.resourcesPath
    ? join(process.resourcesPath, 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin', 'node.exe')
    : null
  if (bundled && existsSync(bundled)) return { bin: bundled, extraEnv: {} }
  return { bin: process.execPath, extraEnv: { ELECTRON_RUN_AS_NODE: '1' } }
}

/** 工作区 → 拉起语义 helper(detached;失败只留痕,绝不影响 agent 创建)。 */
function ensureSemanticHelper(agent, spawned) {
  const cwd = agent && agent.session && agent.session.header && agent.session.header.cwd
  if (!cwd) return
  const mode = process.env.NLE_SEMANTIC
  if (mode === 'off') return
  if (spawned.has(cwd)) return
  if (!existsSync(SERVER)) { note('[semantic] server.mjs missing: ' + SERVER); return }
  // 只给已经配置过 NLE 的工作区自启动,避免为每个随手打开的项目常驻一个 1.2GB 模型进程
  if (mode !== 'on' && !existsSync(join(cwd, '.dsnle-state.json'))) return
  const spool = join(cwd, '.nle-semantic')
  try {
    mkdirSync(spool, { recursive: true })
    const logFd = openSync(join(spool, 'server.log'), 'a')
    const { bin, extraEnv } = nodeBinary()
    const env = { ...process.env, ...extraEnv }
    const child = spawn(bin, [SERVER, '--spool', spool], {
      cwd: dirname(SERVER),
      env,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
    })
    child.unref()
    spawned.add(cwd)
    note('[semantic] spawned pid ' + child.pid + ' via ' + bin + ' spool ' + spool)
  } catch (e) {
    note('[semantic] spawn FAILED ' + e.message)
  }
}

export function apply(ctx) {
  const mounted = new Set()
  const spawned = new Set()

  const mount = (payload) => {
    const agent = payload && payload.agent ? payload.agent : payload
    const target = agent && agent.ctx
    if (!target) { note('[mount] no agent.ctx'); return }
    const id = agent.id || (agent.session && agent.session.id) || '?'
    if (mounted.has(id)) return
    mounted.add(id)
    try {
      target.plugin({ name: dsnle.name, inject: dsnle.inject, apply: dsnle.apply })
      note('[mount] ' + id + ' ok (' + (payload && payload.source ? payload.source : 'live') + ')')
    } catch (e) {
      // agent/created 是串行分发:监听器抛错会连 agent 创建一起拒掉,所以这里必须吞掉并留痕
      note('[mount] ' + id + ' FAILED ' + e.message)
    }
    ensureSemanticHelper(agent, spawned)
  }

  // 已存在的 agent(热加载/后装场景)
  try {
    const agents = ctx.get('agents')
    if (agents && typeof agents.list === 'function') for (const a of agents.list()) mount(a)
  } catch { /* ignore */ }

  ctx.on('agent/created', mount)
  note('[mount] mounter applied')
}
