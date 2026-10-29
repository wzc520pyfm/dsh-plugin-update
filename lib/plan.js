import { isNewer } from './semver.js'

/**
 * Turn an inventory plus remote lookups into rows the panel can act on.
 * Snooze hides one exact target (a version or a commit), not the plugin forever.
 */
export function planUpdates({ installed, remotes = {}, snooze = {} }) {
  const updates = []
  const current = []
  const pinned = []
  const uncertain = []
  const snoozed = []
  const errors = []

  for (const item of installed) {
    if (item.pinned) {
      pinned.push({ name: item.name, spec: item.spec, reason: item.pinReason, self: item.self })
      continue
    }
    const remote = remotes[item.name]
    if (!remote) {
      errors.push({ name: item.name, message: '没有检查结果' })
      continue
    }
    if (remote.error) {
      if (item.source === 'git') {
        uncertain.push({
          name: item.name,
          spec: item.spec,
          self: item.self,
          channel: 'git',
          target: null,
          targetSpec: item.spec,
          resolvedSpec: item.spec,
          notes: null,
          reason: remote.error,
        })
      } else {
        errors.push({ name: item.name, message: remote.error })
      }
      continue
    }
    if (item.source === 'git') {
      classifyGit(item, remote, snooze, { updates, current, uncertain, snoozed })
      continue
    }
    if (!item.version || !remote.version) {
      errors.push({ name: item.name, message: '缺少版本号，不能比较' })
      continue
    }
    if (!isNewer(remote.version, item.version, { allowPrerelease: true })) {
      current.push({ name: item.name, version: item.version, spec: item.spec, self: item.self })
      continue
    }
    const row = npmRow(item, remote)
    if (snooze[item.name] === remote.version) snoozed.push(row)
    else updates.push(row)
  }

  return { updates, current, pinned, uncertain, snoozed, errors }
}

function classifyGit(item, remote, snooze, buckets) {
  const sha = typeof remote.sha === 'string' ? remote.sha : null
  if (item.gitHead && sha && item.gitHead === sha) {
    buckets.current.push({ name: item.name, version: item.version, spec: item.spec, self: item.self })
    return
  }
  if (item.gitHead && sha) {
    const row = gitRow(item, sha, remote.notes)
    if (snooze[item.name] === sha) buckets.snoozed.push(row)
    else buckets.updates.push(row)
    return
  }
  buckets.uncertain.push({
    name: item.name,
    spec: item.spec,
    self: item.self,
    channel: 'git',
    target: sha ? sha.slice(0, 7) : null,
    targetSpec: item.spec,
    resolvedSpec: item.spec,
    notes: remote.notes ?? null,
    reason: sha
      ? '已安装的包没有记录提交号。可以安装远端当前版本，装坏会退回现在这份。'
      : '没有读到已安装提交或远端提交。可以安装远端当前版本，装坏会退回现在这份。',
  })
}

function npmRow(item, remote) {
  return {
    name: item.name,
    spec: item.spec,
    self: item.self,
    channel: 'npm',
    from: item.version,
    target: remote.version,
    targetSpec: remote.version,
    resolvedSpec: remote.version,
    snoozeKey: remote.version,
    notes: remote.notes ?? null,
  }
}

function gitRow(item, sha, notes) {
  return {
    name: item.name,
    spec: item.spec,
    self: item.self,
    channel: 'git',
    from: item.gitHead.slice(0, 7),
    target: sha.slice(0, 7),
    targetSpec: item.spec,
    resolvedSpec: item.spec,
    snoozeKey: sha,
    notes: notes ?? null,
    sha,
  }
}
