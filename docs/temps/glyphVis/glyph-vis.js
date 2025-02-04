import * as d3 from "npm:d3";

class Glyph {
  constructor(data) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Data must be a non-empty array.");
    }
    this.data = data;
    this.normalizers = {}; // Store normalization functions per key
  }

  // --- Data Handling ---

  addData(newData) {
    if (!Array.isArray(newData)) {
      newData = [newData]; // Allow adding single data points
    }
    this.data = [...this.data, ...newData];
    this.clearNormalization(); // Invalidate existing normalizations
  }

  removeData(index) {
    this.data.splice(index, 1);
    this.clearNormalization(); // Invalidate existing normalizations
  }

  // --- Normalization ---

  /**
   * Normalizes the data for specified keys.
   * @param {string[]} keysToNormalize - An array of keys to normalize.
   */
  normalizeData(keysToNormalize) {
    const allValues = {};
    keysToNormalize.forEach((key) => {
      allValues[key] = this.data
        .map((d) => this.parseNumeric(d[key]))
        .filter((v) => v !== null);
    });

    keysToNormalize.forEach((key) => {
      const values = allValues[key];
      const [min, max] = d3.extent(values); // Using d3.extent for efficiency

      if (min === max) {
        this.normalizers[key] = () => 0.5; // Avoid division by zero
      } else {
        this.normalizers[key] = (value) => (value - min) / (max - min);
      }
    });

    // Apply normalization to a copy of the data and return it
    return this.data.map((d) => {
      const normalized = { ...d };
      keysToNormalize.forEach((key) => {
        const value = this.parseNumeric(d[key]);
        if (value !== null) {
          normalized[key] = this.normalizers[key](value);
        }
      });
      return normalized;
    });
  }

  clearNormalization() {
    this.normalizers = {};
  }

  // --- Aggregation ---

  /**
   * Aggregates values for selected parameters.
   * @param {string[]} selectedParameters - An array of keys to aggregate.
   * @param {string} aggregationType - The type of aggregation ('sum', 'mean', 'min', 'max', 'extent').
   * @param {boolean} normalize - Whether to normalize before aggregation.
   * @returns {Object} An object with aggregated values for each parameter.
   */
  aggregateValues(
    selectedParameters,
    aggregationType = "mean",
    normalize = false
  ) {
    const aggregationFunctions = {
      sum: (arr) => d3.sum(arr),
      mean: (arr) => d3.mean(arr),
      min: (arr) => d3.min(arr),
      max: (arr) => d3.max(arr),
      extent: (arr) => d3.extent(arr),
    };

    if (!aggregationFunctions[aggregationType]) {
      throw new Error(`Unsupported aggregation type: ${aggregationType}`);
    }

    const workingData = normalize
      ? this.normalizeData(selectedParameters)
      : this.data;

    const result = {};
    selectedParameters.forEach((param) => {
      const values = workingData
        .map((d) => this.parseNumeric(d[param]))
        .filter((v) => v !== null);

      if (values.length > 0) {
        result[param] = aggregationFunctions[aggregationType](values);
      } else {
        result[param] = null;
      }
    });

    return result;
  }

  // --- Helper ---
  parseNumeric(value) {
    if (typeof value === "string" && !isNaN(value)) {
      return Number(value);
    }
    return typeof value === "number" && !isNaN(value) ? value : null;
  }

  // --- Drawing ---
  // This will be overridden by specific glyph types
  draw(ctx, x, y, ...args) {
    throw new Error("Draw method must be implemented by subclasses.");
  }
}

// Radial Glyph
class RadialGlyph extends Glyph {
  constructor(data, customColors = null) {
    super(data);
    this.colors = customColors;
  }

  draw(ctx, x, y, radius) {
    const angle = (2 * Math.PI) / this.data.length;
    const colors = this.colors
      ? (i) => this.colors[i % this.colors.length]
      : d3.scaleOrdinal(d3.schemeTableau10).domain(d3.range(this.data.length));

    this.data.forEach((d, i) => {
      this.drawPieSlice(
        ctx,
        x,
        y,
        Math.abs(radius * 0.9),
        angle * (i + 0.1),
        angle * (i + 0.9),
        "rgba(0,0,0,0.05)"
      );
      this.drawPieSlice(
        ctx,
        x,
        y,
        Math.abs(radius * Math.sqrt(d) * 0.95),
        angle * (i + 0.1),
        angle * (i + 0.9),
        colors(i)
      );
    });
  }

