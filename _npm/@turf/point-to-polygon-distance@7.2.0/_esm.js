/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/point-to-polygon-distance@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{booleanPointInPolygon as t}from"../boolean-point-in-polygon@7.2.0/_esm.js";import{pointToLineDistance as o}from"../point-to-line-distance@7.2.0/_esm.js";import{polygonToLine as n}from"../polygon-to-line@7.2.0/_esm.js";import{getGeom as r}from"../invariant@7.2.0/_esm.js";import{flattenEach as i}from"../meta@7.2.0/_esm.js";import{polygon as e}from"../helpers@7.2.0/_esm.js";function m(s,a,p={}){var u,f;const l=null!=(u=p.method)?u:"geodesic",h=null!=(f=p.units)?f:"kilometers";if(!s)throw new Error("point is required");if(!a)throw new Error("polygon or multi-polygon is required");const c=r(a);if("MultiPolygon"===c.type){const o=c.coordinates.map((t=>m(s,e(t),{method:l,units:h})));return Math.min(...o.map(Math.abs))*(t(s,a)?-1:1)}if(c.coordinates.length>1){const[t,...o]=c.coordinates.map((t=>m(s,e([t]),{method:l,units:h})));if(t>=0)return t;const n=Math.min(...o);return n<0?Math.abs(n):Math.min(n,Math.abs(t))}const d=n(c);let M=1/0;return i(d,(t=>{M=Math.min(M,o(s,t,{method:l,units:h}))})),t(s,c)?-M:M}var s=m;export{s as default,m as pointToPolygonDistance};
