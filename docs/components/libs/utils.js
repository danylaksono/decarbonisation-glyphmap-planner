// import * as d3 from "npm:d3";
import * as topojson from "npm:topojson-client";
import { require } from "npm:d3-require";
import { Mutable } from "observablehq:stdlib";
import * as turf from "@turf/turf";

import * as d3 from "npm:d3";
// import * as d3Geo from "npm:d3-geo@3.1.1";
// import * as d3GeoProjection from "npm:d3-geo-projection@4";

export function selectionFactory(initialValue, idField) {
  // Initialize a mutable selection (e.g., an empty array)
  const selection = Mutable(initialValue);

  // Define the update function with selection logic
  const updateSelection = (newSelection, mode) => {
    if (mode === "single") {
      // Replace the current selection with the new one
      selection.value = newSelection;
    } else if (mode === "union") {
      // Get IDs from the new selection using the specified idField
      const newIds = new Set(newSelection.map((obj) => obj[idField]));
      // Add objects from the current selection that aren’t in newSelection
      const additional = selection.value.filter(
        (obj) => !newIds.has(obj[idField])
      );
      // Combine the two sets
      selection.value = [...newSelection, ...additional];
    } else if (mode === "intersect") {
      // Get IDs from the current selection using the specified idField
      const currentIds = new Set(selection.value.map((obj) => obj[idField]));
      // Keep only objects from newSelection that are in currentIds
      selection.value = newSelection.filter((obj) =>
        currentIds.has(obj[idField])
      );
    } else {
      // Handle invalid mode
      throw new Error("Invalid mode");
    }
  };

  // Return the getter (selection) and setter (update function)
  return [selection, updateSelection];
}

export function context2d(width, height, dpi = devicePixelRatio) {
  const canvas = document.createElement("canvas");
  canvas.width = width * dpi;
  canvas.height = height * dpi;
  canvas.style = `width: ${width}px;`;
  const context = canvas.getContext("2d");
  context.scale(dpi, dpi);
  return context;
}

export function animate(
  currentValue,
  animationFrame,
  playing = false,
  direction = 1
) {
  // Increment or decrement the value
  let newValue = currentValue + 0.01 * direction;

  // Reverse direction if boundaries are reached
  // if (newValue >= 1 || newValue <= 0) {
  //   direction *= -1;
  //   newValue = Math.max(0, Math.min(1, newValue)); // Clamp value between 0 and 1
  // }
  if (newValue >= 1 || newValue <= 0) {
    newValue = Math.max(0, Math.min(1, newValue)); // Clamp value
    playing = false; // Pause animation
    playButton.innerHTML = '<i class="fas fa-play"></i>'; // Update button
    cancelAnimationFrame(animationFrame);
    return; // Stop animation loop
  }

  // Update the slider and dispatch the "input" event for reactivity
  set(morphFactorInput, newValue);

  if (playing) {
    animationFrame = requestAnimationFrame(() => animate(newValue)); // Pass the updated value
  }
}

export const downloadBoundaries = function (geogName, permittedCodes) {
  const topojsonUrl =
    "https://gicentre.github.io/data/census21/englandAndWales/" +
    geogName +
    ".json";
  const csvUrl =
    "https://gicentre.github.io/data/census21/englandAndWales/" +
    geogName +
    ".csv";
  const geoCsvUrl =
    "https://gicentre.github.io/data/census21/englandAndWales/geo.csv";

  return Promise.all([
    d3.json(topojsonUrl),
    d3.csv(csvUrl),
    d3.csv(geoCsvUrl),
  ]).then(([topoData, geogData, geoData]) => {
    const tj = topojson.feature(topoData, topoData.objects[geogName]);

    // Create a map of code to attribute data from geogName CSV
    const geogMap = new Map();
    geogData.forEach((row) => {
      geogMap.set(row.code, row);
    });

    // Create a map of code to attribute data from geo.csv
    const geoMap = new Map();
    geoData.forEach((row) => {
      geoMap.set(row.code, row);
    });

    // Merge the CSV data with the TopoJSON features
    tj.features.forEach((feature) => {
      const code = feature.properties.code;
      const geogAttributes = geogMap.get(code) || {};
      const geoAttributes = geoMap.get(code) || {};
      feature.properties = {
        ...feature.properties,
        ...geogAttributes,
        ...geoAttributes,
      };
    });

    // Filter features if permittedCodes is defined
    if (permittedCodes !== undefined) {
      tj.features = tj.features.filter((feature) =>
        permittedCodes.includes(feature.properties.code)
      );
    }

    return tj;
  });
};

