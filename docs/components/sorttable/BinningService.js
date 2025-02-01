import * as d3 from "npm:d3";

export class BinningService {
  constructor(config = {}) {
    this.config = {
      maxOrdinalBins: config.maxOrdinalBins || 20,
      continuousBinMethod: config.continuousBinMethod || "freedmanDiaconis",
      dateInterval: config.dateInterval || "day",
      minBinSize: config.minBinSize || 5,
      customThresholds: config.customThresholds || null,
    };
  }

  getBins(data, column, type) {
    console.log(">>> Getting Bins for", column, type);

    if (!data || !column) {
      throw new Error("Invalid input: data and column are required");
    }

    try {
      switch (type) {
        case "continuous":
          return this.getContinuousBins(data, column);
        case "date":
          return this.getDateBins(data, column);
        case "ordinal":
          return this.getOrdinalBins(data, column);
        default:
          throw new Error(`Unsupported data type: ${type}`);
      }
    } catch (error) {
      console.error(`Error in binning data for column ${column}:`, error);
      return [];
    }
  }

  getContinuousBins(data, column) {
    // Extract numeric values and sort
    const values = data
      .map((d) => d[column])
      .filter((v) => v != null && !isNaN(Number(v)))
      .map((v) => Number(v))
      .sort((a, b) => a - b);

    if (values.length === 0) return [];

    // Get domain and handle edge case: all values are equal
    const extent = d3.extent(values);
    if (extent[0] === extent[1]) {
      return [
        {
          x0: extent[0],
          x1: extent[1],
          length: values.length,
          values: values,
          count: values.length,
          mean: extent[0],
          median: extent[0],
          min: extent[0],
          max: extent[0],
        },
      ];
    }

    let useLogTransform = false;
    // Check if all values are positive and highly skewed (mean/median > threshold)
    const meanValue = d3.mean(values);
    const medianValue = d3.median(values);
    if (extent[0] > 0 && medianValue > 0 && meanValue / medianValue > 2) {
      useLogTransform = true;
    }

    let binValues = values,
      binExtent = extent;
    if (useLogTransform) {
      // Transform the values (and domain) to log-scale for binning
      binValues = values.map((v) => Math.log(v));
      binExtent = d3.extent(binValues);
    }

    // choose threshold count based on selected method
    let binCount;
    if (this.config.continuousBinMethod === "scott") {
      binCount = this.calculateScottBinCount(binValues, binExtent);
    } else {
      // default: freedmanDiaconis
      binCount = this.calculateFreedmanDiaconisBinCount(binValues, binExtent);
    }

    // If custom thresholds provided, override the bin count
    let binThresholds = this.config.customThresholds || binCount;

    // Create bins with d3.bin using the selected thresholds.
    const bins = d3.bin().domain(binExtent).thresholds(binThresholds)(
      binValues
    );

    // Transform bins into our expected format. If log transform was used,
    // map the bin boundaries back to original scale.
    let formattedBins = bins.map((bin) => {
      let x0 = useLogTransform ? Math.exp(bin.x0) : bin.x0;
      let x1 = useLogTransform ? Math.exp(bin.x1) : bin.x1;
      let originalValues = useLogTransform
        ? bin.map((lv) => Math.exp(lv))
        : bin;
      return {
        x0,
        x1,
        length: originalValues.length,
        values: Array.from(originalValues),
        count: originalValues.length,
        mean: d3.mean(originalValues),
        median: d3.median(originalValues),
        min: d3.min(originalValues),
        max: d3.max(originalValues),
      };
    });

    // Consolidate small bins that do not meet the minimum bin size.
    let consolidatedBins = [];
    let currentBin = formattedBins[0];
    for (let i = 1; i < formattedBins.length; i++) {
      if (formattedBins[i].count < this.config.minBinSize) {
        // Merge with the previous bin
        currentBin.x1 = formattedBins[i].x1;
        currentBin.count += formattedBins[i].count;
        currentBin.values = currentBin.values.concat(formattedBins[i].values);
        currentBin.mean = d3.mean(currentBin.values);
        currentBin.median = d3.median(currentBin.values);
        currentBin.min = d3.min(currentBin.values);
        currentBin.max = d3.max(currentBin.values);
      } else {
        consolidatedBins.push(currentBin);
        currentBin = formattedBins[i];
      }
    }
    consolidatedBins.push(currentBin);

    // Sort the bins to ensure they are in ascending order by x0.
    consolidatedBins.sort((a, b) => a.x0 - b.x0);

    return consolidatedBins;
  }

