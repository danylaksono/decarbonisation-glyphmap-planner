import * as d3 from "npm:d3";

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
