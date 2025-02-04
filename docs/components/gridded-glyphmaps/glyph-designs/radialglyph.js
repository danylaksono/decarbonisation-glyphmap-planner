import * as d3 from "npm:d3";

export function RadialGlyph(data, customColors, options = {}) {
  this.data = [];
  this.colors = customColors || null;
  this.options = {
    showTooltips: options.showTooltips || false,
    showLegend: options.showLegend || false,
    labels: options.labels || data.map((_, i) => `Item ${i + 1}`),
    tooltipFormatter:
      options.tooltipFormatter || ((d) => `Value: ${d.toFixed(2)}`),
    legendWidth: options.legendWidth || 120,
  };

  data.map((d) => this.data.push(d));

  this.addData = (d) => {
    this.data.push(d);
  };

  this.removeData = (i) => {
    this.data.splice(i, 1);
  };

  let tooltip = null;
  if (this.options.showTooltips) {
    tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "radial-glyph-tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background-color", "rgba(255, 255, 255, 0.9)")
      .style("padding", "5px")
      .style("border", "1px solid #ddd")
      .style("border-radius", "3px");
  }

  this.draw = (ctx, x, y, radius) => {
    let angle = (2 * Math.PI) / this.data.length;

    let colors = this.colors
      ? (i) => this.colors[i % this.colors.length]
      : d3.scaleOrdinal(d3.schemeTableau10).domain(d3.range(this.data.length));

    // Draw the glyph
    this.data.map((d, i) => {
      drawPieSlice(
        ctx,
        x,
        y,
        Math.abs(radius * 0.9),
        angle * (i + 0.1),
        angle * (i + 0.9),
        "rgba(0,0,0,0.05)"
      );
      drawPieSlice(
        ctx,
        x,
        y,
        Math.abs(radius * Math.sqrt(d) * 0.95),
        angle * (i + 0.1),
        angle * (i + 0.9),
        colors(i)
      );
    });

    // Draw legend if enabled
    if (this.options.showLegend) {
      const legendX = x + radius + 20;
      const legendY = y - radius;
      drawLegend(ctx, legendX, legendY, colors);
    }

    // Add mouseover handling if tooltips are enabled
    if (this.options.showTooltips) {
      const canvas = ctx.canvas;
      canvas.addEventListener("mousemove", (event) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Calculate angle from center to mouse
        const dx = mouseX - x;
        const dy = mouseY - y;
        const mouseAngle = Math.atan2(dy, dx);
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if mouse is within the glyph
        if (distance <= radius) {
          // Convert angle to index
          let index = Math.floor(
            ((mouseAngle + Math.PI) / (2 * Math.PI)) * this.data.length
          );
          if (index < 0) index += this.data.length;

          tooltip
            .style("visibility", "visible")
            .style("left", `${event.pageX + 10}px`)
            .style("top", `${event.pageY + 10}px`)
            .html(
              `${this.options.labels[index]}: ${this.options.tooltipFormatter(
                this.data[index]
              )}`
            );
        } else {
          tooltip.style("visibility", "hidden");
        }
      });

      canvas.addEventListener("mouseout", () => {
        tooltip.style("visibility", "hidden");
      });
    }
  };

  function drawPieSlice(ctx, cx, cy, r, angleStart, angleEnd, color) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angleStart, angleEnd);
    ctx.lineTo(cx, cy);
    ctx.fillStyle = color;
    ctx.fill();
  }

  const drawLegend = (ctx, x, y, colors) => {
    const itemHeight = 20;
    const squareSize = 15;

    this.data.forEach((d, i) => {
      // Draw color square
      ctx.fillStyle = colors(i);
      ctx.fillRect(x, y + i * itemHeight, squareSize, squareSize);

      // Draw label
      ctx.fillStyle = "#000";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "12px Arial";
      ctx.fillText(
        this.options.labels[i],
        x + squareSize + 5,
        y + i * itemHeight + squareSize / 2
      );
    });
  };
}
