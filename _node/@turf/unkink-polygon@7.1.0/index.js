import{flattenEach as ae,featureEach as de}from"../meta@7.1.0/index.js";import{polygon as C,featureCollection as F}from"../helpers@7.1.0/index.js";import B from"../../rbush@3.0.1/index.js";import{area as se}from"../area@7.1.0/index.js";import{booleanPointInPolygon as le}from"../boolean-point-in-polygon@7.1.0/index.js";function ce(n,o,t){if(n.geometry.type!=="Polygon")throw new Error("The input feature must be a Polygon");t===void 0&&(t=1);var e=n.geometry.coordinates,s=[],i={};if(t){for(var Y=[],a=0;a<e.length;a++)for(var P=0;P<e[a].length-1;P++)Y.push(y(a,P));var m=new B;m.load(Y)}for(var g=0;g<e.length;g++)for(var r=0;r<e[g].length-1;r++)if(t){var z=m.search(y(g,r));z.forEach(function(E){var A=E.ring,c=E.edge;d(g,r,A,c)})}else for(var X=0;X<e.length;X++)for(var k=0;k<e[X].length-1;k++)d(g,r,X,k);return o||(s={type:"Feature",geometry:{type:"MultiPoint",coordinates:s}}),s;function d(E,A,c,h){var w=e[E][A],T=e[E][A+1],I=e[c][h],x=e[c][h+1],p=ue(w,T,I,x);if(p!==null){var q,b;if(T[0]!==w[0]?q=(p[0]-w[0])/(T[0]-w[0]):q=(p[1]-w[1])/(T[1]-w[1]),x[0]!==I[0]?b=(p[0]-I[0])/(x[0]-I[0]):b=(p[1]-I[1])/(x[1]-I[1]),!(q>=1||q<=0||b>=1||b<=0)){var D=p,H=!i[D];H&&(i[D]=!0),o?s.push(o(p,E,A,w,T,q,c,h,I,x,b,H)):s.push(p)}}}function y(E,A){var c=e[E][A],h=e[E][A+1],w,T,I,x;return c[0]<h[0]?(w=c[0],T=h[0]):(w=h[0],T=c[0]),c[1]<h[1]?(I=c[1],x=h[1]):(I=h[1],x=c[1]),{minX:w,minY:I,maxX:T,maxY:x,ring:E,edge:A}}}function ue(n,o,t,e){if(K(n,t)||K(n,e)||K(o,t)||K(e,t))return null;var s=n[0],i=n[1],Y=o[0],a=o[1],P=t[0],m=t[1],g=e[0],r=e[1],z=(s-Y)*(m-r)-(i-a)*(P-g);if(z===0)return null;var X=((s*a-i*Y)*(P-g)-(s-Y)*(P*r-m*g))/z,k=((s*a-i*Y)*(m-r)-(i-a)*(P*r-m*g))/z;return[X,k]}function K(n,o){if(!n||!o||n.length!==o.length)return!1;for(var t=0,e=n.length;t<e;t++)if(n[t]instanceof Array&&o[t]instanceof Array){if(!K(n[t],o[t]))return!1}else if(n[t]!==o[t])return!1;return!0}function fe(n){if(n.type!="Feature")throw new Error("The input must a geojson object of type Feature");if(n.geometry===void 0||n.geometry==null)throw new Error("The input must a geojson object with a non-empty geometry");if(n.geometry.type!="Polygon")throw new Error("The input must be a geojson Polygon");for(var o=n.geometry.coordinates.length,t=[],e=0;e<o;e++){var s=n.geometry.coordinates[e];N(s[0],s[s.length-1])||s.push(s[0]);for(var i=0;i<s.length-1;i++)t.push(s[i])}if(!ve(t))throw new Error("The input polygon may not have duplicate vertices (except for the first and last vertex of each ring)");var Y=t.length,a=ce(n,function(u,f,R,O,_,ee,ne,re,te,oe,ie,ge){return[u,f,R,O,_,ee,ne,re,te,oe,ie,ge]}),P=a.length;if(P==0){for(var m=[],e=0;e<o;e++)m.push(C([n.geometry.coordinates[e]],{parent:-1,winding:he(n.geometry.coordinates[e])}));var v=F(m);return M(),Z(),v}for(var g=[],r=[],e=0;e<o;e++){g.push([]);for(var i=0;i<n.geometry.coordinates[e].length-1;i++)g[e].push([new G(n.geometry.coordinates[e][J(i+1,n.geometry.coordinates[e].length-1)],1,[e,i],[e,J(i+1,n.geometry.coordinates[e].length-1)],void 0)]),r.push(new L(n.geometry.coordinates[e][i],[e,J(i-1,n.geometry.coordinates[e].length-1)],[e,i],void 0,void 0,!1,!0))}for(var e=0;e<P;e++)g[a[e][1]][a[e][2]].push(new G(a[e][0],a[e][5],[a[e][1],a[e][2]],[a[e][6],a[e][7]],void 0)),a[e][11]&&r.push(new L(a[e][0],[a[e][1],a[e][2]],[a[e][6],a[e][7]],void 0,void 0,!0,!0));for(var z=r.length,e=0;e<g.length;e++)for(var i=0;i<g[e].length;i++)g[e][i].sort(function(R,O){return R.param<O.param?-1:1});for(var X=[],e=0;e<z;e++)X.push({minX:r[e].coord[0],minY:r[e].coord[1],maxX:r[e].coord[0],maxY:r[e].coord[1],index:e});var k=new B;k.load(X);for(var e=0;e<g.length;e++)for(var i=0;i<g[e].length;i++)for(var d=0;d<g[e][i].length;d++){var y;d==g[e][i].length-1?y=g[e][J(i+1,n.geometry.coordinates[e].length-1)][0].coord:y=g[e][i][d+1].coord;var E=k.search({minX:y[0],minY:y[1],maxX:y[0],maxY:y[1]})[0];g[e][i][d].nxtIsectAlongEdgeIn=E.index}for(var e=0;e<g.length;e++)for(var i=0;i<g[e].length;i++)for(var d=0;d<g[e][i].length;d++){var y=g[e][i][d].coord,E=k.search({minX:y[0],minY:y[1],maxX:y[0],maxY:y[1]})[0],A=E.index;A<Y?r[A].nxtIsectAlongRingAndEdge2=g[e][i][d].nxtIsectAlongEdgeIn:N(r[A].ringAndEdge1,g[e][i][d].ringAndEdgeIn)?r[A].nxtIsectAlongRingAndEdge1=g[e][i][d].nxtIsectAlongEdgeIn:r[A].nxtIsectAlongRingAndEdge2=g[e][i][d].nxtIsectAlongEdgeIn}for(var c=[],e=0,i=0;i<o;i++){for(var h=e,d=0;d<n.geometry.coordinates[i].length-1;d++)r[e].coord[0]<r[h].coord[0]&&(h=e),e++;for(var w=r[h].nxtIsectAlongRingAndEdge2,d=0;d<r.length;d++)if(r[d].nxtIsectAlongRingAndEdge1==h||r[d].nxtIsectAlongRingAndEdge2==h){var T=d;break}var I=U([r[T].coord,r[h].coord,r[w].coord],!0)?1:-1;c.push({isect:h,parent:-1,winding:I})}c.sort(function(u,f){return r[u.isect].coord>r[f.isect].coord?-1:1});for(var m=[];c.length>0;){var x=c.pop(),p=x.isect,q=x.parent,b=x.winding,D=m.length,H=[r[p].coord],Q=p;if(r[p].ringAndEdge1Walkable)var S=r[p].ringAndEdge1,l=r[p].nxtIsectAlongRingAndEdge1;else var S=r[p].ringAndEdge2,l=r[p].nxtIsectAlongRingAndEdge2;for(;!N(r[p].coord,r[l].coord);){H.push(r[l].coord);for(var j=void 0,e=0;e<c.length;e++)if(c[e].isect==l){j=e;break}if(j!=null&&c.splice(j,1),N(S,r[l].ringAndEdge1)){if(S=r[l].ringAndEdge2,r[l].ringAndEdge2Walkable=!1,r[l].ringAndEdge1Walkable){var W={isect:l};U([r[Q].coord,r[l].coord,r[r[l].nxtIsectAlongRingAndEdge2].coord],b==1)?(W.parent=q,W.winding=-b):(W.parent=D,W.winding=b),c.push(W)}Q=l,l=r[l].nxtIsectAlongRingAndEdge2}else{if(S=r[l].ringAndEdge1,r[l].ringAndEdge1Walkable=!1,r[l].ringAndEdge2Walkable){var W={isect:l};U([r[Q].coord,r[l].coord,r[r[l].nxtIsectAlongRingAndEdge1].coord],b==1)?(W.parent=q,W.winding=-b):(W.parent=D,W.winding=b),c.push(W)}Q=l,l=r[l].nxtIsectAlongRingAndEdge1}}H.push(r[l].coord),m.push(C([H],{index:D,parent:q,winding:b,netWinding:void 0}))}var v=F(m);M(),Z();function M(){for(var u=[],f=0;f<v.features.length;f++)v.features[f].properties.parent==-1&&u.push(f);if(u.length>1)for(var f=0;f<u.length;f++){for(var R=-1,O=1/0,_=0;_<v.features.length;_++)u[f]!=_&&le(v.features[u[f]].geometry.coordinates[0][0],v.features[_],{ignoreBoundary:!0})&&se(v.features[_])<O&&(R=_);v.features[u[f]].properties.parent=R}}function Z(){for(var u=0;u<v.features.length;u++)if(v.features[u].properties.parent==-1){var f=v.features[u].properties.winding;v.features[u].properties.netWinding=f,$(u,f)}}function $(u,f){for(var R=0;R<v.features.length;R++)if(v.features[R].properties.parent==u){var O=f+v.features[R].properties.winding;v.features[R].properties.netWinding=O,$(R,O)}}return v}var G=function(n,o,t,e,s){this.coord=n,this.param=o,this.ringAndEdgeIn=t,this.ringAndEdgeOut=e,this.nxtIsectAlongEdgeIn=s},L=function(n,o,t,e,s,i,Y){this.coord=n,this.ringAndEdge1=o,this.ringAndEdge2=t,this.nxtIsectAlongRingAndEdge1=e,this.nxtIsectAlongRingAndEdge2=s,this.ringAndEdge1Walkable=i,this.ringAndEdge2Walkable=Y};function U(n,o){if(typeof o>"u"&&(o=!0),n.length!=3)throw new Error("This function requires an array of three points [x,y]");var t=(n[1][0]-n[0][0])*(n[2][1]-n[0][1])-(n[1][1]-n[0][1])*(n[2][0]-n[0][0]);return t>=0==o}function he(n){for(var o=0,t=0;t<n.length-1;t++)n[t][0]<n[o][0]&&(o=t);if(U([n[J(o-1,n.length-1)],n[o],n[J(o+1,n.length-1)]],!0))var e=1;else var e=-1;return e}function N(n,o){if(!n||!o||n.length!=o.length)return!1;for(var t=0,e=n.length;t<e;t++)if(n[t]instanceof Array&&o[t]instanceof Array){if(!N(n[t],o[t]))return!1}else if(n[t]!=o[t])return!1;return!0}function J(n,o){return(n%o+o)%o}function ve(n){for(var o={},t=1,e=0,s=n.length;e<s;++e){if(Object.prototype.hasOwnProperty.call(o,n[e])){t=0;break}o[n[e]]=1}return t}function V(n){var o=[];return ae(n,function(t){t.geometry.type==="Polygon"&&de(fe(t),function(e){o.push(C(e.geometry.coordinates,t.properties))})}),F(o)}var pe=V;export{pe as default,V as unkinkPolygon};