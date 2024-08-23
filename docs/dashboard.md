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
import * as d3 from "npm:d3";
import {
  inSituMorphMouse,
  prepareGeoJsonForMorphingLib,
} from "./components/morpher.js";
import {
  glyphMap,
  createDiscretiserValue,
  _drawCellBackground,
} from "./components/gridded-glyphmaps/index.min.js";
import {
  downloadBoundaries,
  joinCensusDataToGeoJSON,
  convertGridCsvToGeoJson,
} from "./components/utils.js";
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
const regular_geodata = await downloadBoundaries(geogBoundary, list_of_code);
```

```sql id=census_data
SELECT geo.code, geo.label, deprivation.value as deprivation, vehicle.value as vehicle
  FROM geo,deprivation, vehicle
  WHERE geo.geography=(SELECT replace(${geogName}, '"', '''')) AND geo.LA= (SELECT replace(${la_code}, '"', '''')) AND geo.code=deprivation.code AND deprivation.category=5
  ORDER BY deprivation.value DESC
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

const grid_geodata = await convertGridIfExists(filename, bb);
// display(bb);
// display(gridGeoJson);
```

## Morphing Geometry

```js
const data = _.keyBy(
  regular_geodata.features.map((feat) => {
    return {
      code: feat.properties.code,
      population: +feat.properties.population,
    };
  }),
  "code"
);
```

```js
const valueDiscretiser = (geomLookup) => {
  return createDiscretiserValue({
    //... and adds a discretisation function that aggregates by CODE and supplies the polygons for each cell
    valueFn: (row) => {
      return row.code;
    },
    glyphLocationFn: (key) => geomLookup[key]?.centroid,
    boundaryFn: (key) => geomLookup[key]?.geometry.coordinates[0],
  });
};
```

```js
const colourScalePop = d3
  .scaleSequential(d3.interpolateBlues)
  .domain([0, d3.max(Object.values(data).map((row) => row.population))]);

const layouts = [
  {
    shapes: prepareGeoJsonForMorphingLib(
      regular_geodata,
      regular_geodata,
      300,
      300
    ),
    colourFn: (key) => colourScalePop(data[key].population),
    description: local_authority + " " + geogName + " Choropleth Map.",
  },
  {
    shapes: prepareGeoJsonForMorphingLib(
      grid_geodata,
      regular_geodata,
      300,
      300
    ),
    colourFn: (key) => colourScalePop(data[key].population),
    description: local_authority + " " + geogName + "Gridmaps.",
  },
];

const morphers = inSituMorphMouse({
  interactive: true,
  showDescription: true,
  layouts,
});

display(morphers);
```
