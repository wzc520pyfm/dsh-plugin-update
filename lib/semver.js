/**
 * Enough semver for "is this published version newer?" and engines.dsh ranges.
 * Missing or unparsable versions never count as newer.
 */

export function parseVersion(input) {
  if (typeof input !== 'string') return null
  const raw = input.trim().replace(/^v/i, '')
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.').filter(part => part !== '') : [],
  }
}

export function compareVersions(a, b) {
  const left = typeof a === 'string' ? parseVersion(a) : a
  const right = typeof b === 'string' ? parseVersion(b) : b
  if (!left || !right) return null
  if (left.major !== right.major) return left.major < right.major ? -1 : 1
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1
  return comparePrerelease(left.prerelease, right.prerelease)
}

/**
 * A dist-tag result may itself be a prerelease; pass allowPrerelease so that
 * published tag is honored. A lower or equal version is never "newer".
 */
export function isNewer(latest, current, { allowPrerelease = false } = {}) {
  const next = parseVersion(latest)
  const installed = parseVersion(current)
  if (!next || !installed) return false
  if (next.prerelease.length > 0 && installed.prerelease.length === 0 && !allowPrerelease) return false
  return compareVersions(next, installed) === 1
}

/**
 * @returns {true | false | null} null when the range contains a comparator this checker does not understand.
 */
export function satisfies(version, range) {
  if (typeof range !== 'string' || range.trim() === '' || range.trim() === '*') return true
  const groups = range.split('||').map(part => part.trim()).filter(Boolean)
  if (groups.length === 0) return null
  let recognized = false
  const matched = groups.some(group => {
    const parts = group.split(/\s+/).filter(Boolean)
    if (parts.length === 0) return false
    return parts.every(part => {
      const comparator = parseComparator(part)
      if (!comparator) return false
      recognized = true
      return matchesComparator(version, comparator)
    })
  })
  if (!recognized) return null
  return matched
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1
    if (right[index] === undefined) return 1
    const leftNumber = /^\d+$/.test(left[index])
    const rightNumber = /^\d+$/.test(right[index])
    if (leftNumber && rightNumber) {
      const diff = Number(left[index]) - Number(right[index])
      if (diff !== 0) return diff < 0 ? -1 : 1
    } else if (leftNumber) return -1
    else if (rightNumber) return 1
    else if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1
  }
  return 0
}

function parseComparator(part) {
  const match = part.match(/^(>=|<=|>|<|=|\^|~)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/)
  if (!match) return null
  return { op: match[1] || '=', version: match[2] }
}

function matchesComparator(version, comparator) {
  const order = compareVersions(version, comparator.version)
  if (order === null) return false
  if (comparator.op === '=' ) return order === 0
  if (comparator.op === '>') return order > 0
  if (comparator.op === '>=') return order >= 0
  if (comparator.op === '<') return order < 0
  if (comparator.op === '<=') return order <= 0
  const installed = parseVersion(version)
  const bound = parseVersion(comparator.version)
  if (!installed || !bound) return false
  if (order < 0) return false
  if (comparator.op === '~') return installed.major === bound.major && installed.minor === bound.minor
  if (comparator.op === '^') {
    if (bound.major > 0) return installed.major === bound.major
    if (bound.minor > 0) return installed.major === 0 && installed.minor === bound.minor
    return installed.major === 0 && installed.minor === 0 && installed.patch === bound.patch
  }
  return false
}
