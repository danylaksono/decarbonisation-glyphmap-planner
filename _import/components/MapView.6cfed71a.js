// src/components/MapView.js - Map Component
// Purpose: Renders maps (glyph or Leaflet) based on aggregation level.
// Inputs: buildingsData, geoData, state.
// Functions:
// createGlyphMap(mapAggregate, width, height): Handles glyph map rendering.
// createLeafletMap(data, width, height): Renders Leaflet map.
// morphGlyphMap(): Manages morphing logic.
// Dependencies: leaflet-map.js, gridded-glyphmaps, flubber.

// src/components/MapView.js

import { glyphMap } from "./libs/gridded-glyphmaps/index.min.f034b425.js";
import { RadialGlyph } from "./libs/gridded-glyphmaps/glyph-designs/radialglyph.cbd7ddeb.js";
import { LeafletMap } from "./libs/leaflet/leaflet-map.6f908199.js";
import { enrichGeoData, transformGeometry } from "../utils/geoUtils.132647da.js";
import { OSGB } from "./libs/osgb/index.1d2476df.js";
import _ from "../../_npm/lodash@4.17.21/_esm.js";
import { html } from "../../_npm/htl@0.3.1/_esm.js";
import * as d3 from "../../_npm/d3@7.9.0/_esm.js";
import * as turf from "../../_npm/@turf/turf@7.2.0/_esm.js";
import * as flubber from "../../_npm/flubber@0.4.2/_esm.js";

// Glyph variables and colors
const glyphVariables = [
  "ashp_suitability",
  "ashp_size",
  "ashp_total",
  "gshp_suitability",
  "gshp_size",
  "gshp_total",
  "pv_suitability",
  "pv_generation",
  "pv_total",
];
const glyphColours = [
  "#1E90FF",
  "#4682B4",
  "#5F9EA0",
  "#FFA500",
  "#FF8C00",
  "#FFD700",
  "#32CD32",
  "#228B22",
  "#006400",
];

