var production = process.env.NODE_ENV

if (production) {
	module.exports = require('./dist')
} else {
	module.exports = require('./src')
}
