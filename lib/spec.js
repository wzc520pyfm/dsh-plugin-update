const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

export function isPackageName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 214 && PACKAGE_NAME.test(name)
}

export function assertSafeSpec(spec) {
  if (typeof spec !== 'string' || spec.length === 0 || spec.length > 500) {
    throw new Error('安装来源无效')
  }
  if (/[\0\r\n]/.test(spec)) throw new Error('安装来源无效')
}

/**
 * Classify the spec already written in the profile's package.json.
 * file/link/tarball specs stay pinned: they have no newer version to discover.
 */
export function classifySpec(spec) {
  if (typeof spec !== 'string') {
    return { kind: 'unknown', spec: '', pinned: true, reason: '认不出的安装来源' }
  }
  const trimmed = spec.trim()
  if (trimmed === '' || trimmed === '*' || trimmed === 'latest') {
    return { kind: 'npm', spec: trimmed || 'latest', pinned: false, distTag: 'latest' }
  }
  if (trimmed.startsWith('npm:')) {
    return { kind: 'alias', spec: trimmed, pinned: true, reason: '别名安装不自动换源' }
  }
  if (/^(file:|link:|workspace:|portal:)/.test(trimmed)) {
    return { kind: 'local', spec: trimmed, pinned: true, reason: '本地目录由你自己更新' }
  }
  if (/^https?:\/\/.+\.(?:tgz|tar\.gz)(?:\?.*)?$/i.test(trimmed) || trimmed.startsWith('https://codeload.github.com/')) {
    return { kind: 'tarball', spec: trimmed, pinned: true, reason: '压缩包地址不会自己变成新版本' }
  }
  const git = parseGit(trimmed)
  if (git) return { kind: 'git', spec: trimmed, pinned: false, ...git }
  if (/^[\^~>=<]/.test(trimmed) || /^\d+\.\d+\.\d+/.test(trimmed)) {
    return { kind: 'npm', spec: trimmed, pinned: false, distTag: 'latest' }
  }
  if (/^[A-Za-z][\w.-]*$/.test(trimmed)) {
    return { kind: 'npm', spec: trimmed, pinned: false, distTag: trimmed }
  }
  return { kind: 'unknown', spec: trimmed, pinned: true, reason: '认不出的安装来源' }
}

function parseGit(spec) {
  let body = spec
  if (body.startsWith('git+')) body = body.slice(4)
  let match = body.match(/^github:([^/#\s]+)\/([^#\s]+?)(?:\.git)?(?:#([^\s]+))?$/)
  if (match) return gitHub(match[1], match[2], match[3])
  match = body.match(/^(?:https?|git):\/\/github\.com\/([^/#\s]+)\/([^/#\s]+?)(?:\.git)?(?:#([^\s]+))?\/?$/)
  if (match) return gitHub(match[1], match[2], match[3])
  match = body.match(/^ssh:\/\/git@github\.com\/([^/#\s]+)\/([^/#\s]+?)(?:\.git)?(?:#([^\s]+))?$/)
  if (match) return gitHub(match[1], match[2], match[3])
  match = body.match(/^git@github\.com:([^/#\s]+)\/([^/#\s]+?)(?:\.git)?(?:#([^\s]+))?$/)
  if (match) return gitHub(match[1], match[2], match[3])
  if (/^(?:git\+|git:|ssh:|git@)/.test(spec)) {
    return { host: 'git', owner: null, repo: null, ref: 'HEAD' }
  }
  return null
}

function gitHub(owner, repo, ref) {
  return {
    host: 'github',
    owner,
    repo: repo.replace(/\.git$/, ''),
    ref: ref || 'HEAD',
  }
}
