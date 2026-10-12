const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const {spawnSync} = require('node:child_process')

function clock(line, options) {
  let now = 1000
  let id = 0
  const timers = new Map()
  const context = {Promise, console, Date: class extends Date {static now() {return now}},
    setTimeout(callback, delay) {const key = ++id; timers.set(key, {callback, at: now + Math.max(0, Number(delay) || 0)}); return key},
    clearTimeout(key) {timers.delete(key)},
  }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'build', line, 'dist/rate-limiter-api.js'), 'utf8'), context)
  const limiter = context.RateLimiterAPI(options)
  return {limiter, factory: context.RateLimiterAPI, timers,
    tick(duration = 0) {
      const until = now + duration
      let steps = 0
      while (true) {
        const entry = Array.from(timers.entries()).filter(([, timer]) => timer.at <= until).sort((a,b) => a[1].at - b[1].at)[0]
        if (!entry) break
        if (++steps > 10000) throw new Error('Timer loop')
        now = entry[1].at
        timers.delete(entry[0])
        entry[1].callback()
      }
      now = until
    },
  }
}

for (const line of ['legacy', 'modern']) {
  test(`${line}: callback values, errors, throws, invalid handlers, duplicate completion`, async () => {
    const c = clock(line)
    const error = new Error('expected')
    const value = c.limiter.limit(done => {done(null, 42); done(null, 99)})
    const rejected = assert.rejects(c.limiter.limit(done => done(error)), /expected/)
    const thrown = assert.rejects(c.limiter.limit(() => {throw error}), /expected/)
    const invalid = assert.rejects(c.limiter.limit(null), /must be a function/)
    c.tick()
    assert.equal(await value, 42)
    await Promise.all([rejected, thrown, invalid])
    assert.equal(c.timers.size, 0)
  })
  test(`${line}: exhausted quota blocks before dispatch and refills once`, async () => {
    const c = clock(line, {threshold: 1})
    c.limiter.updateRateLimits({rateLimit: 3, rateRemaining: 1, rateReset: 1100})
    let started = 0
    const requests = [0, 1].map(i => c.limiter.limit(done => {started++; done(null, i)}))
    c.tick(99); assert.equal(started, 0)
    c.tick(1); assert.equal(started, 2)
    assert.deepEqual(await Promise.all(requests), [0, 1])
    assert.equal(c.timers.size, 0)
    c.limiter.limit(() => {started++})
    c.tick(500); assert.equal(started, 2, 'No invented repeating reset')
    assert.equal(c.timers.size, 0)
  })
  test(`${line}: final usable request runs without waiting for reset`, async () => {
    const c = clock(line, {threshold: 1})
    c.limiter.updateRateLimits({rateLimit: 10, rateRemaining: 2, rateReset: 1200})
    const result = c.limiter.limit(done => done(null, 'ok'))
    c.tick(); assert.equal(await result, 'ok'); assert.equal(c.timers.size, 0)
  })
  test(`${line}: dispatch reserves a finite budget and stale headers cannot restore it`, async () => {
    const c = clock(line, {threshold: 1, concurrency: 10})
    c.limiter.updateRateLimits({rateLimit: 4, rateRemaining: 3, rateReset: 1200})
    let started = 0
    const callbacks = []
    for (let i = 0; i < 8; i++) c.limiter.limit(done => {started++; callbacks.push(done)})
    c.tick();
    if (line === 'legacy') {callbacks.shift()(null); c.tick()}
    assert.equal(started, 2)
    c.limiter.updateRateLimits({rateRemaining: '3', rateReset: 1200})
    callbacks.splice(0).forEach(done => done(null))
    c.tick(100); assert.equal(started, 2)
    c.tick(100); assert.equal(started, 5)
  })
  test(`${line}: partial updates preserve state and allow recovery after small quota`, async () => {
    const c = clock(line, {threshold: 5})
    c.limiter.updateRateLimits({rateLimit: '3', rateRemaining: '0', rateReset: '1050'})
    let started = false
    const result = c.limiter.limit(done => {started = true; done(null, 'recovered')})
    c.tick(60); assert.equal(started, false)
    c.limiter.threshold = 1
    assert.equal(c.limiter.updateRateLimits({rateReset: 1200}), c.limiter)
    c.tick(); assert.equal(await result, 'recovered')
    const partial = c.limiter.limit(done => done(null, 'partial'))
    c.limiter.updateRateLimits({rateLimit: 10})
    c.tick(); assert.equal(await partial, 'partial')
  })
  test(`${line}: timers are bounded and independent instances do not share quota`, async () => {
    const a = clock(line, {threshold: 1})
    const b = clock(line, {threshold: 1})
    a.limiter.updateRateLimits({rateLimit: 2, rateRemaining: 1, rateReset: 1000 + 2147483647 + 5000})
    a.limiter.limit(() => {})
    a.tick(); assert.equal(a.timers.size, 1)
    assert.equal(Array.from(a.timers.values())[0].at, 1000 + 2147483647)
    const result = b.limiter.limit(done => done(null, 'independent')); b.tick()
    assert.equal(await result, 'independent')
  })
  test(`${line}: expired responses do not create repeated quota refills`, async () => {
    const c = clock(line, {threshold: 1})
    c.limiter.updateRateLimits({rateLimit: 2, rateRemaining: 1, rateReset: 1050})
    let started = 0
    for (let i = 0; i < 3; i++) c.limiter.limit(done => {
      started++
      c.limiter.updateRateLimits({rateLimit: 2, rateRemaining: 1, rateReset: 1050})
      done(null)
    })
    c.tick(500); assert.equal(started, 1)
    assert.equal(c.timers.size, 0)
  })
  test(`${line}: remaining-only headers cannot invent next-window capacity`, async () => {
    const c = clock(line, {threshold: 0})
    c.limiter.updateRateLimits({rateRemaining: 1, rateReset: 1050})
    let started = 0
    for (let i = 0; i < 3; i++) c.limiter.limit(done => {started++; done(null)})
    c.tick(500); assert.equal(started, 1)
  })
}

