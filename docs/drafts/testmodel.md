---
title: Test New Model
toc: false
sidebar: false
footer: false
sql:
  oxford: ./../data/oxford_decarbonisation_data.parquet
---

```js
import { MiniDecarbModel } from "./../components/decarb-model/mini-decarbonisation.js";
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
const buildings = [
  {
    id: "1",
    floor_area: 100,
    heated_floor_area: 90,
    avg_indoor_temperature: 18,
    ashp_suitability: true,
    pv_suitability: true,
    gshp_suitability: false,
    insulation_rating: "medium",
    insulation_cwall_labour: 50,
    insulation_cwall_materials: 100,
    insulation_cwall: 45,
    ashp_labour: 100,
    ashp_material: 200,
    heat_demand: 500,
    pv_labour: 80,
    pv_material: 150,
    pv_generation: 300,
    gshp_labour: 120,
    gshp_material: 250,
    gshp_size: 600,
    fuel_poverty: "yes",
    multideprivation: "deprived",
  },
  {
    id: "2",
    floor_area: 150,
    heated_floor_area: 120,
    avg_indoor_temperature: 20,
    ashp_suitability: false,
    pv_suitability: true,
    gshp_suitability: true,
    insulation_rating: "low",
    insulation_cwall_labour: 60,
    insulation_cwall_materials: 120,
    insulation_cwall: 60,
    ashp_labour: 110,
    ashp_material: 220,
    heat_demand: 600,
    pv_labour: 90,
    pv_material: 180,
    pv_generation: 400,
    gshp_labour: 130,
    gshp_material: 280,
    gshp_size: 700,
    fuel_poverty: "no",
    multideprivation: "not-deprived",
  },
  // ... more buildings
];
```

```js
// model specifications
const listOfTech = {
  ASHP: {
    name: "ASHP",
    config: {
      suitabilityKey: "ashp_suitability",
      labourKey: "ashp_labour",
      materialKey: "ashp_material",
      savingsKey: "heat_demand",
    },
  },
  PV: {
    name: "PV",
    config: {
      suitabilityKey: "pv_suitability",
      labourKey: "pv_labour",
      materialKey: "pv_material",
      savingsKey: "pv_generation",
    },
  },
  GSHP: {
    name: "GSHP",
    config: {
      suitabilityKey: "gshp_suitability",
      labourKey: "gshp_labour",
      materialKey: "gshp_material",
      savingsKey: "gshp_size",
    },
  },
  Insulation: {
    name: "Insulation",
    config: {
      suitabilityKey: "insulation_rating",
      labourKey: "insulation_cwall_labour",
      materialKey: "insulation_cwall_materials",
      savingsKey: "insulation_cwall",
    },
  },
};


// --- Define Different Configurations ---

// Config 1: Tech-first, focus on ASHP, prioritize fuel poverty
const config1 = {
  initialYear: 2024,
  rolloverBudget: 0,
  yearlyBudgets: [500000, 5000, 5000],
  optimizationStrategy: "tech-first",
  tech: "ASHP", // Use the tech name as a string
  priorities: [],
};

// Config 2: Carbon-first, consider ASHP and PV, prioritize multi-deprivation
const config2 = {
  initialYear: 2024,
  rolloverBudget: 0,
  yearlyBudgets: [6000, 6000, 6000],
  optimizationStrategy: "carbon-first",
  technologies: ["ASHP", "PV"], // Use an array of tech names
  priorities: [],
};

// Config 3: Tech-first, focus on Insulation, no specific priority
const config3 = {
  initialYear: 2024,
  rolloverBudget: 0,
  yearlyBudgets: [4000, 4000, 4000],
  optimizationStrategy: "tech-first",
  tech: "Insulation",
  priorities: [],
};

```

```js
// --- Function to create and run a model with a given config ---
function createAndRunModel(buildings, config) {
  const model = new MiniDecarbModel(buildings);

  model.setInitialYear(config.initialYear || 0);
  model.setRolloverBudget(config.rolloverBudget || 0);
  model.setYearlyBudgets(config.yearlyBudgets || []);
  model.setOptimizationStrategy(config.optimizationStrategy || "tech-first");

  // Add technologies
  if (
    config.optimizationStrategy === "carbon-first" &&
    config.technologies &&
    config.technologies.length > 0
  ) {
    config.technologies.forEach((techName) => {
      if (listOfTech[techName]) {
        model.addTechnology(listOfTech[techName]);
      } else {
        console.error(`Error: Technology "${techName}" not found in listOfTech.`);
      }
    });
  } else if (config.tech) {
    if (listOfTech[config.tech]) {
      model.addTechnology(listOfTech[config.tech]);
    } else {
      console.error(`Error: Technology "${config.tech}" not found in listOfTech.`);
    }
  }

  // Add priorities
  if (config.priorities) {
    config.priorities.forEach((priority) => {
      model.addPriority(
        priority.attribute,
        priority.order,
        priority.scoreFunction,
        priority.weight
      );
    });
  }

  // Run the model
  const recap = model.run();
  return recap;
}
```

```js
// display(newBuildings);
```

```js

// --- Run Models and Stack Results ---

const recap1 = createAndRunModel(newBuildings, config1);
const recap2 = createAndRunModel(newBuildings, config2);
const recap3 = createAndRunModel(newBuildings, config3);

const stackedRecap = MiniDecarbModel.stackResults([recap1, recap2]);

```


```js

// --- Analyze Stacked Results ---
display(html`<p> "Stacked Recap Summary:" </p>`)
display(stackedRecap.summary);

display(html`<p> "Stacked Recap Yearly Summary:" </p>`);
display( stackedRecap.yearlySummary);

display(html`<p> "Stacked Recap Buildings:" </p>`);
display( stackedRecap.buildings);

display(html`<p> "Stacked Recap Intervened Buildings:" </p>`);
display(
  stackedRecap.intervenedBuildings
);

display(html`<p> "Stacked Recap Untouched Buildings:" </p>`);
display(
  stackedRecap.untouchedBuildings
);
```