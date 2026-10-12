// npm accepts publishes before every registry edge exposes the version/tag.
export async function waitForRegistry(query, expected, options = {}) {
  const now = options.now || Date.now
  const delay = options.delay || (() => new Promise(resolve => setTimeout(resolve, 10000)))
  const deadline = now() + (options.timeoutMs === undefined ? 300000 : options.timeoutMs)
  let last = ''
  while (true) {
    try {
      const actual = await query()
      if (actual === expected) return
      last = `Expected ${expected}, registry reports ${actual}`
    } catch (error) {
      if (!/\bE404\b/.test(error.message)) throw error
      last = error.message
    }
    if (now() >= deadline) throw new Error(`Registry availability timed out: ${last}`)
    await delay()
  }
}
