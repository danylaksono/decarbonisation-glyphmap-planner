export function LineChartGlyph(data, keysToVisualize, collection = null) {
  if (
    !data ||
    !Array.isArray(data) ||
    data.length === 0 ||
    !keysToVisualize ||
    !Array.isArray(keysToVisualize)
  ) {
    throw new Error(
      "Invalid data or keys: Data must be a non-empty array and keys must be provided."
    );
  }

  // Data access methods
  this.getFilteredData = () => {
    return data.filter((d) =>
      keysToVisualize.some((key) => d[key] !== undefined)
    );
  };

  this.getYears = () => this.getFilteredData().map((d) => d.year);

  this.getMaxValue = () => {
    const filteredData = this.getFilteredData();
    return d3.max(filteredData, (d) =>
      keysToVisualize.reduce((sum, key) => sum + (d[key] || 0), 0)
    );
  };

  this.getDataPoints = (key, xScale, yScale) => {
    return this.getFilteredData().map((d) => ({
      x: xScale(new Date(d.year)),
      y: yScale(d[key] || 0),
    }));
  };

  this.setCollection = (newCollection) => {
    collection = newCollection;
  };

  this.draw = (ctx, centerX, centerY, width, height, padding = 2) => {
    const drawWidth = width - 2 * padding;
    const drawHeight = height - 2 * padding;

    // Create scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(this.getYears(), (year) => new Date(year)))
      .range([centerX - drawWidth / 2, centerX + drawWidth / 2]);

    // Use collection's normalization if available
    const maxValue = collection?.maxValue ?? this.getMaxValue();

    const yScale = d3
      .scaleLinear()
      .domain([0, maxValue])
      .range([centerY + drawHeight / 2, centerY - drawHeight / 2]);

    // Draw lines for each key
    keysToVisualize.forEach((key) => {
      const dataPoints = this.getDataPoints(key, xScale, yScale);

      if (dataPoints.length > 0) {
        ctx.beginPath();
        ctx.moveTo(dataPoints[0].x, dataPoints[0].y);

        for (let i = 1; i < dataPoints.length; i++) {
          ctx.lineTo(dataPoints[i].x, dataPoints[i].y);
        }

        ctx.strokeStyle = colourMapping[key];
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  };
}

export function LineChartCollection() {
  this.glyphs = [];
  this.maxValue = null;

  this.add = (glyph) => {
    this.glyphs.push(glyph);
    glyph.setCollection(this);
  };

  this.recalculate = () => {
    this.maxValue = d3.max(this.glyphs.map((glyph) => glyph.getMaxValue()));
  };
}
