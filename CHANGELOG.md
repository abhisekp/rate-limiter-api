# Changelog

## 1.0.12 — prepared, not yet published

- Preserve the npm 1.0.11 Stampit 2 factory/composition contract and `.default` access; also expose a directly callable CommonJS/browser factory.
- Share the repaired scheduler with 2.x. Reserve quota before dispatch, use the last allowed request, handle resets once, ignore malformed/omitted legacy headers, catch handler exceptions and tolerate duplicate completion.
- Avoid negative concurrency stalls and stale-header quota refills. Keep historically unused `strategy`, `numberOfRequests` and `rateUpdater` behavior unchanged.
- Remove vulnerable runtime dependency installations by bundling the pinned legacy adapter with patched Lodash. Add declarations, Node 6 consumer checks, regression tests and CI.

## 2.0.0 — prepared, not yet published

- Add native ESM, CommonJS, browser and TypeScript entry points with no runtime dependencies. Require Node 22+ for modern consumers.
- Accept Promise-returning handlers alongside callbacks. Default concurrency is one; configure it explicitly for parallel requests.
- Validate header updates atomically and reject invalid data. Implement uniform pacing and per-window request caps.
- Support queued cancellation, task timeout, state snapshots and shutdown. Running requests remain the application's responsibility; a timeout does not abort transport work.
- Maintain both major versions from shared source, independent release manifests, tested npm archives and separate `legacy`/`latest` dist-tags.
