// src/utils/geoUtils.js

import * as turf from "../../_npm/@turf/turf@7.2.0/_esm.js";
import { OSGB } from "../components/libs/osgb/index.1d2476df.js";

// Enrich geo data with building properties
export function enrichGeoData(
  buildingsData,
  geoData,
  buildingKey,
  geoKey,
  aggregations
) {
  console.log(">> Geo-enrichment...");
  const geoFeatures = turf.featureCollection(
    geoData.features.map((feature) => {
      const matchingBuildings = buildingsData.filter(
        (b) => b[buildingKey] === feature.properties[geoKey]
      );
      const properties = { ...feature.properties };

      Object.entries(aggregations).forEach(([key, method]) => {
        properties[key] = matchingBuildings.reduce((acc, b) => {
          const value = b[key] || 0;
          return method === "sum"
            ? acc + value
            : method === "count"
            ? acc + 1
            : acc;
        }, 0);
      });

      return turf.feature(feature.geometry, properties);
    })
  );
  return geoFeatures;
}

// Transform coordinates from OSGB to WGS84
export function transformCoordinates(bbox) {
  const osgb = new OSGB();
  const [minX, minY, maxX, maxY] = bbox;
  const [minLon, minLat] = osgb.toGeo([minX, minY]);
  const [maxLon, maxLat] = osgb.toGeo([maxX, maxY]);
  return [minLon, minLat, maxLon, maxLat];
}

// Transform geometry coordinates from OSGB to WGS84
export function transformGeometry(geometry) {
  const osgb = new OSGB();
  const clone = turf.clone(geometry);
  turf.coordEach(clone, (coord) => {
    const [lon, lat] = osgb.toGeo(coord);
    coord[0] = lon;
    coord[1] = lat;
  });
  return clone;
}

// Check if a point is inside a cell (for glyph map interactions)
export function insideCell(cell, x, y) {
  const boundary = cell.getBoundary(0);
  const point = turf.point([x, y]);
  const polygon = turf.polygon([boundary.concat([boundary[0]])]); // Close the polygon
  return turf.booleanPointInPolygon(point, polygon);
}

// Dependencies: Requires turf for geospatial operations and OSGB for coordinate conversion.
// Functions: Includes geo-enrichment (enrichGeoData), coordinate transformation (transformCoordinates, transformGeometry), and point-in-cell checking (insideCell).
// Usage: Used by MapView.js for geo data processing.
