export function emptyState() {
  return { snooze: {}, backups: {} }
}

export function withSnooze(state, name, version) {
  return {
    ...normalize(state),
    snooze: { ...normalize(state).snooze, [name]: version },
  }
}

export function withoutSnooze(state, name) {
  const snooze = { ...normalize(state).snooze }
  delete snooze[name]
  return { ...normalize(state), snooze }
}

export function withBackup(state, name, backup) {
  return {
    ...normalize(state),
    backups: { ...normalize(state).backups, [name]: backup },
  }
}

export function normalize(state) {
  const source = state && typeof state === 'object' ? state : {}
  return {
    snooze: source.snooze && typeof source.snooze === 'object' ? { ...source.snooze } : {},
    backups: source.backups && typeof source.backups === 'object' ? { ...source.backups } : {},
  }
}
