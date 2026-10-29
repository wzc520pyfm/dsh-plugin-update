import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest, isLoopback } from '../lib/http.js'

const service = {
  async check() {
    return { ok: true, updates: [] }
  },
  async apply(body) {
    return { status: 200, body: { ok: true, echo: body.name } }
  },
}

test('writes are loopback POST json only', async () => {
  assert.equal(isLoopback('::ffff:127.0.0.1'), true)
  const remote = await handleRequest({
    method: 'POST',
    url: '/dsh-plugin-update/check',
    headers: { 'content-type': 'application/json' },
    remote: '10.1.1.1',
    body: {},
    service,
  })
  assert.equal(remote.status, 403)
  const get = await handleRequest({
    method: 'GET',
    url: '/dsh-plugin-update/check',
    headers: { 'content-type': 'application/json' },
    remote: '127.0.0.1',
    body: {},
    service,
  })
  assert.equal(get.status, 405)
  const text = await handleRequest({
    method: 'POST',
    url: '/dsh-plugin-update/apply',
    headers: { 'content-type': 'text/plain' },
    remote: '127.0.0.1',
    body: {},
    service,
  })
  assert.equal(text.status, 415)
  const ok = await handleRequest({
    method: 'POST',
    url: '/dsh-plugin-update/apply',
    headers: { 'content-type': 'application/json' },
    remote: '::1',
    body: { name: 'foo', confirm: true },
    service,
  })
  assert.equal(ok.body.echo, 'foo')
})
