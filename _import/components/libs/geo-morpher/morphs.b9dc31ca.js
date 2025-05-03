import _ from "../../../../_npm/lodash@4.17.21/_esm.js";
import * as turf from "../../../../_node/@turf/turf@7.2.0/index.js";
import { require } from "../../../../_npm/d3-require@1.3.0/_esm.js";
import flubber from "../../../../_node/flubber@0.4.2/index.js";
import { OSGB } from "../osgb/index.1d2476df.js";
import { enrichGeoData, transformGeometry } from "../helpers.30496caa.js";
import { FileAttachment } from "../../../../_observablehq/stdlib.js";
// const d3 = require("d3", "d3-geo-projection");
// const flubber = await require("flubber@0.4");

// const lsoa_boundary = FileAttachment(
//   "../../../../data/oxford_lsoa_boundary.geojson"
// ).json();

// const regular_geodata = FileAttachment("oxford_lsoas_regular.json").json();
// const cartogram_geodata = FileAttachment("oxford_lsoas_cartogram.json").json();

export function geoMorpher({
  aggregations,
  regular_geodata,
  cartogram_geodata,
  getModelData,
  morph_factor,
}) {
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
    regularGeodataLsoaWgs84,
    cartogramGeodataLsoaLookup,
    geographyLsoaWgs84Lookup,
    cartogramLsoaWgs84Lookup,
    tweenWGS84Lookup,
  };
}
