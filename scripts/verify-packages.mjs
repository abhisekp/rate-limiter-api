import {mkdtemp, readFile, writeFile, mkdir} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (!process.env.npm_execpath) throw new Error('Run this script via npm run verify:packages')
await mkdir(path.join(root, 'build/consumers'), {recursive: true})
function execute(binary, args, cwd) {
  const result = spawnSync(binary, args, {cwd, encoding: 'utf8', timeout: 30000})
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error))
  return result.stdout.trim()
}
const registry = process.env.VERIFY_REGISTRY === '1'
const selection = process.env.RELEASE_LINE || 'both'
if (!['both', 'legacy', 'modern'].includes(selection)) throw new Error('Invalid release selection')
for (const line of selection === 'both' ? ['legacy', 'modern'] : [selection]) {
  const manifest = JSON.parse(await readFile(path.join(root, 'packages', line, 'package.json')))
  const directory = await mkdtemp(path.join(root, 'build/consumers', `${line}-`))
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({name: 'release-consumer', private: true}))
  const archive = registry ? `rate-limiter-api@${manifest.version}` : path.join(root, 'artifacts', `rate-limiter-api-${manifest.version}.tgz`)
  if (registry) {
    const tag = line === 'legacy' ? 'legacy' : 'latest'
    const taggedVersion = execute(process.execPath, [process.env.npm_execpath, 'view', `rate-limiter-api@${tag}`, 'version'], root)
    if (taggedVersion !== manifest.version) throw new Error(`${tag} does not point to ${manifest.version}`)
  }
  execute(process.execPath, [process.env.npm_execpath, 'install', ...(registry ? [] : ['--offline']), '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(root, 'build/npm-cache'), '--package-lock=false', archive], directory)
  const installed = path.join(directory, 'node_modules/rate-limiter-api')
  console.log(execute(process.execPath, [path.join(root, 'scripts/consumer-smoke.cjs'), installed, line], directory))
  const browser = path.join(installed, 'dist/rate-limiter-api.js')
  console.log(execute(process.execPath, ['-e', `const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert');const watchdog=setTimeout(()=>process.exit(1),3000);const ctx={setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync(${JSON.stringify(browser)},'utf8'),ctx);assert.equal(typeof ctx.RateLimiterAPI,'function');ctx.RateLimiterAPI().limit(cb=>cb(null,'browser')).then(x=>{assert.equal(x,'browser');clearTimeout(watchdog);console.log('Installed ${line} browser build passed')})`], directory))
  if (line === 'modern') {
    await writeFile(path.join(directory, 'consumer.mjs'), `import factory from 'rate-limiter-api';import assert from 'node:assert/strict';assert.equal(typeof factory,'function');assert.equal(await factory().limit(async()=>42),42);console.log('Installed modern ESM passed')`)
    console.log(execute(process.execPath, [path.join(directory, 'consumer.mjs')], directory))
    await writeFile(path.join(directory, 'consumer.mts'), `import factory, {type Limiter} from 'rate-limiter-api';const limiter:Limiter=factory({threshold:0});const value:Promise<number>=limiter.limit(async()=>42);void value;`)
  }
  await writeFile(path.join(directory, 'consumer.cts'), `import factory=require('rate-limiter-api');const limiter=factory({threshold:1});const value:Promise<string>=limiter.limit<string>(done=>done(null,'ok'));void value;`)
  const files = line === 'modern' ? ['consumer.cts', 'consumer.mts'] : ['consumer.cts']
  execute(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'es2020', '--module', 'nodenext', '--moduleResolution', 'nodenext', ...files], directory)
  console.log(`Installed ${line} TypeScript consumers passed`)
  const packageManifest = JSON.parse(await readFile(path.join(installed, 'package.json')))
  if (packageManifest.dependencies && Object.keys(packageManifest.dependencies).length) throw new Error('Unexpected runtime npm dependencies')
}
