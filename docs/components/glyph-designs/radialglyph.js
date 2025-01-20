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

    let colors = this.colors
      ? (i) => this.colors[i % this.colors.length]
      : d3.scaleOrdinal(d3.schemeTableau10).domain(d3.range(this.data.length));

    // console.log("the data in the glyph", this.data);

    this.data.map((d, i) => {
      // console.log("data in radial glyph", d);
      drawPieSlice(
        ctx,
        x,
        y,
        Math.abs(radius * 0.9), // Add Math.abs() here
        angle * (i + 0.1),
        angle * (i + 0.9),
        "rgba(0,0,0,0.05)"
      );
      drawPieSlice(
        ctx,
        x,
        y,
        Math.abs(radius * Math.sqrt(d) * 0.95), // Add Math.abs() here
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
