import{validateBBox as f,point as v,featureCollection as c,isNumber as m,polygon as p,isObject as y,lineString as P}from"../helpers@7.1.0/index.js";function w(t){return d(t),x(t)}function x(t){return Array.isArray(t)?g(t):t&&t.bbox?g(t.bbox):[j(),B()]}function d(t){t!=null&&(Array.isArray(t)?f(t):t.bbox!=null&&f(t.bbox))}function A(t,n={}){d(n.bbox),t==null&&(t=1);const r=[];for(let i=0;i<t;i++)r.push(v(x(n.bbox)));return c(r)}function E(t,n={}){d(n.bbox),t==null&&(t=1),(n.bbox===void 0||n.bbox===null)&&(n.bbox=[-180,-90,180,90]),(!m(n.num_vertices)||n.num_vertices===void 0)&&(n.num_vertices=10),(!m(n.max_radial_length)||n.max_radial_length===void 0)&&(n.max_radial_length=10);const r=Math.abs(n.bbox[0]-n.bbox[2]),i=Math.abs(n.bbox[1]-n.bbox[3]),b=Math.min(r/2,i/2);if(n.max_radial_length>b)throw new Error("max_radial_length is greater than the radius of the bbox");const h=[n.bbox[0]+n.max_radial_length,n.bbox[1]+n.max_radial_length,n.bbox[2]-n.max_radial_length,n.bbox[3]-n.max_radial_length],u=[];for(let s=0;s<t;s++){let o=[];const a=[...Array(n.num_vertices+1)].map(Math.random);a.forEach((e,l,_)=>{_[l]=l>0?e+_[l-1]:e}),a.forEach(e=>{e=e*2*Math.PI/a[a.length-1];const l=Math.random();o.push([l*(n.max_radial_length||10)*Math.sin(e),l*(n.max_radial_length||10)*Math.cos(e)])}),o[o.length-1]=o[0],o=o.map(S(x(h))),u.push(p([o]))}return c(u)}function I(t,n={}){if(n=n||{},!y(n))throw new Error("options is invalid");const r=n.bbox;d(r);let i=n.num_vertices,b=n.max_length,h=n.max_rotation;t==null&&(t=1),(!m(i)||i===void 0||i<2)&&(i=10),(!m(b)||b===void 0)&&(b=1e-4),(!m(h)||h===void 0)&&(h=Math.PI/8);const u=[];for(let s=0;s<t;s++){const o=[x(r)];for(let a=0;a<i-1;a++){const e=(a===0?Math.random()*2*Math.PI:Math.tan((o[a][1]-o[a-1][1])/(o[a][0]-o[a-1][0])))+(Math.random()-.5)*h*2,l=Math.random()*b;o.push([o[a][0]+l*Math.cos(e),o[a][1]+l*Math.sin(e)])}u.push(P(o))}return c(u)}function S(t){return n=>[n[0]+t[0],n[1]+t[1]]}function M(){return Math.random()-.5}function j(){return M()*360}function B(){return M()*180}function g(t){return[Math.random()*(t[2]-t[0])+t[0],Math.random()*(t[3]-t[1])+t[1]]}export{I as randomLineString,A as randomPoint,E as randomPolygon,w as randomPosition};