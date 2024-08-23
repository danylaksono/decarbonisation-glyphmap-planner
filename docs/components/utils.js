export function joinCensusDataToGeoJSON(censusData, geoJSON) {
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
}
