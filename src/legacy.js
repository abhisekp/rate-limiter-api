import stampit from 'stampit-legacy'
import {initialize} from './scheduler.js'

// Keep the Stampit 2 factory/composition contract shipped in npm 1.0.11.
const RateLimiterAPI = stampit().refs({
  strategy: 'burst-first', numberOfRequests: Infinity, rateUpdater: null,
  threshold: 5,
}).init(function () { initialize(this, true) })

export default RateLimiterAPI
