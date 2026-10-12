const MAX_DELAY = 2147483647

function validNumber(value, allowInfinity) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const number = Number(value)
  return number >= 0 && (isFinite(number) || (allowInfinity && number === Infinity)) ? number : null
}

export function initialize(instance, legacy) {
  if (instance.threshold === undefined) instance.threshold = 5
  if (instance.concurrency === undefined) instance.concurrency = legacy ? Infinity : 1
  if (instance.strategy === undefined) instance.strategy = 'burst-first'
  if (instance.numberOfRequests === undefined) instance.numberOfRequests = Infinity
  if (validNumber(instance.threshold, false) === null) throw new TypeError('threshold must be a non-negative number')
  if (validNumber(instance.concurrency, true) === null || instance.concurrency < 1) throw new TypeError('concurrency must be at least one')
  if (!legacy && instance.strategy !== 'burst-first' && instance.strategy !== 'uniform') throw new TypeError('Unknown strategy')
  if (!legacy && (validNumber(instance.numberOfRequests, true) === null || instance.numberOfRequests < 1)) throw new TypeError('numberOfRequests must be at least one')
  if (!legacy && instance.timeout !== undefined && (validNumber(instance.timeout, false) === null || instance.timeout < 1)) throw new TypeError('timeout must be a positive number')
  let rateLimit = Infinity
  let rateRemaining = Infinity
  let rateReset = null
  let active = 0
  let used = 0
  let warmed = false
  let closed = false
  let timer = null
  let nextStart = 0
  const pending = []
  const running = []

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function schedule(delay) {
    clearTimer()
    if (closed || pending.length === 0) return
    timer = setTimeout(function () { timer = null; pump() }, Math.min(MAX_DELAY, Math.max(0, delay)))
  }

  function resetIfDue() {
    if (rateReset !== null && Date.now() >= rateReset) {
      // A remaining-only update cannot establish the next window's capacity.
      if (isFinite(rateLimit)) rateRemaining = rateLimit
      rateReset = null // Do not invent another window without a provider timestamp.
      used = 0
      nextStart = 0
    }
  }

  function pump() {
    if (closed) return
    resetIfDue()
    while (pending.length) {
      const threshold = validNumber(instance.threshold, false)
      const concurrency = validNumber(instance.concurrency, true)
      if (threshold === null || concurrency === null || concurrency < 1) return
      if (active >= (legacy && !warmed ? 1 : concurrency)) return
      const budget = Math.floor(rateRemaining - threshold)
      const pulseBudget = legacy ? Infinity : Number(instance.numberOfRequests) - used
      if (budget < 1 || pulseBudget < 1) {
        if (rateReset !== null && rateLimit > threshold) schedule(rateReset - Date.now())
        return
      }
      if (!legacy && instance.strategy === 'uniform' && Date.now() < nextStart) {
        schedule(nextStart - Date.now())
        return
      }
      const task = pending.shift()
      active++
      used++
      if (isFinite(rateRemaining)) rateRemaining-- // Reserve at dispatch, not completion.
      if (!legacy && instance.strategy === 'uniform' && rateReset !== null && isFinite(budget)) {
        nextStart = Date.now() + Math.max(0, rateReset - Date.now()) / Math.min(budget, pulseBudget)
      }
      running.push(task)
      task.started = true
      invoke(task)
    }
  }

  function invoke(task) {
    if (!legacy && instance.timeout !== undefined) {
      task.timeout = setTimeout(function () { finish(task, new Error('Request timed out')) }, instance.timeout)
    }
    try {
      const result = task.handler(function (error, response) { finish(task, error, response) })
      if (!legacy && result && typeof result.then === 'function') {
        result.then(function (value) { finish(task, null, value) }, function (error) { finish(task, error, undefined, true) })
      }
    } catch (error) { finish(task, error, undefined, true) }
  }

  function finish(task, error, value, rejected) {
    if (task.finished) return
    task.finished = true
    if (task.timeout !== undefined) clearTimeout(task.timeout)
    if (task.signal && task.abort) task.signal.removeEventListener('abort', task.abort)
    if (task.started) {
      active--
      warmed = true
      running.splice(running.indexOf(task), 1)
    } else {
      const index = pending.indexOf(task)
      if (index !== -1) pending.splice(index, 1)
    }
    if (error || rejected) task.reject(error)
    else task.resolve(value)
    schedule(0)
  }

  instance.updateRateLimits = function (limits) {
    if (!limits || typeof limits !== 'object') {
      if (legacy) return instance
      throw new TypeError('rate limits must be an object')
    }
    // Validate the entire update before mutating state.
    const updates = {}
    ;['rateLimit', 'rateRemaining', 'rateReset'].forEach(function (key) {
      if (limits[key] === undefined) return
      const number = validNumber(limits[key], key !== 'rateReset')
      if (number === null) {
        if (!legacy) throw new TypeError(key + ' must be a non-negative number')
      } else updates[key] = number
    })
    resetIfDue()
    // Late responses from an expired provider window cannot refill quota or
    // install a past timestamp that would trigger another refill on every tick.
    if (updates.rateReset !== undefined && updates.rateReset <= Date.now()) {
      schedule(0)
      return instance
    }
    if (updates.rateLimit !== undefined) rateLimit = updates.rateLimit
    if (updates.rateRemaining !== undefined) {
      // A stale response must not restore budget already reserved by other work.
      rateRemaining = Math.min(rateRemaining, updates.rateRemaining)
    }
    if (updates.rateReset !== undefined) rateReset = updates.rateReset
    rateRemaining = Math.min(rateRemaining, rateLimit)
    schedule(0)
    return instance
  }

  instance.limit = function (handler, options) {
    return new Promise(function (resolve, reject) {
      if (closed) { reject(new Error('Rate limiter is closed')); return }
      if (typeof handler !== 'function') { reject(new TypeError('requestHandler must be a function.')); return }
      const task = {handler, resolve, reject, started: false, finished: false}
      if (!legacy && options && options.signal) {
        task.signal = options.signal
        if (task.signal.aborted) { reject(new Error('Request aborted')); return }
        // Abort only queued work. Running work retains its concurrency slot.
        task.abort = function () { if (!task.started) finish(task, new Error('Request aborted')) }
        task.signal.addEventListener('abort', task.abort, {once: true})
      }
      pending.push(task)
      schedule(0)
    })
  }

  if (!legacy) {
    instance.getRateLimits = function () {
      resetIfDue()
      return {rateLimit, rateRemaining, rateReset, active, queued: pending.length}
    }
    instance.close = function () {
      closed = true
      clearTimer()
      pending.slice().forEach(function (task) { finish(task, new Error('Rate limiter is closed')) })
      // Running handlers may still finish; cancellation cannot undo a request.
    }
  }
  return instance
}
