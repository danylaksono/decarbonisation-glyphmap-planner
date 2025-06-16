import * as d3 from "npm:d3";
import { OSGB } from "./osgb/index.js";
import { log, warn, error, setDebugMode } from "./logger.js";

const proj = new OSGB();
setDebugMode(false);

export function getNumericBudget(value) {
  // Remove commas and parse the value as a number
  let budget = parseFloat(value.replace(/,/g, "").replace(/£/g, ""));
  // log("budget in billions", budget * 1e6);
  return budget * 1000;
}

/**
 * Infer visualization-oriented data types (e.g., Quantitative, Nominal, Temporal, Ordinal).
 * @param {Array} data - Array of objects or arrays.
 * @returns {Object} An object mapping column names to inferred visualization-oriented types.
 */
export function inferTypes(data) {
  if (!Array.isArray(data) || data.length === 0) {
    error("Input data should be a non-empty array");
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
  joinColumn = "lsoa",
  geoJSONJoinColumn = "code",
  aggregations = {},
  normalize = true // Default to false since you want actual sums
) {
  console.log("enrichGeoData: Starting data enrichment process");

  // Input validation
  if (!Array.isArray(buildingData) || !buildingData.length) {
    console.warn("enrichGeoData: Invalid or empty buildingData");
    return geoJSON;
  }

  if (!geoJSON?.features?.length) {
    console.warn("enrichGeoData: Invalid or empty geoJSON");
    return geoJSON || { type: "FeatureCollection", features: [] };
  }

  // Group building data by join column
  console.log(`enrichGeoData: Grouping buildings by "${joinColumn}"`);
  const groupedData = {};

  buildingData.forEach((building) => {
    if (!building) return;

    const code = building[joinColumn];
    if (!code) return;

    if (!groupedData[code]) {
      groupedData[code] = [];
    }
    groupedData[code].push(building);
  });

  console.log(
    `Created ${Object.keys(groupedData).length} groups from ${
      buildingData.length
    } buildings`
  );

  // Aggregate data for each group
  console.log("enrichGeoData: Aggregating building data");
  const aggregatedData = {};

  for (const [code, buildings] of Object.entries(groupedData)) {
    aggregatedData[code] = {};

    for (const [column, aggregationType] of Object.entries(aggregations)) {
      const values = buildings
        .map((b) => b[column])
        .filter((v) => v != null && v !== ""); // Remove null, undefined, and empty strings

      if (values.length === 0) continue;

      try {
        switch (aggregationType) {
          case "sum":
            aggregatedData[code][column] = values.reduce((sum, val) => {
              const num = Number(val);
              return sum + (isNaN(num) ? 0 : num);
            }, 0);
            break;

          case "mean":
            const numericValues = values
              .map((v) => Number(v))
              .filter((v) => !isNaN(v));
            if (numericValues.length > 0) {
              aggregatedData[code][column] =
                numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
            }
            break;

          case "count":
            aggregatedData[code][column] = values.length;
            break;

          case "unique_count":
            aggregatedData[code][column] = new Set(values).size;
            break;

          case "array":
            // Collect unique values as an array
            aggregatedData[code][column] = [...new Set(values)];
            break;

          case "categories":
            // Count occurrences of each category
            const counts = {};
            values.forEach((val) => {
              counts[val] = (counts[val] || 0) + 1;
            });
            // Add each category as separate property
            for (const [cat, count] of Object.entries(counts)) {
              aggregatedData[code][`${column}_${cat}`] = count;
            }
            break;

          case "min":
            const minValues = values
              .map((v) => Number(v))
              .filter((v) => !isNaN(v));
            if (minValues.length > 0) {
              aggregatedData[code][column] = Math.min(...minValues);
            }
            break;

          case "max":
            const maxValues = values
              .map((v) => Number(v))
              .filter((v) => !isNaN(v));
            if (maxValues.length > 0) {
              aggregatedData[code][column] = Math.max(...maxValues);
            }
            break;

          default:
            console.warn(`Unsupported aggregation type: ${aggregationType}`);
        }
      } catch (error) {
        console.error(`Error aggregating column "${column}":`, error);
      }
    }
  }

  // Optional normalization (only if explicitly requested)
  let finalData = aggregatedData;
  if (normalize) {
    console.log("enrichGeoData: Normalizing data");
    finalData = normalizeAggregatedData(aggregatedData);
  }

  // Merge with GeoJSON
  console.log("enrichGeoData: Merging data with GeoJSON");
  let matchCount = 0;

  const enrichedGeoJSON = {
    ...geoJSON,
    features: geoJSON.features.map((feature) => {
      if (!feature?.properties) return feature;

      const joinValue = feature.properties[geoJSONJoinColumn];
      if (!joinValue) return feature;

      const matchingData = finalData[joinValue];
      if (matchingData) {
        matchCount++;
        return {
          ...feature,
          properties: {
            ...feature.properties,
            ...matchingData,
          },
        };
      }

      return feature;
    }),
  };

  console.log(
    `Matched data for ${matchCount} out of ${geoJSON.features.length} features`
  );

  return enrichedGeoJSON;
};

// Helper function for normalization (only used if normalize=true)
function normalizeAggregatedData(aggregatedData) {
  // Convert to flat array for processing
  const flatData = Object.entries(aggregatedData).map(([code, values]) => ({
    code,
    ...values,
  }));

  // Find numeric columns
  const numericKeys = [];
  if (flatData.length > 0) {
    Object.keys(flatData[0]).forEach((key) => {
      if (key !== "code" && typeof flatData[0][key] === "number") {
        numericKeys.push(key);
      }
    });
  }

  // Normalize numeric columns
  const normalizers = {};
  numericKeys.forEach((key) => {
    const values = flatData
      .map((d) => d[key])
      .filter((v) => typeof v === "number");
    const min = Math.min(...values);
    const max = Math.max(...values);

    normalizers[key] =
      min === max ? () => 0.5 : (value) => (value - min) / (max - min);
  });

  // Apply normalization and convert back
  const normalizedData = {};
  flatData.forEach((item) => {
    const { code, ...rest } = item;
    normalizedData[code] = { ...rest };

    numericKeys.forEach((key) => {
      if (typeof item[key] === "number") {
        normalizedData[code][key] = normalizers[key](item[key]);
      }
    });
  });

  return normalizedData;
}

function getNumericKeys(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const sample = data[0];
  if (typeof sample !== "object" || sample === null) return [];
  return Object.keys(sample).filter((key) => typeof sample[key] === "number");
}

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
      warn("Failed to parse stored data:", parseError);
      return defaultValue;
    }
  } catch (error) {
    error("Failed to read from session:", error);
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

// export function normalisebyGroup(data, keysToNormalise, groupByKeys = []) {
//   // If groupByKeys is provided, group the data first
//   const groupedData =
//     groupByKeys.length > 0
//       ? d3.group(data, (...keys) => keys.map(String))
//       : [null, data];

//   // Create a D3 linear scale for each key to be normalized within each group
//   const scales = {};
//   groupedData.forEach(([groupKey, groupData]) => {
//     scales[groupKey || "ungrouped"] = keysToNormalise.map((key) =>
//       d3
//         .scaleLinear()
//         .domain(d3.extent(groupData, (d) => d[key])) // Set domain based on actual data range within the group
//         .range([0, 1])
//     );
//   });

//   // Normalize the data using the scales
//   const normalisedData = data.map((d) => {
//     const groupKey = groupByKeys.map((key) => d[key]).join(",");
//     const scalesForGroup = scales[groupKey] || scales["ungrouped"];

//     return {
//       ...d, // Keep original properties
//       ...keysToNormalise.reduce(
//         (acc, key, index) => ({
//           ...acc,
//           [key]: scalesForGroup[index](d[key]),
//         }),
//         {}
//       ),
//     };
//   });

//   return normalisedData;
// }

export function normaliseData(data, keysToNormalise) {
  if (!Array.isArray(data) || data.length === 0) {
    // throw new Error("Data must be a non-empty array.");
    warn("Data must be a non-empty array.");
    return data; // Return original data if empty
  }

  // First, gather all values for each key
  const allValues = {};
  keysToNormalise.forEach((key) => {
    allValues[key] = data
      .map((d) => {
        let value = d[key];
        if (typeof value === "string" && !isNaN(value)) {
          value = Number(value);
        }
        return typeof value === "number" && !isNaN(value) ? value : null;
      })
      .filter((v) => v !== null);
  });

  // Create normalization functions
  const normalizers = {};
  keysToNormalise.forEach((key) => {
    const values = allValues[key];
    const min = Math.min(...values);
    const max = Math.max(...values);

    if (min === max) {
      normalizers[key] = () => 0.5;
    } else {
      normalizers[key] = (value) => (value - min) / (max - min);
    }
  });

  // Apply normalization
  return data.map((d) => {
    const normalized = { ...d };
    keysToNormalise.forEach((key) => {
      let value = d[key];
      if (typeof value === "string" && !isNaN(value)) {
        value = Number(value);
      }
      if (typeof value === "number" && !isNaN(value)) {
        normalized[key] = normalizers[key](value);
      }
    });
    return normalized;
  });
}

// <!-- dealing with observable input reactivity -->
// two ways Obs input
export function set(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  // console.log("input value:", input.value);
}

export function aggregateValues(
  data,
  selectedParameters,
  aggregationType = "mean",
  normalise = false
) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Data must be a non-empty array.");
  }

  // Define aggregation functions
  const aggregationFunctions = {
    sum: (arr) => arr.reduce((a, b) => a + b, 0),
    mean: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
    min: (arr) => Math.min(...arr),
    max: (arr) => Math.max(...arr),
    extent: (arr) => [Math.min(...arr), Math.max(...arr)],
  };

  if (!aggregationFunctions[aggregationType]) {
    throw new Error(`Unsupported aggregation type: ${aggregationType}`);
  }

  // If normalization is requested, normalize first
  const workingData = normalise
    ? normaliseData(data, selectedParameters)
    : data;

  // For normalized sums, we need to adjust based on the number of items
  const adjustmentFactor =
    normalise && aggregationType === "sum" ? 1 / data.length : 1;

  // Perform aggregation
  const result = {};
  selectedParameters.forEach((param) => {
    const values = workingData
      .map((d) => {
        let value = d[param];
        if (typeof value === "string" && !isNaN(value)) {
          value = Number(value);
        }
        return typeof value === "number" && !isNaN(value) ? value : null;
      })
      .filter((v) => v !== null);

    if (values.length > 0) {
      const aggregated = aggregationFunctions[aggregationType](values);
      result[param] = normalise ? aggregated * adjustmentFactor : aggregated;
    } else {
      result[param] = null;
    }
  });

  return result;
}
