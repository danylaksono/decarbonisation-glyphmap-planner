/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/line-chunk@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{length as r}from"../length@7.2.0/_esm.js";import{lineSliceAlong as e}from"../line-slice-along@7.2.0/_esm.js";import{flattenEach as t}from"../meta@7.2.0/_esm.js";import{isObject as o,featureCollection as n}from"../helpers@7.2.0/_esm.js";function i(i,m,s){if(!o(s=s||{}))throw new Error("options is invalid");var f=s.units,u=s.reverse;if(!i)throw new Error("geojson is required");if(m<=0)throw new Error("segmentLength must be greater than 0");var a=[];return t(i,(function(t){u&&(t.geometry.coordinates=t.geometry.coordinates.reverse()),function(t,o,n,i){var m=r(t,{units:n});if(m<=o)return i(t);var s=m/o;Number.isInteger(s)||(s=Math.floor(s)+1);for(var f=0;f<s;f++){i(e(t,o*f,o*(f+1),{units:n}),f)}}(t,m,f,(function(r){a.push(r)}))})),n(a)}var m=i;export{m as default,i as lineChunk};
