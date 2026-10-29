import assert from 'node:assert/strict'
import test from 'node:test'
import { collectRemote, githubRepoFromUrl, npmPackageUrl, readRegistry } from '../lib/registry.js'

test('registry url keeps a scoped name in the path npm expects', () => {
  assert.equal(npmPackageUrl('https://registry.npmjs.org/', '@scope/name'), 'https://registry.npmjs.org/@scope%2fname')
  assert.equal(readRegistry('# comment\nregistry=https://registry.npmmirror.com/\n'), 'https://registry.npmmirror.com')
  assert.equal(readRegistry('registry=ftp://nope'), 'https://registry.npmjs.org')
})

test('npm lookup uses the requested dist-tag and release notes', async () => {
  const seen = []
  const fetch = async (url) => {
    seen.push(url)
    if (String(url).includes('releases/tags')) {
      return { ok: true, status: 200, json: async () => ({ body: '第一行\n第二行' }) }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ 'dist-tags': { latest: '1.2.0', next: '2.0.0-rc.1' } }),
    }
  }
  const item = {
    name: 'foo',
    source: 'npm',
    pinned: false,
    distTag: 'latest',
    repository: 'git+https://github.com/acme/foo.git',
  }
  const remote = await collectRemote(item, { fetch, registry: 'https://registry.npmjs.org' })
  assert.equal(remote.version, '1.2.0')
  assert.equal(remote.notes, '第一行\n第二行')
  assert.equal(githubRepoFromUrl(item.repository).repo, 'foo')
  assert.ok(seen[0].endsWith('/foo'))
})

test('a registry failure is an error on that plugin only', async () => {
  const remote = await collectRemote(
    { name: 'foo', source: 'npm', pinned: false, distTag: 'latest' },
    { fetch: async () => { throw new Error('offline') }, registry: 'https://registry.npmjs.org' },
  )
  assert.equal(remote.error, '注册表连不上')
})

test('github lookup reads the commit sha', async () => {
  const remote = await collectRemote({
    name: 'foo',
    source: 'git',
    pinned: false,
    git: { host: 'github', owner: 'acme', repo: 'foo', ref: 'main' },
  }, {
    fetch: async (url) => {
      assert.match(url, /commits\/main$/)
      return { ok: true, status: 200, json: async () => ({ sha: 'abc123' }) }
    },
    registry: 'https://registry.npmjs.org',
  })
  assert.equal(remote.sha, 'abc123')
})
