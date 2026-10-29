import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { findProfileDir, stateFileFor } from '../lib/profile.js'

test('profile discovery walks up from a pnpm store path', () => {
  const profile = '/home/u/.dsh/profiles/web'
  const start = path.join(profile, 'node_modules', '.pnpm', 'dsh-plugin-update@0.1.0', 'node_modules', 'dsh-plugin-update')
  const found = findProfileDir({
    start,
    readJson: (file) => file === path.join(profile, 'package.json') ? { dsh: { profile: { bundles: [] } } } : null,
  })
  assert.equal(found, profile)
  assert.equal(stateFileFor(profile), path.join('/home/u/.dsh', 'plugin-update', 'state.json'))
})

test('DSH_PROFILE_DIR wins when it is a profile', () => {
  const found = findProfileDir({
    start: '/anywhere',
    env: { DSH_PROFILE_DIR: '/opt/profile' },
    readJson: (file) => file === path.join('/opt/profile', 'package.json') ? { dsh: { profile: { bundles: ['base'] } } } : null,
  })
  assert.equal(found, '/opt/profile')
})