// MapView component
export function MapView(
  buildingsData,
  geoData,
  state,
  width = 800,
  height = 600
) {
  const { regular_geodata, cartogram_geodata, lsoa_boundary } = geoData;
  const { getMapAggregate, getToggleGrids, getMorphFactor } = state;

  // Geo-enrichment
  const aggregations = {
    isIntervened: "count",
    interventionYear: "sum",
    interventionCost: "sum",
    carbonSaved: "sum",
    numInterventions: "sum",
    interventionTechs: "count",
    building_area: "sum",
    ashp_suitability: "count",
    ashp_size: "sum",
    ashp_total: "sum",
    gshp_suitability: "count",
    gshp_size: "sum",
    gshp_total: "sum",
    heat_demand: "sum",
    pv_suitability: "count",
    pv_size: "sum",
    pv_generation: "sum",
    pv_total: "sum",
  };

  const regular_geodata_withproperties = enrichGeoData(
    buildingsData,
    regular_geodata,
    "lsoa",
    "code",
    aggregations
  );
  const cartogram_geodata_withproperties = enrichGeoData(
    buildingsData,
    cartogram_geodata,
    "lsoa",
    "code",
    aggregations
  );

  // Transform to WGS84
  const regularGeodataLsoaWgs84 = turf.clone(regular_geodata);
  turf.coordEach(regularGeodataLsoaWgs84, (coord) => {
    const [lon, lat] = new OSGB().toGeo(coord); // Assuming OSGB is available
    coord[0] = lon;
    coord[1] = lat;
  });

  const cartogramGeodataLsoaWgs84 = turf.clone(cartogram_geodata);
  turf.coordEach(cartogramGeodataLsoaWgs84, (coord) => {
    const [lon, lat] = new OSGB().toGeo(coord);
    coord[0] = lon;
    coord[1] = lat;
  });

  // Lookup tables
  const regularGeodataLookup = _.keyBy(
    regular_geodata_withproperties.features,
    (feat) => feat.properties.code
  );
  const cartogramGeodataLookup = _.keyBy(
    cartogram_geodata_withproperties.features,
    (feat) => feat.properties.code
  );

  // Flubber interpolations for morphing
  const flubbers = {};
  for (const key of Object.keys(regularGeodataLookup)) {
    if (regularGeodataLookup[key] && cartogramGeodataLookup[key]) {
      flubbers[key] = flubber.interpolate(
        turf.getCoords(
          transformGeometry(regularGeodataLookup[key].geometry)
        )[0],
        turf.getCoords(
          transformGeometry(cartogramGeodataLookup[key].geometry)
        )[0],
        { string: false }
      );
    }
  }

  const tweenWGS84Lookup = _.mapValues(flubbers, (v, k) => {
    const feat = turf.multiLineString([v(getMorphFactor() || 0)], { code: k });
    feat.centroid = turf.getCoord(turf.centroid(feat.geometry));
    return feat;
  });

  // Glyph map specification
  function glyphMapSpec() {
    return {
      coordType:
        getMapAggregate() === "Building Level" ? "mercator" : "notmercator",
      initialBB: turf.bbox(regularGeodataLsoaWgs84),
      data:
        getMapAggregate() === "Building Level"
          ? buildingsData
          : Object.values(regularGeodataLookup),
      getLocationFn: (row) =>
        getMapAggregate() === "Building Level"
          ? [row.x, row.y]
          : regularGeodataLookup[row.code]?.centroid,
      width,
      height,
      customMap: {
        drawFn: (cell, x, y, cellSize, ctx) => {
          const cellData = cell.records[0].data?.properties || cell.data;
          ctx.beginPath();
          const boundary = cell.getBoundary(0);
          if (boundary[0] !== boundary[boundary.length - 1])
            boundary.push(boundary[0]);
          const boundaryFeat = turf.polygon([boundary]);
          ctx.fillStyle = "#efefef";
          d3.geoPath().context(ctx)(boundaryFeat);
          ctx.fill();
          ctx.strokeStyle = "rgb(7, 77, 255)";
          ctx.lineWidth = 0.2;
          ctx.stroke();

          const rg = new RadialGlyph(
            glyphVariables.map((key) => cellData[key] || 0),
            glyphColours
          );
          rg.draw(ctx, x, y, cellSize / 2);
        },
        tooltipTextFn: (cell) =>
          cell
            ? glyphVariables
                .map(
                  (key) =>
                    `${key.replace(/_/g, " ").toUpperCase()}: ${
                      cell.data[key]?.toFixed(2) || 0
                    }`
                )
                .join("<br>")
            : "no data",
      },
    };
  }

  // Create glyph map
  const morphGlyphMap = glyphMap({
    ...glyphMapSpec(),
    coordType: "mercator",
    getLocationFn: (row) => tweenWGS84Lookup[row.code]?.centroid,
  });

  // Create Leaflet map
  function createLeafletMap() {
    const container = html`<div
      style="width: ${width}px; height: ${height}px;"
    ></div>`;
    const mapInstance = new LeafletMap(container, { width, height });
    mapInstance.addLayer("buildings", buildingsData, {
      clusterRadius: 50,
      fitBounds: true,
    });
    mapInstance.addGeoJSONLayer("LSOA Boundary", lsoa_boundary, {
      style: { color: "#f7a55e", weight: 2, opacity: 0.65 },
      onEachFeature: (feature, layer) =>
        layer.bindPopup(feature.properties.LSOA21NM),
    });
    return container;
  }

  // Render based on aggregation level
  const mapAggregate = getMapAggregate() || "LSOA Level";
  if (mapAggregate === "Building Level") {
    return getToggleGrids() ? glyphMap(glyphMapSpec()) : createLeafletMap();
  } else if (mapAggregate === "LSOA Level") {
    return morphGlyphMap;
  } else {
    return html`<p>LA Level visualization not implemented in this example.</p>`;
  }
}

// Dependencies: Requires gridded-glyphmaps, leaflet-map.js, radialglyph.js, d3, turf, flubber, and geoUtils.js.
// State: Expects getMapAggregate, getToggleGrids, getMorphFactor from state.
// Simplifications: Omits LA-level plots and full timeline switch for brevity; extend as needed.
