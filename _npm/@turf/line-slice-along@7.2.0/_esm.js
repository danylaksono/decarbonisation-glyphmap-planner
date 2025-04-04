/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/line-slice-along@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{bearing as r}from"../bearing@7.2.0/_esm.js";import{distance as e}from"../distance@7.2.0/_esm.js";import{destination as t}from"../destination@7.2.0/_esm.js";import{isObject as n,lineString as o}from"../helpers@7.2.0/_esm.js";function i(i,s,m,p){if(!n(p=p||{}))throw new Error("options is invalid");var f,u=[];if("Feature"===i.type)f=i.geometry.coordinates;else{if("LineString"!==i.type)throw new Error("input must be a LineString Feature or Geometry");f=i.coordinates}for(var a,h,g,l=f.length,d=0,y=0;y<f.length&&!(s>=d&&y===f.length-1);y++){if(d>s&&0===u.length){if(!(a=s-d))return u.push(f[y]),o(u);h=r(f[y],f[y-1])-180,g=t(f[y],a,h,p),u.push(g.geometry.coordinates)}if(d>=m)return(a=m-d)?(h=r(f[y],f[y-1])-180,g=t(f[y],a,h,p),u.push(g.geometry.coordinates),o(u)):(u.push(f[y]),o(u));if(d>=s&&u.push(f[y]),y===f.length-1)return o(u);d+=e(f[y],f[y+1],p)}if(d<s&&f.length===l)throw new Error("Start position is beyond line");var c=f[f.length-1];return o([c,c])}var s=i;export{s as default,i as lineSliceAlong};
