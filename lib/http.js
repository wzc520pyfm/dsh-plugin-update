const ROUTES = new Set(['check', 'apply', 'snooze', 'unsnooze', 'rollback'])

export function isLoopback(remote) {
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
}

export async function handleRequest({ method, url, headers, remote, body, service }) {
  if (!isLoopback(remote)) {
    return { status: 403, body: { ok: false, error: 'forbidden', message: '仅允许本机回环请求' } }
  }
  if (method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'method', message: '仅支持 POST' } }
  }
  const contentType = String(headers['content-type'] ?? headers['Content-Type'] ?? '')
  if (!contentType.toLowerCase().includes('application/json')) {
    return { status: 415, body: { ok: false, error: 'unsupported-media-type', message: 'Content-Type 必须为 application/json' } }
  }
  const op = String(url ?? '').split('?')[0].replace(/\/$/, '').split('/').filter(Boolean).pop()
  if (!ROUTES.has(op)) return { status: 404, body: { ok: false, message: '没有这个操作' } }
  if (op === 'check') {
    const report = await service.check()
    return { status: report.ok ? 200 : 503, body: report }
  }
  return service[op](body && typeof body === 'object' ? body : {})
}

export async function readJsonBody(req, maxBytes = 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) return undefined
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}
