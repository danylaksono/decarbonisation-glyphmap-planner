---
title: Testing data
sql:
  census_data_source: ./data/census_data.csv
  geo: ./data/geo.csv
---

# A brief history of space exploration

```js
const data = FileAttachment("./data/census_data.csv").csv();
display(Inputs.table(data));
```

```js
const la_code = "E09000014";
const geogName = "LSOA";
const geogBoundary = geogName.toLowerCase() + "s";
```

```sql id=census_data display
SELECT *
FROM geo g, census_data_source c
WHERE g.geography=(SELECT replace(${geogName}, '"', ''''))
AND g.LA= (SELECT replace(${la_code}, '"', ''''))
AND g.code=c.code
ORDER BY c.value DESC
```
