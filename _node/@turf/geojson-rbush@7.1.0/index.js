import i from"../../rbush@3.0.1/index.js";import{featureCollection as a}from"../helpers@7.1.0/index.js";import{featureEach as f}from"../meta@7.1.0/index.js";import{bbox as n}from"../bbox@7.1.0/index.js";function l(u){var r=new i(u);return r.insert=function(t){if(t.type!=="Feature")throw new Error("invalid feature");return t.bbox=t.bbox?t.bbox:n(t),i.prototype.insert.call(this,t)},r.load=function(t){var e=[];return Array.isArray(t)?t.forEach(function(o){if(o.type!=="Feature")throw new Error("invalid features");o.bbox=o.bbox?o.bbox:n(o),e.push(o)}):f(t,function(o){if(o.type!=="Feature")throw new Error("invalid features");o.bbox=o.bbox?o.bbox:n(o),e.push(o)}),i.prototype.load.call(this,e)},r.remove=function(t,e){if(t.type!=="Feature")throw new Error("invalid feature");return t.bbox=t.bbox?t.bbox:n(t),i.prototype.remove.call(this,t,e)},r.clear=function(){return i.prototype.clear.call(this)},r.search=function(t){var e=i.prototype.search.call(this,this.toBBox(t));return a(e)},r.collides=function(t){return i.prototype.collides.call(this,this.toBBox(t))},r.all=function(){var t=i.prototype.all.call(this);return a(t)},r.toJSON=function(){return i.prototype.toJSON.call(this)},r.fromJSON=function(t){return i.prototype.fromJSON.call(this,t)},r.toBBox=function(t){var e;if(t.bbox)e=t.bbox;else if(Array.isArray(t)&&t.length===4)e=t;else if(Array.isArray(t)&&t.length===6)e=[t[0],t[1],t[3],t[4]];else if(t.type==="Feature")e=n(t);else if(t.type==="FeatureCollection")e=n(t);else throw new Error("invalid geojson");return{minX:e[0],minY:e[1],maxX:e[2],maxY:e[3]}},r}var s=l;export{s as default,l as geojsonRbush};