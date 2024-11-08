---
title: Custom Dashboard Widgets
toc: false
sidebar: false
footer: false
sql:
  oxford: ./data/oxford_decarbonisation_data.parquet
---

```js
import { BudgetAllocator } from "./components/budgetAllocator.js";
import { MiniDecarbModel } from "./components/miniDecarbModel.js";
```

## Budget Allocator

```js
const totalBudget = 100_000;
const startYear = 2024;
const projectLength = 10;

const allocator = new BudgetAllocator(totalBudget, startYear, projectLength);

// linear allocation
const linearAllocation = allocator.allocateLinear();
display(linearAllocation);
display(allocator.visualize(linearAllocation));
// console.log(allocator.visualize(linearAllocation));
// document.body.appendChild(allocator.visualize(linearAllocation));

// // custom allocation with different curve types
// const logAllocation = allocator.allocateCustom("sqrt");
// console.log("sqrt    Allocation Recap:", allocator.allocation(logAllocation));

// const expAllocation = allocator.allocateCustom("exp", { exponent: 2 });
// display(expAllocation);
// display(allocator.visualize(expAllocation));

// // console.log(
// //   "Exponential Allocation Recap:",
// //   allocator.allocation(expAllocation)
// // );

// const sigmoid = allocator.allocateBudget("sigmoid", false);
// const sigmoid = allocator.allocateCustom("cubic");
// display(cubicAllocation);
// display(allocator.visualize(sigmoid));

// console.log("Cubic Allocation Recap:", allocator.allocation(cubicAllocation));
```

## Test New Model

```sql id=oxford_data display
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
const config = {
  initial_year: 2024,
  yearly_budgets: [1200000, 30000, 20000, 5000, 3000, 20000],
  tech: {
    name: "ASHP",
    config: {
      suitabilityKey: "ashp_suitability",
      labourKey: "ashp_labour",
      materialKey: "ashp_material",
      savingsKey: "heat_demand",
    },
  },
  priorities: [
    {
      name: "substation_headroom",
      order: "asc",
    },
  ],
};

const model = new MiniDecarbModel(config, newBuildings);
model.addBuildingFilter((b) => b.properties["substation_headroom"] >= 500);

// For priority rules:
// // Categorical priority
// model.addPriorityRuleCustom({
//   attribute: 'multideprivation',
//   scoreFunction: (value) => ({
//     'deprived': 1000,
//     'not-deprived': 0
//   })[value] || 0
// });

// // Numeric threshold priority
// model.addPriorityRuleCustom({
//   attribute: 'fuel_poverty',
//   scoreFunction: (value) => value > 0.5 ? 500 : 0,
//   weight: 2.0
// });

// // Complex scoring function
// model.addPriorityRuleCustom({
//   attribute: 'energy_rating',
//   scoreFunction: (value) => {
//     const ratings = {'A': 0, 'B': 200, 'C': 400, 'D': 600, 'E': 800, 'F': 1000};
//     return ratings[value] || 0;
//   }
// });

model.addPriorityRuleCustom({
  attribute: "substation_capacity_rating",
  scoreFunction: (value) =>
    ({
      800: 500,
      1500: 1000,
    }[value] || 0),
});

model.runModel();
const results = model.getRecap();
display(results);
```
