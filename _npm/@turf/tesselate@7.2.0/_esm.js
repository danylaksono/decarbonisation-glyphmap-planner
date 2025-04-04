/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/tesselate@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import e from"../../earcut@2.2.4/_esm.js";import{polygon as t}from"../helpers@7.2.0/_esm.js";function o(e){if(!e.geometry||"Polygon"!==e.geometry.type&&"MultiPolygon"!==e.geometry.type)throw new Error("input must be a Polygon or MultiPolygon");const t={type:"FeatureCollection",features:[]};return"Polygon"===e.geometry.type?t.features=r(e.geometry.coordinates):e.geometry.coordinates.forEach((function(e){t.features=t.features.concat(r(e))})),t}function r(o){const r=function(e){const t=e[0][0].length,o={vertices:[],holes:[],dimensions:t};let r=0;for(let n=0;n<e.length;n++){for(let r=0;r<e[n].length;r++)for(let s=0;s<t;s++)o.vertices.push(e[n][r][s]);n>0&&(r+=e[n-1].length,o.holes.push(r))}return o}(o),n=e(r.vertices,r.holes,2),s=[],u=[];n.forEach((function(e,t){const o=n[t];u.push([r.vertices[2*o],r.vertices[2*o+1]])}));for(var c=0;c<u.length;c+=3){const e=u.slice(c,c+3);e.push(u[c]),s.push(t([e]))}return s}var n=o;export{n as default,o as tesselate};
