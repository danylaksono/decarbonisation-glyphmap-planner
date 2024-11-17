import * as d3 from "../../_npm/d3@7.9.0/_esm.js";

/**
 * Infer visualization-oriented data types (e.g., Quantitative, Nominal, Temporal, Ordinal).
 * @param {Array} data - Array of objects or arrays.
 * @returns {Object} An object mapping column names to inferred visualization-oriented types.
 */
export function inferTypes(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Input data should be a non-empty array");
  }

  const sample = Array.isArray(data[0]) ? data : [Object.values(data[0])];
  const keys = Array.isArray(data[0]) ? null : Object.keys(data[0]);

  const inferType = (values) => {
    // Check if all values are numeric
    if (values.every((v) => typeof v === "number" && !isNaN(v))) {
      return "Quantitative";
    }

    // Check if all values are dates
    if (values.every((v) => v instanceof Date || !isNaN(Date.parse(v)))) {
      return "Temporal";
    }

    // Check for Ordinal (few distinct, ordered values)
    const uniqueValues = [...new Set(values)].filter((v) => v != null);
    if (
      typeof values[0] === "string" &&
      uniqueValues.length <= 10 &&
      uniqueValues.every((v, i, arr) => arr.indexOf(v) === i)
    ) {
      return "Ordinal";
    }

    // Default to Nominal (categorical, unordered data)
    return "Nominal";
  };

  if (keys) {
    // Data is an array of objects
    return keys.reduce((result, key) => {
      const column = data.map((row) => row[key]);
      result[key] = inferType(column);
      return result;
    }, {});
  } else {
    // Data is an array of arrays
    return sample[0].map((_, index) => {
      const column = data.map((row) => row[index]);
      return inferType(column);
    });
  }
}

export function normaliseData(data, keysToNormalise) {
  // Create a D3 linear scale for each key to be normalized
  const scales = keysToNormalise.map((key) =>
    d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d[key])) // Set domain based on actual data range
      .range([0, 1])
  );

  // Normalize the data using the scales
  const normalisedData = data.map((d) => ({
    ...d, // Keep original properties
    ...keysToNormalise.reduce(
      (acc, key) => ({
        ...acc,
        [key]: scales[keysToNormalise.indexOf(key)](d[key]),
      }),
      {}
    ),
  }));

  return normalisedData;
}
