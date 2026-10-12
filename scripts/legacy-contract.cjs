// Compatibility oracle: these observable semantics come from npm 1.0.11.
const path = require('path')
const exported = require(path.resolve(process.argv[2]))
const factory = typeof exported === 'function' ? exported : exported.default
const stamp = factory.refs({threshold: 2, custom: 'ref'}).props({nested:{count:0}, array:[1,2]}).methods({describe:function(){return this.threshold}}).init(function(context){this.args=context.args; this.initialized=true}).static({kind:'custom'})
const a = stamp({threshold: 3}, 'argument')
const b = stamp.create()
a.nested.count = 1
a.array.push(3)
const methods = ['create','refs','state','props','methods','init','enclose','static','compose'].map(name => [name,typeof factory[name]])
console.log(JSON.stringify({methods,defaultThreshold:factory().threshold,thresholds:[a.describe(),b.describe()],custom:a.custom,nested:b.nested,array:b.array,args:a.args,initialized:a.initialized,kind:stamp.kind,composed:factory.compose(stamp)().describe(),fixedThreshold:stamp.fixed.refs.threshold}))
