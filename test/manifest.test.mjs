import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apply, inject, name } from '../lib/index.js'

test('the package is a dual-face bundle whose client id is the package name', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const host = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.equal(pkg.name, '@wzc520pyfm/dsh-plugin-update')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.match(client, /id:\s*"@wzc520pyfm\/dsh-plugin-update"/)
  assert.match(client, /plugins\.bundle\.config/)
  assert.match(client, /key:\s*"@wzc520pyfm\/dsh-plugin-update"/)
  assert.match(client, /settings\.section/)
  assert.match(patch, /name:\s*'@wzc520pyfm\/dsh-plugin-update'/)
  assert.doesNotMatch(host, /export default/)
  assert.equal(name, 'dsh-plugin-update')
  assert.deepEqual(inject, ['webServer'])
})

test('the host registers the five loopback routes', () => {
  const paths = []
  apply({
    webServer: {
      register(route) {
        paths.push(route.path)
        return () => {}
      },
    },
    effect(fn) { return fn() },
  })
  assert.deepEqual(paths, [
    '/dsh-plugin-update/check',
    '/dsh-plugin-update/apply',
    '/dsh-plugin-update/snooze',
    '/dsh-plugin-update/unsnooze',
    '/dsh-plugin-update/rollback',
  ])
})
