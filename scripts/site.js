(function () {
  'use strict'

  var quotaInput = document.querySelector('#quota-input')
  var concurrencyInput = document.querySelector('#concurrency-input')
  var requestCount = document.querySelector('#request-count')
  var runButton = document.querySelector('#run-demo')
  var demoStatus = document.querySelector('#demo-status')
  var requestList = document.querySelector('#request-list')
  var toast = document.querySelector('#toast')
  var limiter = null
  var batchSize = 0
  var completed = 0
  var resetAt = 0
  var resetTimer = null
  var countdownTimer = null
  var toastTimer = null
  var batchToken = 0
  var rows = new Map()

  function showToast(message) {
    toast.textContent = message
    toast.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { toast.classList.remove('show') }, 1700)
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text)
    }
    var input = document.createElement('textarea')
    input.value = text
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    var copied = document.execCommand('copy')
    input.remove()
    return copied ? Promise.resolve() : Promise.reject(new Error('Copy unavailable'))
  }

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      copyText(button.getAttribute('data-copy')).then(function () { showToast('Install command copied') }, function () { showToast('Could not copy this command') })
    })
  })
  document.querySelectorAll('[data-copy-target]').forEach(function (button) {
    button.addEventListener('click', function () {
      var code = document.querySelector('#' + button.getAttribute('data-copy-target'))
      copyText(code.innerText).then(function () { showToast('Code copied') }, function () { showToast('Could not copy this code') })
    })
  })

  var examples = {
    promise: '<span class="code-muted">// Queue a request and keep a little quota in reserve</span>\n<span class="code-key">const</span> limiter = <span class="code-fn">RateLimiterAPI</span>({\n  threshold: <span class="code-num">1</span>,\n  concurrency: <span class="code-num">2</span>,\n})\n\nlimiter.<span class="code-fn">updateRateLimits</span>({\n  rateLimit: <span class="code-num">60</span>,\n  rateRemaining: <span class="code-num">42</span>,\n  rateReset: <span class="code-fn">Date</span>.<span class="code-fn">now</span>() + <span class="code-num">60_000</span>,\n})\n\n<span class="code-key">const</span> result = <span class="code-key">await</span> limiter.<span class="code-fn">limit</span>(() =&gt; fetch(<span class="code-string">\'/api/data\'</span>))',
    callback: '<span class="code-muted">// Install the compatible release with npm install rate-limiter-api@legacy</span>\n<span class="code-key">const</span> RateLimiterAPI = require(<span class="code-string">\'rate-limiter-api\'</span>)\n<span class="code-key">const</span> limiter = <span class="code-fn">RateLimiterAPI</span>({ threshold: <span class="code-num">1</span> })\n\nlimiter.<span class="code-fn">limit</span>((done) =&gt; {\n  fetch(<span class="code-string">\'/api/data\'</span>)\n    .then((response) =&gt; done(<span class="code-key">null</span>, response))\n    .catch(done)\n}).<span class="code-fn">then</span>((response) =&gt; {\n  console.<span class="code-fn">log</span>(response)\n})'
  }
  document.querySelectorAll('.code-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.code-tab').forEach(function (other) {
        var active = other === tab
        other.classList.toggle('active', active)
        other.setAttribute('aria-selected', active ? 'true' : 'false')
      })
      document.querySelector('#code-block code').innerHTML = examples[tab.getAttribute('data-example')]
    })
  })

  var navToggle = document.querySelector('.menu-toggle')
  var nav = document.querySelector('#site-nav')
  navToggle.addEventListener('click', function () {
    var open = navToggle.getAttribute('aria-expanded') !== 'true'
    navToggle.setAttribute('aria-expanded', String(open))
    navToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation')
    nav.classList.toggle('open', open)
  })
  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      nav.classList.remove('open')
      navToggle.setAttribute('aria-expanded', 'false')
      navToggle.setAttribute('aria-label', 'Open navigation')
    })
  })

  function setDemoStatus(text) {
    demoStatus.textContent = text
  }

  function setPanelStatus(kind, text) {
    var status = document.querySelector('#panel-status')
    status.className = 'panel-status' + (kind ? ' ' + kind : '')
    status.lastChild.textContent = ' ' + text
  }

  function updateCounters() {
    document.querySelector('#completed-count').innerHTML = completed + ' <small>/ ' + batchSize + '</small>'
    document.querySelector('#active-count').textContent = limiter ? limiter.getRateLimits().active : '0'
    var state = limiter ? limiter.getRateLimits() : null
    document.querySelector('#queued-count').textContent = state ? state.queued : '0'
    if (!state) return
    var total = Number(quotaInput.value)
    var left = Math.max(0, Math.min(total, Math.floor(state.rateRemaining)))
    document.querySelector('#quota-count').textContent = left + ' of ' + total + ' remain'
    var track = document.querySelector('#quota-track')
    track.setAttribute('aria-label', left + ' of ' + total + ' requests remain in this window')
    track.innerHTML = ''
    for (var i = 0; i < total; i++) {
      var segment = document.createElement('span')
      if (i < left) segment.className = 'remaining'
      else if (i === total - 1) segment.className = 'reserved'
      track.appendChild(segment)
    }
  }

  function updateRow(id, state, message) {
    var row = rows.get(id)
    if (!row) return
    row.className = 'request-row ' + state
    var details = row.querySelector('.request-detail')
    details.lastChild.textContent = message
    var meta = row.querySelector('.request-meta')
    meta.textContent = state === 'running' ? 'sending' : state === 'done' ? '200 OK' : state === 'queued' ? 'queued' : 'failed'
  }

  function appendRequest(id) {
    var empty = requestList.querySelector('.empty-state')
    if (empty) empty.remove()
    var row = document.createElement('div')
    row.className = 'request-row queued'
    row.innerHTML = '<span class="request-id">GET</span><span class="request-detail"><i></i><span>Request ' + String(id).padStart(2, '0') + '</span></span><span class="request-meta">queued</span>'
    requestList.prepend(row)
    rows.set(id, row)
    while (requestList.children.length > 18) {
      var removed = requestList.lastElementChild
      var match = removed.querySelector('.request-detail span')
      if (match) rows.delete(Number(match.textContent.replace('Request ', '')))
      removed.remove()
    }
  }

  function updateCountdown() {
    if (!resetAt) return
    var seconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000))
    document.querySelector('#reset-countdown').textContent = seconds + 's'
    var state = limiter && limiter.getRateLimits()
    var waiting = state && state.queued > 0 && state.rateRemaining <= 1
    if (waiting) {
      setPanelStatus('waiting', 'Waiting for reset')
      setDemoStatus('Quota reached. The queued requests will continue when the window resets in ' + seconds + ' seconds.')
    } else if (completed < batchSize) {
      setPanelStatus('busy', 'Processing')
    }
  }

  function finishBatch(token) {
    if (token !== batchToken) return
    if (completed < batchSize) return
    runButton.disabled = false
    quotaInput.disabled = false
    concurrencyInput.disabled = false
    requestCount.disabled = false
    runButton.querySelector('span:last-child').textContent = 'Run another batch'
    setPanelStatus('', 'Complete')
    setDemoStatus('All ' + batchSize + ' simulated requests completed. Try another quota or concurrency setting.')
    clearInterval(countdownTimer)
    countdownTimer = null
    clearTimeout(resetTimer)
    resetTimer = null
    resetAt = 0
    document.querySelector('#reset-countdown').textContent = '—'
    updateCounters()
  }

  function runDemo() {
    if (typeof window.RateLimiterAPI !== 'function' || runButton.disabled) return
    var quota = Number(quotaInput.value)
    var concurrency = Number(concurrencyInput.value)
    batchSize = Number(requestCount.value)
    var token = ++batchToken
    completed = 0
    rows = new Map()
    requestList.innerHTML = ''
    runButton.disabled = true
    quotaInput.disabled = true
    concurrencyInput.disabled = true
    requestCount.disabled = true
    runButton.querySelector('span:last-child').textContent = 'Sending requests…'
    setPanelStatus('busy', 'Starting')
    setDemoStatus('Handing ' + batchSize + ' requests to the real 2.0.0 scheduler…')
    limiter = window.RateLimiterAPI({threshold: 1, concurrency: concurrency})
    resetAt = Date.now() + 6000
    limiter.updateRateLimits({rateLimit: quota, rateRemaining: quota, rateReset: resetAt})
    document.querySelector('#reset-countdown').textContent = '6s'
    clearInterval(countdownTimer)
    countdownTimer = setInterval(updateCountdown, 250)
    clearTimeout(resetTimer)
    function renewWindow() {
      if (token !== batchToken || !limiter || completed >= batchSize) return
      resetAt = Date.now() + 6000
      limiter.updateRateLimits({rateLimit: quota, rateRemaining: quota, rateReset: resetAt})
      updateCounters()
      resetTimer = setTimeout(renewWindow, 6000)
    }
    resetTimer = setTimeout(renewWindow, 6000)
    updateCounters()

    var jobs = []
    for (var id = 1; id <= batchSize; id++) {
      appendRequest(id)
      ;(function (requestId) {
        var job = limiter.limit(function () {
          updateRow(requestId, 'running', 'Request ' + String(requestId).padStart(2, '0'))
          updateCounters()
          return new Promise(function (resolve) {
            setTimeout(function () {
              if (token === batchToken) {
                updateRow(requestId, 'done', 'Request ' + String(requestId).padStart(2, '0'))
                completed++
                updateCounters()
              }
              resolve({status: 200, id: requestId})
            }, 580 + (requestId % 3) * 170)
          })
        })
        jobs.push(job)
      })(id)
    }
    updateCounters()
    Promise.all(jobs).then(function () { finishBatch(token) }).catch(function (error) {
      if (token !== batchToken) return
      runButton.disabled = false
      quotaInput.disabled = false
      concurrencyInput.disabled = false
      requestCount.disabled = false
      runButton.querySelector('span:last-child').textContent = 'Try again'
      setPanelStatus('', 'Error')
      setDemoStatus(error.message || 'The simulated batch could not complete.')
      clearInterval(countdownTimer)
    })
  }

  quotaInput.addEventListener('input', function () { document.querySelector('#quota-value').value = quotaInput.value })
  concurrencyInput.addEventListener('input', function () { document.querySelector('#concurrency-value').value = concurrencyInput.value })
  requestCount.addEventListener('change', function () { runButton.querySelector('span:last-child').textContent = 'Run ' + requestCount.value + ' requests' })
  runButton.addEventListener('click', runDemo)
  document.querySelector('#clear-demo').addEventListener('click', function () {
    if (limiter) limiter.close()
    batchToken++
    limiter = null
    batchSize = 0
    completed = 0
    rows.clear()
    clearInterval(countdownTimer)
    countdownTimer = null
    clearTimeout(resetTimer)
    resetTimer = null
    resetAt = 0
    requestList.innerHTML = '<div class="empty-state"><span class="empty-mark">↘</span><strong>Your queue is clear.</strong><span>Run a batch to watch requests pass through.</span></div>'
    document.querySelector('#reset-countdown').textContent = '—'
    document.querySelector('#completed-count').innerHTML = '0 <small>/ 0</small>'
    document.querySelector('#active-count').textContent = '0'
    document.querySelector('#queued-count').textContent = '0'
    document.querySelector('#quota-count').textContent = quotaInput.value + ' available'
    quotaInput.disabled = false
    concurrencyInput.disabled = false
    requestCount.disabled = false
    drawEmptyQuota()
    runButton.disabled = typeof window.RateLimiterAPI !== 'function'
    runButton.querySelector('span:last-child').textContent = 'Run ' + requestCount.value + ' requests'
    setPanelStatus('', 'Ready')
    setDemoStatus('Ready. Change the quota or concurrency, then send a batch.')
  })

  if (typeof window.RateLimiterAPI === 'function') {
    runButton.disabled = false
    runButton.querySelector('span:last-child').textContent = 'Run ' + requestCount.value + ' requests'
    setDemoStatus('Ready. Change the quota or concurrency, then send a batch.')
    drawEmptyQuota()
  } else if (window.rateLimiterBundleFailed) {
    runButton.querySelector('span:last-child').textContent = 'Demo unavailable'
    setDemoStatus('The package bundle could not load. Check your connection and refresh to try again.')
  } else {
    runButton.querySelector('span:last-child').textContent = 'Demo unavailable'
    setDemoStatus('The package bundle is unavailable in this browser.')
  }

  function drawEmptyQuota() {
    var total = Number(quotaInput.value)
    var track = document.querySelector('#quota-track')
    track.setAttribute('aria-label', total + ' requests available in this window')
    track.innerHTML = ''
    for (var i = 0; i < total; i++) {
      var segment = document.createElement('span')
      segment.className = i === total - 1 ? 'reserved' : 'remaining'
      track.appendChild(segment)
    }
  }
})()

