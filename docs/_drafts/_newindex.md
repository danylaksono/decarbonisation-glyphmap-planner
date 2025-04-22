---
title: Decarbonisation Planner
toc: false
sidebar: false
footer: false
sql:
  oxford: ./data/oxford_decarbonisation_data.parquet
---

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
   -- "Domestic Insulation Potential_Insulation - Cavity Wall" AS insulation_cwall,
   -- "Low Carbon Technology Costs_Insulation - Cavity Wall - Labour" AS insulation_cwall_labour,
   -- "Low Carbon Technology Costs_Insulation - Cavity Wall  - Materials" AS insulation_cwall_materials,
   -- "Low Carbon Technology Costs_Insulation - Cavity Wall - Total" AS insulation_cwall_total,
   -- "Domestic Insulation Potential_Insulation - External Wall" AS insulation_ewall,
   -- "Low Carbon Technology Costs_Insulation - External Wall - Labour" AS insulation_ewall_labour,
   -- "Low Carbon Technology Costs_Insulation - External Wall - Material" AS insulation_ewall_materials,
   -- "Low Carbon Technology Costs_Insulation - External Wall - Total" AS insulation_ewall_total,
   -- "Domestic Insulation Potential_Insulation - Roof" AS insulation_roof,
   -- "Low Carbon Technology Costs_Insulation - Loft - Labour" AS insulation_roof_labour,
   -- "Low Carbon Technology Costs_Insulation - Loft - Material" AS insulation_roof_materials,
   -- "Low Carbon Technology Costs_Insulation - Loft - Total" AS insulation_roof_total,
   -- "Domestic Insulation Potential_Insulation - Under Floor" AS insulation_floor,
   -- "Low Carbon Technology Costs_Insulation - Under Floor - Labour" AS insulation_floor_labour,
   -- "Low Carbon Technology Costs_Insulation - Under Floor - Material" AS insulation_floor_materials,
   -- "Low Carbon Technology Costs_Insulation - Under Floor- Total" AS insulation_floor_total,
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
import { TableView } from "./components/TableView.js";
import { QuickviewForm } from "./components/QuickviewForm.js";
import { TimelineView } from "./components/TimelineView.js";
import { MapView } from "./components/MapView.js";
import { createInterventionManager } from "./components/InterventionManager.js";
import { loadData, loadGeoData } from "./utils/dataUtils.js";
import { initState } from "./utils/stateUtils.js";

// Load data
const { buildingsData } = await loadData(oxford_data);
const geoData = await loadGeoData();

// Initialize state
const state = initState();

// Define listOfTech
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
};

// Create intervention manager
const manager = createInterventionManager(buildingsData, listOfTech);

// Define runModel
function runModel() {
  const recaps = manager.runInterventions();
  state.setInterventions(recaps);
  state.setResults(manager.getStackedResults());
}

// Reactive state variables
const interventions = state.getInterventions(); // Array of interventions
const timelineModifications = state.getTimelineModifications(); // Modifications from timeline
const selectedInterventionIndex = state.getSelectedInterventionIndex(); // Currently selected index

// Compute tableFilteredData
const tableFilteredData = state.getTableFiltered()
  ? state
      .getTableFiltered()
      .map((index) => buildingsData[index])
      .filter(Boolean)
  : null;

// Define modifyIntervention
function modifyIntervention(index, newConfig) {
  if (!newConfig) {
    console.info("No change detected for intervention", index);
    return;
  }
  manager.modifyIntervention(index, newConfig);
  runModel();
}

// Define reorderIntervention
function reorderIntervention(order, index, direction) {
  let newOrder = [...order];
  if (direction === "up" && index > 0) {
    [newOrder[index - 1], newOrder[index]] = [
      newOrder[index],
      newOrder[index - 1],
    ];
  } else if (direction === "down" && index < newOrder.length - 1) {
    [newOrder[index], newOrder[index + 1]] = [
      newOrder[index + 1],
      newOrder[index],
    ];
  }
  manager.setInterventionOrder(newOrder);
  runModel();
}
```

<!-- Stylesheets -->
<style> .main-top { grid-row: 1; } .main-bottom { grid-row: 2; } </style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.2/css/bulma.min.css">
<link rel="stylesheet" href="./styles/bulma-quickview.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">	
<link rel="stylesheet" href="./styles/dashboard.css">

<div class="grid-container">
	<!-- Left Panel: Table and Timeline -->
	<div id="left-panel">
	<!-- Table View -->
	<div class="left-top"> ${TableView(buildingsData, state)} </div>
	<!-- Timeline View -->
	<div class="left-bottom"> ${TimelineView(state, manager, runModel)} </div>
</div>
<!-- Main Panel: Map Only -->
<!-- <div id="main-panel"> ${MapView(buildingsData, geoData, state)} </div> -->
</div>

<!-- Quickview Modal -->

${QuickviewForm(state, manager, runModel, tableFilteredData)}
