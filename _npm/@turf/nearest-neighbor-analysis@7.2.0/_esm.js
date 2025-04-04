/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/nearest-neighbor-analysis@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{area as e}from"../area@7.2.0/_esm.js";import{bbox as r}from"../bbox@7.2.0/_esm.js";import{bboxPolygon as t}from"../bbox-polygon@7.2.0/_esm.js";import{centroid as m}from"../centroid@7.2.0/_esm.js";import{distance as o}from"../distance@7.2.0/_esm.js";import{nearestPoint as n}from"../nearest-point@7.2.0/_esm.js";import{featureEach as s}from"../meta@7.2.0/_esm.js";import{featureCollection as i,convertArea as p}from"../helpers@7.2.0/_esm.js";function a(a,f){const u=(f=f||{}).studyArea||t(r(a)),c=f.properties||{},d=f.units||"kilometers",b=[];s(a,(e=>{b.push(m(e))}));const l=b.length,h=b.map(((e,r)=>{const t=i(b.filter(((e,t)=>t!==r)));return o(e,n(e,t).geometry.coordinates,{units:d})})).reduce(((e,r)=>e+r),0)/l,g=l/p(e(u),"meters",d),x=1/(2*Math.sqrt(g)),y=.26136/Math.sqrt(l*g);return c.nearestNeighborAnalysis={units:d,arealUnits:d+"²",observedMeanDistance:h,expectedMeanDistance:x,nearestNeighborIndex:h/x,numberOfPoints:l,zScore:(h-x)/y},u.properties=c,u}var f=a;export{f as default,a as nearestNeighborAnalysis};
