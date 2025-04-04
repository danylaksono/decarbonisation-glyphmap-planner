/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/center-mean@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{geomEach as e,coordEach as r}from"../meta@7.2.0/_esm.js";import{isNumber as t,point as n}from"../helpers@7.2.0/_esm.js";function o(o,u={}){let i=0,m=0,f=0;return e(o,(function(e,n,o){let l=u.weight?null==o?void 0:o[u.weight]:void 0;if(l=null==l?1:l,!t(l))throw new Error("weight value must be a number for feature index "+n);l=Number(l),l>0&&r(e,(function(e){i+=e[0]*l,m+=e[1]*l,f+=l}))})),n([i/f,m/f],u.properties,u)}var u=o;export{o as centerMean,u as default};
