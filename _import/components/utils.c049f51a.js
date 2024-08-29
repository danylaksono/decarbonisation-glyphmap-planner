// import * as d3 from "npm:d3";
import * as topojson from "../../_npm/topojson-client@3.1.0/_esm.js";
import { require } from "../../_npm/d3-require@1.3.0/_esm.js";

import * as d3 from "../../_npm/d3@7.9.0/_esm.js";
// import * as d3Geo from "npm:d3-geo@3.1.1";
// import * as d3GeoProjection from "npm:d3-geo-projection@4";

export function context2d(width, height, dpi = devicePixelRatio) {
  const canvas = document.createElement("canvas");
  canvas.width = width * dpi;
  canvas.height = height * dpi;
  canvas.style = `width: ${width}px;`;
  const context = canvas.getContext("2d");
  context.scale(dpi, dpi);
  return context;
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
