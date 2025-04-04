/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/collect@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{bbox as r}from"../bbox@7.2.0/_esm.js";import{booleanPointInPolygon as o}from"../boolean-point-in-polygon@7.2.0/_esm.js";import e from"../../rbush@3.0.1/_esm.js";var t=e;function n(e,n,m,i){var a=new t(6),p=n.features.map((function(r){var o;return{minX:r.geometry.coordinates[0],minY:r.geometry.coordinates[1],maxX:r.geometry.coordinates[0],maxY:r.geometry.coordinates[1],property:null==(o=r.properties)?void 0:o[m]}}));return a.load(p),e.features.forEach((function(e){e.properties||(e.properties={});var t=r(e),n=a.search({minX:t[0],minY:t[1],maxX:t[2],maxY:t[3]}),m=[];n.forEach((function(r){o([r.minX,r.minY],e)&&m.push(r.property)})),e.properties[i]=m})),e}var m=n;export{n as collect,m as default};
