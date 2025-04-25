import * as d3 from "npm:d3";
import _ from "npm:lodash";
import * as turf from "@turf/turf";
import { require } from "npm:d3-require";
import { OSGB } from "../osgb/index.js";
import { enrichGeoData, transformGeometry } from "../helpers.js";

const d3 = require("d3", "d3-geo-projection");
const flubber = require("flubber@0.4");

export function geoMorpher({
  regular_geodata,
  cartogram_geodata,
  getModelData,
  morph_factor,
  _,
}) {
  // define the aggregation function for each column
  const aggregations = {
    // "id": 200004687243,
    isIntervened: "count",
    interventionYear: "sum",
    interventionCost: "sum",
    carbonSaved: "sum",
    numInterventions: "sum",
    interventionTechs: "count",
    building_area: "sum",
    garden_area: "sum",
    ashp_suitability: "count",
    ashp_size: "sum",
    ashp_labour: "sum",
    ashp_material: "sum",
    ashp_total: "sum",
    gshp_suitability: "count",
    gshp_size: "sum",
    gshp_labour: "sum",
    gshp_material: "sum",
    gshp_total: "sum",
    heat_demand: "sum",
    pv_suitability: "count",
    pv_size: "sum",
    pv_generation: "sum",
    pv_labour: "sum",
    pv_material: "sum",
    pv_total: "sum",
    substation_capacity_rating: "sum",
    substation_peakload: "sum",
    substation_headroom: "sum",
    substation_headroom_pct: "sum",
    substation_demand: "count",
    deprivation_score: "sum",
    deprivation_rank: "sum",
    deprivation_decile: "sum",
    fuel_poverty_households: "sum",
    fuel_poverty_proportion: "sum",
  };

  // Enrich geodata with properties
  const regular_geodata_withproperties = enrichGeoData(
    getModelData,
    regular_geodata,
    "lsoa",
    "code",
    aggregations
  );
  const cartogram_geodata_withproperties = enrichGeoData(
    getModelData,
    cartogram_geodata,
    "lsoa",
    "code",
    aggregations
  );

  // Transform coordinates to WGS84
  const osgb = new OSGB();
  let cloneRegular = turf.clone(regular_geodata);
  turf.coordEach(cloneRegular, (currentCoord) => {
    const newCoord = osgb.toGeo(currentCoord);
    currentCoord[0] = newCoord[0];
    currentCoord[1] = newCoord[1];
  });
  const regularGeodataLsoaWgs84 = cloneRegular;

  let cloneCartogram = turf.clone(cartogram_geodata);
  turf.coordEach(cloneCartogram, (currentCoord) => {
    const newCoord = osgb.toGeo(currentCoord);
    currentCoord[0] = newCoord[0];
    currentCoord[1] = newCoord[1];
  });
  const cartogramGeodataLsoaWgs84 = cloneCartogram;

  // Lookup tables
  const keydata = _.keyBy(
    regular_geodata_withproperties.features.map((feat) => ({
      code: feat.properties.code,
      population: +feat.properties.population,
      data: feat,
    })),
    "code"
  );

  const regularGeodataLookup = _.keyBy(
    regular_geodata_withproperties.features.map((feat) => ({
      ...feat,
      centroid: turf.getCoord(turf.centroid(feat.geometry)),
    })),
    (feat) => feat.properties.code
  );

  const cartogramGeodataLsoaLookup = _.keyBy(
    cartogram_geodata_withproperties.features.map((feat) => ({
      ...feat,
      centroid: turf.getCoord(turf.centroid(feat.geometry)),
    })),
    (feat) => feat.properties.code
  );

  const geographyLsoaWgs84Lookup = _.keyBy(
    regular_geodata_withproperties.features.map((feat) => {
      const transformedGeometry = transformGeometry(feat.geometry);
      const centroid = turf.getCoord(turf.centroid(transformedGeometry));
      return {
        ...feat,
        geometry: transformedGeometry,
        centroid: centroid,
      };
    }),
    (feat) => feat.properties.code
  );

  const cartogramLsoaWgs84Lookup = _.keyBy(
    cartogram_geodata_withproperties.features.map((feat) => {
      const transformedGeometry = transformGeometry(feat.geometry);
      const centroid = turf.getCoord(turf.centroid(transformedGeometry));
      return {
        ...feat,
        geometry: transformedGeometry,
        centroid: centroid,
      };
    }),
    (feat) => feat.properties.code
  );

  // Flubber interpolations
  const flubbers = {};
  for (const key of Object.keys(cartogramLsoaWgs84Lookup)) {
    if (geographyLsoaWgs84Lookup[key] && cartogramLsoaWgs84Lookup[key]) {
      flubbers[key] = flubber.interpolate(
        turf.getCoords(geographyLsoaWgs84Lookup[key])[0],
        turf.getCoords(cartogramLsoaWgs84Lookup[key])[0],
        { string: false }
      );
    }
  }

  const tweenWGS84Lookup = _.mapValues(flubbers, (v, k) => {
    const feat = turf.multiLineString([v(morph_factor)], { code: k });
    feat.centroid = turf.getCoord(turf.centroid(feat.geometry));
    return feat;
  });

  return {
    keydata,
    regularGeodataLookup,
    cartogramGeodataLsoaLookup,
    geographyLsoaWgs84Lookup,
    cartogramLsoaWgs84Lookup,
    tweenWGS84Lookup,
  };
}
