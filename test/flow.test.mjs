import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createMemoryIo } from './helpers.mjs'
import { createService } from '../lib/service.js'
import { stateFileFor } from '../lib/profile.js'

const profile = path.join('/home/u/.dsh/profiles/web')

function setup({ failSecond = false } = {}) {
  const calls = []
  const io = createMemoryIo(async (command, args, { cwd }, api) => {
    calls.push({ command, args: [...args], cwd })
    assert.equal(args.includes('remove') || args.includes('uninstall'), false)
    if (String(cwd).includes(`${path.sep}tmp${path.sep}stage`) || String(cwd).startsWith('/tmp/stage')) {
      const spec = JSON.parse(api.files.get(path.join(cwd, 'package.json')))
      const name = Object.keys(spec.dependencies)[0]
      const version = spec.dependencies[name]
      if (failSecond && name === 'foo') return { code: 1, stdout: '', stderr: 'foo stage failed' }
      const root = path.join(cwd, 'node_modules', ...name.split('/'))
      api.files.set(path.join(root, 'package.json'), JSON.stringify({
        name,
        version,
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      api.files.set(path.join(root, 'cordis.patch.yml'), '- insert:\n')
      return { code: 0, stdout: '', stderr: '' }
    }
    return { code: 0, stdout: '', stderr: '' }
  })
  const original = {
    name: 'web',
    dependencies: { foo: '^1.0.0', bar: '^2.0.0', '@deepseek-ai/dsh-base': '0.2.0' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'foo', 'bar'] } },
  }
  io.files.set(path.join(profile, 'package.json'), `${JSON.stringify(original, null, 2)}\n`)
  io.files.set(path.join(profile, 'pnpm-lock.yaml'), 'lock\n')
  io.files.set(path.join(profile, 'cordis.patch.yml'), 'disabled: false\n')
  io.files.set(path.join(profile, 'node_modules', 'foo', 'package.json'), JSON.stringify({ name: 'foo', version: '1.0.0' }))
  io.files.set(path.join(profile, 'node_modules', 'bar', 'package.json'), JSON.stringify({ name: 'bar', version: '2.0.0' }))
  io.files.set(path.join(profile, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), JSON.stringify({ version: '0.2.0' }))
  const fetch = async (url) => {
    const name = String(url).split('/').pop()
    const version = name === 'bar' ? '2.1.0' : '1.2.0'
    return { ok: true, status: 200, json: async () => ({ 'dist-tags': { latest: version } }) }
  }
  const service = createService({ profileDir: profile, io, fetch, stateFile: stateFileFor(profile) })
  return { io, service, calls, original }
}

test('check, update, and rollback round-trip one installed plugin', async () => {
  const { io, service } = setup()
  const report = await service.check()
  assert.deepEqual(report.updates.map(row => row.name), ['bar', 'foo'])
  assert.equal(report.updates.find(row => row.name === 'foo').notes, null)

  const applied = await service.apply({ name: 'foo', confirm: true })
  assert.equal(applied.status, 200)
  const again = await service.check()
  assert.ok(again.rollbackable.includes('foo'))
  const after = JSON.parse(io.files.get(path.join(profile, 'package.json')))
  assert.equal(after.dependencies.foo, '1.2.0')
  assert.equal(after.dependencies.bar, '^2.0.0')
  assert.deepEqual(after.dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'foo', 'bar'])
  assert.equal(io.files.get(path.join(profile, 'cordis.patch.yml')), 'disabled: false\n')

  const rolled = await service.rollback({ name: 'foo', confirm: true })
  assert.equal(rolled.status, 200)
  const restored = JSON.parse(io.files.get(path.join(profile, 'package.json')))
  assert.equal(restored.dependencies.foo, '^1.0.0')
})

test('bulk update stops when a later stage fails', async () => {
  const { io, service } = setup({ failSecond: true })
  const applied = await service.apply({ all: true, confirm: true })
  assert.equal(applied.status, 500)
  assert.equal(applied.body.results[0].ok, true)
  assert.equal(applied.body.results[1].ok, false)
  const after = JSON.parse(io.files.get(path.join(profile, 'package.json')))
  assert.equal(after.dependencies.bar, '2.1.0')
  assert.equal(after.dependencies.foo, '^1.0.0')
})

test('snooze hides one target until a newer version exists', async () => {
  const { service } = setup()
  const snoozed = await service.snooze({ name: 'foo', version: '1.2.0' })
  assert.equal(snoozed.status, 200)
  const hidden = await service.check()
  assert.equal(hidden.updates.some(row => row.name === 'foo'), false)
  assert.equal(hidden.snoozed.some(row => row.name === 'foo'), true)
  await service.unsnooze({ name: 'foo' })
  const shown = await service.check()
  assert.equal(shown.updates.some(row => row.name === 'foo'), true)
})

test('apply without confirm does nothing', async () => {
  const { io, service } = setup()
  const applied = await service.apply({ name: 'foo' })
  assert.equal(applied.status, 400)
  assert.match(io.files.get(path.join(profile, 'package.json')), /\^1\.0\.0/)
})
