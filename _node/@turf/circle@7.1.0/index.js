import{destination as n}from"../destination@7.1.0/index.js";import{polygon as c}from"../helpers@7.1.0/index.js";function s(r,i,t={}){const p=t.steps||64,a=t.properties?t.properties:!Array.isArray(r)&&r.type==="Feature"&&r.properties?r.properties:{},o=[];for(let e=0;e<p;e++)o.push(n(r,i,e*-360/p,t).geometry.coordinates);return o.push(o[0]),c([o],a)}var u=s;export{s as circle,u as default};