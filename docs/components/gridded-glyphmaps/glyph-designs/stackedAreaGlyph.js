export function StackedAreaGlyph(data, keysToVisualize, collection = null) {
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
  this.getYears = () => data.map((d) => d.year);
  this.getNormalizedData = () => {
    return data.map((d) => {
      const total = keysToVisualize.reduce((sum, key) => sum + d[key], 0);
      return {
        ...d,
        ...keysToVisualize.reduce((acc, key) => {
          acc[key] = d[key] / total;
          return acc;
        }, {}),
      };
    });
  };

  this.getTotalAtTime = (time) => {
    const yearData = data[time];
    return yearData
      ? keysToVisualize.reduce((sum, key) => sum + yearData[key], 0)
      : 0;
  };

  this.getMaxTotal = () => {
    return d3.max(data, (d) =>
      keysToVisualize.reduce((sum, key) => sum + d[key], 0)
    );
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

    const yScale = d3
      .scaleLinear()
      .domain([0, 1]) // Using normalized values
      .range([centerY + drawHeight / 2, centerY - drawHeight / 2]);

    // Create and apply the stack
    const stack = d3.stack().keys(keysToVisualize).order(d3.stackOrderNone);

    const normalizedData = this.getNormalizedData();
    const series = stack(normalizedData);

    // Draw series
    const curve = d3.curveBumpX;

    series.forEach((s) => {
      ctx.beginPath();
      const area = d3
        .area()
        .x((d) => xScale(new Date(d.data.year)))
        .y0((d) => yScale(d[0]))
        .y1((d) => yScale(d[1]))
        .curve(curve);

      area.context(ctx)(s);
      ctx.fillStyle = colourMapping[s.key];
      ctx.fill();
    });
  };
}

export function StackedAreaCollection() {
  this.glyphs = [];
  this.maxTotal = null;

  this.add = (glyph) => {
    this.glyphs.push(glyph);
    glyph.setCollection(this);
  };

  this.recalculate = () => {
    this.maxTotal = d3.max(this.glyphs.map((glyph) => glyph.getMaxTotal()));
  };
}
