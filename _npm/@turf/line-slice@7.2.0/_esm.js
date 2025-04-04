/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/line-slice@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{getCoords as r,getType as e}from"../invariant@7.2.0/_esm.js";import{lineString as t}from"../helpers@7.2.0/_esm.js";import{nearestPointOnLine as i}from"../nearest-point-on-line@7.2.0/_esm.js";function n(n,o,p){var s=r(p);if("LineString"!==e(p))throw new Error("line must be a LineString");for(var m,a=i(p,n),f=i(p,o),u=[(m=a.properties.index<=f.properties.index?[a,f]:[f,a])[0].geometry.coordinates],d=m[0].properties.index+1;d<m[1].properties.index+1;d++)u.push(s[d]);return u.push(m[1].geometry.coordinates),t(u,p.properties)}var o=n;export{o as default,n as lineSlice};
