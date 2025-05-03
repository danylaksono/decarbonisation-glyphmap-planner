import * as d3 from "npm:d3";

/**
 * LineChartGlyph - Renders a line chart using normalized data (0-1 range)
 * @param {Array} data - Array of data objects with year and value properties
 * @param {Array} keysToVisualize - Array of keys to visualize from the data
 * @param {Object} collection - Optional collection object for shared normalization
 * @param {Object} colourMapping - Optional mapping of keys to colors
 */
export function LineChartGlyph(
  data,
  keysToVisualize,
  collection = null,
  colourMapping = {}
) {
  // Comprehensive input validation
  if (!data) {
    throw new Error("Data must be provided");
  }
  if (!Array.isArray(data)) {
    throw new Error("Data must be an array");
  }
  if (data.length === 0) {
    throw new Error("Data array cannot be empty");
  }
  if (!keysToVisualize) {
    throw new Error("Keys to visualize must be provided");
  }
  if (!Array.isArray(keysToVisualize)) {
    throw new Error("Keys to visualize must be an array");
  }
  if (keysToVisualize.length === 0) {
    throw new Error("At least one key must be provided to visualize");
  }

  // Validate that all data entries have a year property
  const missingYearEntries = data.filter((d) => !d.year);
  if (missingYearEntries.length > 0) {
    throw new Error("All data entries must have a 'year' property");
  }

  // Validate data values are within 0-1 range
  data.forEach((d, index) => {
    keysToVisualize.forEach((key) => {
      if (d[key] !== undefined && (d[key] < 0 || d[key] > 1)) {
        throw new Error(
          `Data value for key '${key}' at index ${index} is outside the normalized 0-1 range: ${d[key]}`
        );
      }
    });
  });

  // Data access methods with defensive checks
  this.getFilteredData = () => {
    try {
      return data.filter((d) =>
        keysToVisualize.some((key) => d[key] !== undefined)
      );
    } catch (error) {
      console.error("Error filtering data:", error);
      return [];
    }
  };

  this.getYears = () => {
    try {
      const years = this.getFilteredData().map((d) => d.year);
      if (years.length === 0) {
        console.warn("No valid years found in data");
      }
      return years;
    } catch (error) {
      console.error("Error extracting years:", error);
      return [];
    }
  };

  // For normalized data, the max value should be 1
  // But we keep this method for compatibility with the collection
  this.getMaxValue = () => {
    try {
      // For normalized data, max value should always be 1
      // But we calculate it anyway to ensure data integrity
      const filteredData = this.getFilteredData();
      if (filteredData.length === 0) return 1;

      const calculatedMax = d3.max(filteredData, (d) =>
        keysToVisualize.reduce((sum, key) => sum + (d[key] || 0), 0)
      );

      // Return 1 if the max is less than or equal to 1, otherwise use the calculated max
      // This ensures proper scaling even if data exceeds normalized range
      return calculatedMax > 1 ? calculatedMax : 1;
    } catch (error) {
      console.error("Error calculating max value:", error);
      return 1; // Default to 1 for normalized data
    }
  };

  this.getDataPoints = (key, xScale, yScale) => {
    try {
      return this.getFilteredData().map((d) => {
        // Ensure value is within 0-1 range for normalized data
        const value =
          d[key] !== undefined ? Math.max(0, Math.min(1, d[key])) : 0;

        // Safely parse date and create data point
        let xValue;
        try {
          xValue = xScale(new Date(d.year));
        } catch (e) {
          console.warn(`Invalid year format: ${d.year}, using 0`);
          xValue = xScale(new Date(0));
        }

        return {
          x: xValue,
          y: yScale(value),
          rawValue: value,
        };
      });
    } catch (error) {
      console.error("Error generating data points:", error);
      return [];
    }
  };

  this.setCollection = (newCollection) => {
    collection = newCollection;
  };

  this.draw = (ctx, centerX, centerY, width, height, padding = 2) => {
    if (!ctx) {
      console.error("Canvas context is required for drawing");
      return;
    }

    try {
      // Validate drawing parameters and provide better error logging
      if (!Number.isFinite(centerX)) {
        console.error(`Invalid centerX parameter: ${centerX}`);
        centerX = 0; // Default to 0 instead of failing
      }
      if (!Number.isFinite(centerY)) {
        console.error(`Invalid centerY parameter: ${centerY}`);
        centerY = 0; // Default to 0 instead of failing
      }
      if (!Number.isFinite(width)) {
        console.error(`Invalid width parameter: ${width}`);
        width = 100; // Default to 100 instead of failing
      }
      if (!Number.isFinite(height)) {
        console.error(`Invalid height parameter: ${height}`);
        height = 100; // Default to 100 instead of failing
      }

      if (width <= 0 || height <= 0) {
        console.warn("Width and height must be positive, using default values");
        width = width <= 0 ? 100 : width;
        height = height <= 0 ? 100 : height;
      }

      const drawWidth = Math.max(0, width - 2 * padding);
      const drawHeight = Math.max(0, height - 2 * padding);

      if (drawWidth <= 0 || drawHeight <= 0) {
        console.warn(
          "Effective drawing area is too small, using minimum values"
        );
        // Continue with minimum values instead of throwing an error
      }

      // Get years and handle empty data
      const years = this.getYears();
      if (years.length === 0) {
        console.warn("No years data available for drawing");
        return;
      }

      // Create scales with safeguards
      let yearExtent;
      try {
        yearExtent = d3.extent(years, (year) => new Date(year));
        // If invalid dates, use fallback
        if (
          !yearExtent[0] ||
          !yearExtent[1] ||
          isNaN(yearExtent[0]) ||
          isNaN(yearExtent[1])
        ) {
          throw new Error("Invalid year data");
        }
      } catch (e) {
        console.warn("Error in date parsing, using fallback dates");
        yearExtent = [new Date(2020, 0, 1), new Date(2021, 0, 1)];
      }

      const xScale = d3
        .scaleTime()
        .domain(yearExtent)
        .range([centerX - drawWidth / 2, centerX + drawWidth / 2]);

      // For normalized data, always use domain [0, 1]
      const yScale = d3
        .scaleLinear()
        .domain([0, 1])
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

          // Use color mapping with fallback
          ctx.strokeStyle = colourMapping[key] || "#000000";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
    } catch (error) {
      console.error("Error during drawing:", error);
    }
  };
}

