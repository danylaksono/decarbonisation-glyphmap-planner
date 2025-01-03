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

// export const enrichGeoData = function (
//   buildingData,
//   geoJSON,
//   joinColumn = "lsoa_code",
//   geoJSONJoinColumn = "code",
//   aggregations = {}
// ) {
//   // 1. Group building data by LSOA code
//   const groupedData = buildingData.reduce((acc, item) => {
//     const code = item[joinColumn];
//     if (!acc[code]) {
//       acc[code] = [];
//     }
//     acc[code].push(item);
//     return acc;
//   }, {});

//   // 2. Infer data types using your inferTypes function
//   const dataTypes = inferTypes(buildingData);

//   // 3. Aggregate building data for each LSOA
//   const aggregatedData = {};
//   for (const code in groupedData) {
//     aggregatedData[code] = {};
//     const buildingsInLSOA = groupedData[code];

//     for (const column in aggregations) {
//       const aggregationType = aggregations[column];
//       const values = buildingsInLSOA.map((building) => building[column]);

//       if (dataTypes[column] === "Quantitative") {
//         // Handle numerical aggregations (sum, mean, etc.) as before
//         switch (aggregationType) {
//           case "sum":
//             aggregatedData[code][column] = values.reduce((a, b) => a + b, 0);
//             break;
//           case "mean":
//             aggregatedData[code][column] =
//               values.reduce((a, b) => a + b, 0) / values.length;
//             break;
//           // Add more numerical aggregations as needed (e.g., min, max, median)
//           case "count":
//             aggregatedData[code][column] = values.length;
//             break;
//           default:
//             console.warn(
//               `Unsupported aggregation type: ${aggregationType} for numerical column: ${column}`
//             );
//         }
//       } else {
//         // Handle categorical/ordinal aggregations
//         if (aggregationType === "count") {
//           // Count occurrences of each unique value
//           const counts = values.reduce((acc, val) => {
//             acc[val] = (acc[val] || 0) + 1;
//             return acc;
//           }, {});

//           // Store the counts for each unique value as separate properties
//           for (const [val, count] of Object.entries(counts)) {
//             aggregatedData[code][`${column}_${val}`] = count;
//           }
//         } else if (typeof aggregationType === "object") {
//           // Handle custom conditions like counting specific values
//           for (const [conditionName, conditionValue] of Object.entries(
//             aggregationType
//           )) {
//             const count = values.filter((val) => val === conditionValue).length;
//             aggregatedData[code][`${column}_${conditionName}`] = count;
//           }
//         } else {
//           console.warn(
//             `Unsupported aggregation type: ${aggregationType} for categorical column: ${column}`
//           );
//         }
//       }
//     }
//   }

//   // 4. Create a deep copy of the original GeoJSON
//   const newGeoJSON = JSON.parse(JSON.stringify(geoJSON));

//   // 5. Iterate through features and add aggregated data
//   newGeoJSON.features = newGeoJSON.features.map((feature) => {
//     const code = feature.properties[geoJSONJoinColumn];
//     const aggregatedItem = aggregatedData[code];

//     if (aggregatedItem) {
//       feature.properties = {
//         ...feature.properties,
//         ...aggregatedItem,
//       };
//     }

//     return feature;
//   });

//   return newGeoJSON;
// };

export const enrichGeoData = function (
  buildingData,
  geoJSON,
  joinColumn = "lsoa_code",
  geoJSONJoinColumn = "code",
  aggregations = {}
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
      const values = buildings
        .map(b => b[column])
        .filter(v => v != null); // Remove null/undefined values

      if (aggregationType === "sum" || aggregationType === "mean") {
        const sum = values.reduce((a, b) => a + (Number(b) || 0), 0);
        aggregatedData[code][column] = aggregationType === "sum" ?
          sum : (values.length ? sum / values.length : 0);
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

  // 3. Create new GeoJSON with merged data
  return {
    ...geoJSON,
    features: geoJSON.features.map(feature => ({
      ...feature,
      properties: {
        ...feature.properties,
        ...(aggregatedData[feature.properties[geoJSONJoinColumn]] || {})
      }
    }))
  };
};

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
