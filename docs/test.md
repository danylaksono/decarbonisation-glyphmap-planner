---
title: Test New Model
toc: false
sidebar: false
footer: false
sql:
  oxford: ./data/oxford_decarbonisation_data.parquet
---

```js
import {
  TimeGlyph,
  GlyphCollection,
} from "./components/glyph-designs/timeGlyph.js";
import { Model } from "./components/newModel2.js";
// import { Model } from "./components/model.js";
```

## Test UI

<label for="decarbonisation-slider">Decarbonisation Progress:</label>

```js
const n = html`<input
  style="width: 800px;"
  type="range"
  step="0.1"
  min="0"
  max="1"
/>`;
```

```js
const nn = Generators.input(n);
display(n);
```

```js
display(nn);
```

## Test New Model

```sql id=oxford_data
  SELECT DISTINCT
    "LSOA code" AS lsoa,
    "MSOA code" AS msoa,
    "Air Source Heat Pump Potential_Building Size (m^2)" AS building_area,
    "Air Source Heat Pump Potential_Garden Area (m^2)" AS garden_area,
    "Air Source Heat Pump Potential_Overall Suitability Rating" AS ashp_suitability,
    "Air Source Heat Pump Potential_Recommended Heat Pump Size [kW]" AS ashp_size,
    "Low Carbon Technology Costs_Air Source Heat Pump - Labour" AS ashp_labour,
    "Low Carbon Technology Costs_Air Source Heat Pump - Material" AS ashp_material,
    "Low Carbon Technology Costs_Air Source Heat Pump - Total" AS ashp_total,
    "Domestic Ground Source Heat Pump Potential_Overall Suitability Rating" AS gshp_suitability,
    "Domestic Ground Source Heat Pump Potential_Recommended Heat Pump Size [kW]" AS gshp_size,
    "Low Carbon Technology Costs_Ground Source Heat Pump - Labour" AS gshp_labour,
    "Low Carbon Technology Costs_Ground Source Heat Pump - Materials" AS gshp_material,
    "Low Carbon Technology Costs_Ground Source Heat Pump - Total" AS gshp_total,
    "Domestic Heat Demand_Annual Heat Demand (kWh)" AS heat_demand,
    "Domestic Insulation Potential_EPC Rating" AS insulation_rating,
    "Domestic Insulation Potential_Insulation - Cavity Wall" AS insulation_cwall,
    "Low Carbon Technology Costs_Insulation - Cavity Wall - Labour" AS insulation_cwall_labour,
    "Low Carbon Technology Costs_Insulation - Cavity Wall  - Materials" AS insulation_cwall_materials,
    "Low Carbon Technology Costs_Insulation - Cavity Wall - Total" AS insulation_cwall_total,
    "Domestic Insulation Potential_Insulation - External Wall" AS insulation_ewall,
    "Low Carbon Technology Costs_Insulation - External Wall - Labour" AS insulation_ewall_labour,
    "Low Carbon Technology Costs_Insulation - External Wall - Material" AS insulation_ewall_materials,
    "Low Carbon Technology Costs_Insulation - External Wall - Total" AS insulation_ewall_total,
    "Domestic Insulation Potential_Insulation - Roof" AS insulation_roof,
    "Low Carbon Technology Costs_Insulation - Loft - Labour" AS insulation_roof_labour,
    "Low Carbon Technology Costs_Insulation - Loft - Material" AS insulation_roof_materials,
    "Low Carbon Technology Costs_Insulation - Loft - Total" AS insulation_roof_total,
    "Domestic Insulation Potential_Insulation - Under Floor" AS insulation_floor,
    "Low Carbon Technology Costs_Insulation - Under Floor - Labour" AS insulation_floor_labour,
    "Low Carbon Technology Costs_Insulation - Under Floor - Material" AS insulation_floor_materials,
    "Low Carbon Technology Costs_Insulation - Under Floor- Total" AS insulation_floor_total,
    "Domestic PV Potential_Overall Suitability" AS pv_suitability,
    "Domestic PV Potential_Recommended Array Size [kW]" AS pv_size,
    "Domestic PV Potential_Annual Generation [kWh]" AS pv_generation,
    "Low Carbon Technology Costs_Rooftop PV - Labour" AS pv_labour,
    "Low Carbon Technology Costs_Rooftop PV - Materials" AS pv_material,
    "Low Carbon Technology Costs_Rooftop PV - Total" AS pv_total,
    "Substation Name" AS substation_name,
    "Substation - CapacityRating" AS substation_capacity_rating,
    "Substation - Peakload" AS substation_peakload,
    "Substation - Headroom" AS substation_headroom,
    "Substation - % headroom" AS substation_headroom_pct,
    "Substation - Demand_rag" AS substation_demand
FROM oxford b;
```

```js
const newBuildings = [...oxford_data];
```

```js
// Define technologies
const technologies = [
  {
    name: "ASHP",
    allocation: 0.5,
    config: {
      scoreFn: (building) =>
        building.heat_demand / (building.ashp_size * 24 * 365),
      suitabilityKey: "ashp_suitability",
      costKey: "ashp_total",
      labourKey: "ashp_labour",
      materialKey: "ashp_material",
      savingsKey: "heat_demand",
    },
  },
  {
    name: "PV",
    allocation: 0.3,
    config: {
      scoreFn: (building) => building.pv_generation / building.pv_size,
      suitabilityKey: "pv_suitability",
      costKey: "pv_total",
      labourKey: "pv_labour",
      materialKey: "pv_material",
      savingsKey: "pv_generation",
    },
  },
];

let modelSpec = {
  nr_years: 10,
  yearly_funding: 300_000_000,
  technologies,
};

// Create and run model
const model = new Model(newBuildings, modelSpec);

// Add new technology later
model.addTechnology("GSHP", 0.2, {
  scoreFn: (building) => building.heat_demand / building.gshp_size,
  suitabilityKey: "gshp_suitability",
  costKey: "gshp_total",
  labourKey: "gshp_labour",
  materialKey: "gshp_material",
  savingsKey: "heat_demand",
});

// Run model
model.runModel();

const budgetTracking = model.getBudgetProgression();
display(budgetTracking);

//we group interventions first by lsoa, then technology, then year
let lsoaTechYear = model
  .getInterventions()
  .groupBy("lsoa")
  .groupBy("type")
  .groupBy("year")
  .all();
console.log("Interventions (grouped lsoa->tech->year)", lsoaTechYear);

//get building data at each simulation year, split by lsoa
let buildingsYearLsoas = d3
  .range(modelSpec.nr_years)
  .map((y) => model.getBuildings(y).groupBy("lsoa").all());
console.log("Buildings by year (grouped lsoa)", buildingsYearLsoas);

console.log(
  "Final remaining budget:",
  model.getBudgetProgression().finalRemaining
);
```
