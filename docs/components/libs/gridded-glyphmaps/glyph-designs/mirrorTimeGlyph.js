import * as d3 from "npm:d3";

export function StreamGraphGlyph(
  data,
  timeKey = "year",
  collection = null,
  config = {
    upwardKeys: ["ashp_carbonsaved", "ev_carbonsaved", "pv_carbonsaved"],
    downwardKeys: ["labour_cost", "material_cost", "total_cost"],
    colors: null, // Can be array of colors or object mapping variable names to colors
  }
) {
  if (!config.upwardKeys || !config.downwardKeys) {
    throw new Error("Config must define upwardKeys and downwardKeys arrays");
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.warn("StreamGraphGlyph: received empty data.");
    return;
  }

  if (!timeKey || typeof timeKey !== "string" || !(timeKey in data[0])) {
    throw new Error(`Invalid or missing timeKey: ${timeKey}`);
  }

  const upwardKeys = config.upwardKeys;
  const downwardKeys = config.downwardKeys;

  const defaultPalette = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  ];
  
  const allKeys = [...upwardKeys, ...downwardKeys];
  const colourMapping = {};
  
  // Handle color configuration
  if (config.colors) {
    if (Array.isArray(config.colors)) {
      // If colors is an array, assign colors in order
      allKeys.forEach((key, i) => {
        colourMapping[key] = config.colors[i % config.colors.length];
      });
    } else if (typeof config.colors === 'object') {
      // If colors is an object, use direct mapping with fallback to default palette
      allKeys.forEach((key, i) => {
        colourMapping[key] = config.colors[key] || defaultPalette[i % defaultPalette.length];
      });
    } else {
      console.warn("Invalid colors configuration. Expected array or object. Using default palette.");
      allKeys.forEach((key, i) => {
        colourMapping[key] = defaultPalette[i % defaultPalette.length];
      });
    }
  } else {
    // Use default palette if no colors specified
    allKeys.forEach((key, i) => {
      colourMapping[key] = defaultPalette[i % defaultPalette.length];
    });
  }

  const safeSum = (d, keys) =>
    keys.reduce(
      (sum, key) => sum + (typeof d[key] === "number" ? d[key] : 0),
      0
    );

  this.getTimeValues = () => data.map((d) => d[timeKey]);
  this.getUpwardMax = () => d3.max(data, (d) => safeSum(d, upwardKeys));
  this.getDownwardMax = () => d3.max(data, (d) => safeSum(d, downwardKeys));

  this.setCollection = (newCollection) => {
    collection = newCollection;
  };

  this.draw = (ctx, centerX, centerY, width, height, padding = 2) => {
    // Save canvas state at the beginning to prevent context leakage
    ctx.save();
    
    const drawWidth = width - 2 * padding;
    const drawHeight = height - 2 * padding;
    const maxHeight = drawHeight / 2;

    const xExtent = d3.extent(this.getTimeValues());
    if (!xExtent[0] || !xExtent[1]) {
      console.warn("Invalid xExtent in StreamGraphGlyph draw:", xExtent);
      return;
    }

    const xScale = d3
      .scaleLinear()
      .domain(xExtent)
      .range([
        centerX - drawWidth / 2 + padding,
        centerX + drawWidth / 2 - padding,
      ]);

    const upwardNorm = collection?.upwardNorm ?? this.getUpwardMax() ?? 1;
    const downwardNorm = collection?.downwardNorm ?? this.getDownwardMax() ?? 1;

    const yScaleUpward = d3
      .scaleLinear()
      .domain([0, upwardNorm])
      .range([0, maxHeight]);

    const yScaleDownward = d3
      .scaleLinear()
      .domain([0, downwardNorm])
      .range([0, maxHeight]);

    const upwardStack = d3.stack().keys(upwardKeys).order(d3.stackOrderNone);
    const downwardStack = d3.stack().keys(downwardKeys).order(d3.stackOrderNone);

    const upwardSeries = upwardStack(data);
    const downwardSeries = downwardStack(data);

    const curve = d3.curveBumpX;

    // Draw background bands to indicate year separation
    ctx.save();
    ctx.globalAlpha = 0.05;

    const yearValues = this.getTimeValues();
    const uniqueYears = [...new Set(yearValues)].sort((a, b) => a - b);
    const bandWidth = drawWidth / uniqueYears.length;

    uniqueYears.forEach((year, i) => {
      const xStart = centerX - drawWidth / 2 + i * bandWidth;
      ctx.fillStyle = i % 2 === 0 ? "#000" : "#444";
      ctx.fillRect(xStart, centerY - maxHeight, bandWidth, maxHeight * 2);
    });

    ctx.restore();

    // Draw upward areas
    upwardSeries.forEach((s) => {
      ctx.beginPath();
      const area = d3
        .area()
        .x((d) => xScale(d.data[timeKey]))
        .y0((d) => centerY - yScaleUpward(d[0]))
        .y1((d) => centerY - yScaleUpward(d[1]))
        .curve(curve)
        .context(ctx);
      area(s);
      ctx.fillStyle = colourMapping[s.key];
      ctx.fill();
    });

    // Draw downward areas
    downwardSeries.forEach((s) => {
      ctx.beginPath();
      const area = d3
        .area()
        .x((d) => xScale(d.data[timeKey]))
        .y0((d) => centerY + yScaleDownward(d[0]))
        .y1((d) => centerY + yScaleDownward(d[1]))
        .curve(curve)
        .context(ctx);
      area(s);
      ctx.fillStyle = colourMapping[s.key];
      ctx.fill();
    });

    // Draw center line
    ctx.beginPath();
    ctx.moveTo(centerX - drawWidth / 2, centerY);
    ctx.lineTo(centerX + drawWidth / 2, centerY);
    ctx.strokeStyle = "white";
    ctx.stroke();
    
    // Restore canvas state to prevent context leakage
    ctx.restore();
  };

  // console.log("StreamGraphGlyph created with", data.length, "points.");
}
