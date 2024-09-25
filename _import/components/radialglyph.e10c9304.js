import * as d3 from "../../_npm/d3@7.9.0/_esm.js";

export function RadialGlyph(data){

  this.data = [];
  data.map( d => this.data.push(d));

  this.addData = (d) => { this.data.push(d)};
  this.removeData = (i) => {this.data.splice(i,1)}

  this.draw = (ctx, x, y, radius) => {

    let angle = 2 * Math.PI / this.data.length;

    //get a colour palette
    let colors = d3.scaleOrdinal(d3.schemeTableau10).domain(d3.range(this.data.length));

    this.data.map((d, i) => {
      drawPieSlice(ctx, x, y, radius * 0.9, angle * (i + 0.1), angle * (i + 0.9), 'rgba(0,0,0,0.05)');
      drawPieSlice(ctx, x, y, radius * Math.sqrt(d) * 0.95, angle * (i + 0.1), angle * (i + 0.9), colors(i))
    });
  }

  function drawPieSlice(ctx, cx, cy, r, angleStart, angleEnd, color){
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, angleStart, angleEnd);
  ctx.lineTo(cx, cy);
  ctx.fillStyle = color;
  ctx.fill();
  }
}