/**
 * LineChartCollection - Manages a collection of LineChartGlyph instances
 * Handles normalization across multiple glyphs for consistent visualization
 */
export function LineChartCollection() {
  this.glyphs = [];
  this.maxValue = 1; // Default to 1 for normalized data

  /**
   * Add a glyph to the collection
   * @param {LineChartGlyph} glyph - The glyph to add
   */
  this.add = (glyph) => {
    if (!glyph) {
      console.error("Cannot add null or undefined glyph to collection");
      return;
    }

    try {
      this.glyphs.push(glyph);
      glyph.setCollection(this);
    } catch (error) {
      console.error("Error adding glyph to collection:", error);
    }
  };

  /**
   * Remove a glyph from the collection
   * @param {LineChartGlyph} glyph - The glyph to remove
   * @returns {boolean} - True if glyph was found and removed
   */
  this.remove = (glyph) => {
    try {
      const index = this.glyphs.indexOf(glyph);
      if (index > -1) {
        this.glyphs.splice(index, 1);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error removing glyph from collection:", error);
      return false;
    }
  };

  /**
   * Clear all glyphs from the collection
   */
  this.clear = () => {
    this.glyphs = [];
    this.maxValue = 1;
  };

  /**
   * Recalculate the maximum value across all glyphs
   * For normalized data, this should generally stay at 1
   * but we calculate it to handle any data outside the normalized range
   */
  this.recalculate = () => {
    try {
      if (!this.glyphs || this.glyphs.length === 0) {
        this.maxValue = 1;
        return;
      }

      // Calculate max from all glyphs
      const calculatedMax = d3.max(
        this.glyphs.map((glyph) => {
          try {
            return glyph.getMaxValue();
          } catch (e) {
            console.warn("Error getting max value from glyph:", e);
            return 1;
          }
        })
      );

      // Use calculated max if valid, otherwise default to 1 for normalized data
      this.maxValue =
        calculatedMax !== undefined &&
        calculatedMax !== null &&
        !isNaN(calculatedMax)
          ? Math.max(1, calculatedMax) // Ensure at least 1 for normalized data
          : 1;
    } catch (error) {
      console.error("Error recalculating collection max value:", error);
      this.maxValue = 1; // Default to 1 on error
    }
  };

  /**
   * Get the count of glyphs in the collection
   * @returns {number} - The number of glyphs
   */
  this.count = () => {
    return this.glyphs.length;
  };
}
