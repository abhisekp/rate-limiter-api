import {initialize} from './scheduler.js'

export default function RateLimiterAPI(options = {}) {
  return initialize(Object.assign({}, options), false)
}
