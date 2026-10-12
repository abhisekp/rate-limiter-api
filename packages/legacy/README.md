# Rate Limiter API — compatible 1.x

The repaired 1.x line preserves the callback, Promise, mutable refs and Stampit 2 composition API shipped in 1.0.11. The factory is now directly callable and remains available at `.default` for existing consumers. Numeric header strings are accepted; omitted or invalid header values leave existing values unchanged.

```sh
npm install rate-limiter-api@legacy
```

```js
const RateLimiterAPI = require('rate-limiter-api') // .default also works
const limiter = RateLimiterAPI({threshold: 1})
limiter.updateRateLimits({rateLimit: 10, rateRemaining: 10, rateReset: Date.now() + 60000})
limiter.limit(done => { done(null, 'response') }).then(console.log)
```

The completion callback is required in 1.x. Update limits from each real response. `rateReset` is an epoch timestamp in **milliseconds**; multiply provider timestamps in seconds by 1000. Requests reserve quota before they start. Header updates cannot restore budget already consumed in the current window. Each instance is independent; this is not a distributed limiter.

```js
const custom = RateLimiterAPI.refs({threshold: 1}).methods({describe() {return 'custom'}})
const limiter = custom.create()
```

Browser: load `https://cdn.jsdelivr.net/npm/rate-limiter-api@1.0.12/dist/rate-limiter-api.js`, then call `RateLimiterAPI()`. You need native Promise support or an application-provided polyfill. Node 6+ syntax is supported; Node 6 is obsolete and retained only for existing applications.

`strategy`, `numberOfRequests`, and `rateUpdater` retain their historical inert behavior in 1.x. New functionality belongs to 2.x. A quota less than or equal to `threshold` waits for a valid quota or smaller threshold; it never dispatches into the reserved allowance. Invalid updates are ignored; handler throws reject their Promise; duplicate callbacks are ignored.

Maintenance and migration: https://github.com/abhisekp/rate-limiter-api

MIT. Bundled Stampit, Supermixer and Lodash license notices are included.
