/**
 * Web Worker for sorterTable computationally intensive operations
 * This worker handles heavy calculations to keep the main UI thread responsive
 */

// Import d3 if needed for calculations
// importScripts('https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js');

// Cache for binning operations to avoid redundant calculations
const _cache = {
  binning: {},
};

/**
 * Process messages from the main thread
 */
self.onmessage = function (e) {
  try {
    const { task, data, taskId } = e.data;

    switch (task) {
      case "infer_column_types":
        const columnTypes = inferColumnTypes(data.dataArray, data.columns);
        self.postMessage({
          task,
          taskId,
          status: "complete",
          result: columnTypes,
        });
        break;

      case "calculate_bins":
        const bins = calculateBins(
          data.dataArray,
          data.column,
          data.columnType,
          data.options
        );
        self.postMessage({
          task,
          taskId,
          status: "complete",
          result: bins,
        });
        break;

      case "sort_data":
        const sorted = sortData(
          data.dataArray,
          data.dataInd,
          data.sortingConfig
        );
        self.postMessage({
          task,
          taskId,
          status: "complete",
          result: sorted,
        });
        break;

      case "aggregate_data":
        const aggregated = aggregateData(
          data.dataArray,
          data.dataInd,
          data.groupByColumn,
          data.columnTypes
        );
        self.postMessage({
          task,
          taskId,
          status: "complete",
          result: aggregated,
        });
        break;

      default:
        self.postMessage({
          task,
          taskId,
          status: "error",
          error: `Unknown task: ${task}`,
        });
    }
  } catch (error) {
    self.postMessage({
      task: e.data.task || "unknown",
      taskId: e.data.taskId || "unknown",
      status: "error",
      error: error.message || "Unknown error in worker",
    });
  }
};

/**
 * Infer types for columns
 * @param {Array} dataArray - Array of data objects
 * @param {Array} columns - Column definitions
 * @returns {Object} Map of column names to types
 */
function inferColumnTypes(dataArray, columns) {
  // Early validation
  if (
    !Array.isArray(dataArray) ||
    !dataArray.length ||
    !Array.isArray(columns)
  ) {
    throw new Error("Invalid data or columns provided to inferColumnTypes");
  }

  const result = {};

  // Process each column
  columns.forEach((column) => {
    // Allow both string column names and object column definitions
    const colName = typeof column === "string" ? column : column.column;

    // Skip if no column name
    if (!colName) return;

    // Check cache first
    const cacheKey = `type_${colName}`;
    if (_cache.binning[cacheKey]) {
      result[colName] = _cache.binning[cacheKey];
      return;
    }

    // Get column type from predefined type if available
    if (typeof column === "object" && column.type) {
      result[colName] = column.type;
      _cache.binning[cacheKey] = column.type;
      return;
    }

    // Infer type from data
    let inferredType = inferColumnType(dataArray, colName);
    result[colName] = inferredType;

    // Cache the result
    _cache.binning[cacheKey] = inferredType;
  });

  return result;
}

/**
 * Infer type for a single column
 * @param {Array} data - Array of data objects
 * @param {string} column - Column name
 * @returns {string} Inferred column type
 */
function inferColumnType(data, column) {
  // Count value types frequencies to make a better decision
  let numberCount = 0;
  let dateCount = 0;
  let stringCount = 0;
  let nullCount = 0;
  let uniqueValues = new Set();

  // Sample the data for performance (use at most 1000 rows)
  const sampleLimit = Math.min(1000, data.length);
  const sampleStep = Math.max(1, Math.floor(data.length / sampleLimit));

  for (let i = 0; i < data.length; i += sampleStep) {
    const value = data[i][column];

    // Skip null/undefined values
    if (value === null || value === undefined) {
      nullCount++;
      continue;
    }

    // Track unique values
    uniqueValues.add(value);

    // Check value type
    if (value instanceof Date) {
      dateCount++;
    } else if (typeof value === "number") {
      numberCount++;
    } else if (typeof value === "string") {
      stringCount++;

      // Check if string might be a number
      if (!isNaN(Number(value)) && value.trim() !== "") {
        numberCount++;
      }

      // Check if string might be a date
      const potentialDate = new Date(value);
      if (!isNaN(potentialDate.getTime())) {
        dateCount++;
      }
    }
  }

  // Calculate total non-null values
  const totalValues = data.length - nullCount;

  // Make type determination
  if (dateCount > totalValues * 0.5) {
    return "date";
  } else if (numberCount > totalValues * 0.5) {
    // For numbers, consider whether they're continuous or just a few discrete values
    if (uniqueValues.size > 10 && uniqueValues.size > totalValues * 0.1) {
      return "continuous";
    } else {
      return "ordinal";
    }
  }

  // Default to ordinal for strings and small number sets
  return "ordinal";
}

