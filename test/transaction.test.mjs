import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createMemoryIo } from './helpers.mjs'
import { applyUpdate, packageManagerFor, replaceDependency } from '../lib/transaction.js'

const profile = '/profile'
const originalJson = `${JSON.stringify({
  name: 'web',
  dependencies: { foo: '^1.0.0', bar: '1.0.0' },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'foo'] } },
}, null, 2)}\n`
const originalPatch = 'id: keep-me\n'
const originalLock = 'lock: v1\n'

function seed(io) {
  io.files.set(path.join(profile, 'package.json'), originalJson)
  io.files.set(path.join(profile, 'cordis.patch.yml'), originalPatch)
  io.files.set(path.join(profile, 'pnpm-lock.yaml'), originalLock)
}

function callsOf(io) {
  return io.calls
}

function installFoo(version, { name = 'foo', engines, patch = '- insert:\n', failProfile = false, mutatePatch = false, failStage = false } = {}) {
  const calls = []
  let profileInstalls = 0
  const io = createMemoryIo(async (command, args, { cwd }, api) => {
    calls.push({ command, args, cwd })
    if (args.some(arg => ['remove', 'uninstall'].includes(arg))) return { code: 99, stdout: '', stderr: 'removed' }
    if (String(cwd).includes('/tmp/stage')) {
      if (failStage) return { code: 1, stdout: '', stderr: 'stage failed' }
      const root = path.join(cwd, 'node_modules', 'foo')
      api.files.set(path.join(root, 'package.json'), JSON.stringify({
        name,
        version,
        engines,
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      if (patch !== null) api.files.set(path.join(root, 'cordis.patch.yml'), patch)
      return { code: 0, stdout: '', stderr: '' }
    }
    profileInstalls += 1
    if (mutatePatch && profileInstalls === 1) api.files.set(path.join(profile, 'cordis.patch.yml'), 'mutated\n')
    if (failProfile && profileInstalls === 1) return { code: 1, stdout: '', stderr: 'profile install failed' }
    return { code: 0, stdout: '', stderr: '' }
  })
  io.calls = calls
  seed(io)
  return io
}

test('replaceDependency changes one spec and keeps the bundle list', () => {
  const next = replaceDependency(JSON.parse(originalJson), 'foo', '1.2.0')
  assert.equal(next.dependencies.foo, '1.2.0')
  assert.equal(next.dependencies.bar, '1.0.0')
  assert.deepEqual(next.dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'foo'])
})

test('a failed temp install does not change the profile', async () => {
  const io = installFoo('1.2.0', { failStage: true })
  const result = await applyUpdate({
    profileDir: profile,
    name: 'foo',
    targetSpec: '1.2.0',
    resolvedSpec: '1.2.0',
    runningDsh: '0.2.0',
  }, io)
  assert.equal(result.ok, false)
  assert.equal(result.phase, 'stage')
  assert.equal(result.touchedProfile, false)
  assert.equal(io.files.get(path.join(profile, 'package.json')), originalJson)
  assert.equal(callsOf(io).some(call => call.args.includes('remove')), false)
})

test('a package that fails verification never rewrites the profile', async () => {
  const io = installFoo('9.0.0', { engines: { dsh: '>=9.0.0' } })
  const result = await applyUpdate({
    profileDir: profile,
    name: 'foo',
    targetSpec: '9.0.0',
    resolvedSpec: '9.0.0',
    runningDsh: '0.2.0',
  }, io)
  assert.equal(result.ok, false)
  assert.match(result.message, /要求 DSH/)
  assert.equal(io.files.get(path.join(profile, 'package.json')), originalJson)
  assert.equal(callsOf(io).some(call => call.cwd === profile), false)
})

test('a missing declared patch file aborts before the profile changes', async () => {
  const io = installFoo('1.2.0', { patch: null })
  const result = await applyUpdate({
    profileDir: profile,
    name: 'foo',
    targetSpec: '1.2.0',
    resolvedSpec: '1.2.0',
  }, io)
  assert.equal(result.ok, false)
  assert.match(result.message, /补丁/)
  assert.equal(io.files.get(path.join(profile, 'package.json')), originalJson)
})

test('a successful swap keeps the patch and does not uninstall', async () => {
  const io = installFoo('1.2.0', { engines: { dsh: '>=0.1.0' }, mutatePatch: true })
  const result = await applyUpdate({
    profileDir: profile,
    name: 'foo',
    targetSpec: '1.2.0',
    resolvedSpec: '1.2.0',
    runningDsh: '0.2.1',
  }, io)
  assert.equal(result.ok, true)
  assert.equal(result.restart, true)
  const written = JSON.parse(io.files.get(path.join(profile, 'package.json')))
  assert.equal(written.dependencies.foo, '1.2.0')
  assert.equal(written.dependencies.bar, '1.0.0')
  assert.deepEqual(written.dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'foo'])
  assert.equal(io.files.get(path.join(profile, 'cordis.patch.yml')), originalPatch)
  assert.equal(callsOf(io).some(call => call.args.includes('remove') || call.args.includes('uninstall')), false)
  assert.ok(callsOf(io).some(call => call.command === 'pnpm' && call.args.includes('--ignore-scripts')))
})

test('a failed profile install restores the previous files', async () => {
  const io = installFoo('1.2.0', { failProfile: true })
  const result = await applyUpdate({
    profileDir: profile,
    name: 'foo',
    targetSpec: '1.2.0',
    resolvedSpec: '1.2.0',
  }, io)
  assert.equal(result.ok, false)
  assert.equal(result.phase, 'install')
  assert.equal(result.rolledBack, true)
  assert.equal(io.files.get(path.join(profile, 'package.json')), originalJson)
  assert.equal(io.files.get(path.join(profile, 'pnpm-lock.yaml')), originalLock)
  assert.equal(io.files.get(path.join(profile, 'cordis.patch.yml')), originalPatch)
  assert.ok(callsOf(io).some(call => call.args.includes('--frozen-lockfile')))
})

test('npm lockfiles select npm and repair with ci', () => {
  const manager = packageManagerFor(['package.json', 'package-lock.json'])
  assert.equal(manager.command, 'npm')
  assert.deepEqual(manager.repairArgs('/profile', [{ file: 'package-lock.json', existed: true }]), ['ci', '--prefix', '/profile', '--no-fund', '--no-audit'])
})
