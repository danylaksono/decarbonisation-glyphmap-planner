export function StreamGraphGlyph(data, keysToVisualize, collection = null) {
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

  // Private constants
  const downwardKeys = keysToVisualize.filter((key) =>
    ["labour_cost", "material_cost", "total_cost"].includes(key)
  );
  const upwardKeys = keysToVisualize.filter((key) =>
    ["ashp_carbonsaved", "ev_carbonsaved", "pv_carbonsaved"].includes(key)
  );

  // Data access methods
  this.getYears = () => data.map((d) => d.year);
  this.getUpwardMax = () =>
    d3.max(data, (d) =>
      upwardKeys.reduce((sum, key) => sum + Math.abs(d[key]), 0)
    );
  this.getDownwardMax = () =>
    d3.max(data, (d) =>
      downwardKeys.reduce((sum, key) => sum + Math.abs(d[key]), 0)
    );

  this.setCollection = (newCollection) => {
    collection = newCollection;
  };

  this.draw = (ctx, centerX, centerY, width, height, padding = 2) => {
    const drawWidth = width - 2 * padding;
    const drawHeight = height - 2 * padding;
    const maxHeight = drawHeight / 2;

    // Create scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(this.getYears(), (year) => new Date(year)))
      .range([
        centerX - drawWidth / 2 + padding,
        centerX + drawWidth / 2 - padding,
      ]);

    // Use collection's normalization if available
    const upwardNorm = collection?.upwardNorm ?? this.getUpwardMax();
    const downwardNorm = collection?.downwardNorm ?? this.getDownwardMax();

    const yScaleUpward = d3
      .scaleLinear()
      .domain([0, upwardNorm])
      .range([0, maxHeight])
      .nice();

    const yScaleDownward = d3
      .scaleLinear()
      .domain([0, downwardNorm])
      .range([0, maxHeight])
      .nice();

    // Create stacks
    const upwardStack = d3.stack().keys(upwardKeys).order(d3.stackOrderNone);

    const downwardStack = d3
      .stack()
      .keys(downwardKeys)
      .order(d3.stackOrderNone);

    const upwardSeries = upwardStack(data);
    const downwardSeries = downwardStack(data);

    // Draw series
    const curve = d3.curveBumpX;

    // Draw upward series
    upwardSeries.forEach((s) => {
      ctx.beginPath();
      const area = d3
        .area()
        .x((d) => xScale(new Date(d.data.year)))
        .y0((d) => centerY - yScaleUpward(d[0]))
        .y1((d) => centerY - yScaleUpward(d[1]))
        .curve(curve);

      area.context(ctx)(s);
      ctx.fillStyle = colourMapping[s.key];
      ctx.fill();
    });

    // Draw downward series
    downwardSeries.forEach((s) => {
      ctx.beginPath();
      const area = d3
        .area()
        .x((d) => xScale(new Date(d.data.year)))
        .y0((d) => centerY + yScaleDownward(d[0]))
        .y1((d) => centerY + yScaleDownward(d[1]))
        .curve(curve);

      area.context(ctx)(s);
      ctx.fillStyle = colourMapping[s.key];
      ctx.fill();
    });

    // Draw center line
    ctx.beginPath();
    ctx.moveTo(centerX - drawWidth / 2, centerY);
    ctx.lineTo(centerX + drawWidth / 2, centerY);
    ctx.strokeStyle = "white";
    ctx.stroke();
  };
}

// Corresponding collection class for StreamGraphGlyph
export function StreamGraphCollection() {
  this.glyphs = [];
  this.upwardNorm = null;
  this.downwardNorm = null;

  this.add = (glyph) => {
    this.glyphs.push(glyph);
    glyph.setCollection(this);
  };

  this.recalculate = () => {
    this.upwardNorm = d3.max(this.glyphs.map((glyph) => glyph.getUpwardMax()));
    this.downwardNorm = d3.max(
      this.glyphs.map((glyph) => glyph.getDownwardMax())
    );
  };
}
