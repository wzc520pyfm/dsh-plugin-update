import path from 'node:path'

/**
 * A profile directory is the one whose package.json declares dsh.profile.
 * Walk up from the installed plugin so pnpm's .pnpm store path still finds it.
 */
export function findProfileDir({ start, env = {}, readJson }) {
  if (typeof env.DSH_PROFILE_DIR === 'string' && env.DSH_PROFILE_DIR !== '') {
    const directed = profileAt(env.DSH_PROFILE_DIR, readJson)
    if (directed) return directed
  }
  let dir = start
  for (let hop = 0; hop < 16 && dir; hop += 1) {
    const found = profileAt(dir, readJson)
    if (found) return found
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  if (typeof env.DSH_HOME === 'string' && typeof env.DSH_PROFILE === 'string') {
    return profileAt(path.join(env.DSH_HOME, 'profiles', env.DSH_PROFILE), readJson)
  }
  return null
}

export function stateFileFor(profileDir) {
  const parent = path.dirname(profileDir)
  if (path.basename(parent) === 'profiles') return path.join(path.dirname(parent), 'plugin-update', 'state.json')
  return path.join(profileDir, '.dsh-plugin-update', 'state.json')
}

function profileAt(dir, readJson) {
  if (!dir) return null
  try {
    const pkg = readJson(path.join(dir, 'package.json'))
    if (pkg && pkg.dsh && pkg.dsh.profile) return dir
  } catch {
    return null
  }
  return null
}
