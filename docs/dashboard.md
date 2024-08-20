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

## Cartogram configuration

Change the sliders to reflect the desired cartogram configuration.

```js
const gridInput = view(
  Object.assign(
    Inputs.form([
      Inputs.range([2, 40], {
        value: 6,
        step: 1,
        label: "Rows",
      }),
      Inputs.range([2, 40], {
        value: 6,
        step: 1,
        label: "Columns",
      }),
      Inputs.range([-1, 1], {
        value: 0.8,
        step: 0.01,
        label: "Compactness",
      }),
    ]),
    {
      oninput: (event) => {
        return event.isTrusted && event.stopImmediatePropagation();
      },
      onchange: (event) =>
        event.currentTarget.dispatchEvent(new Event("input")),
    }
  )
);
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
