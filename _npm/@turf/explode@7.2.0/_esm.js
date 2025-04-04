/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/explode@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{featureEach as t,coordEach as e}from"../meta@7.2.0/_esm.js";import{point as r,featureCollection as n}from"../helpers@7.2.0/_esm.js";function o(o){const p=[];return"FeatureCollection"===o.type?t(o,(function(t){e(t,(function(e){p.push(r(e,t.properties))}))})):"Feature"===o.type?e(o,(function(t){p.push(r(t,o.properties))})):e(o,(function(t){p.push(r(t))})),n(p)}var p=o;export{p as default,o as explode};
