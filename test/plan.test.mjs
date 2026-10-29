import assert from 'node:assert/strict'
import test from 'node:test'
import { planUpdates } from '../lib/plan.js'

const foo = {
  name: 'foo',
  spec: '^1.0.0',
  version: '1.0.0',
  gitHead: null,
  source: 'npm',
  pinned: false,
  self: false,
  distTag: 'latest',
  git: null,
}

test('a newer registry version is an update and the snoozed target stays hidden', () => {
  const open = planUpdates({
    installed: [foo],
    remotes: { foo: { version: '1.2.0', notes: '修复启动' } },
  })
  assert.equal(open.updates.length, 1)
  assert.equal(open.updates[0].targetSpec, '1.2.0')
  assert.equal(open.updates[0].resolvedSpec, '1.2.0')
  assert.equal(open.updates[0].notes, '修复启动')
  assert.equal(open.updates[0].snoozeKey, '1.2.0')

  const hidden = planUpdates({
    installed: [foo],
    remotes: { foo: { version: '1.2.0' } },
    snooze: { foo: '1.2.0' },
  })
  assert.equal(hidden.updates.length, 0)
  assert.equal(hidden.snoozed[0].target, '1.2.0')

  const again = planUpdates({
    installed: [foo],
    remotes: { foo: { version: '1.3.0' } },
    snooze: { foo: '1.2.0' },
  })
  assert.equal(again.updates[0].target, '1.3.0')
})

test('pinned specs and current versions are not updates', () => {
  const plan = planUpdates({
    installed: [
      { ...foo, name: 'local', spec: 'file:../local', pinned: true, pinReason: '本地目录由你自己更新', version: '1.0.0' },
      foo,
    ],
    remotes: { foo: { version: '1.0.0' } },
  })
  assert.equal(plan.updates.length, 0)
  assert.equal(plan.current[0].name, 'foo')
  assert.equal(plan.pinned[0].reason, '本地目录由你自己更新')
})

test('git commits update only when the recorded head differs', () => {
  const item = {
    ...foo,
    source: 'git',
    spec: 'github:acme/foo',
    gitHead: 'aaa',
    git: { host: 'github', owner: 'acme', repo: 'foo', ref: 'HEAD' },
  }
  const same = planUpdates({ installed: [item], remotes: { foo: { sha: 'aaa' } } })
  assert.equal(same.current.length, 1)
  const moved = planUpdates({ installed: [item], remotes: { foo: { sha: 'bbbccc' } } })
  assert.equal(moved.updates[0].resolvedSpec, 'github:acme/foo')
  assert.equal(moved.updates[0].snoozeKey, 'bbbccc')
  assert.equal(moved.updates[0].target, 'bbbccc')
})

test('git without a comparable commit stays out of the bulk list', () => {
  const item = { ...foo, source: 'git', spec: 'git+ssh://git@example.com/foo.git', gitHead: null, git: { host: 'git' } }
  const plan = planUpdates({
    installed: [item],
    remotes: { foo: { error: '这个 Git 地址不在 GitHub，不能自动比对提交' } },
  })
  assert.equal(plan.updates.length, 0)
  assert.equal(plan.uncertain[0].targetSpec, item.spec)
  assert.match(plan.uncertain[0].reason, /GitHub/)
})
