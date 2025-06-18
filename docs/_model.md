---
title: Testing Model Functionality
toc: false
sidebar: false
footer: false
sql:
  oxford: ./data/oxford_decarbonisation_data.parquet
---

```js
import {
  InterventionManager,
  MiniDecarbModel,
} from "./components/libs/decarb-model/mini-decarbonisation.js";

import { queryLLMForConfig } from "./components/libs/decarb-model/llm-interface.js";

async function runLLMQuery(query, buildings) {
  const config = await queryLLMForConfig(query);
  const model = new MiniDecarbModel(buildings);
  model.configure(config);
  const result = model.run();
  return result;
}
```

<!-- ---------------- Loading Raw Data ---------------- -->

```sql id=oxford_data
  SELECT DISTINCT
    "UPRN" AS id,
    "LSOA code" AS lsoa,
    "MSOA code" AS msoa,
    "xcoord" AS x,
    "ycoord" AS y,
    "Air Source Heat Pump Potential_Building Size (m^2)" AS building_area,
    -- "Air Source Heat Pump Potential_Garden Area (m^2)" AS garden_area,
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
    "Domestic Insulation Potential_EPC Rating" AS EPC_rating,
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
    "Substation - Demand_rag" AS substation_demand,
    "index of multiple deprivation (imd) score" AS deprivation_score,
    "index of multiple deprivation (imd) rank " AS deprivation_rank,
    "index of multiple deprivation (imd) decile " AS deprivation_decile,
    "Number of households in fuel poverty" AS fuel_poverty_households,
    "Proportion of households fuel poor (%)" AS fuel_poverty_proportion
FROM oxford b;
```

```js
const buildingsData = [...oxford_data];
```

```js
// Assuming buildingsData is an array of building objects

const modelConfigIntervention1 = {
  modelId: "intervention_alpha",
  initial_year: 2025,
  yearly_budgets: [100000, 120000, 150000], // 3-year intervention
  optimizationStrategy: "carbon-first",
  priorities: [{ attribute: "EPC_rating", order: "asc", weight: 1.5 }],
  filters: [
    {
      filterName: "Large Buildings",
      attribute: "building_area",
      operator: ">=",
      threshold: 500,
    },
  ],
  // rolledover_budget will use its default (0) from the schema
  // tech will use its default (ASHP) but won't be used due to carbon-first strategy
};
```

```js
const model1 = new MiniDecarbModel(buildingsData); // Initialize with default modelId
model1.configure(modelConfigIntervention1);
const recap1 = model1.run();
console.log("Recap for Intervention Alpha:", recap1);

// For a subsequent intervention, potentially using rollover from the first
const modelConfigIntervention2 = {
  modelId: "intervention_beta",
  initial_year:
    recap1.yearlyStats[
      recap1.projectDuration + modelConfigIntervention1.initial_year - 1
    ].interventionYear + 1 || 2029, // Start after previous
  rolledover_budget: recap1.remainingBudget,
  yearly_budgets: [200000, 200000],
  optimizationStrategy: "tech-first", // Switch strategy
};

const model2 = new MiniDecarbModel(buildingsData, "custom_id_for_beta"); // Can also set modelId in constructor
model2.configure(modelConfigIntervention2);
const recap2 = model2.run();
console.log("Recap for Intervention Beta:", recap2);
```

```js
const query = view(
  Inputs.textarea({
    label: "Query",
    placeholder: "Query the model",
    value: "",
    submit: true,
  })
);
```

```js
{
  //   display(query);
  if (query !== "") {
    const recap = await runLLMQuery(query, buildingsData);
    display(query);
    view(Inputs.table(recap.intervenedBuildings));
    display({ recap: recap });
  }
  //   const recap3 = runLLMQuery(
  //     "Install PV on buildings starting 2026 for 3 years with a budget of 150k per year",
  //     buildingsData
  //   );
}
```

```js
// display({ recap1: recap1, recap2: recap2 });
// const flattenedIntervenedBuildings = recap1.intervenedBuildings.map(building => ({
//   ...building,
//   ...building.properties
// }));

// view(Inputs.table(recap1.intervenedBuildings));
```
