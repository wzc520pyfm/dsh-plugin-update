import path from 'node:path'
import { assertSafeSpec, isPackageName } from './spec.js'
import { satisfies } from './semver.js'

export const PROFILE_FILES = ['package.json', 'pnpm-lock.yaml', 'package-lock.json', 'cordis.patch.yml']
const REMOVAL_ARGS = new Set(['remove', 'uninstall', 'un', 'rm', 'unlink', 'prune'])

export function replaceDependency(packageJson, name, spec) {
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    throw new Error('profile 的 package.json 无法读取')
  }
  const dependencies = packageJson.dependencies
  if (!dependencies || !Object.prototype.hasOwnProperty.call(dependencies, name)) {
    throw new Error(`${name} 不是这个 profile 的直接依赖`)
  }
  return {
    ...packageJson,
    dependencies: { ...dependencies, [name]: spec },
  }
}

export function packageManagerFor(fileNames) {
  const names = Array.isArray(fileNames) ? fileNames : []
  if (names.includes('package-lock.json') && !names.includes('pnpm-lock.yaml')) return npmManager()
  return pnpmManager()
}

/**
 * Verify the package that landed in the temp install before the profile is touched.
 * A declared bundle patch must exist. engines.dsh is enforced only when the running
 * DSH version is known; an unparsable range does not block.
 */
export async function verifyStagedPackage(pkg, { name, fileExists, runningDsh }) {
  if (!pkg || pkg.name !== name) {
    return { ok: false, message: `临时目录里的包名是 ${pkg && pkg.name ? pkg.name : '空'}，不是 ${name}` }
  }
  if (typeof pkg.version !== 'string' || pkg.version === '') {
    return { ok: false, message: '临时目录里的包没有版本号' }
  }
  const patch = pkg.dsh && pkg.dsh.bundle ? pkg.dsh.bundle.patch : undefined
  if (patch !== undefined) {
    const files = Array.isArray(patch) ? patch : [patch]
    for (const file of files) {
      const relative = safeRelative(file)
      if (relative === null || !(await fileExists(relative))) {
        return { ok: false, message: `声明了补丁 ${String(file)}，临时安装里没有这个文件` }
      }
    }
  }
  const range = pkg.engines && typeof pkg.engines.dsh === 'string' ? pkg.engines.dsh : null
  if (range && runningDsh) {
    const ok = satisfies(runningDsh, range)
    if (ok === false) return { ok: false, message: `这个版本要求 DSH ${range}，当前是 ${runningDsh}` }
    if (ok === null) return { ok: true, version: pkg.version, engineUnchecked: true }
  }
  return { ok: true, version: pkg.version, engineUnchecked: Boolean(range) && !runningDsh }
}

/**
 * Stage the target in a temp directory, verify it, then update the profile dependency.
 * The profile is not modified until verification passes. A failed profile install
 * writes the previous package.json, lockfile, and cordis.patch.yml back.
 * This never removes a dependency.
 */
export async function applyUpdate(options, io) {
  const { profileDir, name, targetSpec, resolvedSpec, runningDsh = null } = options
  try {
    assertSafeSpec(targetSpec)
    assertSafeSpec(resolvedSpec)
  } catch (error) {
    return failure('verify', error.message, false)
  }
  if (!isPackageName(name)) return failure('verify', '包名无效', false)

  const stage = await io.makeTempDir()
  try {
    await io.writeFile(path.join(stage, 'package.json'), `${JSON.stringify({
      private: true,
      dependencies: { [name]: targetSpec },
    }, null, 2)}\n`)
    const npmrc = path.join(profileDir, '.npmrc')
    if (await io.exists(npmrc)) await io.copyFile(npmrc, path.join(stage, '.npmrc'))

    const fileNames = await io.listDir(profileDir)
    const manager = packageManagerFor(fileNames)
    const staged = await run(io, manager.command, manager.stageArgs(stage), stage)
    if (staged.code !== 0) {
      return failure('stage', '临时安装失败，已安装的插件没有改动', false, tail(staged.stderr || staged.stdout))
    }

    const root = path.join(stage, 'node_modules', ...name.split('/'))
    let pkg
    try {
      pkg = JSON.parse(await io.readFile(path.join(root, 'package.json')))
    } catch {
      return failure('verify', '临时安装里没有这个包', false)
    }
    const verified = await verifyStagedPackage(pkg, {
      name,
      runningDsh,
      fileExists: (relative) => io.exists(path.join(root, relative)),
    })
    if (!verified.ok) return failure('verify', verified.message, false)

    const snapshot = await readSnapshotFrom(profileDir, io)
    const packageJson = snapshot.find(item => item.file === 'package.json')
    if (!packageJson || !packageJson.existed) return failure('verify', 'profile 没有 package.json', false)
    let next
    try {
      next = replaceDependency(JSON.parse(packageJson.content), name, resolvedSpec)
    } catch (error) {
      return failure('verify', error.message, false)
    }

    await io.writeFile(path.join(profileDir, 'package.json'), `${JSON.stringify(next, null, 2)}\n`)
    const installed = await run(io, manager.command, manager.installArgs(profileDir), profileDir)
    if (installed.code !== 0) {
      await restoreSnapshot(profileDir, snapshot, io)
      const repair = await run(io, manager.command, manager.repairArgs(profileDir, snapshot), profileDir)
      return {
        ...failure(
          'install',
          repair.code === 0 ? '安装失败，已恢复原来的插件' : '安装失败，自动恢复也失败了。备份还在，不要再卸载。',
          repair.code === 0,
          tail(installed.stderr || installed.stdout),
        ),
        touchedProfile: true,
        snapshot,
      }
    }
    await restorePatchIfChanged(profileDir, snapshot, io)
    return {
      ok: true,
      phase: 'done',
      rolledBack: false,
      touchedProfile: true,
      version: verified.version,
      previousSpec: JSON.parse(packageJson.content).dependencies[name],
      spec: resolvedSpec,
      engineUnchecked: verified.engineUnchecked === true,
      restart: true,
      snapshot,
      message: '已换成新版本。重启 dsh 后新代码才会加载。',
    }
  } finally {
    await io.removeDir(stage).catch(() => {})
  }
}

