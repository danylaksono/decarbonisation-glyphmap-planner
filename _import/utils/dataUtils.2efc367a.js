// export async function loadData(sqlData) {
//   const buildingsData = [...sqlData];
//   return { buildingsData };
// }

// export async function loadGeoData() {
//   const lsoa_boundary = await FileAttachment(
//     "./data/oxford_lsoa_boundary.geojson"
//   ).json();
//   const regular_geodata = await FileAttachment(
//     "./data/oxford_lsoas_regular.json"
//   ).json();
//   const cartogram_geodata = await FileAttachment(
//     "./data/oxford_lsoas_cartogram.json"
//   ).json();
//   return { lsoa_boundary, regular_geodata, cartogram_geodata };
// }

// src/utils/dataUtils.js

import { FileAttachment } from "../../_observablehq/stdlib.js"; // For file attachments in Observable

// Load raw building data from SQL query
export async function loadData(sqlData) {
  console.log(">> Loading Data...");
  const buildingsData = [...sqlData]; // Copy data from SQL result
  console.log(">> Loading Data Done");
  return { buildingsData };
}

// Load geospatial boundary data
export async function loadGeoData() {
  console.log(">> Define and Load boundary data...");
  const lsoa_boundary = await FileAttachment(
    "../../data/oxford_lsoa_boundary.geojson", import.meta.url
  ).json();
  const regular_geodata = await FileAttachment(
    "../../data/oxford_lsoas_regular.json", import.meta.url
  ).json();
  const cartogram_geodata = await FileAttachment(
    "../../data/oxford_lsoas_cartogram.json", import.meta.url
  ).json();
  return { lsoa_boundary, regular_geodata, cartogram_geodata };
}

// Aggregate values across data for specified variables
export function aggregateValues(
  data,
  variables,
  method = "sum",
  normalise = false
) {
  const result = {};
  variables.forEach((variable) => {
    result[variable] = data.reduce((acc, item) => {
      const value = item[variable] || 0;
      return method === "sum" ? acc + value : acc; // Extend for other methods as needed
    }, 0);
  });

  if (normalise) {
    const maxValues = {};
    variables.forEach((variable) => {
      maxValues[variable] = Math.max(
        ...data.map((item) => item[variable] || 0)
      );
    });
    Object.keys(result).forEach((key) => {
      result[key] = maxValues[key] ? result[key] / maxValues[key] : 0;
    });
  }

  return result;
}

// Normalize data for visualization (e.g., glyph maps)
export function normaliseData(dataArray, variables) {
  const maxValues = {};
  variables.forEach((variable) => {
    maxValues[variable] = Math.max(...dataArray.map((d) => d[variable] || 0));
  });

  return dataArray.map((data) => {
    const normalised = {};
    variables.forEach((variable) => {
      normalised[variable] = maxValues[variable]
        ? (data[variable] || 0) / maxValues[variable]
        : 0;
    });
    return normalised;
  });
}

// Transform intervention data for timeline (specific to LSOA and fields)
export function transformInterventionData(data, lsoaCode, fields) {
  const lsoaData = data[lsoaCode];
  if (!lsoaData?.children) return [];

  return Object.entries(lsoaData.children).map(([year, interventions]) => {
    const yearData = { year };
    fields.forEach((field) => (yearData[field] = 0));

    interventions.forEach((intervention) => {
      if (intervention) {
        fields.forEach((field) => {
          if (intervention[field] !== undefined) {
            yearData[field] += intervention[field];
          }
        });
      }
    });

    Object.keys(yearData).forEach((key) => {
      if (typeof yearData[key] === "number") {
        yearData[key] = Math.round(yearData[key] * 100) / 100;
      }
    });

    return yearData;
  });
}

// Dependencies: Uses FileAttachment for loading geo data files.
// Functions: Provides data loading (loadData, loadGeoData), aggregation (aggregateValues), normalization (normaliseData), and timeline transformation (transformInterventionData).
// Usage: Called by index.md to initialize data.
