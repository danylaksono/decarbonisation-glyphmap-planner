import{clone as E}from"../clone@7.1.0/index.js";import{distance as P}from"../distance@7.1.0/index.js";import{lengthToDegrees as R,degreesToRadians as M}from"../helpers@7.1.0/index.js";import _ from"../../rbush@3.0.1/index.js";var j=_;function b(a,f,u={}){u.mutate!==!0&&(a=E(a));const p=u.minPoints||3,i=R(f,u.units);var h=new j(a.features.length),m=a.features.map(s=>!1),d=a.features.map(s=>!1),l=a.features.map(s=>!1),c=a.features.map(s=>-1);h.load(a.features.map((s,e)=>{var[r,n]=s.geometry.coordinates;return{minX:r,minY:n,maxX:r,maxY:n,index:e}}));const g=s=>{const e=a.features[s],[r,n]=e.geometry.coordinates,t=Math.max(n-i,-90),o=Math.min(n+i,90),v=function(){return t<0&&o>0?i:Math.abs(t)<Math.abs(o)?i/Math.cos(M(o)):i/Math.cos(M(t))}(),Y=Math.max(r-v,-360),y=Math.min(r+v,360),D={minX:Y,minY:t,maxX:y,maxY:o};return h.search(D).filter(T=>{const k=T.index,w=a.features[k];return P(e,w,{units:"kilometers"})<=f})},X=(s,e)=>{for(var r=0;r<e.length;r++){var n=e[r];const t=n.index;if(!m[t]){m[t]=!0;const o=g(t);o.length>=p&&e.push(...o)}d[t]||(d[t]=!0,c[t]=s)}};var x=0;return a.features.forEach((s,e)=>{if(m[e])return;const r=g(e);if(r.length>=p){const n=x;x++,m[e]=!0,X(n,r)}else l[e]=!0}),a.features.forEach((s,e)=>{var r=a.features[e];r.properties||(r.properties={}),c[e]>=0?(r.properties.dbscan=l[e]?"edge":"core",r.properties.cluster=c[e]):r.properties.dbscan="noise"}),a}var q=b;export{b as clustersDbscan,q as default};