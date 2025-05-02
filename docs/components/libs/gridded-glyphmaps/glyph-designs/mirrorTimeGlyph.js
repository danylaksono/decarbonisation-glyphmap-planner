import * as d3 from "npm:d3";

export function StreamGraphGlyph(
  data,
  timeKey = "year",
  collection = null,
  config = {
    upwardKeys: ["ashp_carbonsaved", "ev_carbonsaved", "pv_carbonsaved"],
    downwardKeys: ["labour_cost", "material_cost", "total_cost"],
  }
) {
  // Validate config
  if (!config.upwardKeys || !config.downwardKeys) {
    throw new Error("Config must define upwardKeys and downwardKeys arrays");
  }

  if (
    !data ||
    !Array.isArray(data) ||
    data.length === 0 ||
    !timeKey ||
    typeof timeKey !== "string"
  ) {
    throw new Error(
      "Invalid inputs: Data must be non-empty array and timeKey must be string."
    );
  }

  // Validate timeKey exists in data
  if (!data[0].hasOwnProperty(timeKey)) {
    throw new Error(`Data must contain the specified timeKey: ${timeKey}`);
  }

  // Private constants - directly use config keys
  const downwardKeys = config.downwardKeys;
  const upwardKeys = config.upwardKeys;

  // Generate colour mapping for arbitrary keys
  const defaultPalette = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf",
  ];
  const allKeys = [...upwardKeys, ...downwardKeys];
  const colourMapping = {};
  allKeys.forEach((key, i) => {
    colourMapping[key] = defaultPalette[i % defaultPalette.length];
  });

  // Update data access methods
  this.getTimeValues = () => data.map((d) => d[timeKey]);
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

    // Update scale to use timeKey
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(this.getTimeValues(), (value) => new Date(value)))
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

    // Update area generators to use timeKey
    upwardSeries.forEach((s) => {
      ctx.beginPath();
      const area = d3
        .area()
        .x((d) => xScale(new Date(d.data[timeKey])))
        .y0((d) => centerY - yScaleUpward(d[0]))
        .y1((d) => centerY - yScaleUpward(d[1]))
        .curve(curve);

      area.context(ctx)(s);
      ctx.fillStyle = colourMapping[s.key];
      ctx.fill();
    });

    downwardSeries.forEach((s) => {
      ctx.beginPath();
      const area = d3
        .area()
        .x((d) => xScale(new Date(d.data[timeKey])))
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

// Usage example:
// const customConfig = {
//   upwardKeys: ["metric1", "metric2"],
//   downwardKeys: ["cost1", "cost2"]
// };

// const glyph = new StreamGraphGlyph(data, "year", null, customConfig);
