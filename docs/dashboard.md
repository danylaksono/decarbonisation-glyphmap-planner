---
theme: dashboard
title: dashboard
toc: false
sql:
  geo: ./data/geo.csv
  pop: ./data/pop.parquet
  deprivation: ./data/deprivation.parquet
  vehicle: ./data/vehicle.parquet
---

# Morphing Glyphmaps

An observable framework translation of https://observablehq.com/@danylaksono/morphing-gridmaps

```js
import * as turf from "@turf/turf";
```

## Area Selection

Select the Local authority from the list below

```js
const local_authority = view(
  Inputs.select(
    [...list_la].map((item) => item.label),
    {
      value: "Cambridge",
      label: "Local Authority:",
    }
  )
);
```

```js
const geogName = view(
  Inputs.radio(["LSOA", "MSOA"], {
    value: "MSOA",
    label: "Geography",
  })
);
```

```js
const la_code = [...list_la].find((row) => row.label === local_authority).code;
const geogBoundary = geogName.toLowerCase() + "s";
```

```sql id=list_la
select distinct label, code from geo where geography = 'LA' order by label
```

```sql id=list_of_codes
SELECT code
FROM geo
WHERE geo.geography = (SELECT replace(${geogName}, '"', ''''))
AND geo.LA = (SELECT replace(${la_code}, '"', ''''))
```

```js
const list_of_code = [...list_of_codes].map((row) => row.code);
```

```sql id=census_data
SELECT geo.code, geo.label, deprivation.value as deprivation, vehicle.value as vehicle
  FROM geo,deprivation, vehicle
  WHERE geo.geography=(SELECT replace(${geogName}, '"', '''')) AND geo.LA= (SELECT replace(${la_code}, '"', '''')) AND geo.code=deprivation.code AND deprivation.category=5
  ORDER BY deprivation.value DESC
```

```js
const regular_geodata = await downloadBoundaries(geogBoundary, list_of_code);

display(regular_geodata);
```

```js
async function convertGridIfExists(filename, bb) {
  // take from stored preprocessed grids for now
  // future version will use the grid generation code
  const gridPath = `https://www.danylaksono.com/datasets/cartogram/${filename}.csv`;

  try {
    const gridCsv = await d3.csv(gridPath);
    return convertGridCsvToGeoJson(gridCsv, bb);
  } catch (error) {
    // console.log(`Grid file ${filename}.csv not found or couldn't be loaded.`);
    return null;
  }
}

const filename = `${local_authority.toLowerCase()}_${geogBoundary}_grids`;
const bb = turf.bbox(regular_geodata);

const gridGeoJson = await convertGridIfExists(filename, bb);
// display(bb);
// display(gridGeoJson);
```

## Functions and Dependencies

```js
function downloadBoundaries(geogName, permittedCodes) {
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
}
```

```js
function convertGridCsvToGeoJson(gridCsv, bb) {
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
}
```
