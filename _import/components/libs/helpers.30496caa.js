import * as d3 from "../../../_npm/d3@7.9.0/_esm.js";
import { OSGB } from "./osgb/index.1d2476df.js";
import { log, warn, error, setDebugMode } from "./logger.864b8094.js";

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
  joinColumn = "lsoa_code",
  geoJSONJoinColumn = "code",
  aggregations = {},
  normalize = true // Flag to enable or disable normalisation
) {
  log("enrichGeoData: Starting data enrichment process");

  // Input validation
  if (!Array.isArray(buildingData)) {
    error("enrichGeoData: buildingData is not an array");
    return geoJSON;
  }

  if (!buildingData.length) {
    warn("enrichGeoData: buildingData is empty");
    return geoJSON;
  }

  if (!geoJSON || !geoJSON.features || !Array.isArray(geoJSON.features)) {
    error("enrichGeoData: Invalid geoJSON structure");
    return geoJSON || { type: "FeatureCollection", features: [] };
  }

  if (typeof joinColumn !== "string" || typeof geoJSONJoinColumn !== "string") {
    error(
      `enrichGeoData: Invalid join columns. Using defaults. Got joinColumn=${joinColumn}, geoJSONJoinColumn=${geoJSONJoinColumn}`
    );
    joinColumn = "lsoa_code";
    geoJSONJoinColumn = "code";
  }

  if (typeof aggregations !== "object") {
    error("enrichGeoData: Invalid aggregations object");
    aggregations = {};
  }

  // Check if any building has the join column
  const hasJoinColumn = buildingData.some((item) => item && item[joinColumn]);
  if (!hasJoinColumn) {
    error(`enrichGeoData: No buildings found with join column "${joinColumn}"`);
    return geoJSON;
  }

  // 1. Group building data by join column
  log(`enrichGeoData: Grouping buildings by "${joinColumn}"`);
  const groupedData = buildingData.reduce((acc, item) => {
    if (!item) return acc; // Skip null items

    const code = item[joinColumn];
    if (!code) {
      // Debug info for missing join values
      if (item.id || item.building_id) {
        log(
          `enrichGeoData: Building ${
            item.id || item.building_id
          } missing join value for "${joinColumn}"`
        );
      }
      return acc; // Skip items with missing join values
    }

    acc[code] = acc[code] || [];
    acc[code].push(item);
    return acc;
  }, {});

  const groupCount = Object.keys(groupedData).length;
  log(
    `enrichGeoData: Created ${groupCount} groups from ${buildingData.length} buildings`
  );

  if (groupCount === 0) {
    warn("enrichGeoData: No valid groups created. Check join column values.");
    return geoJSON;
  }

  // 2. Aggregate building data for each group
  log("enrichGeoData: Aggregating building data");
  const aggregatedData = {};
  const skippedAggregations = [];

  for (const code in groupedData) {
    aggregatedData[code] = {};
    const buildings = groupedData[code];

    for (const column in aggregations) {
      const aggregationType = aggregations[column];

      // Check if column exists in at least one building
      const columnExists = buildings.some((b) => column in b);
      if (!columnExists) {
        skippedAggregations.push(column);
        continue;
      }

      const values = buildings.map((b) => b[column]).filter((v) => v != null); // Remove null/undefined values

      if (values.length === 0) {
        log(
          `enrichGeoData: No valid values for column "${column}" in area "${code}"`
        );
        continue;
      }

      try {
        if (aggregationType === "sum" || aggregationType === "mean") {
          const sum = values.reduce((a, b) => {
            const numValue = Number(b);
            if (isNaN(numValue)) {
              warn(
                `enrichGeoData: Non-numeric value "${b}" found in column "${column}"`
              );
              return a;
            }
            return a + (numValue || 0);
          }, 0);

          aggregatedData[code][column] =
            aggregationType === "sum"
              ? sum
              : values.length
              ? sum / values.length
              : 0;
        } else if (aggregationType === "count") {
          if (values.length > 0 && typeof values[0] === "string") {
            // Handle categorical counts
            const counts = values.reduce((acc, val) => {
              if (val === null || val === undefined) return acc;
              acc[val] = (acc[val] || 0) + 1;
              return acc;
            }, {});

            for (const [val, count] of Object.entries(counts)) {
              if (val) {
                // Ensure we don't create properties with empty keys
                aggregatedData[code][`${column}_${val}`] = count;
              }
            }
          } else {
            // Simple count
            aggregatedData[code][column] = values.length;
          }
        } else {
          warn(
            `enrichGeoData: Unsupported aggregation type "${aggregationType}" for column "${column}"`
          );
        }
      } catch (error) {
        error(`enrichGeoData: Error aggregating column "${column}":`, error);
        // Continue processing other columns
      }
    }
  }

  if (skippedAggregations.length > 0) {
    // console.warn(
    //   `enrichGeoData: Skipped aggregations for non-existent columns: ${skippedAggregations.join(
    //     ", "
    //   )}`
    // );
  }

  // 3. Normalize aggregated data if enabled
  let normalizedAggregatedData = aggregatedData;
  if (normalize) {
    log("enrichGeoData: Normalizing aggregated data");
    try {
      // Flatten aggregatedData to prepare it for normalization
      const flattenedData = Object.entries(aggregatedData).map(
        ([code, values]) => ({
          code,
          ...values,
        })
      );

      if (flattenedData.length === 0) {
        warn("enrichGeoData: No data to normalize");
      } else {
        // Determine numeric keys for normalization
        const numericKeys = getNumericKeys(flattenedData);
        log(
          `enrichGeoData: Found ${numericKeys.length} numeric columns to normalize`
        );

        // Normalize the flattened data
        const normalizedData = normaliseData(flattenedData, numericKeys);

        // Transform back to grouped structure
        normalizedAggregatedData = normalizedData.reduce((acc, item) => {
          const { code, ...rest } = item;
          acc[code] = rest;
          return acc;
        }, {});
      }
    } catch (err) {
      error("enrichGeoData: Error during normalization:", err);
      // Fall back to unnormalized data
      normalizedAggregatedData = aggregatedData;
    }
  }

  // 4. Create new GeoJSON with merged and normalized data
  log("enrichGeoData: Merging data with GeoJSON");
  let matchCount = 0;
  let missingMatches = [];

  const enrichedGeoJSON = {
    ...geoJSON,
    features: geoJSON.features.map((feature) => {
      if (!feature || !feature.properties) {
        warn("enrichGeoData: Found feature without properties");
        return feature;
      }

      const joinValue = feature.properties[geoJSONJoinColumn];
      if (!joinValue) {
        log(
          `enrichGeoData: Feature missing join value for "${geoJSONJoinColumn}"`
        );
        return feature;
      }

      const matchingData = normalizedAggregatedData[joinValue];
      if (!matchingData) {
        missingMatches.push(joinValue);
      } else {
        matchCount++;
      }

      return {
        ...feature,
        properties: {
          ...feature.properties,
          ...(matchingData || {}),
        },
      };
    }),
  };

  log(
    `enrichGeoData: Matched data for ${matchCount} out of ${geoJSON.features.length} features`
  );
  if (missingMatches.length > 0) {
    warn(
      `enrichGeoData: No matching data for ${missingMatches.length} features`
    );
    if (missingMatches.length < 10) {
      log(`enrichGeoData: Missing matches for: ${missingMatches.join(", ")}`);
    }
  }

  return enrichedGeoJSON;
};

