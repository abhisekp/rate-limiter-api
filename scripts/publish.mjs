import {readFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const line = process.env.RELEASE_LINE
if (!['both', 'legacy', 'modern'].includes(line)) throw new Error('Choose both, legacy or modern')
if (process.env.GITHUB_REF !== 'refs/heads/master' || !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA || '')) throw new Error('Publish requires a full master commit SHA')
const head = spawnSync('git', ['rev-parse', 'origin/master'], {cwd: root, encoding: 'utf8'})
if (head.status !== 0 || head.stdout.trim() !== process.env.GITHUB_SHA) throw new Error('Master head changed')
for (const release of line === 'both' ? ['legacy', 'modern'] : [line]) {
  const manifest = JSON.parse(await readFile(path.join(root, 'packages', release, 'package.json')))
  const args = ['publish', path.join(root, 'artifacts', `rate-limiter-api-${manifest.version}.tgz`), '--ignore-scripts', '--access', 'public', '--tag', release === 'legacy' ? 'legacy' : 'latest', '--provenance']
  // No token is embedded. npm uses the configured workflow's OIDC identity.
  const result = spawnSync('npm', args, {cwd: root, stdio: 'inherit'})
  if (result.status !== 0) throw new Error(`${release} publishing failed`)
}
