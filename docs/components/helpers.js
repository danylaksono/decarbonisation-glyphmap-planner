import * as d3 from "npm:d3";
import { OSGB } from "./osgb/index.js";

const proj = new OSGB();

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

export const enrichGeoData = function (
  buildingData,
  geoJSON,
  joinColumn = "lsoa_code",
  geoJSONJoinColumn = "code",
  aggregations = {},
  normalize = true // Flag to enable or disable normalisation
) {
  // 1. Group building data by join column
  const groupedData = buildingData.reduce((acc, item) => {
    const code = item[joinColumn];
    if (!code) return acc; // Skip items with missing join values
    acc[code] = acc[code] || [];
    acc[code].push(item);
    return acc;
  }, {});

  // 2. Aggregate building data for each group
  const aggregatedData = {};
  for (const code in groupedData) {
    aggregatedData[code] = {};
    const buildings = groupedData[code];

    for (const column in aggregations) {
      const aggregationType = aggregations[column];
      const values = buildings.map((b) => b[column]).filter((v) => v != null); // Remove null/undefined values

      if (aggregationType === "sum" || aggregationType === "mean") {
        const sum = values.reduce((a, b) => a + (Number(b) || 0), 0);
        aggregatedData[code][column] =
          aggregationType === "sum"
            ? sum
            : values.length
            ? sum / values.length
            : 0;
      } else if (aggregationType === "count") {
        if (typeof values[0] === "string") {
          // Handle categorical counts
          const counts = values.reduce((acc, val) => {
            acc[val] = (acc[val] || 0) + 1;
            return acc;
          }, {});
          for (const [val, count] of Object.entries(counts)) {
            aggregatedData[code][`${column}_${val}`] = count;
          }
        } else {
          // Simple count
          aggregatedData[code][column] = values.length;
        }
      }
    }
  }

  // 3. Normalize aggregated data if enabled
  let normalizedAggregatedData = aggregatedData;
  if (normalize) {
    // Flatten aggregatedData to prepare it for normalization
    const flattenedData = Object.entries(aggregatedData).map(
      ([code, values]) => ({
        code,
        ...values,
      })
    );

    // Determine numeric keys for normalization
    const numericKeys = getNumericKeys(flattenedData);

    // Normalize the flattened data
    const normalizedData = normaliseData(flattenedData, numericKeys);

    // Transform back to grouped structure
    normalizedAggregatedData = normalizedData.reduce((acc, item) => {
      const { code, ...rest } = item;
      acc[code] = rest;
      return acc;
    }, {});
  }

  // 4. Create new GeoJSON with merged and normalized data
  return {
    ...geoJSON,
    features: geoJSON.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        ...(normalizedAggregatedData[feature.properties[geoJSONJoinColumn]] ||
          {}),
      },
    })),
  };
};

function getNumericKeys(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const sample = data[0];
  if (typeof sample !== "object" || sample === null) return [];
  return Object.keys(sample).filter((key) => typeof sample[key] === "number");
}

export function aggregateValues(
  data,
  selectedParameters = getNumericKeys(data), // Default to numeric keys if not provided
  aggregationType = "mean"
) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Data must be a non-empty array.");
  }

  const aggregates = {};

  // Map the aggregation type to the corresponding D3 function
  const aggregationFunctions = {
    mean: d3.mean,
    sum: d3.sum,
    min: d3.min,
    max: d3.max,
    extent: d3.extent,
  };

  const aggregationFn = aggregationFunctions[aggregationType];

  if (!aggregationFn) {
    throw new Error(`Unsupported aggregation type: ${aggregationType}`);
  }

  // Validate selected parameters
  // console.log("selectedParameters:", selectedParameters);

  if (!Array.isArray(selectedParameters) || selectedParameters.length === 0) {
    throw new Error("Selected parameters must be a non-empty array.");
  }

  for (const parameter of selectedParameters) {
    const values = data
      .map((d) =>
        typeof d[parameter] === "boolean"
          ? d[parameter]
            ? 1
            : 0 // Convert boolean to 1 or 0
          : d[parameter]
      )
      .filter((v) => v != null); // Filter out null/undefined
    if (values.length === 0) {
      // Handle cases where there are no valid values for the parameter
      aggregates[parameter] = null;
    } else {
      aggregates[parameter] = aggregationFn(values);
    }
  }

  return aggregates;
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

// function getNumericKeys(data) {
//   const sample = data[0];
//   return Object.keys(sample).filter((key) => typeof sample[key] === "number");
// }

export function insideCell(c, x, y) {
  // console.log(x + " " + y  + " " + c.getXCentre() + " " + c.getYCentre() + " " + c.getCellSize());
  if (
    x >= c.getXCentre() - c.getCellSize() &&
    x <= c.getXCentre() + c.getCellSize() &&
    y >= c.getYCentre() - c.getCellSize() &&
    y <= c.getYCentre() + c.getCellSize()
  )
    return true;
  return false;
}