export async function restoreSnapshot(profileDir, snapshot, io) {
  for (const item of snapshot) {
    const full = path.join(profileDir, item.file)
    if (item.existed) await io.writeFile(full, item.content)
    else if (await io.exists(full)) await io.removeFile(full)
  }
}

export async function writeSnapshot(io, dir, snapshot) {
  const absent = snapshot.filter(item => !item.existed).map(item => item.file)
  await io.writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify({ absent })}\n`)
  for (const item of snapshot) {
    if (!item.existed) continue
    await io.writeFile(path.join(dir, item.file), item.content)
  }
}

export async function readSnapshot(io, dir) {
  const manifest = JSON.parse(await io.readFile(path.join(dir, 'manifest.json')))
  const absent = new Set(manifest.absent ?? [])
  const snapshot = []
  for (const file of PROFILE_FILES) {
    if (absent.has(file)) snapshot.push({ file, existed: false, content: null })
    else snapshot.push({ file, existed: true, content: await io.readFile(path.join(dir, file)) })
  }
  return snapshot
}

async function readSnapshotFrom(profileDir, io) {
  const snapshot = []
  for (const file of PROFILE_FILES) {
    const full = path.join(profileDir, file)
    if (await io.exists(full)) snapshot.push({ file, existed: true, content: await io.readFile(full) })
    else snapshot.push({ file, existed: false, content: null })
  }
  return snapshot
}

async function restorePatchIfChanged(profileDir, snapshot, io) {
  const patch = snapshot.find(item => item.file === 'cordis.patch.yml')
  if (!patch) return
  const full = path.join(profileDir, patch.file)
  if (patch.existed) {
    const now = await io.exists(full) ? await io.readFile(full) : null
    if (now !== patch.content) await io.writeFile(full, patch.content)
    return
  }
  if (await io.exists(full)) await io.removeFile(full)
}

async function run(io, command, args, cwd) {
  if (args.some(arg => REMOVAL_ARGS.has(arg))) throw new Error('更新不会卸载插件')
  return io.spawn(command, args, { cwd })
}

function failure(phase, message, rolledBack, detail = '') {
  return {
    ok: false,
    phase,
    rolledBack,
    touchedProfile: false,
    message,
    detail,
    restart: false,
  }
}

function tail(text) {
  if (!text) return ''
  return String(text).trim().split('\n').slice(-8).join('\n').slice(0, 2000)
}

function safeRelative(file) {
  if (typeof file !== 'string' || file === '') return null
  const relative = file.replace(/^\.\//, '')
  if (relative === '' || relative.split('/').includes('..') || path.isAbsolute(relative)) return null
  return relative
}

function pnpmManager() {
  return {
    id: 'pnpm',
    command: 'pnpm',
    stageArgs: (dir) => ['install', '--dir', dir, '--ignore-scripts'],
    installArgs: (dir) => ['install', '--dir', dir],
    repairArgs: (dir, snapshot) => {
      const args = ['install', '--dir', dir]
      const lock = snapshot.find(item => item.file === 'pnpm-lock.yaml')
      if (lock && lock.existed) args.push('--frozen-lockfile')
      return args
    },
  }
}

function npmManager() {
  return {
    id: 'npm',
    command: 'npm',
    stageArgs: (dir) => ['install', '--prefix', dir, '--ignore-scripts', '--no-fund', '--no-audit'],
    installArgs: (dir) => ['install', '--prefix', dir, '--no-fund', '--no-audit'],
    repairArgs: (dir, snapshot) => {
      const lock = snapshot.find(item => item.file === 'package-lock.json')
      if (lock && lock.existed) return ['ci', '--prefix', dir, '--no-fund', '--no-audit']
      return ['install', '--prefix', dir, '--no-fund', '--no-audit']
    },
  }
}