  drawPieSlice(ctx, cx, cy, r, angleStart, angleEnd, color) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angleStart, angleEnd);
    ctx.lineTo(cx, cy);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

// StreamGraph Glyph
class StreamGraphGlyph extends Glyph {
  constructor(
    data,
    timeKey = "year",
    collection = null,
    config = {
      upwardKeys: ["ashp_carbonsaved", "ev_carbonsaved", "pv_carbonsaved"],
      downwardKeys: ["labour_cost", "material_cost", "total_cost"],
    }
  ) {
    super(data);

    // Validate config
    if (!config.upwardKeys || !config.downwardKeys) {
      throw new Error("Config must define upwardKeys and downwardKeys arrays");
    }
    if (!data[0].hasOwnProperty(timeKey)) {
      throw new Error(`Data must contain the specified timeKey: ${timeKey}`);
    }

    this.timeKey = timeKey;
    this.collection = collection;
    this.config = config;
    this.downwardKeys = config.downwardKeys;
    this.upwardKeys = config.upwardKeys;

    this.getTimeValues = () => data.map((d) => d[timeKey]);
    this.getUpwardMax = () =>
      d3.max(data, (d) =>
        this.upwardKeys.reduce((sum, key) => sum + Math.abs(d[key]), 0)
      );
    this.getDownwardMax = () =>
      d3.max(data, (d) =>
        this.downwardKeys.reduce((sum, key) => sum + Math.abs(d[key]), 0)
      );
  }

  setCollection(newCollection) {
    this.collection = newCollection;
  }

  draw(ctx, centerX, centerY, width, height, padding = 2) {
    const drawWidth = width - 2 * padding;
    const drawHeight = height - 2 * padding;
    const maxHeight = drawHeight / 2;

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(this.getTimeValues(), (value) => new Date(value)))
      .range([
        centerX - drawWidth / 2 + padding,
        centerX + drawWidth / 2 - padding,
      ]);

    const upwardNorm = this.collection?.upwardNorm ?? this.getUpwardMax();
    const downwardNorm = this.collection?.downwardNorm ?? this.getDownwardMax();

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

    const upwardStack = d3
      .stack()
      .keys(this.upwardKeys)
      .order(d3.stackOrderNone);
    const downwardStack = d3
      .stack()
      .keys(this.downwardKeys)
      .order(d3.stackOrderNone);

    const upwardSeries = upwardStack(this.data);
    const downwardSeries = downwardStack(this.data);

    const curve = d3.curveBumpX;

    upwardSeries.forEach((s) => {
      ctx.beginPath();
      const area = d3
        .area()
        .x((d) => xScale(new Date(d.data[this.timeKey])))
        .y0((d) => centerY - yScaleUpward(d[0]))
        .y1((d) => centerY - yScaleUpward(d[1]))
        .curve(curve);

      area.context(ctx)(s);
      ctx.fillStyle = colourMapping[s.key]; //  need to define 'colourMapping'
      ctx.fill();
    });

    downwardSeries.forEach((s) => {
      ctx.beginPath();
      const area = d3
        .area()
        .x((d) => xScale(new Date(d.data[this.timeKey])))
        .y0((d) => centerY + yScaleDownward(d[0]))
        .y1((d) => centerY + yScaleDownward(d[1]))
        .curve(curve);

      area.context(ctx)(s);
      ctx.fillStyle = colourMapping[s.key]; // need to define 'colourMapping'
      ctx.fill();
    });

    ctx.beginPath();
    ctx.moveTo(centerX - drawWidth / 2, centerY);
    ctx.lineTo(centerX + drawWidth / 2, centerY);
    ctx.strokeStyle = "white";
    ctx.stroke();
  }
}

class StreamGraphCollection {
  constructor() {
    this.glyphs = [];
    this.upwardNorm = null;
    this.downwardNorm = null;
  }

  add(glyph) {
    if (!(glyph instanceof StreamGraphGlyph)) {
      throw new Error("Collection only accepts StreamGraphGlyph instances.");
    }
    this.glyphs.push(glyph);
    glyph.setCollection(this);
    this.recalculate();
  }

  recalculate() {
    this.upwardNorm = d3.max(this.glyphs, (glyph) => glyph.getUpwardMax());
    this.downwardNorm = d3.max(this.glyphs, (glyph) => glyph.getDownwardMax());
  }
}
