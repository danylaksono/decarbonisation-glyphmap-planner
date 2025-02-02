// BinningService.js
import * as d3 from "npm:d3";

export class BinningService {
  constructor(config = {}) {
    this.config = {
      maxOrdinalBins: 12,
      continuousMethod: "scott",
      dateIntervals: ["day", "month", "year"],
      minBinSize: 5,
      ...config,
    };
  }

  getBins(data, column, type) {
    const values = data
      .map((d) => d[column])
      .filter((v) => v !== null && v !== undefined);

    // Use custom thresholds if provided
    if (this.config.customThresholds?.[column]) {
      return this.applyCustomThresholds(
        values,
        this.config.customThresholds[column]
      );
    }

    switch (type) {
      case "continuous":
        return this.binContinuous(values);
      case "ordinal":
        return this.binOrdinal(values);
      case "date":
        return this.binDates(values);
      default:
        return this.autoDetectBinning(values);
    }
  }

  applyCustomThresholds(values, thresholds) {
    return d3.bin().thresholds(thresholds)(values);
  }

  binContinuous(values) {
    const [min, max] = d3.extent(values);
    return d3.bin().domain([min, max]).thresholds(this.config.continuousMethod)(
      values
    );
  }

  binOrdinal(values) {
    const counts = d3.rollup(
      values,
      (v) => v.length,
      (v) => v
    );
    return Array.from(counts, ([key, count]) => ({ key, count }));
  }

  binDates(values) {
    return d3
      .timeBin()
      .domain(d3.extent(values))
      .thresholds(d3.timeInterval(this.config.dateInterval))(values);
  }

  autoDetectBinning(values) {
    const sample = values[0];
    if (sample instanceof Date) return this.binDates(values);
    if (typeof sample === "number") return this.binContinuous(values);
    return this.binOrdinal(values);
  }
}
