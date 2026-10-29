import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSafeSpec, classifySpec, isPackageName } from '../lib/spec.js'

test('npm ranges and dist-tags stay on the registry channel', () => {
  assert.equal(classifySpec('^1.2.3').kind, 'npm')
  assert.equal(classifySpec('^1.2.3').distTag, 'latest')
  assert.equal(classifySpec('1.2.3').kind, 'npm')
  assert.equal(classifySpec('next').distTag, 'next')
  assert.equal(classifySpec('latest').distTag, 'latest')
  assert.equal(classifySpec('*').pinned, false)
})

test('local paths and tarballs are pinned', () => {
  assert.equal(classifySpec('file:../plugin').kind, 'local')
  assert.equal(classifySpec('link:/tmp/plugin').pinned, true)
  assert.equal(classifySpec('workspace:*').kind, 'local')
  assert.equal(classifySpec('https://example.com/plugin-1.0.0.tgz').kind, 'tarball')
  assert.equal(classifySpec('npm:@other/pkg@1.0.0').kind, 'alias')
})

test('github specs keep owner, repo, and ref', () => {
  const spec = classifySpec('github:wzc520pyfm/dsh-plugin-update#main')
  assert.equal(spec.kind, 'git')
  assert.equal(spec.host, 'github')
  assert.equal(spec.owner, 'wzc520pyfm')
  assert.equal(spec.repo, 'dsh-plugin-update')
  assert.equal(spec.ref, 'main')
  const https = classifySpec('git+https://github.com/acme/plugin.git#v1.2.3')
  assert.equal(https.repo, 'plugin')
  assert.equal(https.ref, 'v1.2.3')
})

test('package names and specs reject injection', () => {
  assert.equal(isPackageName('@scope/name'), true)
  assert.equal(isPackageName('not a name'), false)
  assert.equal(isPackageName('../etc'), false)
  assert.throws(() => assertSafeSpec('1.2.3\nrm -rf /'), /无效/)
  assert.throws(() => assertSafeSpec(''), /无效/)
})
