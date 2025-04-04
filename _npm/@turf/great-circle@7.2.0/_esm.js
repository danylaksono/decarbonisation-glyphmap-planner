/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/@turf/great-circle@7.2.0/dist/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{lineString as t}from"../helpers@7.2.0/_esm.js";import{getCoord as e}from"../invariant@7.2.0/_esm.js";var r=Math.PI/180,s=180/Math.PI,i=function(t,e){this.lon=t,this.lat=e,this.x=r*t,this.y=r*e};i.prototype.view=function(){return String(this.lon).slice(0,4)+","+String(this.lat).slice(0,4)},i.prototype.antipode=function(){var t=-1*this.lat,e=this.lon<0?180+this.lon:-1*(180-this.lon);return new i(e,t)};var o=function(){this.coords=[],this.length=0};o.prototype.move_to=function(t){this.length++,this.coords.push(t)};var n=function(t){this.properties=t||{},this.geometries=[]};n.prototype.json=function(){if(this.geometries.length<=0)return{geometry:{type:"LineString",coordinates:null},type:"Feature",properties:this.properties};if(1===this.geometries.length)return{geometry:{type:"LineString",coordinates:this.geometries[0].coords},type:"Feature",properties:this.properties};for(var t=[],e=0;e<this.geometries.length;e++)t.push(this.geometries[e].coords);return{geometry:{type:"MultiLineString",coordinates:t},type:"Feature",properties:this.properties}},n.prototype.wkt=function(){for(var t="",e="LINESTRING(",r=function(t){e+=t[0]+" "+t[1]+","},s=0;s<this.geometries.length;s++){if(0===this.geometries[s].coords.length)return"LINESTRING(empty)";this.geometries[s].coords.forEach(r),t+=e.substring(0,e.length-1)+")"}return t};var h=function(t,e,r){if(!t||void 0===t.x||void 0===t.y)throw new Error("GreatCircle constructor expects two args: start and end objects with x and y properties");if(!e||void 0===e.x||void 0===e.y)throw new Error("GreatCircle constructor expects two args: start and end objects with x and y properties");this.start=new i(t.x,t.y),this.end=new i(e.x,e.y),this.properties=r||{};var s=this.start.x-this.end.x,o=this.start.y-this.end.y,n=Math.pow(Math.sin(o/2),2)+Math.cos(this.start.y)*Math.cos(this.end.y)*Math.pow(Math.sin(s/2),2);if(this.g=2*Math.asin(Math.sqrt(n)),this.g===Math.PI)throw new Error("it appears "+t.view()+" and "+e.view()+" are 'antipodal', e.g diametrically opposite, thus there is no single route but rather infinite");if(isNaN(this.g))throw new Error("could not calculate great circle between "+t+" and "+e)};function a(r,s,i){if("object"!=typeof(i=i||{}))throw new Error("options is invalid");var o=i.properties,n=i.npoints,a=i.offset;if(r=e(r),s=e(s),o=o||{},n=n||100,r[0]===s[0]&&r[1]===s[1]){const e=Array(n);return e.fill([r[0],r[1]]),t(e,o)}return a=a||10,new h({x:r[0],y:r[1]},{x:s[0],y:s[1]},o).Arc(n,{offset:a}).json()}h.prototype.interpolate=function(t){var e=Math.sin((1-t)*this.g)/Math.sin(this.g),r=Math.sin(t*this.g)/Math.sin(this.g),i=e*Math.cos(this.start.y)*Math.cos(this.start.x)+r*Math.cos(this.end.y)*Math.cos(this.end.x),o=e*Math.cos(this.start.y)*Math.sin(this.start.x)+r*Math.cos(this.end.y)*Math.sin(this.end.x),n=e*Math.sin(this.start.y)+r*Math.sin(this.end.y),h=s*Math.atan2(n,Math.sqrt(Math.pow(i,2)+Math.pow(o,2)));return[s*Math.atan2(o,i),h]},h.prototype.Arc=function(t,e){var r=[];if(!t||t<=2)r.push([this.start.lon,this.start.lat]),r.push([this.end.lon,this.end.lat]);else for(var s=1/(t-1),i=0;i<t;++i){var h=s*i,a=this.interpolate(h);r.push(a)}for(var p=!1,u=0,l=e&&e.offset?e.offset:10,c=180-l,f=-180+l,g=360-l,v=1;v<r.length;++v){var y=r[v-1][0],d=r[v][0],M=Math.abs(d-y);M>g&&(d>c&&y<f||y>c&&d<f)?p=!0:M>u&&(u=M)}var w=[];if(p&&u<l){var m=[];w.push(m);for(var x=0;x<r.length;++x){var b=parseFloat(r[x][0]);if(x>0&&Math.abs(b-r[x-1][0])>g){var E=parseFloat(r[x-1][0]),F=parseFloat(r[x-1][1]),I=parseFloat(r[x][0]),S=parseFloat(r[x][1]);if(E>-180&&E<f&&180===I&&x+1<r.length&&r[x-1][0]>-180&&r[x-1][0]<f){m.push([-180,r[x][1]]),x++,m.push([r[x][0],r[x][1]]);continue}if(E>c&&E<180&&-180===I&&x+1<r.length&&r[x-1][0]>c&&r[x-1][0]<180){m.push([180,r[x][1]]),x++,m.push([r[x][0],r[x][1]]);continue}if(E<f&&I>c){var N=E;E=I,I=N;var j=F;F=S,S=j}if(E>c&&I<f&&(I+=360),E<=180&&I>=180&&E<I){var L=(180-E)/(I-E),G=L*S+(1-L)*F;m.push([r[x-1][0]>c?180:-180,G]),(m=[]).push([r[x-1][0]>c?-180:180,G]),w.push(m)}else m=[],w.push(m);m.push([b,r[x][1]])}else m.push([r[x][0],r[x][1]])}}else{var A=[];w.push(A);for(var P=0;P<r.length;++P)A.push([r[P][0],r[P][1]])}for(var q=new n(this.properties),C=0;C<w.length;++C){var R=new o;q.geometries.push(R);for(var T=w[C],_=0;_<T.length;++_)R.move_to(T[_])}return q};var p=a;
/*!
 * Copyright (c) 2019, Dane Springmeyer
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in
 *       the documentation and/or other materials provided with the
 *       distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 * IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */export{p as default,a as greatCircle};
