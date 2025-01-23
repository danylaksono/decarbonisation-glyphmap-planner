---
title: Test New Model
toc: false
sidebar: false
footer: false
sql:
  oxford: ./../data/oxford_decarbonisation_data.parquet
---

```js
import * as L from "npm:leaflet";
import {
  TimeGlyph,
  GlyphCollection,
} from "./../components/glyph-designs/timeGlyph.js";
import {
  InterventionManager,
  MiniDecarbModel,
} from "./../components/decarb-model/mini-decarbonisation.js";
import { LeafletMap } from "./../components/leaflet/leaflet-map.js";
```

```js
function context2d(width, height, dpi = devicePixelRatio) {
  const canvas = document.createElement("canvas");
  canvas.width = width * dpi;
  canvas.height = height * dpi;
  canvas.style = `width: ${width}px;`;
  const context = canvas.getContext("2d");
  context.scale(dpi, dpi);
  return context;
}
```

## Test New Model

```sql id=oxford_data
  SELECT DISTINCT
    "UPRN" AS id,
    "LSOA code" AS lsoa,
    "MSOA code" AS msoa,
    "xcoord" AS x,
    "ycoord" AS y,
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
console.log("this SPECIFICATION cell is called");
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
  id: Date.now(),
  initialYear: 2024,
  rolloverBudget: 0,
  yearlyBudgets: [5000, 5000, 5000],
  optimizationStrategy: "tech-first",
  tech: "ASHP", // Use the tech name as a string
  priorities: [],
  filters: [
    {
      // Using the createDynamicFilter helper
      filterName: "high heat demand",
      filterFunction: MiniDecarbModel.createDynamicFilter(
        "heat_demand",
        "<",
        5500
      ),
    },
  ],
};

// Config 2: Carbon-first, consider ASHP and PV, prioritize multi-deprivation
const config2 = {
  modelId: Date.now(),
  initialYear: 2024,
  rolloverBudget: 0,
  yearlyBudgets: [60000, 6000, 6000],
  optimizationStrategy: "carbon-first",
  technologies: ["ASHP", "PV"], // Use an array of tech names
  priorities: [],
};

// Config 3: Tech-first, focus on Insulation, no specific priority
const config3 = {
  id: Date.now(),
  initialYear: 2026,
  rolloverBudget: 0,
  yearlyBudgets: [9000, 7000, 4000],
  optimizationStrategy: "tech-first",
  tech: "PV",
  priorities: [],
};
```

```js
console.log("this INTERVENTION cell is called");
// --- Create an InterventionManager instance ---
const manager = new InterventionManager(newBuildings, listOfTech);

// --- Add interventions ---
manager.addIntervention(config1);
// manager.addIntervention(config3);
// manager.addIntervention(config2);

// --- Change the order of interventions ---
// manager.setInterventionOrder([1, 0]);

// --- Run the interventions ---
const recaps = manager.runInterventions();

// --- Get the stacked results ---
const stackedRecap = manager.getStackedResults();
```

### Modify and Run Intervention

```js
const newResults = manager.modifyAndRunIntervention(0, {
  yearlyBudgets: [5000, 0, 0],
});
display(newResults);
```

### Model Outputs

```js
console.log("this ANALYZE cell is called");
// --- Analyze Stacked Results ---
display(html`<p>"RECAPS"</p>`);
display(recaps);

display(html`<p>"appliedFilters:"</p>`);
display(recaps[0].appliedFilters);

// --- Analyze Stacked Results ---
display(html`<p>"Stacked Recap Summary:"</p>`);
display(stackedRecap.summary);

display(html`<p>"Stacked Recap Yearly Summary:"</p>`);
display(stackedRecap.yearlySummary);

display(html`<p>"Stacked Recap Buildings:"</p>`);
display(stackedRecap.buildings);

display(html`<p>"Stacked Recap Intervened Buildings:"</p>`);
display(stackedRecap.intervenedBuildings);

display(html`<p>"List of Intervention Results:"</p>`);
display(stackedRecap.recap);

display(html`<p>"Grouped Intervention"</p>`);
const groupedAll = MiniDecarbModel.group(stackedRecap.intervenedBuildings, [
  "lsoa",
  "interventionYear",
]);
display(groupedAll);
```

## Show the data

```js
const container = document.createElement("div");
document.body.appendChild(container);

const mapInstance = new LeafletMap(container, {
  width: "800px",
  height: "600px",
  tooltipFormatter: (props) => `<strong>${props.id}</strong>`,
});

// Add a data layer
const buildingsData = [
  { x: 110.123, y: -7.231231, name: "Building A" },
  { x: 110.223, y: -7.231251, name: "Building B" },
];

mapInstance.addLayer("buildings", stackedRecap.buildings, {
  clusterRadius: 50,
  fitBounds: true,
});

display(container);
// Later, update the layer
// mapInstance.updateLayer("buildings", newData);

// // Toggle layer visibility
// mapInstance.setLayerVisibility("buildings", false);

// // Clean up
// mapInstance.destroy();
```

```js
/*
The filters will exclude non-matching buildings, while priorities will determine the order in which remaining buildings are selected for intervention within the budget constraints.

The priority scoring combines:

Base ranking score
Custom score function (if provided)
Weight multiplier
Multiple priority rules can be combined

Filters are applied first to create a subset of suitable buildings, then priorities determine the order of intervention within that subset.
*/

// Example priorities
const priorities_example = [
  {
    attribute: "energyConsumption", // The building property to evaluate
    order: "desc", // "asc" or "desc" ordering
    scoreFunction: (value) => value / 100, // Optional custom scoring function
    weight: 1.5, // Optional weight factor (default: 1.0)
  },
  {
    attribute: "buildingAge",
    order: "asc",
    weight: 0.8,
  },
];
// Example filters using the static helper method
const filters_example = [
  {
    filterName: "Large Buildings Only",
    filterFunction: (building) => building.properties.floorArea > 1000,
  },
  {
    // Using the createDynamicFilter helper
    filterName: "High Energy Buildings",
    filterFunction: MiniDecarbModel.createDynamicFilter(
      "energyConsumption",
      ">",
      500
    ),
  },
];
```

```js
const filterByIds = (suitableIds) => {
  return {
    filterName: `Buildings with IDs in provided list (${suitableIds.length} buildings)`,
    filterFunction: (building) => suitableIds.includes(building.id),
  };
};
```