/**
 * Calculate bins for a column
 * @param {Array} dataArray - Array of data objects
 * @param {string} column - Column name
 * @param {string} columnType - Column type
 * @param {Object} options - Binning options
 * @returns {Array} Calculated bins
 */
function calculateBins(dataArray, column, columnType, options = {}) {
  // Early validation
  if (!Array.isArray(dataArray) || !dataArray.length || !column) {
    throw new Error("Invalid data or column provided to calculateBins");
  }

  // Check cache first
  const cacheKey = `bins_${column}_${columnType}`;
  if (_cache.binning[cacheKey]) {
    return _cache.binning[cacheKey];
  }

  // Extract values
  const values = dataArray
    .map((d) => d[column])
    .filter((v) => v !== null && v !== undefined);

  // No values, return empty bins
  if (!values.length) {
    return [];
  }

  let bins = [];

  try {
    if (columnType === "continuous") {
      // Continuous data binning
      const min = Math.min(...values.filter((v) => typeof v === "number"));
      const max = Math.max(...values.filter((v) => typeof v === "number"));

      // Generate thresholds
      const binCount = options.maxContinuousBins || 20;
      const step = (max - min) / binCount;

      // Create thresholds with nice rounded values
      const thresholds = Array.from({ length: binCount + 1 }, (_, i) => {
        return Number((min + i * step).toFixed(2));
      });

      // Create bins using threshold
      for (let i = 0; i < thresholds.length - 1; i++) {
        const x0 = thresholds[i];
        const x1 = thresholds[i + 1];

        // Filter values that fall within this bin
        const binValues = values.filter(
          (v) => v >= x0 && (i === thresholds.length - 2 ? v <= x1 : v < x1)
        );

        bins.push({
          x0,
          x1,
          count: binValues.length,
          values: binValues,
        });
      }
    } else if (columnType === "date") {
      // Date column binning
      const dates = values
        .map((v) => new Date(v))
        .filter((d) => !isNaN(d.getTime()));

      if (dates.length) {
        const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

        // Determine appropriate bin interval (day, month, year)
        const timeDiff = maxDate - minDate;
        const daysRange = timeDiff / (1000 * 60 * 60 * 24);

        let interval;
        if (daysRange <= 31) {
          interval = "day";
        } else if (daysRange <= 366) {
          interval = "month";
        } else {
          interval = "year";
        }

        // Create bins based on interval
        const binsByDate = new Map();

        dates.forEach((date) => {
          let binKey;

          switch (interval) {
            case "day":
              binKey = date.toISOString().split("T")[0];
              break;
            case "month":
              binKey = `${date.getFullYear()}-${String(
                date.getMonth() + 1
              ).padStart(2, "0")}`;
              break;
            case "year":
              binKey = date.getFullYear().toString();
              break;
          }

          if (!binsByDate.has(binKey)) {
            binsByDate.set(binKey, {
              date: new Date(date),
              count: 0,
              values: [],
            });
          }

          const bin = binsByDate.get(binKey);
          bin.count++;
          bin.values.push(date);
        });

        // Convert map to array and sort by date
        bins = Array.from(binsByDate.values()).sort((a, b) => a.date - b.date);
      }
    } else {
      // Ordinal binning - count occurrences of each value
      const valueCount = new Map();

      values.forEach((value) => {
        const key = String(value);
        if (!valueCount.has(key)) {
          valueCount.set(key, {
            key: value,
            count: 0,
            values: [],
          });
        }

        const bin = valueCount.get(key);
        bin.count++;
        bin.values.push(value);
      });

      // Convert to array
      bins = Array.from(valueCount.values());

      // Limit number of bins if needed
      const maxOrdinalBins = options.maxOrdinalBins || 12;
      if (bins.length > maxOrdinalBins) {
        // Sort bins by count in descending order
        bins.sort((a, b) => b.count - a.count);

        // Take top N-1 bins and put the rest in "Other"
        const topBins = bins.slice(0, maxOrdinalBins - 1);
        const otherBins = bins.slice(maxOrdinalBins - 1);

        if (otherBins.length) {
          const otherBin = {
            key: "Other",
            count: otherBins.reduce((sum, bin) => sum + bin.count, 0),
            values: otherBins.flatMap((bin) => bin.values),
          };

          topBins.push(otherBin);
          bins = topBins;
        }
      }
    }

    // Cache the result
    _cache.binning[cacheKey] = bins;

    return bins;
  } catch (error) {
    // Return empty array on error
    console.error("Error calculating bins:", error);
    return [];
  }
}

/**
 * Sort data based on compound sorting configuration
 * @param {Array} dataArray - Original data array
 * @param {Array} dataInd - Indices to sort
 * @param {Object} sortingConfig - Sorting configuration
 * @returns {Array} Sorted indices
 */
