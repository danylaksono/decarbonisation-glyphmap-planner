/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/tag@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{booleanPointInPolygon as r}from"../boolean-point-in-polygon@7.2.0/_esm.js";import{clone as o}from"../clone@7.2.0/_esm.js";import{featureEach as e}from"../meta@7.2.0/_esm.js";function p(p,t,i,n){return p=o(p),t=o(t),e(p,(function(o){o.properties||(o.properties={}),e(t,(function(e){o.properties&&e.properties&&void 0===o.properties[n]&&r(o,e)&&(o.properties[n]=e.properties[i])}))})),p}var t=p;export{t as default,p as tag};
