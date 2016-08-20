var production = process.env.NODE_ENV

if (production) {
	module.exports = require('./dist/rate-limiter-api')
} else {
	module.exports = require('./src')
}
