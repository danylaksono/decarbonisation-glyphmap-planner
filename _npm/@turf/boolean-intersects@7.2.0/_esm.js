/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/boolean-intersects@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{booleanDisjoint as e}from"../boolean-disjoint@7.2.0/_esm.js";import{flattenEach as r}from"../meta@7.2.0/_esm.js";function t(t,o,{ignoreSelfIntersections:n=!0}={}){let m=!1;return r(t,(t=>{r(o,(r=>{if(!0===m)return!0;m=!e(t.geometry,r.geometry,{ignoreSelfIntersections:n})}))})),m}var o=t;export{t as booleanIntersects,o as default};
