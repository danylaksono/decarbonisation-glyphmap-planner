/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/circle@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{destination as r}from"../destination@7.2.0/_esm.js";import{polygon as e}from"../helpers@7.2.0/_esm.js";function t(t,p,o={}){const s=o.steps||64,i=o.properties?o.properties:!Array.isArray(t)&&"Feature"===t.type&&t.properties?t.properties:{},m=[];for(let e=0;e<s;e++)m.push(r(t,p,-360*e/s,o).geometry.coordinates);return m.push(m[0]),e([m],i)}var p=t;export{t as circle,p as default};
