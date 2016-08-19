// import 'source-map-support/register'
import 'babel-polyfill'
import stampit from 'stampit'
import queue from 'async-es/queue'
import isNumber from 'lodash-es/isNumber'
import isFunction from 'lodash-es/isFunction'

/**
 * strategy: 'burst-first' | 'uniform'
 *
 * burst-first: request X number of requests or till remaining number
 * of request whichever is lower at first burst.
 *
 * uniform: request X number of requests or remaining number of requests
 * uniformly in the remaining time period from the rateReset time
 * whichever is lower.
 */
const RateLimiter = stampit()
	.refs({
		strategy: 'burst-first',
		numberOfRequests: Infinity, // max. number of requests per pulse
		rateUpdater: null, // pass `rateLimits` as param (async) (not implemented yet)
		threshold: 5, // leave `threshold` amount of api requests intact (minimum: 1)
	})
	.init(function () {
		const rateLimits = {
			rateLimit: Infinity,
			rateRemaining: Infinity,
			rateReset: Date.now(),
		}

		/**
		 * Update rate limits every time a request is made
		 * @method updateRateLimits
		 * @param	{number}				 rateLimit		 Maximum rate limit
		 * @param	{number}				 rateRemaining Remaining number of requests in current pulse
		 * @param	{number}				 rateReset		 Next reset time
		 * @return {object}											 Rate limiter object (this)
		 */
		this.updateRateLimits = function ({
			rateLimit, rateRemaining, rateReset
		}) {
			if (isNumber(Number(rateLimit))) {
				rateLimits.rateLimit = Number(rateLimit)
			}

			if (isNumber(Number(rateRemaining))) {
				rateLimits.rateRemaining = Number(rateRemaining)
			}

			if (isNumber(Number(rateReset))) {
				rateLimits.rateReset = Number(rateReset)
			}

			return this
		}

		// set the default initial concurrency to 1
		const q = queue((requestHandler, responseHandler) => {
			if (isFunction(requestHandler)) {
				requestHandler(responseHandler)
			} else {
				responseHandler(Error('requestHandler must be a function.'))
			}
		}, 1)

		/**
		 * Accepts a callback (the task) and returns a promise. The promise resolves when the task finishes.
		 * @method limit
		 * @param {function(function)} requestHandler(responseHandler) Limit the requestHandler and pass the responseHandler.
 	 	 *																														 The responseHandler is called by the requestHandler
 	 	 *																														 after request is successful.
 	 	 *																														 requestHandler has node-style callback i.e. it accepts an
 	 	 *																														 Error object as first param and/or response as the second
		 *																														 param.
		 * @param {object} option.immediate Immediately process the request
		 * @return {Promise} Return a promise to resolve when the request completes
		 */
		this.limit = function (requestHandler) {
			return new Promise((resolve, reject) => {
				const responseHandler = (err, response) => {
					// console.log('Concurrency:', q.concurrency)
					console.dir(rateLimits, {colors:1})
					const concurrency = rateLimits.rateRemaining - this.threshold
					if (concurrency <= 1) {
						// next reset time difference
						const timeDiff = rateLimits.rateReset - Date.now()

						// pause the queue till rate reset
						q.pause()

						// reset at next reset time
						setTimeout(() => {
							// reset the concurrency
							q.concurrency = rateLimits.rateLimit - this.threshold
							q.resume()
						}, timeDiff + 1)
					} else {
						// set the concurrency to the rate remaining - the min. threshold amount
						q.concurrency = concurrency
					}

					if (err) {
						reject(err)
					}
					resolve(response)
				}

				q.push(requestHandler, responseHandler)
			})
		}
	})

export default RateLimiter
