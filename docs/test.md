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
import { DecarbonisationModel } from "./components/decarbonisationModel.js";
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
    "UPRN" AS id,
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
// model specifications
const modelSpec = {
  initial_year: 2024,
  target_years: 5,
  overall_budget: 50_000_000,
  uncapped_mode: false, // Explicitly set mode
  technologies: [
    {
      name: "PV",
      allocation: 0.4,
      config: {
        scoreFn: (building) => {
          if (!building.pv_suitability) return 0;
          return building.pv_generation / building.pv_size;
        },
        suitabilityKey: "pv_suitability",
        labourKey: "pv_labour",
        materialKey: "pv_material",
        savingsKey: "pv_generation", // assuming 1kWh = 1kg CO2
      },
    },
    {
      name: "ASHP",
      allocation: 0.6,
      config: {
        scoreFn: (building) => {
          if (!building.ashp_suitability) return 0;
          return building.heat_demand / building.ashp_size;
        },
        suitabilityKey: "ashp_suitability",
        labourKey: "ashp_labour",
        materialKey: "ashp_material",
        savingsKey: "heat_demand", // assuming full heat demand offset
      },
    },
  ],
};
```

```js
const model = new DecarbonisationModel(modelSpec, newBuildings);
model.addBuildingFilter(b => b.properties.substation_headroom >= 1000);
model.runModel();

console.log("Yearly Interventions in 2024:", model.getYearInterventions(2024));

// Get interventions grouped by year and technology
console.log(model.getGroupedInterventions());

// Get final stats
console.log(model.getFinalStats());

display(model.getFinalStats());
```

## Uncapped MOdel

```js
// testing uncapped
const uncappedModel = new DecarbonisationModel(
  {
    ...modelSpec,
    overall_budget: null,
    uncapped_mode: true,
  },
  newBuildings
);

uncappedModel.runModel();

console.log(
  "Yearly Interventions in 2024:",
  uncappedModel.getYearInterventions(2024)
);

// Get interventions grouped by year and technology
console.log(uncappedModel.getGroupedInterventions());

// Get final stats
console.log(uncappedModel.getFinalStats());

display(uncappedModel.getFinalStats());
```
