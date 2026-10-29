import assert from 'node:assert/strict'
import test from 'node:test'
import { compareVersions, isNewer, satisfies } from '../lib/semver.js'

test('a higher release is newer and an equal or lower one is not', () => {
  assert.equal(isNewer('1.2.4', '1.2.3'), true)
  assert.equal(isNewer('1.2.3', '1.2.3'), false)
  assert.equal(isNewer('1.2.2', '1.2.3'), false)
  assert.equal(isNewer('v1.3.0', '1.2.9'), true)
})

test('a prerelease is not offered over a stable install unless the caller trusts the tag', () => {
  assert.equal(isNewer('1.2.4-rc.1', '1.2.3'), false)
  assert.equal(isNewer('1.2.4-rc.1', '1.2.3', { allowPrerelease: true }), true)
  assert.equal(isNewer('1.2.3-rc.1', '1.2.3', { allowPrerelease: true }), false)
})

test('prerelease identifiers follow semver precedence', () => {
  assert.equal(compareVersions('1.0.0-alpha.1', '1.0.0-alpha'), 1)
  assert.equal(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1)
  assert.equal(compareVersions('1.0.0-1', '1.0.0-alpha'), -1)
  assert.equal(compareVersions('1.0.0', '1.0.0-rc.1'), 1)
})

test('engines ranges accept caret, tilde, and, and or', () => {
  assert.equal(satisfies('0.2.5', '>=0.2.0 <0.3.0'), true)
  assert.equal(satisfies('0.3.0', '>=0.2.0 <0.3.0'), false)
  assert.equal(satisfies('0.2.5', '^0.2.0'), true)
  assert.equal(satisfies('0.3.0', '^0.2.0'), false)
  assert.equal(satisfies('1.4.0', '^1.2.3'), true)
  assert.equal(satisfies('2.0.0', '^1.2.3'), false)
  assert.equal(satisfies('1.2.9', '~1.2.3'), true)
  assert.equal(satisfies('1.3.0', '~1.2.3'), false)
  assert.equal(satisfies('1.0.0', '^0.2.0 || ^1.0.0'), true)
})

test('an unknown comparator does not pretend to match', () => {
  assert.equal(satisfies('1.2.3', 'workspace:*'), null)
  assert.equal(satisfies('1.2.3', '*'), true)
})
