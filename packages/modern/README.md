# Rate Limiter API — 2.x

Modern ESM, CommonJS, TypeScript and browser builds with no runtime npm dependencies. Node 22+; browsers need Promise and ES2020 support. For the Stampit composition API and older Node applications, use `rate-limiter-api@legacy`.

```sh
npm install rate-limiter-api
```

```js
import RateLimiterAPI from 'rate-limiter-api'
const limiter = RateLimiterAPI({threshold: 1, concurrency: 2})
limiter.updateRateLimits({rateLimit: 10, rateRemaining: 10, rateReset: Date.now() + 60000})
const body = await limiter.limit(async () => {
  const response = await fetch('https://api.example.com/resource')
  limiter.updateRateLimits({
    rateLimit: response.headers.get('X-RateLimit-Limit') ?? undefined,
    rateRemaining: response.headers.get('X-RateLimit-Remaining') ?? undefined,
    rateReset: response.headers.has('X-RateLimit-Reset') ? Number(response.headers.get('X-RateLimit-Reset')) * 1000 : undefined,
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
})
```

Header names and reset units depend on the provider. This example assumes Unix seconds in `X-RateLimit-Reset`; the library requires **epoch milliseconds**. Supply known quotas before queueing work whenever possible. The initial allowance is unknown/infinite, not a discovered provider limit. Updates only lower available quota within a window, protecting in-flight reservations from stale responses. A known reset refills from `rateLimit` once; further windows require fresh provider timestamps. A threshold at or above the limit blocks until configuration permits a request.

The callback API is also supported: `limiter.limit(done => done(null, value))`. Return a Promise or call the callback; the first completion wins. A synchronous return value alone does not complete a request. Invalid header values throw before changing state; partial updates and numeric strings are accepted.

Options: `threshold` (default 5), `concurrency` (default 1), `strategy` (`burst-first` or `uniform`), `numberOfRequests` (maximum starts per known reset window, default Infinity), `timeout` (milliseconds until a handler is considered complete). Uniform spacing needs known quota and a future reset. Timeouts do not cancel underlying network requests; use fetch cancellation yourself when needed.

`limit(handler, {signal})` cancels queued work only. Once a task has started, its handler controls network cancellation. `getRateLimits()` returns a snapshot. `close()` rejects queued and future work; active tasks may finish. Queued resets use a single bounded timer. No timers remain when the queue is empty.

CommonJS: `const RateLimiterAPI = require('rate-limiter-api')`. Browser: load `https://cdn.jsdelivr.net/npm/rate-limiter-api@2.0.0/dist/rate-limiter-api.js`, then call `RateLimiterAPI()`.

Migration: replace Stampit `.refs()/.compose()/.init()` customization with factory options or application wrappers. Default concurrency is now one, invalid headers throw, and returned Promises are recognized. Set `concurrency` explicitly for parallel work. 1.x remains maintained from the same scheduler and regression suite. Instances do not share quotas across processes or clients.

MIT. https://github.com/abhisekp/rate-limiter-api
