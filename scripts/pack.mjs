import {mkdir, readFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(path.join(root, 'artifacts'), {recursive: true})
for (const line of ['legacy', 'modern']) {
  const args = ['pack', '--ignore-scripts', '--json', '--pack-destination', path.join(root, 'artifacts')]
  if (!process.env.npm_execpath) throw new Error('Run this script via npm run pack:releases')
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {cwd: path.join(root, 'build', line), encoding: 'utf8'})
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  const manifest = JSON.parse(await readFile(path.join(root, 'packages', line, 'package.json')))
  console.log(`Packed ${line}: ${manifest.name}@${manifest.version}`)
}
