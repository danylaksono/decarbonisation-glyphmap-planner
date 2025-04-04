/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/destination@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{degreesToRadians as t,lengthToRadians as a,radiansToDegrees as s,point as n}from"../helpers@7.2.0/_esm.js";import{getCoord as h}from"../invariant@7.2.0/_esm.js";function i(i,r,o,M={}){const e=h(i),m=t(e[0]),p=t(e[1]),c=t(o),f=a(r,M.units),u=Math.asin(Math.sin(p)*Math.cos(f)+Math.cos(p)*Math.sin(f)*Math.cos(c)),l=m+Math.atan2(Math.sin(c)*Math.sin(f)*Math.cos(p),Math.cos(f)-Math.sin(p)*Math.sin(u)),v=s(l),d=s(u);return n([v,d],M.properties)}var r=i;export{r as default,i as destination};
