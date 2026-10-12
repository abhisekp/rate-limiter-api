const {test} = require('node:test')
const assert = require('node:assert/strict')

test('Registry propagation: retries missing/stale metadata until the expected tag appears', async () => {
  const {waitForRegistry} = await import('../scripts/registry-wait.mjs')
  let calls = 0; let time = 0
  await waitForRegistry(() => {
    calls++
    if (calls === 1) throw new Error('npm error E404')
    return calls === 2 ? '1.0.11' : '1.0.12'
  }, '1.0.12', {now: () => time, delay: async () => {time += 10}, timeoutMs: 100})
  assert.equal(calls, 3)
})
test('Registry propagation: authentication errors fail immediately', async () => {
  const {waitForRegistry} = await import('../scripts/registry-wait.mjs')
  await assert.rejects(waitForRegistry(() => {throw new Error('npm error E403')}, '1.0.12'), /E403/)
})
test('Registry propagation: a missing release fails at the bounded deadline', async () => {
  const {waitForRegistry} = await import('../scripts/registry-wait.mjs')
  let time = 0
  await assert.rejects(waitForRegistry(() => '1.0.11', '1.0.12', {now: () => time, delay: async () => {time += 10}, timeoutMs: 20}), /timed out/)
})