function sortData(dataArray, dataInd, sortingConfig) {
  // Early validation
  if (!Array.isArray(dataArray) || !Array.isArray(dataInd) || !sortingConfig) {
    throw new Error("Invalid parameters provided to sortData");
  }

  try {
    // Create a map of sorting columns
    const sorts = {};

    Object.keys(sortingConfig).forEach((column) => {
      const sortDir = sortingConfig[column].how === "up" ? 1 : -1;

      // Check if we're sorting strings (reverse direction)
      let adjustedSortDir = sortDir;
      if (typeof dataArray[0][column] === "string") {
        adjustedSortDir *= -1;
      }

      // Create sorted indices for this column
      const sortedIndices = dataInd.slice().sort((i1, i2) => {
        const val1 = dataArray[i1][column];
        const val2 = dataArray[i2][column];

        // Handle null/undefined values
        if (val1 === null || val1 === undefined) return adjustedSortDir * -1;
        if (val2 === null || val2 === undefined) return adjustedSortDir;

        // Compare values
        return adjustedSortDir * (val1 > val2 ? 1 : val1 < val2 ? -1 : 0);
      });

      // Assign rank to each item based on its position
      sorts[column] = new Array(dataArray.length);
      let rank = 0;
      sorts[column][sortedIndices[0]] = rank;

      for (let i = 1; i < sortedIndices.length; i++) {
        if (
          dataArray[sortedIndices[i]][column] !=
          dataArray[sortedIndices[i - 1]][column]
        ) {
          rank = i;
        }
        sorts[column][sortedIndices[i]] = rank;
      }
    });

    // Create a Map to store indices for efficient lookup
    const tabIndices = new Map();
    dataInd.forEach((v, i) => {
      tabIndices.set(v, i);
    });

    // Sort indices based on compound sorting
    const sortedIndices = dataInd.slice().sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      Object.keys(sorts).forEach((column) => {
        const weight = sortingConfig[column].weight;
        scoreA += weight * sorts[column][tabIndices.get(a)];
        scoreB += weight * sorts[column][tabIndices.get(b)];
      });

      return scoreA - scoreB;
    });

    return sortedIndices;
  } catch (error) {
    console.error("Error sorting data:", error);
    return dataInd; // Return original indices on error
  }
}

/**
 * Aggregate data by column
 * @param {Array} dataArray - Original data array
 * @param {Array} dataInd - Indices to aggregate
 * @param {string} groupByColumn - Column to group by
 * @param {Object} columnTypes - Map of column types
 * @returns {Object} Aggregated data
 */
function aggregateData(dataArray, dataInd, groupByColumn, columnTypes) {
  // Early validation
  if (!Array.isArray(dataArray) || !Array.isArray(dataInd) || !groupByColumn) {
    throw new Error("Invalid parameters provided to aggregateData");
  }

  try {
    // Collect all unique values in the groupBy column
    const uniqueValues = new Set();
    dataInd.forEach((index) => {
      uniqueValues.add(dataArray[index][groupByColumn]);
    });

    // Create aggregated data
    const aggregatedData = [];

    Array.from(uniqueValues).forEach((value) => {
      // Filter rows with this value
      const matchingIndices = dataInd.filter(
        (index) => dataArray[index][groupByColumn] === value
      );

      // Skip if no matches (shouldn't happen)
      if (!matchingIndices.length) return;

      // Create aggregated row
      const aggregatedRow = { [groupByColumn]: value };

      // Aggregate each column
      Object.keys(columnTypes).forEach((column) => {
        // Skip groupBy column
        if (column === groupByColumn) return;

        const colType = columnTypes[column];
        const values = matchingIndices
          .map((index) => dataArray[index][column])
          .filter((v) => v !== null && v !== undefined);

        // Apply aggregation based on column type
        if (colType === "continuous" || colType === "number") {
          // For numerical columns, calculate mean
          if (values.length) {
            // Calculate mean
            const sum = values.reduce((acc, val) => acc + Number(val), 0);
            const mean = sum / values.length;

            // Format to 2 decimal places
            aggregatedRow[column] = Number(mean.toFixed(2));
          } else {
            aggregatedRow[column] = 0;
          }
        } else if (colType === "date") {
          // For date columns, count
          aggregatedRow[column] = values.length;
        } else {
          // For ordinal/categorical columns, count
          aggregatedRow[column] = values.length;
        }
      });

      aggregatedData.push(aggregatedRow);
    });

    return {
      data: aggregatedData,
      dataInd: Array.from(Array(aggregatedData.length).keys()),
    };
  } catch (error) {
    console.error("Error aggregating data:", error);
    return {
      data: dataArray,
      dataInd: dataInd,
      error: error.message,
    };
  }
}
