import{segmentEach as i}from"../meta@7.1.0/index.js";import{getGeom as p}from"../invariant@7.1.0/index.js";import{lineOverlap as P}from"../line-overlap@7.1.0/index.js";import{lineIntersect as M}from"../line-intersect@7.1.0/index.js";import{geojsonEquality as h}from"../../geojson-equality-ts@1.0.2/index.js";function y(o,r){const n=p(o),a=p(r),t=n.type,e=a.type;if(t==="MultiPoint"&&e!=="MultiPoint"||(t==="LineString"||t==="MultiLineString")&&e!=="LineString"&&e!=="MultiLineString"||(t==="Polygon"||t==="MultiPolygon")&&e!=="Polygon"&&e!=="MultiPolygon")throw new Error("features must be of the same type");if(t==="Point")throw new Error("Point geometry not supported");if(h(o,r,{precision:6}))return!1;let l=0;switch(t){case"MultiPoint":for(var s=0;s<n.coordinates.length;s++)for(var u=0;u<a.coordinates.length;u++){var c=n.coordinates[s],m=a.coordinates[u];if(c[0]===m[0]&&c[1]===m[1])return!0}return!1;case"LineString":case"MultiLineString":i(o,g=>{i(r,f=>{P(g,f).features.length&&l++})});break;case"Polygon":case"MultiPolygon":i(o,g=>{i(r,f=>{M(g,f).features.length&&l++})});break}return l>0}var d=y;export{y as booleanOverlap,d as default};