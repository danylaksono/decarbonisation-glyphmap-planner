export class HistogramRenderer {
  constructor(container, config = {}) {
    this.container = container;
    this.config = {
      width: 100,
      height: 50,
      margin: { top: 5, right: 5, bottom: 8, left: 5 },
      ...config,
    };
    this.bins = [];
    this.selectedBins = new Set();
    this.initSVG();
  }

  initSVG() {
    this.svg = d3
      .select(this.container)
      .append("svg")
      .attr("width", this.config.width)
      .attr("height", this.config.height);

    this.chart = this.svg
      .append("g")
      .attr(
        "transform",
        `translate(${this.config.margin.left},${this.config.margin.top})`
      );

    this.width =
      this.config.width - this.config.margin.left - this.config.margin.right;
    this.height =
      this.config.height - this.config.margin.top - this.config.margin.bottom;
  }

  update(bins, xScale) {
    this.bins = bins;
    this.xScale = xScale;
    this.render();
  }

  render() {
    // Clear existing elements
    this.chart.selectAll("*").remove();

    // Create bars
    this.chart
      .selectAll(".bar")
      .data(this.bins)
      .join("g")
      .attr("class", "bar")
      .attr("transform", (d) => `translate(${this.xScale(d.x0)},0)`)
      .each(function (d) {
        const bar = d3.select(this);
        // Visible bar
        bar
          .append("rect")
          .attr("width", Math.max(0, this.xScale(d.x1) - this.xScale(d.x0) - 1))
          .attr("height", this.height - this.yScale(d.length))
          .attr("y", this.yScale(d.length))
          .attr("fill", (d) =>
            this.selectedBins.has(d) ? "orange" : "steelblue"
          );

        // Interactive overlay
        bar
          .append("rect")
          .attr("class", "interactive-overlay")
          .attr("width", Math.max(0, this.xScale(d.x1) - this.xScale(d.x0)))
          .attr("height", this.height)
          .attr("fill", "transparent")
          .on("click", (event, d) => this.toggleBinSelection(d));
      });

    // axes if needed later
    // Could be configurable based on options
  }

  toggleBinSelection(bin) {
    if (this.selectedBins.has(bin)) {
      this.selectedBins.delete(bin);
    } else {
      this.selectedBins.add(bin);
    }
    this.render();
    this.config.onSelectionChange?.(Array.from(this.selectedBins));
  }

  clearSelection() {
    this.selectedBins.clear();
    this.render();
  }
}
