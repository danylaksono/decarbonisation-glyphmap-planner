/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/centroid@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{point as r}from"../helpers@7.2.0/_esm.js";import{coordEach as t}from"../meta@7.2.0/_esm.js";function e(e,m={}){let o=0,p=0,f=0;return t(e,(function(r){o+=r[0],p+=r[1],f++}),!0),r([o/f,p/f],m.properties)}var m=e;export{e as centroid,m as default};
