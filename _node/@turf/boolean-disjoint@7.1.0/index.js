import{booleanPointInPolygon as s}from"../boolean-point-in-polygon@7.1.0/index.js";import{lineIntersect as a}from"../line-intersect@7.1.0/index.js";import{flattenEach as f}from"../meta@7.1.0/index.js";import{polygonToLine as u}from"../polygon-to-line@7.1.0/index.js";function l(t,e,n={}){var o;const c=(o=n.ignoreSelfIntersections)!=null?o:!1;let r=!0;return f(t,i=>{f(e,h=>{if(r===!1)return!1;r=P(i.geometry,h.geometry,c)})}),r}function P(t,e,n){switch(t.type){case"Point":switch(e.type){case"Point":return!S(t.coordinates,e.coordinates);case"LineString":return!g(e,t);case"Polygon":return!s(t,e)}break;case"LineString":switch(e.type){case"Point":return!g(t,e);case"LineString":return!d(t,e,n);case"Polygon":return!y(e,t,n)}break;case"Polygon":switch(e.type){case"Point":return!s(e,t);case"LineString":return!y(t,e,n);case"Polygon":return!m(e,t,n)}}return!1}function g(t,e){for(let n=0;n<t.coordinates.length-1;n++)if(p(t.coordinates[n],t.coordinates[n+1],e.coordinates))return!0;return!1}function d(t,e,n){return a(t,e,{ignoreSelfIntersections:n}).features.length>0}function y(t,e,n){for(const o of e.coordinates)if(s(o,t))return!0;return a(e,u(t),{ignoreSelfIntersections:n}).features.length>0}function m(t,e,n){for(const o of t.coordinates[0])if(s(o,e))return!0;for(const o of e.coordinates[0])if(s(o,t))return!0;return a(u(t),u(e),{ignoreSelfIntersections:n}).features.length>0}function p(t,e,n){const o=n[0]-t[0],c=n[1]-t[1],r=e[0]-t[0],i=e[1]-t[1];return o*i-c*r!==0?!1:Math.abs(r)>=Math.abs(i)?r>0?t[0]<=n[0]&&n[0]<=e[0]:e[0]<=n[0]&&n[0]<=t[0]:i>0?t[1]<=n[1]&&n[1]<=e[1]:e[1]<=n[1]&&n[1]<=t[1]}function S(t,e){return t[0]===e[0]&&t[1]===e[1]}var b=l;export{l as booleanDisjoint,b as default};