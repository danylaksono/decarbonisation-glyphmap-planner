import{degreesToRadians as o,radiansToDegrees as g}from"../helpers@7.1.0/index.js";import{getCoord as f}from"../invariant@7.1.0/index.js";function n(a,r,t={}){if(t.final===!0)return l(a,r);const s=f(a),i=f(r),h=o(s[0]),M=o(i[0]),c=o(s[1]),e=o(i[1]),u=Math.sin(M-h)*Math.cos(e),d=Math.cos(c)*Math.sin(e)-Math.sin(c)*Math.cos(e)*Math.cos(M-h);return g(Math.atan2(u,d))}function l(a,r){let t=n(r,a);return t=(t+180)%360,t}var m=n;export{n as bearing,m as default};