function getNumericKeys(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const sample = data[0];
  if (typeof sample !== "object" || sample === null) return [];
  return Object.keys(sample).filter((key) => typeof sample[key] === "number");
}

// export function aggregateValues(
//   data,
//   selectedParameters = getNumericKeys(data),
//   aggregationType = "mean",
//   normalise = false // Optional normalization flag
// ) {
//   if (!Array.isArray(data) || data.length === 0) {
//     throw new Error("Data must be a non-empty array.");
//   }

//   // Validate selected parameters
//   if (!Array.isArray(selectedParameters) || selectedParameters.length === 0) {
//     throw new Error("Selected parameters must be a non-empty array.");
//   }

//   // Optional normalization step BEFORE aggregation
//   if (normalise && selectedParameters.length > 1) {
//     data = normaliseData(data, selectedParameters);
//   }

//   const aggregates = {};

//   // Define aggregation functions
//   const aggregationFunctions = {
//     mean: d3.mean,
//     sum: d3.sum,
//     min: d3.min,
//     max: d3.max,
//     extent: d3.extent,
//   };

//   const aggregationFn = aggregationFunctions[aggregationType];

//   if (!aggregationFn) {
//     throw new Error(`Unsupported aggregation type: ${aggregationType}`);
//   }

//   // Perform aggregation
//   for (const parameter of selectedParameters) {
//     const values = data
//       .map((d) => {
//         let value = d[parameter];

//         if (typeof value === "boolean") {
//           return value ? 1 : 0;
//         }

//         if (typeof value === "string" && !isNaN(value)) {
//           value = Number(value); // Convert numeric strings to numbers
//         }

//         return typeof value === "number" ? value : null; // Ensure it's a number
//       })
//       .filter((v) => v != null); // Remove null/undefined values

//     aggregates[parameter] = values.length > 0 ? aggregationFn(values) : null;
//   }

//   return aggregates;
// }

// // Normalization function
// export function normaliseData(data, keysToNormalise) {
//   if (!Array.isArray(data) || data.length === 0) {
//     throw new Error("Data must be a non-empty array.");
//   }

//   if (!Array.isArray(keysToNormalise) || keysToNormalise.length === 0) {
//     throw new Error("Keys to normalise must be a non-empty array.");
//   }

//   // Create a D3 linear scale for each key
//   const scales = {};
//   keysToNormalise.forEach((key) => {
//     const numericValues = data
//       .map((d) =>
//         typeof d[key] === "string" && !isNaN(d[key]) ? Number(d[key]) : d[key]
//       )
//       .filter((v) => typeof v === "number" && !isNaN(v));

//     const extent = d3.extent(numericValues);
//     console.log(`Key: ${key}, Min: ${extent[0]}, Max: ${extent[1]}`); // Debugging

//     if (extent[0] === extent[1]) {
//       // Avoid division by zero by setting a constant scale
//       scales[key] = () => 0.5;
//     } else {
//       scales[key] = d3.scaleLinear().domain(extent).range([0, 1]);
//     }
//   });

//   // Normalize data
//   return data.map((d) => {
//     let newData = { ...d };

//     keysToNormalise.forEach((key) => {
//       if (scales[key]) {
//         newData[key] = scales[key](d[key]);
//       }
//     });

//     return newData;
//   });
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
