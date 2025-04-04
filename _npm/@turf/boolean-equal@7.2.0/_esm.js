/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/boolean-equal@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{geojsonEquality as r}from"../../geojson-equality-ts@1.0.2/_esm.js";import{cleanCoords as e}from"../clean-coords@7.2.0/_esm.js";import{getGeom as o}from"../invariant@7.2.0/_esm.js";function t(t,i,n={}){let m=n.precision;if(m=null==m||isNaN(m)?6:m,"number"!=typeof m||!(m>=0))throw new Error("precision must be a positive number");return o(t).type===o(i).type&&r(e(t),e(i),{precision:m})}var i=t;export{t as booleanEqual,i as default};
