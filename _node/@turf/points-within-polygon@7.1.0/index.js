import{booleanPointInPolygon as p}from"../boolean-point-in-polygon@7.1.0/index.js";import{multiPoint as m,featureCollection as c}from"../helpers@7.1.0/index.js";import{featureEach as s,geomEach as a,coordEach as h}from"../meta@7.1.0/index.js";function f(l,r){const e=[];return s(l,function(o){let t=!1;if(o.geometry.type==="Point")a(r,function(n){p(o,n)&&(t=!0)}),t&&e.push(o);else if(o.geometry.type==="MultiPoint"){var i=[];a(r,function(n){h(o,function(u){p(u,n)&&(t=!0,i.push(u))})}),t&&e.push(m(i,o.properties))}else throw new Error("Input geometry must be a Point or MultiPoint")}),c(e)}var P=f;export{P as default,f as pointsWithinPolygon};