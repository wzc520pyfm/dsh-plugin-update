import { classifySpec, isPackageName } from './spec.js'

/**
 * Direct dependencies of one profile, minus in-box @deepseek-ai packages.
 * Installed metadata comes from each package's own package.json.
 */
export function listInstalled({ packageJson, installed = {}, selfName }) {
  const dependencies = packageJson && typeof packageJson.dependencies === 'object' && packageJson.dependencies
    ? packageJson.dependencies
    : {}
  const items = []
  for (const [name, spec] of Object.entries(dependencies)) {
    if (!isPackageName(name) || name.startsWith('@deepseek-ai/')) continue
    if (typeof spec !== 'string') continue
    const source = classifySpec(spec)
    const meta = installed[name] && typeof installed[name] === 'object' ? installed[name] : {}
    items.push({
      name,
      spec,
      version: typeof meta.version === 'string' ? meta.version : null,
      gitHead: typeof meta.gitHead === 'string' ? meta.gitHead : null,
      repository: repositoryUrl(meta.repository),
      bundle: Boolean(meta.dsh && meta.dsh.bundle),
      self: name === selfName,
      source: source.kind,
      pinned: source.pinned === true,
      pinReason: source.reason ?? null,
      distTag: source.distTag ?? null,
      git: source.kind === 'git'
        ? { host: source.host ?? null, owner: source.owner ?? null, repo: source.repo ?? null, ref: source.ref ?? null }
        : null,
    })
  }
  items.sort((left, right) => left.name.localeCompare(right.name))
  return items
}

function repositoryUrl(repository) {
  if (!repository) return null
  const url = typeof repository === 'string' ? repository : repository.url
  return typeof url === 'string' ? url : null
}