export function debounceInput(input, delay = 1000) {
  // From https://github.com/Fil/pangea/blob/main/src/components/debounce.js
  // Wrap the input in a div, and get ready to pass changes up.
  console.log("....... debouncing input");
  const div = document.createElement("div");
  div.appendChild(input);
  div.value = input.value;

  function pass(value) {
    div.value = value;
    div.dispatchEvent(new Event("input"));
  }

  let timer = null;
  let value;

  // On input, check if we recently reported a value.
  // If we did, do nothing and wait for a delay;
  // otherwise, report the current value and set a timeout.
  function inputted() {
    if (timer !== null) return;
    value = input.value;
    requestAnimationFrame(() => pass(value));
    timer = setTimeout(delayed, delay);
  }

  // After a delay, check if the last-reported value is the current value.
  // If it’s not, report the new value.
  function delayed() {
    timer = null;
    if (value === input.value) return;
    pass((value = input.value));
  }

  input.addEventListener("input", inputted);
  return div;
}

// using session storage to escape observablehq's reactivity
export function saveToSession(key, value) {
  // Validate parameters
  if (!key || typeof key !== "string") {
    throw new Error("Invalid key: must be a non-empty string");
  }

  try {
    // Handle null/undefined
    if (value === undefined) {
      value = null;
    }

    // Check available space (rough estimation)
    const serialized = JSON.stringify(value);
    if (serialized.length * 2 > 5242880) {
      // 5MB limit
      throw new Error("Data exceeds storage capacity");
    }

    sessionStorage.setItem(key, serialized);
    // console.log(`Saved to session: ${key}: ${serialized}`);
    return true;
  } catch (error) {
    if (error.name === "QuotaExceededError") {
      console.error("Storage quota exceeded");
    } else {
      console.error("Failed to save to session:", error);
    }
    return false;
  }
}

export function getFromSession(key, defaultValue = null) {
  // Validate key
  if (!key || typeof key !== "string") {
    throw new Error("Invalid key: must be a non-empty string");
  }

  try {
    const item = sessionStorage.getItem(key);
    // console.log(`Reading from session: ${key}: ${item}`);

    // Handle missing data
    if (item === null) {
      return defaultValue;
    }

    // Safe parsing
    try {
      return JSON.parse(item);
    } catch (parseError) {
      console.warn("Failed to parse stored data:", parseError);
      return defaultValue;
    }
  } catch (error) {
    console.error("Failed to read from session:", error);
    return defaultValue;
  }
}

// Coordinate transformation utilities
export function transformCoordinates(coords) {
  if (coords.length === 4 && !Array.isArray(coords[0])) {
    // bounding box
    return [
      ...proj.toGeo([coords[0], coords[1]]),
      ...proj.toGeo([coords[2], coords[3]]),
    ];
  } else if (Array.isArray(coords[0])) {
    // arrays of coordinates
    return coords.map(transformCoordinates);
  } else {
    // individual coordinate pairs
    return proj.toGeo(coords);
  }
}

export function transformGeometry(geometry) {
  if (geometry.type === "GeometryCollection") {
    return {
      ...geometry,
      geometries: geometry.geometries.map(transformGeometry),
    };
  }

  return {
    ...geometry,
    coordinates: transformCoordinates(geometry.coordinates),
  };
}

// Function to apply transformation to geographicShapes
export function applyTransformationToShapes(geographicShapes) {
  return Object.fromEntries(
    Object.entries(geographicShapes).map(([code, feature]) => [
      code,
      {
        ...feature,
        geometry: transformGeometry(feature.geometry),
      },
    ])
  );
}

// export function normaliseData(data, keysToNormalise) {
//   // Create a D3 linear scale for each key to be normalized
//   const scales = keysToNormalise.map((key) =>
//     d3
//       .scaleLinear()
//       .domain(d3.extent(data, (d) => d[key])) // Set domain based on actual data range
//       .range([0, 100])
//   );

//   // Normalize the data using the scales
//   const normalisedData = data.map((d) => ({
//     ...d, // Keep original properties
//     ...keysToNormalise.reduce(
//       (acc, key) => ({
//         ...acc,
//         [key]: scales[keysToNormalise.indexOf(key)](d[key]),
//       }),
//       {}
//     ),
//   }));

//   return normalisedData;
// }

export function normalisebyGroup(data, keysToNormalise, groupByKeys = []) {
  // If groupByKeys is provided, group the data first
  const groupedData =
    groupByKeys.length > 0
      ? d3.group(data, (...keys) => keys.map(String))
      : [null, data];

  // Create a D3 linear scale for each key to be normalized within each group
  const scales = {};
  groupedData.forEach(([groupKey, groupData]) => {
    scales[groupKey || "ungrouped"] = keysToNormalise.map((key) =>
      d3
        .scaleLinear()
        .domain(d3.extent(groupData, (d) => d[key])) // Set domain based on actual data range within the group
        .range([0, 1])
    );
  });

  // Normalize the data using the scales
  const normalisedData = data.map((d) => {
    const groupKey = groupByKeys.map((key) => d[key]).join(",");
    const scalesForGroup = scales[groupKey] || scales["ungrouped"];

    return {
      ...d, // Keep original properties
      ...keysToNormalise.reduce(
        (acc, key, index) => ({
          ...acc,
          [key]: scalesForGroup[index](d[key]),
        }),
        {}
      ),
    };
  });

  return normalisedData;
}
