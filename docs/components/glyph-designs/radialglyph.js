import * as d3 from "npm:d3";

export function RadialGlyph(data, customColors) {
  this.data = [];
  this.colors = customColors || null;
  data.map((d) => this.data.push(d));

  this.addData = (d) => {
    this.data.push(d);
  };
  this.removeData = (i) => {
    this.data.splice(i, 1);
  };

  this.draw = (ctx, x, y, radius) => {
    let angle = (2 * Math.PI) / this.data.length;

    // Use custom colors if provided, otherwise use D3 scheme
    let colors = this.colors
      ? (i) => this.colors[i % this.colors.length]
      : d3.scaleOrdinal(d3.schemeTableau10).domain(d3.range(this.data.length));

    this.data.map((d, i) => {
      drawPieSlice(
        ctx,
        x,
        y,
        radius * 0.9,
        angle * (i + 0.1),
        angle * (i + 0.9),
        "rgba(0,0,0,0.05)"
      );
      drawPieSlice(
        ctx,
        x,
        y,
        radius * Math.sqrt(d) * 0.95,
        angle * (i + 0.1),
        angle * (i + 0.9),
        colors(i)
      );
    });
  };

  function drawPieSlice(ctx, cx, cy, r, angleStart, angleEnd, color) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angleStart, angleEnd);
    ctx.lineTo(cx, cy);
    ctx.fillStyle = color;
    ctx.fill();
  }
}
