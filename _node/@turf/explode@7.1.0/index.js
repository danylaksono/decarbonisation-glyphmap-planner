import{featureEach as i,coordEach as t}from"../meta@7.1.0/index.js";import{point as n,featureCollection as c}from"../helpers@7.1.0/index.js";function u(o){const r=[];return o.type==="FeatureCollection"?i(o,function(e){t(e,function(p){r.push(n(p,e.properties))})}):o.type==="Feature"?t(o,function(e){r.push(n(e,o.properties))}):t(o,function(e){r.push(n(e))}),c(r)}var a=u;export{a as default,u as explode};