export const enrichGeoData = function (
  buildingData,
  geoJSON,
  joinColumn = "lsoa_code",
  geoJSONJoinColumn = "code",
  aggregations = {}
) {
  // 1. Group building data by LSOA code
  const groupedData = buildingData.reduce((acc, item) => {
    const code = item[joinColumn];
    if (!acc[code]) {
      acc[code] = [];
    }
    acc[code].push(item);
    return acc;
  }, {});

  // 2. Aggregate building data for each LSOA
  const aggregatedData = {};
  for (const code in groupedData) {
    aggregatedData[code] = {};
    const buildingsInLSOA = groupedData[code];

    for (const column in aggregations) {
      const aggregationType = aggregations[column];
      const values = buildingsInLSOA.map((building) => building[column]);

      switch (aggregationType) {
        case "sum":
          aggregatedData[code][column] = values.reduce((a, b) => a + b, 0);
          break;
        case "mean":
          aggregatedData[code][column] =
            values.reduce((a, b) => a + b, 0) / values.length;
          break;
        // Add more aggregation types as needed (e.g., min, max, median, count)
        case "count":
          aggregatedData[code][column] = values.length;
          break;
        default:
          console.warn(
            `Unsupported aggregation type: ${aggregationType} for column: ${column}`
          );
      }
    }
  }

  // 3. Create a deep copy of the original GeoJSON
  const newGeoJSON = JSON.parse(JSON.stringify(geoJSON));

  // 4. Iterate through features and add aggregated data
  newGeoJSON.features = newGeoJSON.features.map((feature) => {
    const code = feature.properties[geoJSONJoinColumn];
    const aggregatedItem = aggregatedData[code];

    if (aggregatedItem) {
      feature.properties = {
        ...feature.properties,
        ...aggregatedItem,
      };
    }

    return feature;
  });

  return newGeoJSON;
};

export const joinCensusDataToGeoJSON = function (censusData, geoJSON) {
  // Create a lookup object from census data
  const censusLookup = censusData.reduce((acc, item) => {
    acc[item.code] = item;
    return acc;
  }, {});

  // Create a deep copy of the original GeoJSON to avoid modifying the input
  const newGeoJSON = JSON.parse(JSON.stringify(geoJSON));

  // Iterate through features and add census data properties
  newGeoJSON.features = newGeoJSON.features.map((feature) => {
    const code = feature.properties.code;
    const censusItem = censusLookup[code];

    if (censusItem) {
      // Merge census data properties into feature properties
      feature.properties = {
        ...feature.properties,
        ...censusItem,
      };
    }

    return feature;
  });

  return newGeoJSON;
};

export const convertGridCsvToGeoJson = function (gridCsv, bb) {
  const maxCol = d3.max(gridCsv.map((row) => +row.row));
  const maxRow = d3.max(gridCsv.map((row) => +row.col));

  const colW = Math.abs(bb[2] - bb[0]) / maxCol - 1;
  const rowH = Math.abs(bb[3] - bb[1]) / maxRow - 1;

  console.log(colW, rowH);

  const squares = [];

  for (const row of gridCsv) {
    const c = +row.col - 1;
    const r = +row.row - 1;
    squares.push(
      turf.polygon(
        [
          [
            [bb[0] + c * colW, bb[1] + r * rowH],
            [bb[0] + (c + 1) * colW, bb[1] + r * rowH],
            [bb[0] + (c + 1) * colW, bb[1] + (r + 1) * rowH],
            [bb[0] + c * colW, bb[1] + (r + 1) * rowH],
            [bb[0] + c * colW, bb[1] + r * rowH],
          ],
        ],
        { code: row.code }
      )
    );
  }
  return turf.featureCollection(squares);
};

// Safe debug logging utility with circular reference protection
export function createSafeLogger(debugMode = false) {
  // Track objects that have been processed to avoid circular references
  const processedObjects = new WeakSet();

  // Helper to safely stringify objects
  function safeStringify(obj, depth = 0, maxDepth = 2) {
    if (depth > maxDepth) return "[Object depth limit]";

    if (obj === null || obj === undefined) return String(obj);
    if (typeof obj !== "object") return String(obj);
    if (processedObjects.has(obj)) return "[Circular reference]";

    try {
      processedObjects.add(obj);

      // Handle arrays
      if (Array.isArray(obj)) {
        if (obj.length > 20) {
          return `[Array(${obj.length}): ${obj
            .slice(0, 3)
            .map((item) => safeStringify(item, depth + 1, maxDepth))
            .join(", ")}...]`;
        }
        return `[${obj
          .slice(0, 10)
          .map((item) => safeStringify(item, depth + 1, maxDepth))
          .join(", ")}${obj.length > 10 ? "..." : ""}]`;
      }

      // Handle objects
      const keys = Object.keys(obj);
      if (keys.length > 20) {
        return `{Object with ${keys.length} keys: ${keys
          .slice(0, 3)
          .map(
            (key) => `${key}: ${safeStringify(obj[key], depth + 1, maxDepth)}`
          )
          .join(", ")}...}`;
      }

      return `{${keys
        .slice(0, 10)
        .map((key) => `${key}: ${safeStringify(obj[key], depth + 1, maxDepth)}`)
        .join(", ")}${keys.length > 10 ? "..." : ""}}`;
    } catch (e) {
      return "[Unprocessable object]";
    } finally {
      processedObjects.delete(obj);
    }
  }

  return {
    log: (...args) => {
      if (!debugMode) return;
      const safeArgs = args.map((arg) => {
        if (typeof arg === "object" && arg !== null) {
          return safeStringify(arg);
        }
        return arg;
      });
      console.log(...safeArgs);
    },
    warn: (...args) => {
      if (!debugMode) return;
      console.warn(...args);
    },
    error: (...args) => console.error(...args), // Errors always show
    setDebug: (mode) => (debugMode = !!mode),
  };
}
