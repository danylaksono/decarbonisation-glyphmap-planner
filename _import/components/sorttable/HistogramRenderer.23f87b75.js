// HistogramRenderer.js
import * as d3 from "../../../_npm/d3@7.9.0/_esm.js";

export class HistogramRenderer {
  constructor(container, onSelectionChange) {
    this.container = container;
    this.onSelectionChange = onSelectionChange;
    this.selectedBins = new Set();
    this.init();
  }

  init() {
    this.svg = d3
      .select(this.container)
      .append("svg")
      .attr("width", 120)
      .attr("height", 60);

    this.chart = this.svg.append("g").attr("transform", "translate(5,5)");
  }

  update(data, metadata) {
    this.data = data;
    this.metadata = metadata;
    this.render();
  }

  render() {
    const { type, scale } = this.metadata;
    const maxValue = d3.max(this.data, (d) => d.length);

    const y = d3.scaleLinear().domain([0, maxValue]).range([50, 0]);

    const bars = this.chart
      .selectAll(".bar")
      .data(this.data)
      .join("g")
      .attr("class", "bar")
      .attr("transform", (d) => `translate(${scale(d.x0)},0)`);

    // Visible bars
    bars
      .append("rect")
      .attr("width", (d) => Math.max(0, scale(d.x1) - scale(d.x0) - 1))
      .attr("height", (d) => 50 - y(d.length))
      .attr("y", (d) => y(d.length))
      .attr("fill", (d) => (this.selectedBins.has(d) ? "#ff7f0e" : "#1f77b4"));

    // Interactive overlay
    bars
      .append("rect")
      .attr("class", "interactive")
      .attr("width", (d) => scale(d.x1) - scale(d.x0))
      .attr("height", 50)
      .attr("fill", "transparent")
      .on("click", (event, d) => this.toggleBin(d));
  }

  toggleBin(bin) {
    if (this.selectedBins.has(bin)) {
      this.selectedBins.delete(bin);
    } else {
      this.selectedBins.add(bin);
    }
    this.render();
    this.onSelectionChange(Array.from(this.selectedBins));
  }

  clearSelection() {
    this.selectedBins.clear();
    this.render();
  }
}
