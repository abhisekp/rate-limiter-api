import {build} from 'esbuild'
import {readFile, writeFile, mkdir, cp, rm} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cjsFooter = 'module.exports = module.exports.default; module.exports.default = module.exports; Object.defineProperty(module.exports, "__esModule", {value:true});'
const browserFooter = 'RateLimiterAPI = RateLimiterAPI.default; RateLimiterAPI.default = RateLimiterAPI; if (typeof module === "object" && module.exports) module.exports = RateLimiterAPI; else if (typeof define === "function" && define.amd) define([], function(){return RateLimiterAPI});'
for (const line of ['legacy', 'modern']) {
  const output = path.join(root, 'build', line)
  if (!output.startsWith(path.join(root, 'build') + path.sep)) throw new Error('Unexpected build path')
  await rm(output, {recursive: true, force: true})
  await mkdir(path.join(output, 'dist'), {recursive: true})
  const options = {
    entryPoints: [path.join(root, 'src', line === 'legacy' ? 'legacy.js' : 'index.js')],
    bundle: true, mainFields: ['main'], target: line === 'legacy' ? 'es2015' : 'es2020', legalComments: 'inline',
    // Stampit 2 uses Lodash 3 module paths. Resolve them to patched Lodash 4.
    alias: {'lodash/collection/forEach': 'lodash/forEach', 'lodash/lang/isFunction': 'lodash/isFunction', 'lodash/lang/isObject': 'lodash/isObject'},
    sourcemap: false,
  }
  await build({...options, format: 'cjs', platform: 'neutral', outfile: path.join(output, 'index.js'), footer: {js: cjsFooter}})
  await build({...options, format: 'iife', globalName: 'RateLimiterAPI', platform: 'browser', outfile: path.join(output, 'dist/rate-limiter-api.js'), footer: {js: browserFooter}})
  if (line === 'modern') {
    await build({...options, format: 'esm', platform: 'neutral', outfile: path.join(output, 'dist/rate-limiter-api.mjs')})
  }
  for (const file of ['package.json', 'index.d.ts', 'README.md']) {
    await cp(path.join(root, 'packages', line, file), path.join(output, file))
  }
  if (line === 'modern') {
    await cp(path.join(root, 'packages/modern/index.d.mts'), path.join(output, 'index.d.mts'))
    await cp(path.join(root, 'packages/modern/index.d.mts'), path.join(output, 'dist/rate-limiter-api.d.mts'))
  }
  await cp(path.join(root, 'LICENSE'), path.join(output, 'LICENSE'))
  await mkdir(path.join(output, 'src'), {recursive: true})
  await cp(path.join(root, 'src/scheduler.js'), path.join(output, 'src/scheduler.js'))
  await writeFile(path.join(output, 'src/index.js'), line === 'legacy'
    ? "import RateLimiterAPI from '../index.js'\nexport default RateLimiterAPI\n"
    : "export {default} from '../dist/rate-limiter-api.mjs'\n")
  if (line === 'legacy') {
    let licenses = 'Stampit 2.1.2: MIT, Eric Elliott (https://github.com/stampit-org/stampit)\nSupermixer 1.0.5: MIT, koresar (https://github.com/stampit-org/supermixer)\n\n'
    licenses += await readFile(path.join(root, 'licenses/legacy-MIT.txt'), 'utf8')
    licenses += '\n--- Lodash ---\n' + await readFile(path.join(root, 'node_modules/lodash/LICENSE'), 'utf8')
    await writeFile(path.join(output, 'THIRD_PARTY_LICENSES.txt'), licenses)
  }
}
// Preserve the historical repository entry point and browser path as v2 builds.
await cp(path.join(root, 'build/modern/index.js'), path.join(root, 'dist/rate-limiter-api.cjs'))
await cp(path.join(root, 'build/modern/dist/rate-limiter-api.js'), path.join(root, 'dist/rate-limiter-api.js'))
console.log('Built legacy 1.x and modern 2.x from the shared scheduler.')
