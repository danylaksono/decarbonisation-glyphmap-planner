function M(e){return e}function P(e){if(e==null)return M;var u,f,a=e.scale[0],c=e.scale[1],l=e.translate[0],g=e.translate[1];return function(p,s){s||(u=f=0);var r=2,t=p.length,n=new Array(t);for(n[0]=(u+=p[0])*a+l,n[1]=(f+=p[1])*c+g;r<t;)n[r]=p[r],++r;return n}}function w(e){var u=P(e.transform),f,a=1/0,c=a,l=-a,g=-a;function p(r){r=u(r),r[0]<a&&(a=r[0]),r[0]>l&&(l=r[0]),r[1]<c&&(c=r[1]),r[1]>g&&(g=r[1])}function s(r){switch(r.type){case"GeometryCollection":r.geometries.forEach(s);break;case"Point":p(r.coordinates);break;case"MultiPoint":r.coordinates.forEach(p);break}}e.arcs.forEach(function(r){for(var t=-1,n=r.length,o;++t<n;)o=u(r[t],t),o[0]<a&&(a=o[0]),o[0]>l&&(l=o[0]),o[1]<c&&(c=o[1]),o[1]>g&&(g=o[1])});for(f in e.objects)s(e.objects[f]);return[a,c,l,g]}function j(e,u){for(var f,a=e.length,c=a-u;c<--a;)f=e[c],e[c++]=e[a],e[a]=f}function _(e,u){return typeof u=="string"&&(u=e.objects[u]),u.type==="GeometryCollection"?{type:"FeatureCollection",features:u.geometries.map(function(f){return x(e,f)})}:x(e,u)}function x(e,u){var f=u.id,a=u.bbox,c=u.properties==null?{}:u.properties,l=E(e,u);return f==null&&a==null?{type:"Feature",properties:c,geometry:l}:a==null?{type:"Feature",id:f,properties:c,geometry:l}:{type:"Feature",id:f,bbox:a,properties:c,geometry:l}}function E(e,u){var f=P(e.transform),a=e.arcs;function c(t,n){n.length&&n.pop();for(var o=a[t<0?~t:t],i=0,d=o.length;i<d;++i)n.push(f(o[i],i));t<0&&j(n,d)}function l(t){return f(t)}function g(t){for(var n=[],o=0,i=t.length;o<i;++o)c(t[o],n);return n.length<2&&n.push(n[0]),n}function p(t){for(var n=g(t);n.length<4;)n.push(n[0]);return n}function s(t){return t.map(p)}function r(t){var n=t.type,o;switch(n){case"GeometryCollection":return{type:n,geometries:t.geometries.map(r)};case"Point":o=l(t.coordinates);break;case"MultiPoint":o=t.coordinates.map(l);break;case"LineString":o=g(t.arcs);break;case"MultiLineString":o=t.arcs.map(g);break;case"Polygon":o=s(t.arcs);break;case"MultiPolygon":o=t.arcs.map(s);break;default:return null}return{type:n,coordinates:o}}return r(u)}function C(e,u){var f={},a={},c={},l=[],g=-1;u.forEach(function(r,t){var n=e.arcs[r<0?~r:r],o;n.length<3&&!n[1][0]&&!n[1][1]&&(o=u[++g],u[g]=r,u[t]=o)}),u.forEach(function(r){var t=p(r),n=t[0],o=t[1],i,d;if(i=c[n])if(delete c[i.end],i.push(r),i.end=o,d=a[o]){delete a[d.start];var h=d===i?i:i.concat(d);a[h.start=i.start]=c[h.end=d.end]=h}else a[i.start]=c[i.end]=i;else if(i=a[o])if(delete a[i.start],i.unshift(r),i.start=n,d=c[n]){delete c[d.end];var y=d===i?i:d.concat(i);a[y.start=d.start]=c[y.end=i.end]=y}else a[i.start]=c[i.end]=i;else i=[r],a[i.start=n]=c[i.end=o]=i});function p(r){var t=e.arcs[r<0?~r:r],n=t[0],o;return e.transform?(o=[0,0],t.forEach(function(i){o[0]+=i[0],o[1]+=i[1]})):o=t[t.length-1],r<0?[o,n]:[n,o]}function s(r,t){for(var n in r){var o=r[n];delete t[o.start],delete o.start,delete o.end,o.forEach(function(i){f[i<0?~i:i]=1}),l.push(o)}}return s(c,a),s(a,c),u.forEach(function(r){f[r<0?~r:r]||l.push([r])}),l}function F(e){return E(e,G.apply(this,arguments))}function G(e,u,f){var a,c,l;if(arguments.length>1)a=q(e,u,f);else for(c=0,a=new Array(l=e.arcs.length);c<l;++c)a[c]=c;return{type:"MultiLineString",arcs:C(e,a)}}function q(e,u,f){var a=[],c=[],l;function g(n){var o=n<0?~n:n;(c[o]||(c[o]=[])).push({i:n,g:l})}function p(n){n.forEach(g)}function s(n){n.forEach(p)}function r(n){n.forEach(s)}function t(n){switch(l=n,n.type){case"GeometryCollection":n.geometries.forEach(t);break;case"LineString":p(n.arcs);break;case"MultiLineString":case"Polygon":s(n.arcs);break;case"MultiPolygon":r(n.arcs);break}}return t(u),c.forEach(f==null?function(n){a.push(n[0].i)}:function(n){f(n[0].g,n[n.length-1].g)&&a.push(n[0].i)}),a}function z(e){for(var u=-1,f=e.length,a,c=e[f-1],l=0;++u<f;)a=c,c=e[u],l+=a[0]*c[1]-a[1]*c[0];return Math.abs(l)}function T(e){return E(e,A.apply(this,arguments))}function A(e,u){var f={},a=[],c=[];u.forEach(l);function l(s){switch(s.type){case"GeometryCollection":s.geometries.forEach(l);break;case"Polygon":g(s.arcs);break;case"MultiPolygon":s.arcs.forEach(g);break}}function g(s){s.forEach(function(r){r.forEach(function(t){(f[t=t<0?~t:t]||(f[t]=[])).push(s)})}),a.push(s)}function p(s){return z(E(e,{type:"Polygon",arcs:[s]}).coordinates[0])}return a.forEach(function(s){if(!s._){var r=[],t=[s];for(s._=1,c.push(r);s=t.pop();)r.push(s),s.forEach(function(n){n.forEach(function(o){f[o<0?~o:o].forEach(function(i){i._||(i._=1,t.push(i))})})})}}),a.forEach(function(s){delete s._}),{type:"MultiPolygon",arcs:c.map(function(s){var r=[],t;if(s.forEach(function(h){h.forEach(function(y){y.forEach(function(m){f[m<0?~m:m].length<2&&r.push(m)})})}),r=C(e,r),(t=r.length)>1)for(var n=1,o=p(r[0]),i,d;n<t;++n)(i=p(r[n]))>o&&(d=r[0],r[0]=r[n],r[n]=d,o=i);return r}).filter(function(s){return s.length>0})}}function L(e,u){for(var f=0,a=e.length;f<a;){var c=f+a>>>1;e[c]<u?f=c+1:a=c}return f}function B(e){var u={},f=e.map(function(){return[]});function a(h,y){h.forEach(function(m){m<0&&(m=~m);var v=u[m];v?v.push(y):u[m]=[y]})}function c(h,y){h.forEach(function(m){a(m,y)})}function l(h,y){h.type==="GeometryCollection"?h.geometries.forEach(function(m){l(m,y)}):h.type in g&&g[h.type](h.arcs,y)}var g={LineString:a,MultiLineString:c,Polygon:c,MultiPolygon:function(h,y){h.forEach(function(m){c(m,y)})}};e.forEach(l);for(var p in u)for(var s=u[p],r=s.length,t=0;t<r;++t)for(var n=t+1;n<r;++n){var o=s[t],i=s[n],d;(d=f[o])[p=L(d,i)]!==i&&d.splice(p,0,i),(d=f[i])[p=L(d,o)]!==o&&d.splice(p,0,o)}return f}function S(e){if(e==null)return M;var u,f,a=e.scale[0],c=e.scale[1],l=e.translate[0],g=e.translate[1];return function(p,s){s||(u=f=0);var r=2,t=p.length,n=new Array(t),o=Math.round((p[0]-l)/a),i=Math.round((p[1]-g)/c);for(n[0]=o-u,u=o,n[1]=i-f,f=i;r<t;)n[r]=p[r],++r;return n}}function D(e,u){if(e.transform)throw new Error("already quantized");if(!u||!u.scale){if(!((g=Math.floor(u))>=2))throw new Error("n must be \u22652");s=e.bbox||w(e);var f=s[0],a=s[1],c=s[2],l=s[3],g;u={scale:[c-f?(c-f)/(g-1):1,l-a?(l-a)/(g-1):1],translate:[f,a]}}else s=e.bbox;var p=S(u),s,r,t=e.objects,n={};function o(h){return p(h)}function i(h){var y;switch(h.type){case"GeometryCollection":y={type:"GeometryCollection",geometries:h.geometries.map(i)};break;case"Point":y={type:"Point",coordinates:o(h.coordinates)};break;case"MultiPoint":y={type:"MultiPoint",coordinates:h.coordinates.map(o)};break;default:return h}return h.id!=null&&(y.id=h.id),h.bbox!=null&&(y.bbox=h.bbox),h.properties!=null&&(y.properties=h.properties),y}function d(h){var y=0,m=1,v=h.length,k,b=new Array(v);for(b[0]=p(h[0],0);++y<v;)((k=p(h[y],y))[0]||k[1])&&(b[m++]=k);return m===1&&(b[m++]=[0,0]),b.length=m,b}for(r in t)n[r]=i(t[r]);return{type:"Topology",bbox:s,transform:u,objects:n,arcs:e.arcs.map(d)}}export{w as bbox,_ as feature,T as merge,A as mergeArcs,F as mesh,G as meshArcs,B as neighbors,D as quantize,P as transform,S as untransform};