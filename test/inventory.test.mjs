import assert from 'node:assert/strict'
import test from 'node:test'
import { listInstalled } from '../lib/inventory.js'

test('inventory skips in-box packages and reads the installed manifest', () => {
  const items = listInstalled({
    selfName: 'dsh-plugin-update',
    packageJson: {
      dependencies: {
        '@deepseek-ai/dsh-base': '0.2.0',
        foo: '^1.0.0',
        'dsh-plugin-update': '0.1.0',
        local: 'link:/tmp/local',
        weird: { version: '1' },
      },
    },
    installed: {
      foo: { version: '1.0.1', dsh: { bundle: { patch: './cordis.patch.yml' } }, repository: { url: 'git+https://github.com/acme/foo.git' } },
      'dsh-plugin-update': { version: '0.1.0', gitHead: 'abc' },
      local: { version: '0.0.1' },
    },
  })
  assert.deepEqual(items.map(item => item.name), ['dsh-plugin-update', 'foo', 'local'])
  const foo = items.find(item => item.name === 'foo')
  assert.equal(foo.version, '1.0.1')
  assert.equal(foo.bundle, true)
  assert.equal(foo.repository, 'git+https://github.com/acme/foo.git')
  assert.equal(foo.source, 'npm')
  assert.equal(items.find(item => item.name === 'dsh-plugin-update').self, true)
  assert.equal(items.find(item => item.name === 'local').pinned, true)
})
