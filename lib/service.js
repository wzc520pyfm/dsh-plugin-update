import path from 'node:path'
import { listInstalled } from './inventory.js'
import { planUpdates } from './plan.js'
import { collectRemote, mapPool, readRegistry } from './registry.js'
import { normalize, withBackup, withSnooze, withoutSnooze } from './state.js'
import {
  applyUpdate,
  packageManagerFor,
  readSnapshot,
  restoreSnapshot,
  writeSnapshot,
} from './transaction.js'

export const SELF_NAME = 'dsh-plugin-update'

export function createService({ profileDir, io, fetch, stateFile, selfName = SELF_NAME }) {
  let busy = false

  async function loadState() {
    if (!stateFile) return normalize(null)
    try {
      return normalize(JSON.parse(await io.readFile(stateFile)))
    } catch {
      return normalize(null)
    }
  }

  async function saveState(state) {
    if (!stateFile) return
    await io.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  }

  async function runningDsh() {
    try {
      const pkg = JSON.parse(await io.readFile(path.join(profileDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')))
      return typeof pkg.version === 'string' ? pkg.version : null
    } catch {
      return null
    }
  }

  async function inventory() {
    const packageJson = JSON.parse(await io.readFile(path.join(profileDir, 'package.json')))
    const installed = {}
    const dependencies = packageJson.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {}
    for (const name of Object.keys(dependencies)) {
      if (name.startsWith('@deepseek-ai/')) continue
      try {
        installed[name] = JSON.parse(await io.readFile(path.join(profileDir, 'node_modules', ...name.split('/'), 'package.json')))
      } catch {
        installed[name] = {}
      }
    }
    return listInstalled({ packageJson, installed, selfName })
  }

  async function registry() {
    const npmrcPath = path.join(profileDir, '.npmrc')
    if (!(await io.exists(npmrcPath))) return 'https://registry.npmjs.org'
    return readRegistry(await io.readFile(npmrcPath))
  }

  return {
    async check() {
      if (!profileDir) {
        return { ok: false, message: '找不到当前 profile', updates: [], current: [], pinned: [], uncertain: [], snoozed: [], errors: [], rollbackable: [] }
      }
      const items = await inventory()
      const source = await registry()
      const looked = await mapPool(items, 5, (item) => collectRemote(item, { fetch, registry: source }))
      const remotes = {}
      items.forEach((item, index) => {
        if (looked[index]) remotes[item.name] = looked[index]
      })
      const state = await loadState()
      const plan = planUpdates({ installed: items, remotes, snooze: state.snooze })
      return {
        ok: true,
        profileDir,
        registry: source,
        rollbackable: Object.keys(state.backups),
        ...plan,
      }
    },

    async apply(body) {
      if (!profileDir) return { status: 503, body: { ok: false, message: '找不到当前 profile' } }
      if (!body || body.confirm !== true) {
        return { status: 400, body: { ok: false, error: 'confirm', message: '更新需要确认' } }
      }
      if (busy) return { status: 409, body: { ok: false, error: 'busy', message: '已有一次更新在进行' } }
      busy = true
      try {
        const report = await this.check()
        const names = body.all === true ? report.updates.map(row => row.name) : [body.name]
        if (body.all !== true && (typeof body.name !== 'string' || body.name === '')) {
          return { status: 400, body: { ok: false, message: '缺少插件名' } }
        }
        if (names.length === 0) return { status: 200, body: { ok: true, results: [], message: '没有要更新的插件' } }
        const dsh = await runningDsh()
        const results = []
        for (const name of names) {
          const row = report.updates.find(item => item.name === name)
            || (body.force === true ? report.uncertain.find(item => item.name === name) : null)
          if (!row) {
            const message = '没有可安装的新版本'
            results.push({ name, ok: false, message })
            return { status: 404, body: { ok: false, results, message } }
          }
          const outcome = await applyUpdate({
            profileDir,
            name,
            targetSpec: row.targetSpec,
            resolvedSpec: row.resolvedSpec,
            runningDsh: dsh,
          }, io)
          if (outcome.snapshot) await persistBackup(io, stateFile, name, outcome, loadState, saveState)
          const { snapshot, ...publicOutcome } = outcome
          results.push({ name, ...publicOutcome })
          if (!outcome.ok) return { status: 500, body: { ok: false, results, message: outcome.message } }
        }
        return { status: 200, body: { ok: true, results, message: '更新完成。重启 dsh 后新代码才会加载。' } }
      } finally {
        busy = false
      }
    },

    async snooze(body) {
      if (!profileDir) return { status: 503, body: { ok: false, message: '找不到当前 profile' } }
      if (!body || typeof body.name !== 'string' || typeof body.version !== 'string' || body.version === '') {
        return { status: 400, body: { ok: false, message: '缺少要忽略的版本' } }
      }
      const state = await loadState()
      await saveState(withSnooze(state, body.name, body.version))
      return { status: 200, body: { ok: true, message: '这个版本先不提醒。再有更新版本时会重新出现。' } }
    },

    async unsnooze(body) {
      if (!profileDir) return { status: 503, body: { ok: false, message: '找不到当前 profile' } }
      if (!body || typeof body.name !== 'string') return { status: 400, body: { ok: false, message: '缺少插件名' } }
      const state = await loadState()
      await saveState(withoutSnooze(state, body.name))
      return { status: 200, body: { ok: true } }
    },

    async rollback(body) {
      if (!profileDir) return { status: 503, body: { ok: false, message: '找不到当前 profile' } }
      if (!body || body.confirm !== true) return { status: 400, body: { ok: false, message: '回滚需要确认' } }
      if (!body.name || typeof body.name !== 'string') return { status: 400, body: { ok: false, message: '缺少插件名' } }
      if (busy) return { status: 409, body: { ok: false, message: '已有一次更新在进行' } }
      const state = await loadState()
      const backup = state.backups[body.name]
      if (!backup || !backup.dir) return { status: 404, body: { ok: false, message: '没有可回滚的备份' } }
      busy = true
      try {
        const snapshot = await readSnapshot(io, backup.dir)
        await restoreSnapshot(profileDir, snapshot, io)
        const present = snapshot.filter(item => item.existed).map(item => item.file)
        const manager = packageManagerFor(present)
        const repair = await io.spawn(manager.command, manager.repairArgs(profileDir, snapshot), { cwd: profileDir })
        if (repair.code !== 0) {
          return { status: 500, body: { ok: false, message: '清单已写回，但重新安装失败。备份还在。', detail: repair.stderr || '' } }
        }
        return { status: 200, body: { ok: true, message: `已回到更新前的 ${backup.previousSpec}。重启 dsh 后生效。`, restart: true } }
      } catch (error) {
        return { status: 500, body: { ok: false, message: `回滚失败：${error.message}` } }
      } finally {
        busy = false
      }
    },
  }
}

async function persistBackup(io, stateFile, name, outcome, loadState, saveState) {
  if (!stateFile || !outcome.snapshot) return
  const root = path.join(path.dirname(stateFile), 'backups', name.replaceAll('/', '__'))
  const dir = path.join(root, stamp())
  await writeSnapshot(io, dir, outcome.snapshot)
  const state = await loadState()
  await saveState(withBackup(state, name, {
    dir,
    at: new Date().toISOString(),
    previousSpec: outcome.previousSpec ?? null,
    spec: outcome.spec ?? null,
    version: outcome.version ?? null,
  }))
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}
