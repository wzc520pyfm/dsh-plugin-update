const USER_AGENT = 'dsh-plugin-update'

export function readRegistry(npmrc) {
  if (typeof npmrc !== 'string') return 'https://registry.npmjs.org'
  for (const line of npmrc.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) continue
    if (!trimmed.startsWith('registry=')) continue
    const value = trimmed.slice('registry='.length).trim().replace(/\/$/, '')
    if (/^https?:\/\//.test(value)) return value
  }
  return 'https://registry.npmjs.org'
}

export function npmPackageUrl(registry, name) {
  const base = String(registry).replace(/\/$/, '')
  const encoded = name.startsWith('@') ? `@${name.slice(1).replace('/', '%2f')}` : name
  return `${base}/${encoded}`
}

export function githubRepoFromUrl(url) {
  if (typeof url !== 'string') return null
  const match = url.match(/github\.com[:/]([^/\s]+)\/([^/#\s]+?)(?:\.git)?(?:[/#]|$)/)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

export async function collectRemote(item, { fetch, registry }) {
  if (!item || item.pinned) return null
  if (item.source === 'npm') return lookupNpm(item, { fetch, registry })
  if (item.source === 'git') return lookupGit(item, { fetch })
  return { error: '没有更新通道' }
}

export async function mapPool(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

async function lookupNpm(item, { fetch, registry }) {
  const tag = item.distTag || 'latest'
  try {
    const response = await fetch(npmPackageUrl(registry, item.name), {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    })
    if (!response.ok) return { error: `注册表返回 ${response.status}` }
    const body = await response.json()
    const version = body && body['dist-tags'] ? body['dist-tags'][tag] : undefined
    if (typeof version !== 'string') return { error: `注册表没有 ${tag} 版本` }
    const notes = await releaseNotes(item, version, fetch)
    return { version, notes }
  } catch {
    return { error: '注册表连不上' }
  }
}

async function lookupGit(item, { fetch }) {
  const git = item.git
  if (!git || git.host !== 'github' || !git.owner || !git.repo) {
    return { error: '这个 Git 地址不在 GitHub，不能自动比对提交' }
  }
  const ref = !git.ref || git.ref === 'HEAD' ? 'HEAD' : git.ref
  const url = `https://api.github.com/repos/${git.owner}/${git.repo}/commits/${encodeURIComponent(ref)}`
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': USER_AGENT },
    })
    if (!response.ok) return { error: `GitHub 返回 ${response.status}` }
    const body = await response.json()
    if (!body || typeof body.sha !== 'string') return { error: 'GitHub 没有返回提交号' }
    const notes = await releaseNotes(item, null, fetch, git)
    return { sha: body.sha, notes }
  } catch {
    return { error: 'GitHub 连不上' }
  }
}

async function releaseNotes(item, version, fetch, git = null) {
  const repo = git && git.owner ? git : githubRepoFromUrl(item.repository)
  if (!repo || !version) return null
  for (const tag of [`v${version}`, version]) {
    const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/tags/${encodeURIComponent(tag)}`
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': USER_AGENT },
      })
      if (!response.ok) continue
      const body = await response.json()
      if (!body || typeof body.body !== 'string' || body.body.trim() === '') continue
      return clip(body.body)
    } catch {
      return null
    }
  }
  return null
}

function clip(text) {
  const flat = text.replace(/\r\n/g, '\n').trim()
  if (flat.length <= 500) return flat
  return `${flat.slice(0, 500).trimEnd()}…`
}
