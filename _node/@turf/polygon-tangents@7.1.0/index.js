import{getCoords as k,getType as P}from"../invariant@7.1.0/index.js";import{featureCollection as T,point as y}from"../helpers@7.1.0/index.js";import{bbox as C}from"../bbox@7.1.0/index.js";import{explode as E}from"../explode@7.1.0/index.js";import{nearestPoint as w}from"../nearest-point@7.1.0/index.js";function b(e,n){const t=k(e),o=k(n);let l=[],r=[],f;const a=C(n);let i=0,c=null;switch(t[0]>a[0]&&t[0]<a[2]&&t[1]>a[1]&&t[1]<a[3]&&(c=w(e,E(n)),i=c.properties.featureIndex),P(n)){case"Polygon":l=o[0][i],r=o[0][0],c!==null&&c.geometry.coordinates[1]<t[1]&&(r=o[0][i]),f=u(o[0][0],o[0][o[0].length-1],t),[l,r]=v(o[0],t,f,l,r);break;case"MultiPolygon":for(var g=0,s=0,h=0,p=0;p<o[0].length;p++){g=p;for(var d=!1,m=0;m<o[0][p].length;m++){if(s=m,h===i){d=!0;break}h++}if(d)break}l=o[0][g][s],r=o[0][g][s],f=u(o[0][0][0],o[0][0][o[0][0].length-1],t),o.forEach(function(x){[l,r]=v(x[0],t,f,l,r)});break}return T([y(l),y(r)])}function v(e,n,t,o,l){for(let r=0;r<e.length;r++){const f=e[r];let a=e[r+1];r===e.length-1&&(a=e[0]);const i=u(f,a,n);t<=0&&i>0?I(n,f,o)||(o=f):t>0&&i<=0&&(A(n,f,l)||(l=f)),t=i}return[o,l]}function A(e,n,t){return u(e,n,t)>0}function I(e,n,t){return u(e,n,t)<0}function u(e,n,t){return(n[0]-e[0])*(t[1]-e[1])-(t[0]-e[0])*(n[1]-e[1])}var M=b;export{M as default,b as polygonTangents};