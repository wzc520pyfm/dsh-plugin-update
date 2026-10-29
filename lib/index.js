import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleRequest, readJsonBody } from './http.js'
import { createNodeIo } from './node-io.js'
import { findProfileDir, stateFileFor } from './profile.js'
import { createService } from './service.js'

export const name = 'dsh-plugin-update'
export const inject = ['webServer']

const ROUTE_OPS = ['check', 'apply', 'snooze', 'unsnooze', 'rollback']

export function apply(ctx) {
  const webServer = ctx.webServer ?? ctx.get?.('webServer')
  if (!webServer || typeof webServer.register !== 'function') return
  const profileDir = findProfileDir({
    start: path.dirname(fileURLToPath(import.meta.url)),
    env: process.env,
    readJson: (file) => {
      try {
        return JSON.parse(readFileSync(file, 'utf8'))
      } catch {
        return null
      }
    },
  })
  const service = createService({
    profileDir,
    io: createNodeIo(),
    fetch: globalThis.fetch,
    stateFile: profileDir ? stateFileFor(profileDir) : null,
  })
  const routes = ROUTE_OPS.map(op => ({
    kind: 'exact',
    path: `/dsh-plugin-update/${op}`,
    handler: (req, res) => { void dispatch(req, res, service) },
  }))
  const registerAll = () => {
    const stops = routes.map(route => webServer.register(route))
    return () => {
      for (const stop of stops) if (typeof stop === 'function') stop()
    }
  }
  if (typeof ctx.effect === 'function') ctx.effect(registerAll, 'dsh-plugin-update: routes')
  else registerAll()
}

async function dispatch(req, res, service) {
  try {
    const body = await readJsonBody(req)
    if (body === undefined) {
      writeJson(res, 400, { ok: false, message: '请求体必须是 JSON' })
      return
    }
    const result = await handleRequest({
      method: req.method,
      url: req.url,
      headers: req.headers ?? {},
      remote: req.socket?.remoteAddress ?? '',
      body,
      service,
    })
    writeJson(res, result.status, result.body)
  } catch (error) {
    writeJson(res, 500, { ok: false, message: error instanceof Error ? error.message : '检查或更新失败' })
  }
}

function writeJson(res, status, value) {
  const payload = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}
