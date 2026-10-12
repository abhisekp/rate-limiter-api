import modern = require('../../build/modern');
import legacy = require('../../build/legacy');
const modernLimiter = modern({threshold: 0, concurrency: 2});
legacy.default({threshold: 1});
modern.default({threshold: 1});
const asyncValue: Promise<number> = modernLimiter.limit(async () => 42);
const callbackValue: Promise<string> = modernLimiter.limit<string>(done => done(null, 'ok'));
modernLimiter.updateRateLimits({rateRemaining: '10'});
modernLimiter.getRateLimits().queued;
modernLimiter.close();
const stamp = legacy.refs({threshold: 1}).methods({label() {return 'custom'}}).init(function () {this.label = 'custom'});
const oldValue: Promise<string> = stamp.create().limit<string>(done => done(null, 'legacy'));
// @ts-expect-error Bad options must fail the consumer's type check.
modern({concurrency: 'two'});
// @ts-expect-error Callback result does not match the declared response type.
modernLimiter.limit<number>(done => done(null, 'wrong'));
void [asyncValue, callbackValue, oldValue];
