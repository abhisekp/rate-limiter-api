// ES2015 syntax: this same consumer fixture also runs on Node 6.
const assert = require('assert')
const path = require('path')
const target = path.resolve(process.argv[2])
const line = process.argv[3]
const watchdog = setTimeout(function () {console.error('Consumer did not settle'); process.exit(1)}, 3000)
const RateLimiterAPI = require(target)
assert.equal(typeof RateLimiterAPI, 'function')
assert.strictEqual(RateLimiterAPI.default, RateLimiterAPI)
if (line === 'legacy') {
  const stamp = RateLimiterAPI.refs({threshold: 1}).methods({label: function () {return this.threshold}})
  assert.equal(stamp.create().label(), 1)
}
const limiter = RateLimiterAPI({threshold: 1, concurrency: 2})
const reset = Date.now() + 40
limiter.updateRateLimits({rateLimit: 3, rateRemaining: 1, rateReset: reset})
let startedAt
limiter.limit(function (done) {startedAt = Date.now(); done(null, 42)}).then(function (value) {
  assert.equal(value, 42)
  assert(startedAt >= reset, 'Started with exhausted quota')
  return limiter.limit(function () {throw new Error('expected')})
}).then(function () {throw new Error('Throw was not rejected')}, function (error) {
  assert.equal(error.message, 'expected')
  const result = limiter.limit(function (done) {done(null, 'once'); done(null, 'twice')})
  // Refill once more using a fresh known provider window.
  limiter.updateRateLimits({rateLimit: 3, rateRemaining: 1, rateReset: Date.now() + 20})
  return result
}).then(function (value) {
  assert.equal(value, 'once')
  clearTimeout(watchdog)
  console.log(line + ' consumer passed on ' + process.version)
}, function (error) {clearTimeout(watchdog); console.error(error.stack); process.exitCode = 1})