test('legacy: Stampit 2 refs, props, methods, init, compose and static survive', () => {
  const factory = require('../build/legacy')
  assert.equal(factory.default, factory)
  for (const name of ['create','refs','state','props','methods','init','enclose','static','compose']) assert.equal(typeof factory[name], 'function')
  const custom = factory.refs({threshold: 2}).props({nested: {count: 0}}).methods({describe() {return this.threshold}}).init(function () {this.initialized = true}).static({kind:'custom'})
  const a = custom({threshold: 3})
  const b = custom.create()
  a.nested.count = 1
  assert.equal(b.nested.count, 0)
  assert.equal(a.describe(), 3)
  assert.equal(b.describe(), 2)
  assert.equal(a.initialized, true)
  assert.equal(custom.kind, 'custom')
  assert.equal(factory.compose(custom)().describe(), 2)
  assert.equal(custom.fixed.refs.threshold, 2)
})

test('legacy: observable factory contract matches the published 1.0.11 oracle', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/legacy-contract.cjs'), path.join(__dirname, '../build/legacy')], {encoding: 'utf8'})
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/legacy-contract.json'), 'utf8')))
})

test('legacy: malformed headers are ignored without freezing scheduling', async () => {
  const c = clock('legacy')
  c.limiter.updateRateLimits({rateLimit: undefined, rateRemaining: 'garbage', rateReset: NaN})
  const result = c.limiter.limit(done => done(null, true)); c.tick()
  assert.equal(await result, true)
})

test('modern: invalid updates are atomic', () => {
  const c = clock('modern', {threshold: 0})
  c.limiter.updateRateLimits({rateLimit: 10, rateRemaining: 10, rateReset: 1100})
  assert.throws(() => c.limiter.updateRateLimits({rateLimit: 1, rateRemaining: 'garbage'}), /rateRemaining/)
  assert.equal(c.limiter.getRateLimits().rateLimit, 10)
  for (const value of [null, '', false, NaN, -1]) assert.throws(() => c.limiter.updateRateLimits({rateRemaining: value}))
})

test('modern: promises complete and concurrency is bounded', async () => {
  const factory = require('../build/modern')
  const limiter = factory({threshold: 0, concurrency: 2})
  let active = 0; let peak = 0
  const values = await Promise.all([1,2,3,4].map(i => limiter.limit(async () => {
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--; return i
  })))
  assert.deepEqual(values, [1,2,3,4]); assert.equal(peak, 2)
  await assert.rejects(limiter.limit(async () => {throw new Error('promise error')}), /promise error/)
  let rejected = false
  await limiter.limit(() => Promise.reject(undefined)).then(() => {}, () => {rejected = true})
  assert.equal(rejected, true, 'A falsy Promise rejection remains a rejection')
  limiter.close()
})

test('modern: uniform strategy spaces starts and request cap resets', async () => {
  const c = clock('modern', {threshold: 0, concurrency: 3, strategy: 'uniform', numberOfRequests: 2})
  c.limiter.updateRateLimits({rateLimit: 3, rateRemaining: 3, rateReset: 1100})
  let started = 0
  for (let i = 0; i < 3; i++) c.limiter.limit(done => {started++; done(null)})
  c.tick(); assert.equal(started, 1)
  c.tick(49); assert.equal(started, 1)
  c.tick(1); assert.equal(started, 2)
  c.tick(49); assert.equal(started, 2)
  c.tick(1); assert.equal(started, 3)
})

test('modern: queued abort, close and active-slot ownership', async () => {
  const c = clock('modern')
  let complete
  const active = c.limiter.limit(done => {complete = done})
  c.tick()
  const controller = new AbortController()
  const aborted = assert.rejects(c.limiter.limit(() => {throw new Error('must not start')}, {signal: controller.signal}), /aborted/)
  controller.abort(); await aborted
  assert.equal(c.limiter.getRateLimits().active, 1)
  const queued = assert.rejects(c.limiter.limit(() => {}), /closed/)
  c.limiter.close(); await queued
  complete(null, 'done'); assert.equal(await active, 'done')
  await assert.rejects(c.limiter.limit(() => {}), /closed/)
  assert.equal(c.timers.size, 0)
})

test('modern: timeout rejects a stalled handler and ignores late completion', async () => {
  const c = clock('modern', {timeout: 20})
  let late
  const timeout = assert.rejects(c.limiter.limit(done => {late = done}), /timed out/)
  c.tick(20); await timeout
  late(null, 'late'); assert.equal(c.limiter.getRateLimits().active, 0)
  assert.equal(c.timers.size, 0)
})
