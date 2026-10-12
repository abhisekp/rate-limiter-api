const {test} = require('node:test')
const assert = require('node:assert/strict')
const {spawnSync} = require('node:child_process')
const path = require('node:path')

test('Both archives are published before registry verification can fail', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import childProcess from 'node:child_process'
    import {syncBuiltinESMExports} from 'node:module'
    childProcess.spawnSync = (command, args) => {
      if (command === 'git') return {status: 0, stdout: process.env.GITHUB_SHA}
      if (args[0] === 'publish') {
        console.log('PUBLISHED ' + args[1])
        return {status: 0}
      }
      return {status: 1, stderr: 'npm error E403'}
    }
    syncBuiltinESMExports()
    await import('./scripts/publish.mjs')
  `], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000,
    env: {...process.env, RELEASE_LINE: 'both', GITHUB_REF: 'refs/heads/master', GITHUB_SHA: 'a'.repeat(40)}
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /E403/)
  const publications = result.stdout.split('\n').filter(line => line.startsWith('PUBLISHED '))
  assert.equal(publications.length, 2)
  assert.ok(publications[0].includes(`rate-limiter-api-${require('../packages/legacy/package.json').version}.tgz`))
  assert.ok(publications[1].includes(`rate-limiter-api-${require('../packages/modern/package.json').version}.tgz`))
})