  // Calculate optimal bin count using the Freedman-Diaconis rule.
  calculateFreedmanDiaconisBinCount(values, extent) {
    const n = values.length;
    const q1 = d3.quantile(values, 0.25);
    const q3 = d3.quantile(values, 0.75);
    const iqr = q3 - q1;
    if (iqr === 0) {
      // Fallback to Sturges' formula if IQR is zero
      return Math.ceil(Math.log2(n) + 1);
    }
    const binWidth = (2 * iqr) / Math.cbrt(n);
    const range = extent[1] - extent[0];
    return Math.max(1, Math.ceil(range / binWidth));
  }

  // Calculate optimal bin count using Scott's rule.
  calculateScottBinCount(values, extent) {
    const n = values.length;
    const stdev = d3.deviation(values);
    if (!stdev || stdev === 0) {
      return Math.ceil(Math.log2(n) + 1);
    }
    // Scott's bin width: 3.5 * standard deviation / cube root(n)
    const binWidth = (3.5 * stdev) / Math.cbrt(n);
    const range = extent[1] - extent[0];
    return Math.max(1, Math.ceil(range / binWidth));
  }

  getDateBins(data, column) {
    const dates = data
      .map((d) => d[column])
      .filter((d) => d instanceof Date && !isNaN(d));

    if (dates.length === 0) {
      return [];
    }

    const timeInterval = this.getTimeInterval();
    const histogram = d3
      .histogram()
      .domain(d3.extent(dates))
      .thresholds(timeInterval.range(...d3.extent(dates)))
      .value((d) => d);

    return histogram(dates).map((bin) => ({
      ...bin,
      date: bin.x0,
      count: bin.length,
    }));
  }

  getTimeInterval() {
    switch (this.config.dateInterval) {
      case "hour":
        return d3.timeHour;
      case "day":
        return d3.timeDay;
      case "week":
        return d3.timeWeek;
      case "month":
        return d3.timeMonth;
      case "year":
        return d3.timeYear;
      default:
        return d3.timeDay;
    }
  }

  getOrdinalBins(data, column) {
    // Group data by column values
    const grouped = d3.group(data, (d) => d[column]);

    // Create initial bins
    let bins = Array.from(grouped, ([key, values]) => ({
      key,
      length: values.length,
      values,
      ...this.getBinStats(values.map((d) => d[column])),
    }));

    // Handle case when there are too many bins
    if (bins.length > this.config.maxOrdinalBins) {
      bins = this.handleLargeOrdinalBins(bins);
    }

    return bins;
  }

  consolidateOrdinalBins(bins) {
    const topBins = bins.slice(0, this.config.maxOrdinalBins - 1);
    const otherBins = bins.slice(this.config.maxOrdinalBins - 1);

    if (otherBins.length > 0) {
      const otherBin = {
        key: "Other",
        count: d3.sum(otherBins, (b) => b.count),
        values: otherBins.flatMap((b) => b.values),
      };
      return [...topBins, otherBin];
    }

    return topBins;
  }

  /**
   * Handles consolidation of ordinal bins when there are too many categories
   * @param {Array} bins - Array of bin objects with count and category information
   * @returns {Array} Consolidated bins with an "Other" category
   */
  handleLargeOrdinalBins(bins) {
    // Sort bins by count in descending order
    const sorted = bins.sort((a, b) => b.length - a.length);

    // Take top N-1 bins (leaving space for "Other" bin)
    const topBins = sorted.slice(0, this.config.maxOrdinalBins - 1);

    // Collect remaining bins
    const otherBins = sorted.slice(this.config.maxOrdinalBins - 1);

    // Create "Other" bin if there are remaining bins
    if (otherBins.length > 0) {
      const otherBin = {
        key: "Other",
        length: otherBins.reduce((sum, bin) => sum + bin.length, 0),
        x0: "Other",
        x1: "Other",
        // Store original categories for reference
        originalCategories: otherBins.map((bin) => bin.key),
        values: otherBins.flatMap((bin) => bin.values || []),
      };

      return [...topBins, otherBin];
    }

    return topBins;
  }

  /**
   * Helper method to get bin statistics
   * @param {Array} values - Array of values in the bin
   * @returns {Object} Statistics for the bin
   */
  getBinStats(values) {
    if (!values || values.length === 0) return {};

    return {
      count: values.length,
      mean: values.reduce((sum, v) => sum + v, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }
}
