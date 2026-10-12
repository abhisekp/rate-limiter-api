const {test} = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

for (const line of ['legacy', 'modern']) test(`${line}: real HTTP requests respect provider window and reserve threshold`, {timeout: 5000}, async () => {
  let remaining = 3
  let reset = Date.now() + 100
  const requests = []
  const server = http.createServer((request, response) => {
    const now = Date.now()
    if (now >= reset) {remaining = 3; reset = now + 100}
    remaining--
    requests.push({at: now, remaining, reset})
    response.setHeader('x-ratelimit-limit', '3')
    response.setHeader('x-ratelimit-remaining', String(remaining))
    response.setHeader('x-ratelimit-reset', String(reset))
    response.end('ok')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const factory = require(`../build/${line}`)
  const limiter = factory({threshold: 1, concurrency: 1})
  reset = Date.now() + 100
  limiter.updateRateLimits({rateLimit: 3, rateRemaining: 3, rateReset: reset})
  const request = done => {
    http.get(`http://127.0.0.1:${server.address().port}`, response => {
      limiter.updateRateLimits({rateLimit: response.headers['x-ratelimit-limit'], rateRemaining: response.headers['x-ratelimit-remaining'], rateReset: response.headers['x-ratelimit-reset']})
      response.resume()
      response.on('end', () => done(null, response.statusCode))
    }).on('error', done)
  }
  try {
    assert.deepEqual(await Promise.all(Array.from({length: 6}, () => limiter.limit(request))), [200,200,200,200,200,200])
    assert(requests.every(item => item.remaining >= 1), 'Provider reserve was consumed')
    assert(requests[2].at >= requests[0].reset, 'Requests did not wait for provider reset')
  } finally {await new Promise(resolve => server.close(resolve))}
})
