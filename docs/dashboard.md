---
title: Decarbonisation Planner
toc: false
sidebar: false
footer: false
sql:
  oxford: ./data/oxford_decarbonisation_data.parquet
---

<!-- ------------ Imports ------------ -->

```js
const d3 = require("d3", "d3-geo-projection");
const flubber = require("flubber@0.4");

import { require } from "npm:d3-require";
import { Mutable } from "npm:@observablehq/stdlib";

import {
  TimeGlyph,
  GlyphCollection,
} from "./components/glyph-designs/timeGlyph.js";
import * as turf from "@turf/turf";
import { RadialGlyph } from "./components/radialglyph.js";
import {
  glyphMap,
  createDiscretiserValue,
  _drawCellBackground,
} from "./components/gridded-glyphmaps/index.min.js";
import { OSGB } from "./components/osgb/index.js";
import { Model } from "./components/model.js";
import { BudgetAllocator } from "./components/budgetAllocator.js";
import { MiniDecarbModel } from "./components/miniDecarbModel.js";
import { createTable } from "./components/sorterTable.js";
import { createTimelineInterface } from "./components/timeline.js";
import { YearPicker } from "./components/yearpicker/yearpicker.js";
import {
  inferTypes,
  enrichGeoData,
  normaliseData,
} from "./components/helpers.js";
import {
  downloadBoundaries,
  joinCensusDataToGeoJSON,
  convertGridCsvToGeoJson,
  context2d,
} from "./components/utils.js";
```

```js
const proj = new OSGB();
```

<!-- ---------------- Data ---------------- -->

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
    "Substation - Demand_rag" AS substation_demand,
    "index of multiple deprivation (imd) score" AS deprivation_score,
    "index of multiple deprivation (imd) rank " AS deprivation_rank,
    "index of multiple deprivation (imd) decile " AS deprivation_decile,
    "Number of households in fuel poverty" AS fuel_poverty_households,
    "Proportion of households fuel poor (%)" AS fuel_poverty_proportion
FROM oxford b;
```

```js
// >> declare data
const buildingsData = [...oxford_data];
const flatData = buildingsData.map((p) => ({ ...p }));
const allColumns = Object.keys(buildingsData[0]);
```

```js
// oxford boundary data
const lsoa_boundary = FileAttachment(
  "./data/oxford_lsoa_boundary.geojson"
).json();
const regular_geodata = FileAttachment(
  "./data/oxford_lsoas_regular.json"
).json();
const cartogram_geodata = FileAttachment(
  "./data/oxford_lsoas_cartogram.json"
).json();
```

<!-- ------------ Getter-Setter ------------ -->

```js
function useState(value) {
  const state = Mutable(value);
  const setState = (value) => (state.value = value);
  return [state, setState];
}
const [selected, setSelected] = useState({});  // selected data in table
const [getIntervention, setIntervention] = useState([]); // list of interventions
const [getResults, setResults] = useState([]); // list of results, from running model
const [selectedIntervention, setSelectedIntervention] = useState(null); // selected intervention in timeline
// const [selectedInterventionIndex, setSelectedInterventionIndex] = useState(null); // selected intervention index
const [detailOnDemand, setDetailOnDemand] = useState(null); // detail on demand on map
```

<!-------- Stylesheets -------->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/bulma@1.0.0/css/bulma.min.css"
>

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">

<link
  rel="stylesheet"
  href="./styles/dashboard.css"
>

<link
  rel="stylesheet"
  href="./components/yearpicker/yearpicker.css"
>

<style>
body, html {
  height: 100%;
  margin: 0 !important;
  /* overflow: hidden; */
  padding: 0;
}

#observablehq-main, #observablehq-header, #observablehq-footer {
    margin: 0 !important;
    /* width: 100% !important; */
    max-width: 100% !important;
}

#observablehq-center {
  margin: 0.5rem !important;
}

.grid {
  margin: 0 !important;
}

.grid-container {
    display: grid;
    grid-template-columns: 1fr 4fr;
    grid-template-rows: repeat(2, 1fr) 1fr;
    gap: 4px; /* gap between grid items */
    padding: 2px;
    height: 92vh;
  }

  /* Left panel boxes */
  #left-panel {
     /* Spans 2 rows */
    display: grid;
    /* grid-template-rows: 1fr 1fr; Two equal rows */
    gap: 4px;
  }


  /* Right panel boxes */
  #main-panel {
    /*grid-row: span 2;  Spans 2 rows */
    display: grid;
    grid-template-rows: 4fr 2fr;
    height: 92vh;
    gap: 4px;
  }

  .main-top {
    display: grid;
    grid-template-columns: 1fr 1fr; /* Split into two equal columns */
    gap: 8px;
  }

  /* Main panel bottom, split into two sections */
  .main-bottom {
    /* grid-row: 2 / 3; Takes the second row */
    display: grid;
    grid-template-columns: 3fr 1fr; /* Split bottom row into 1/3 ratio */
    gap: 8px;
  }

  .card {
    /* display: flex; /* Use Flexbox */
    /* justify-content: center; Horizontally center content */
    /* align-items: center; Vertically center content */
    /* text-align: center; Center text alignment for multiline */ */
    border: 1px dark-grey solid;
    padding: 8px;
    margin: 0 !important;
    border-radius: 0 !important;
    box-sizing: border-box; /* Ensure padding is included in height calculations */
  }

  .main-top,
  .main-bottom .card {
      height: 100%; /* Let the grid layout define height naturally */
  }

.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

#interventions-list li {
  transition: background-color 0.3s;
}

#interventions-list li:hover {
  background-color: #f9f9f9;
}

#interventions-list li.selected {
  background-color: #e0f7fa; /* Light cyan for selection */
  font-weight: bold;
  border-left: 4px solid #00bcd4; /* Accent border */
}

.buttons {
      margin-left: auto;
    }

.buttons button {
  margin-left: 5px;
  border: none;
  background: none;
  cursor: pointer;
  color: #007bff;
}

.buttons button:hover {
  color: #0056b3;
}

.hidden {
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none; /* Prevent clicks when hidden */
}

.visible {
  opacity: 1;
  transition: opacity 0.3s ease;
}

#graph-container {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
  border: 1px solid #ddd;
  padding: 10px;
  box-sizing: border-box;
}


/* Panel styling */
#timeline-panel {
  flex: 1;
  background-color: #f9f9f9;
  padding: 10px;
  border-right: 1px solid #ddd;
}

/* Buttons container styling */
#timeline-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 10px; /* Margin on all sides */
}

/* Button styling */
#timeline-buttons .btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px; /* Consistent button size */
  font-size: 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: transform 0.2s ease, background-color 0.2s ease; /* Smooth background transition */
  background-color: #f0f0f0; /* Subtle background */
}

/* Hover effect for buttons */
#timeline-buttons .btn:hover {
  transform: scale(1.1);
  background-color: #e0e0e0;
}

#timeline-buttons .btn i {
  font-size: 18px;
  vertical-align: middle;
}

#timeline-buttons button[disabled] {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: #cccccc;
  }

</style>

<!-- ---------------- HTML Layout ---------------- -->

<div class="grid-container" style="padding:8px; height:92vh;">
  <!-- Left panel (two boxes, stacked vertically) -->
  <div id="left-panel">
    <div id="project-properties" class="card">
      <h1>Decarbonisation Dashboard</h1>
      <br>
      <div class="form-group">
        ${techsInput}
      </div>
      <div class="form-group">
        ${totalBudgetInput}
      </div>
      <div class="form-group">
        <div style="display:flex; flex-direction: row; align-items: center; min-height: 25.5px; gap: 60px;">
        <span> <b>Start Year </b> </span> ${startYearInput}
        </div >
      </div>
      <div class="form-group">
        <label for="total-budget">Project length (years):</label>
        ${projectLengthInput}
      </div>
      <div class="form-group">
      <label for="total-budget">Budget Allocation Type:</label>
        ${allocationTypeInput}
      </div>
        ${svg}
      <div class="form-group">
        ${priorityInput}
      </div>
      <div class="form-group">
        ${filterInput}
      </div>
      <div class="form-group">
        ${html`
        <button class="create-btn" type="button" onclick=${addNewIntervention}>
          Add New Intervention
        </button>`}
      </div>
    </div>
  </div>
  <!-- Main panel (right side) -->
  <div id="main-panel">
    <!-- <div class="card main-top">Map View</div> -->
    <div class="main-top">
      <div class="card" style="overflow-x:hidden; min-width: 400px;">
      <!-- <h2> Sortable Table </h2> -->
      ${table.getNode()}
      ${selected ? html`
        <div>No. of intervened buildings: ${JSON.stringify(stackedResults.summary.intervenedCount)}</div>` : ""
        }
      </div>
      <div class="card" style="overflow-x:hidden;overflow-y:hidden; min-width: 400px;">
      <!-- <h2>Map View</h2> -->
      ${glyphmapTypeInput}
      ${mapAggregationInput}
      ${(map_aggregate == "Building Level") ? "" : morphFactorInput}
      ${resize((width, height) => createGlyphMap(map_aggregate, {width, height}))}
      </div>
    </div>
    <div class="main-bottom">
      <div class="card" style="overflow-y: scroll;">
      <!-- <h2> General overview graph </h2> -->
      <br>
      <div id="graph-container">
        <div id="timeline-panel">
          ${createTimelineInterface(
            interventions,
            () => {},
            (click) => {
              selectIntervention(click);
              },
            600,
            200
          )}
        </div>
        <nav id="timeline-buttons">
          <button class="btn edit" aria-label="Edit">
            <i class="fas fa-edit" style="color:green;"></i>
          </button>
          ${html`<button class="btn erase" aria-label="Delete"
          onclick=${(e) => {
            e.stopPropagation();
            console.log("clicked block", e);
            }}>
            <i class="fas fa-trash" style="color:red;"></i>
          </button>`}
          <button class="btn move-up" aria-label="Move Up">
            <i class="fas fa-arrow-up"></i>
          </button>
          <button class="btn move-down" aria-label="Move Down">
            <i class="fas fa-arrow-down"></i>
          </button>
        </nav>
      </div>
    </div>
    <div class="card">
    <!-- <h2>Details on demand </h2> -->
    ${resize((width, height) => drawDetailOnDemand(width, height))}
    </div>
  </div>
</div>

```js
// for dealing with selected list items
let selectedInterventionIndex = null; // Track the selected intervention index
// console.log("selectedInterventionIndex: ", selectedInterventionIndex);

function selectIntervention(index) {
  // Update the selected index
  selectedInterventionIndex = index;
  // setSelectedInterventionIndex(index);

  // Clear previous selection
  document
    .querySelectorAll("#interventions-list li")
    .forEach((li) => li.classList.remove("selected"));

  // Highlight the selected item
  const selectedItem = document.querySelector(
    `#interventions-list li:nth-child(${index + 1})`
  );
  setSelectedIntervention(results[selectedInterventionIndex]);
  // console.log("selectedItem: ", results[selectedInterventionIndex]);
  // setSelectedIntervention(selectedItem);
  if (selectedItem) selectedItem.classList.add("selected");
}

// if interventions is empty, setSelectedIntervention to null
if (interventions.length === 0) {
  setSelectedIntervention(null);
  // setSelectedInterventionIndex(null); // this somehow crashes the code
}
```

```js
// Disable buttons when no intervention is selected
document.querySelectorAll('#timeline-buttons button').forEach(button => {
    button.disabled = !selectedIntervention;
    // console.log("button status", button.disabled);
    button.setAttribute('aria-disabled', !selectedIntervention);
});
```

<!-- ---------------- Input form declarations ---------------- -->

```js
// list of decarb technologies
const techsInput = Inputs.select(
  [
    "PV",
    "ASHP",
    "GSHP",
    "Insulation - Cavity Wall",
    "Insulation - External Wall",
    "Insulation - Roof",
    "Insulation - Under Floor",
  ],
  {
    label: html`<b>Technology</b>`,
    value: selectedIntervention ? selectedIntervention.techName : "ASHP",
    disabled: selectedIntervention ? true : false,
  }
);
techsInput.style["max-width"] = "300px";
const technology = Generators.input(techsInput);
// display(techsInput);

// Total Budget
const totalBudgetInput = Inputs.text({
  label: html`<b>Total Budget</b>`,
  placeholder: "Available Budget in GBP",
  disabled: selectedIntervention ? true : false,
  value: selectedIntervention
    ? Math.round(
        (selectedIntervention.totalBudgetSpent + Number.EPSILON) * 100
      ) / 100
    : 100_000_000,
  // submit: html`<button class="create-btn" style="color:white;">Submit</button>`,
});
totalBudgetInput.style["max-width"] = "300px";
const total_budget = Generators.input(totalBudgetInput);

// Start Year
// const startYearInput = Inputs.text({
//   label: html`<b>Start Year</b>`,
//   placeholder: "Starting year?",
//   disabled: selectedIntervention ? true : false,
//   value: selectedIntervention
//     ? Number(Object.keys(selectedIntervention.yearlyStats)[0])
//     : 2024,
//   // submit: html`<button class="create-btn" style="color:white;">Submit</button>`,
// });
// startYearInput.style["max-width"] = "300px";
const startYearInput = html`<input
  style="width: 100%; max-width:100px; max-height: 25.5px;"
  type="number"
  value=${selectedIntervention
    ? Number(Object.keys(selectedIntervention.yearlyStats)[0])
    : 2024}
  step="1"
  min="2024"
  max="2080"
  disabled=${selectedIntervention ? true : false}
  label="Start Year"
/>`;
// console.log("startYearInput.style", startYearInput.columns);
const start_year = Generators.input(startYearInput);

// Project Length
const projectLengthInput = Inputs.range([0, 10], {
  // label: html`<b>Project length in years</b>`,
  step: 1,
  value: selectedIntervention
    ? Object.keys(selectedIntervention.yearlyStats).length
    : 5,
  disabled: selectedIntervention ? true : false,
});
projectLengthInput.number.style["max-width"] = "60px";
Object.assign(projectLengthInput, {
  oninput: (event) => event.isTrusted && event.stopImmediatePropagation(),
  onchange: (event) => event.currentTarget.dispatchEvent(new Event("input")),
});
const project_length = Generators.input(projectLengthInput);

// Allocation Type
const allocationTypeInput = Inputs.radio(["linear", "sqrt", "exp", "cubic"], {
  // label: html`<b>Allocation Type</b>`,
  value: "linear",
  disabled: selectedIntervention ? true : false,
});
const allocation_type = Generators.input(allocationTypeInput);

const priorityInput = Inputs.form([
  Inputs.select([...allColumns, "None"], {
    label: html`<b>Sorting Priority</b>`,
    value: "None",
    disabled: true,
  }),
  Inputs.radio(["asc", "desc"], {
    label: "Order",
    value: "asc",
    disabled: true,
  }),
]);
const priority_input = Generators.input(priorityInput);

const filterInput = Inputs.form([
  Inputs.select([...allColumns, "None"], {
    label: html`<b>Filter Column</b>`,
    value: "None",
    disabled: true,
  }),
  Inputs.text({
    label: "Filter Value",
    placeholder: "e.g., '> 1000'",
    disabled: true,
  }),
]);
const filter_input = Generators.input(filterInput);

const glyphmapTypeInput = Inputs.radio(
  ["Interventions", "Decarbonisation Time series"],
  {
    label: "Type of map",
    value: "Interventions",
  }
);
const glyphmapType = Generators.input(glyphmapTypeInput);

const mapAggregationInput = Inputs.radio(
  ["LSOA Level", "Building Level"],
  {
    label: "Map Aggregated at",
    value: "LSOA Level",
  }
);
const map_aggregate = Generators.input(mapAggregationInput);

const morphFactorInput = html`<input
  style="width: 100%; max-width:450px;"
  type="range"
  value="0"
  step="0.05"
  min="0"
  max="1"
/>`;
const morph_factor = Generators.input(morphFactorInput);
```

```js
// Budget Allocator
const allocator = new BudgetAllocator(
  total_budget,
  Number(start_year),
  Number(project_length)
);

let initialAllocations;
if (allocation_type === "linear") {
  initialAllocations = allocator.allocateLinear();
} else {
  initialAllocations = allocator.allocateCustom(allocation_type);
}
```

```js
const { svg, getAllocations } = allocator.visualise(
  initialAllocations,
  (changes) => {
    // console.log("data changed:", changes);
    setSelected(changes);
  },
  400,
  200
);
// display(results);
```

```js
// set allocation based on custom graph
allocation_type;
const allocations = selected ? getAllocations(selected) : initialAllocations;
// display(interventions);
```

```js
// console.log("selected: ", selected);
```

```js
// store intervention results
let interventions = getIntervention;
let results = getResults;
```

<!-- ---------------- Functions ---------------- -->

```js
// >> Some functions related to creating and managing interventions

// create config template
function createConfigTemplate(start_year, allocations) {
  return {
    initial_year: Number(start_year),
    duration: allocations.length,
    rolledover_budget: 0,
    yearly_budgets: allocations.map((item) => item.budget),
    tech: {},
    priorities: [],
    filters: [],
  };
}

// add new intervention
function addIntervention(
  techConfig,
  start_year,
  allocation,
  filters = [],
  priorities = []
) {
  const config = createConfigTemplate(start_year, allocation);
  // console.log("configuration sent", config);

  config.tech = {
    name: techConfig.name,
    config: techConfig.config,
  };

  // console.log("techConfig Name", techConfig);

  // Apply filters and priorities - append to existing
  config.filters = [...(config.filters || []), ...filters];
  config.priorities = [...(config.priorities || []), ...priorities];

  const newIntervention = { ...config, id: Date.now() };
  setIntervention([...interventions, newIntervention]);
  const modelResult = runModel(newIntervention, buildingsData);
  setResults([...results, modelResult]);
  console.log("Intervention added:", config);
}
// remove intervention
function removeIntervention(index) {
  if (index >= 0 && index < interventions.length) {
    setIntervention(interventions.filter((_, i) => i !== index));

    // when intervention is removed, remove the corresponding results
    setResults(results.filter((_, i) => i !== index));
  } else {
    console.log("Invalid index.");
  }
}

// handle form submission: add new intervention
function addNewIntervention() {
  const new_start_year = start_year;
  const new_tech = technology;
  const new_allocations = allocations;

  // if result exist, take the remaining budget from the latest year
  // and add it to this first year budget
  if (results.length > 0) {
    const latestResult = results[results.length - 1];
    new_allocations[0].budget += latestResult.remainingBudget;
  }

  // Retrieve techConfig from the selected technology
  const techConfig = listOfTech[new_tech];
  // console.log("techConfig", techConfig);

  // Example filters and priorities
  // const filters = [(b) => b.properties["substation_headroom"] >= 500];
  // const priorities = [{ name: "substation_capacity_rating", order: "asc" }];
  const filters = [];
  const priorities = [];

  addIntervention(
    techConfig,
    new_start_year,
    new_allocations,
    filters,
    priorities
  );
}

// Modify current intervention
function modifyIntervention(
  index,
  newTechConfig = null,
  newStartYear = null,
  newAllocations = null,
  newFilters = null,
  newPriorities = null
) {
  // Validate index
  if (index < 0 || index >= interventions.length) {
    console.error("Invalid intervention index");
    return;
  }

  // Get existing intervention
  const intervention = {...interventions[index]};

  // Update values if provided
  if (newTechConfig) {
    intervention.tech = {
      name: newTechConfig.name,
      config: newTechConfig.config
    };
  }

  if (newStartYear) {
    intervention.initial_year = Number(newStartYear);
  }

  if (newAllocations) {
    intervention.yearly_budgets = newAllocations.map(item => item.budget);
    intervention.duration = newAllocations.length;
  }

  if (newFilters) {
    intervention.filters = [...newFilters];
  }

  if (newPriorities) {
    intervention.priorities = [...newPriorities];
  }

  // Update interventions array
  const updatedInterventions = [...interventions];
  updatedInterventions[index] = intervention;
  setIntervention(updatedInterventions);

  // Re-run model and update results
  const modelResult = runModel(intervention, buildingsData);
  const updatedResults = [...results];
  updatedResults[index] = modelResult;
  setResults(updatedResults);

  console.log("Intervention modified:", intervention);
}

// stack results from getRecap() method
function stackResults(results) {
  const buildingMap = new Map();
  const yearlySummary = {}; // Object to store the overall yearly summary

  // Collect and merge all buildings from all results
  results.forEach((result) => {
    // Process yearlyStats for overall summary
    Object.entries(result.yearlyStats).forEach(([year, stats]) => {
      if (!yearlySummary[year]) {
        yearlySummary[year] = {
          budgetSpent: 0,
          buildingsIntervened: 0,
          totalCarbonSaved: 0, // Initialize carbon saved
          technologies: new Set(),
        };
      }

      yearlySummary[year].budgetSpent += stats.budgetSpent;
      yearlySummary[year].buildingsIntervened += stats.buildingsIntervened;
      yearlySummary[year].technologies.add(result.techName); // Add the technology

      // Accumulate total carbon saved from intervened buildings for this year
      stats.intervenedBuildings.forEach((building) => {
        yearlySummary[year].totalCarbonSaved += building.carbonSaved || 0;
      });
    });

    result.allBuildings.forEach((building) => {
      if (!buildingMap.has(building.id)) {
        const { properties, ...rest } = building; // Destructure properties and other fields
        buildingMap.set(building.id, {
          ...rest,
          ...properties, // Flatten properties here
          isIntervened: false,
          totalCost: 0,
          totalCarbonSaved: 0,
          interventionHistory: [],
          interventionYears: [],
          interventionTechs: [],
        });
      }
    });

    // Process interventions
    result.intervenedBuildings.forEach((building) => {
      const target = buildingMap.get(building.id);
      const intervention = {
        tech: result.techName,
        year: building.interventionYear,
        cost: building.interventionCost,
        carbonSaved: building.carbonSaved,
        interventionID: result.interventionId,
      };

      target.isIntervened = true;
      target.totalCost += building.interventionCost;
      target.totalCarbonSaved += building.carbonSaved;
      target.interventionHistory.push(intervention);
      target.interventionYears.push(building.interventionYear);
      if (!target.interventionTechs.includes(result.techName)) {
        target.interventionTechs.push(result.techName);
      }
    });
  });

  // Finalize the yearly summary
  Object.values(yearlySummary).forEach((yearData) => {
    yearData.technologies = Array.from(yearData.technologies); // Convert Set to Array
  });

  const buildings = Array.from(buildingMap.values());
  const summary = {
    totalBuildings: buildings.length,
    intervenedCount: buildings.filter((b) => b.isIntervened).length,
    untouchedCount: buildings.filter((b) => !b.isIntervened).length,
    totalCost: buildings.reduce((sum, b) => sum + b.totalCost, 0),
    totalCarbonSaved: buildings.reduce((sum, b) => sum + b.totalCarbonSaved, 0),
    uniqueTechs: [
      ...new Set(buildings.flatMap((b) => b.interventionTechs).filter(Boolean)),
    ],
    interventionYearRange: buildings.some((b) => b.interventionYears.length)
      ? [
          Math.min(...buildings.flatMap((b) => b.interventionYears)),
          Math.max(...buildings.flatMap((b) => b.interventionYears)),
        ]
      : null,
  };

  return {
    buildings,
    summary,
    yearlySummary, // Add the overall yearly summary
    intervenedBuildings: buildings.filter((b) => b.isIntervened),
    untouchedBuildings: buildings.filter((b) => !b.isIntervened),
  };
};

const stackedResults = stackResults(results);

// console.log("stackedResults", stackedResults);
```

```js
let config = {
  initial_year: Number(start_year),
  rolledover_budget: 0,
  yearly_budgets: allocations.map((item) => item.budget),
  tech: {},
  priorities: [],
};

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
      savingsKey: "solar_generation",
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

function addTechConfig(techConfig) {
  config.tech = {
    name: techConfig.name,
    config: techConfig.config,
  };
}

function addPriority(name, order = "asc") {
  const newPriority = {
    name: name,
    order: order,
  };

  config.priorities.push(newPriority);
}

function runModel(config, buildings) {
  const model = new MiniDecarbModel(config, buildings);
  model.runModel();
  return model.getRecap();
}

// update config here
// addTechConfig(listOfTech.ASHP);
// // addPriority("substation_headroom", "asc");
```

```js
// console.log("selectedIntervention", selectedIntervention);
// console.log(
//   "selectedIntervention year",
//   Object.keys(selectedIntervention.yearlyStats)[0]
// );
```

<!-- ---------------- Sortable Table ---------------- -->

```js
// columns to show in the table
const cols = [
  { column: "id", nominals: null },
  {
    column: "isIntervened",
    nominals: null,
  },
  { column: "lsoa", nominals: null },
  {
    column: "insulation_rating",
    ordinals: ["Unknown", "A", "B", "C", "D", "E", "F", "G"],
  },
  {
    column: "insulation_ewall",
    // ordinals: null,
    nominals: null,
    // ordinals: ["Unknown", "A", "B", "C", "D", "E", "F", "G"],
  },
  {
    column: "pv_generation",
    thresholds: [
      0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000,
      30000, 40000, 50000,
    ],
  },
  {
    column: "ashp_size",
    thresholds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50],
  },
];
```

```js
const tableData = selectedIntervention
  ? selectedIntervention.allBuildings.map((building) => ({
      ...building.properties,
      isIntervened: building.isIntervened,
    }))
  : (stackedResults ? stackedResults.buildings : flatData);

  // (stackedResults ? stackedResults.buildings : flatData);

const table = new createTable(tableData, cols, (changes) => {
  console.log("Table changed:", changes);
  setSelected(changes.selection);
});
```

```js
// console.log("Test inferring data types", inferTypes(tableData));
```

<!-- ---------------- Glyph Maps ---------------- -->

```js
// glyphmap basic specs
function glyphMapSpecBasic(width = 800, height = 600) {
  return {
    // coordType: "notmercator",
    initialBB: turf.bbox(lsoa_boundary),
    data: tableData,
    getLocationFn: (row) => [row.x, row.y],
    discretisationShape: "grid",
    mapType: "CartoPositron",
    interactiveCellSize: true,
    cellSize: 30,

    // width: 800,
    // height: 600,
    width: width,
    height: height - 40,

    customMap: {
      scaleParams: [],

      initFn: (cells, cellSize, global, panel) => {
        // console.log("initFn", cells, cellSize, global, panel);
      },

      preAggrFn: (cells, cellSize, global, panel) => {
        // console.log("global", global);
      },

      aggrFn: (cell, row, weight, global, panel) => {
        if (cell.building_area) {
          cell.building_area += row.building_area;
          // Update existing values
          cell.data.costs.ashp += row.ashp_labour + row.ashp_material;
          cell.data.costs.pv += row.pv_labour + row.pv_material;
          cell.data.costs.gshp += row.gshp_labour + row.gshp_material;
          cell.data.carbon.ashp += row.heat_demand;
          cell.data.carbon.pv += row.pv_generation;
          cell.data.carbon.gshp += row.gshp_size;
        } else {
          cell.building_area = row.building_area;
          // Initialize data structure
          cell.data = {
            costs: {
              ashp: row.ashp_labour + row.ashp_material,
              pv: row.pv_labour + row.pv_material,
              gshp: row.gshp_labour + row.gshp_material,
            },
            carbon: {
              ashp: row.heat_demand,
              pv: row.pv_generation,
              gshp: row.gshp_size,
            },
          };
        }

        // --- Normalization ---
        // Create arrays for costs and carbon for normalization
        let costsData = Object.entries(cell.data.costs).map(([key, value]) => ({
          key,
          value,
        }));
        let carbonData = Object.entries(cell.data.carbon).map(
          ([key, value]) => ({ key, value })
        );

        // Normalize costs and carbon data separately
        costsData = normaliseData(costsData, ["value"]);
        carbonData = normaliseData(carbonData, ["value"]);

        // Update cell.data with normalized values
        cell.data.costs = costsData.reduce((acc, { key, value }) => {
          acc[key] = value;
          return acc;
        }, {});
        cell.data.carbon = carbonData.reduce((acc, { key, value }) => {
          acc[key] = value;
          return acc;
        }, {});
      },

      postAggrFn: (cells, cellSize, global, panel) => {
        //add cell interaction
        let canvas = d3.select(panel).select("canvas").node();
      },

      preDrawFn: (cells, cellSize, ctx, global, panel) => {
        if (!cells || cells.length === 0) {
          console.error("No cells data available");
          return;
        }

        global.pathGenerator = d3.geoPath().context(ctx);
        global.colourScalePop = d3
          .scaleSequential(d3.interpolateBlues)
          .domain([0, d3.max(cells.map((row) => row.building_area))]);
      },

      drawFn: (cell, x, y, cellSize, ctx, global, panel) => {
        const boundary = cell.getBoundary(0);
        if (boundary[0] != boundary[boundary.length - 1]) {
          boundary.push(boundary[0]);
        }
        const boundaryFeat = turf.polygon([boundary]);

        ctx.beginPath();
        global.pathGenerator(boundaryFeat);
        ctx.fillStyle = global.colourScalePop(cell.building_area);
        ctx.fill();

        //add contour to clicked cells
        if (global.clickedCell == cell) {
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgb(250,250,250)";
          ctx.stroke();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgb(50,50,50)";
          ctx.stroke();
        }

        //draw a radial glyph -> change the array to real data (between 0 and 1)
        // drawRadialMultivariateGlyph([0.5, 0.1, 0.9, 0.3], x, y, cellSize, ctx);
        let rg = new RadialGlyph([
          cell.data.carbon.ashp,
          cell.data.carbon.pv,
          cell.data.carbon.gshp,
          cell.data.costs.ashp,
          cell.data.costs.pv,
          cell.data.costs.gshp,
        ]);
        rg.draw(ctx, x, y, cellSize / 2);

        // console.log("boundary", boundary);
      },

      postDrawFn: (cells, cellSize, ctx, global, panel) => {},

      tooltipTextFn: (cell) => {
        if (cell) {
          console.log("cell on tooltip", cell);
          setDetailOnDemand(cell.data);
          return `Total Building Area: ${cell.building_area.toFixed(2)} m^2`;
        } else {
          return "no data";
        }
      },
    },
  };
}
```

```js
const glyphMapSpecBasicWgs84 = {
  ...glyphMapSpecBasic,
  // coordType: "mercator",
  initialBB: {}, //use the WGS84 extent
  getLocationFn: (row) => {},
};
```

```js
function drawDetailOnDemand(width, height) {
  let canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = width;

  if (!detailOnDemand) {
    return canvas;
  }

  let data = detailOnDemand;

  let rg = new RadialGlyph([
    data.carbon.ashp,
    data.carbon.pv,
    data.carbon.gshp,
    data.costs.ashp,
    data.costs.pv,
    data.costs.gshp,
  ]);
  rg.draw(ctx, width / 2, height / 2, Math.min(width / 2, height / 2));

  return canvas;
}
```

```js
function drawRadialMultivariateGlyph(normalisedData, x, y, size, ctx) {
  let angle = (2 * Math.PI) / normalisedData.length;
  let centerX = x;
  let centerY = y;
  let radius = size / 2;
  // console.log(radius);

  //get a colour palette
  let colors = d3
    .scaleOrdinal(d3.schemeTableau10)
    .domain(d3.range(normalisedData.length));

  normalisedData.map((d, i) => {
    drawPieSlice(
      ctx,
      centerX,
      centerY,
      radius * 0.9,
      angle * (i + 0.1),
      angle * (i + 0.9),
      "rgba(0,0,0,0.05)"
    );
    drawPieSlice(
      ctx,
      centerX,
      centerY,
      radius * Math.sqrt(d) * 0.95,
      angle * (i + 0.1),
      angle * (i + 0.9),
      colors(i)
    );
  });
}
```

```js
function drawPieSlice(ctx, cx, cy, r, angleStart, angleEnd, color) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, angleStart, angleEnd);
  ctx.lineTo(cx, cy);
  ctx.fillStyle = color;
  ctx.fill();
}
```

```js
// joining attributes to geodata
// const regular_geodata_withproperties = joinCensusDataToGeoJSON(
//   [...flatData],
//   regular_geodata
// );
// const cartogram_geodata_withproperties = joinCensusDataToGeoJSON(
//   [...flatData],
//   cartogram_geodata
// );
// console.log("regular_geodata_withproperties", regular_geodata_withproperties);
// console.log(
//   "cartogram_geodata_withproperties",
//   cartogram_geodata_withproperties
// );
```

```js
// console.log("Flat Data", flatData);
```

```js
// geo-enrichment - combine geodata with building level properties
const aggregations = {
  building_area: "sum",
  ashp_labour: "sum",
  ashp_material: "sum",
  pv_labour: "sum",
  pv_material: "sum",
  gshp_labour: "sum",
  gshp_material: "sum",
  gshp_size: "sum",
  heat_demand: "sum", // type inferrence need to deal with some nullish values
  pv_generation: "sum", // type inferrence need to deal with some nullish values
  ashp_suitability: "count",
  pv_suitability: "count",
  gshp_suitability: "count",
};

const regular_geodata_withproperties = enrichGeoData(
  flatData,
  regular_geodata,
  "lsoa",
  "code",
  aggregations
);

// console.log(
//   "regular_geodata_withproperties_enriched",
//   regular_geodata_withproperties_enriched
// );

const cartogram_geodata_withproperties = enrichGeoData(
  flatData,
  cartogram_geodata,
  "lsoa",
  "code",
  aggregations
);
// console.log(
//   "cartogram_geodata_withproperties_enriched",
//   cartogram_geodata_withproperties_enriched
// );
```

```js
// Data processing functions

const osgb = new OSGB();
let clone = turf.clone(regular_geodata);
turf.coordEach(clone, (currentCoord) => {
  const newCoord = osgb.toGeo(currentCoord);
  currentCoord[0] = newCoord[0];
  currentCoord[1] = newCoord[1];
});
const regularGeodataLsoaWgs84 = clone;
```

```js
const osgb = new OSGB();
let clone = turf.clone(cartogram_geodata);
turf.coordEach(clone, (currentCoord) => {
  const newCoord = osgb.toGeo(currentCoord);
  currentCoord[0] = newCoord[0];
  currentCoord[1] = newCoord[1];
});
const cartogramGeodataLsoaWgs84 = clone;
// display(cartogramLsoaWgs84());
```

```js
// Create a lookup table for the key data - geography
const keydata = _.keyBy(
  regular_geodata_withproperties.features.map((feat) => {
    return {
      code: feat.properties.code,
      population: +feat.properties.population,
      data: feat,
    };
  }),
  "code"
);
// console.log("keydat", keydata);

const regularGeodataLookup = _.keyBy(
  regular_geodata_withproperties.features.map((feat) => {
    return { ...feat, centroid: turf.getCoord(turf.centroid(feat.geometry)) };
  }),
  (feat) => feat.properties.code
);

const cartogramGeodataLsoaLookup = _.keyBy(
  cartogram_geodata_withproperties.features.map((feat) => {
    return { ...feat, centroid: turf.getCoord(turf.centroid(feat.geometry)) };
  }),
  (feat) => feat.properties.code
);
```

```js
const geographyLsoaWgs84Lookup = _.keyBy(
  regular_geodata_withproperties.features.map((feat) => {
    const transformedGeometry = transformGeometry(feat.geometry);
    const centroid = turf.getCoord(turf.centroid(transformedGeometry));
    return {
      ...feat,
      geometry: transformedGeometry,
      centroid: centroid,
    };
  }),
  (feat) => feat.properties.code
);

const cartogramLsoaWgs84Lookup = _.keyBy(
  cartogram_geodata_withproperties.features.map((feat) => {
    const transformedGeometry = transformGeometry(feat.geometry);
    const centroid = turf.getCoord(turf.centroid(transformedGeometry));
    return {
      ...feat,
      geometry: transformedGeometry,
      centroid: centroid,
    };
  }),
  (feat) => feat.properties.code
);
```

```js
const flubbers = {};
for (const key of Object.keys(cartogramLsoaWgs84Lookup)) {
  if (geographyLsoaWgs84Lookup[key] && cartogramLsoaWgs84Lookup[key]) {
    flubbers[key] = flubber.interpolate(
      turf.getCoords(geographyLsoaWgs84Lookup[key])[0],
      turf.getCoords(cartogramLsoaWgs84Lookup[key])[0],
      { string: false }
    );
  }
}
const tweenWGS84Lookup = _.mapValues(flubbers, (v, k) => {
  const feat = turf.multiLineString([v(morph_factor)], { code: k });
  feat.centroid = turf.getCoord(turf.centroid(feat.geometry));
  return feat;
});
```

```js
// discretiser
function valueDiscretiser(geomLookup) {
  return createDiscretiserValue({
    valueFn: (row) => {
      return row.code;
    },
    glyphLocationFn: (key) => geomLookup[key]?.centroid,
    boundaryFn: (key) => geomLookup[key]?.geometry.coordinates[0],
  });
}
```

```js
const glyphMapSpec = {
  coordType: "notmercator",
  initialBB: transformCoordinates(turf.bbox(regular_geodata)),
  data: Object.values(keydata),
  getLocationFn: (row) => regularGeodataLookup[row.code]?.centroid,
  discretisationShape: "grid",
  interactiveCellSize: true,
  interactiveZoomPan: true,
  mapType: "CartoPositron",
  // mapType: "StamenTonerLite",
  cellSize: 30,

  width: 500,
  height: 500,

  customMap: {
    scaleParams: [],

    initFn: (cells, cellSize, global, panel) => {
      // console.log("initFn", cells, cellSize, global, panel);
    },

    preAggrFn: (cells, cellSize, global, panel) => {
      // console.log("global", global);
    },

    aggrFn: (cell, row, weight, global, panel) => {
      // console.log("aggrFn", row);
      if (cell.building_area) {
        cell.building_area += row.data.properties.building_area;
        // Update existing values
        cell.data.costs.ashp +=
          row.data.properties.ashp_labour + row.data.properties.ashp_material;
        cell.data.costs.pv +=
          row.data.properties.pv_labour + row.data.properties.pv_material;
        cell.data.costs.gshp +=
          row.data.properties.gshp_labour + row.data.properties.gshp_material;
        cell.data.carbon.ashp += row.data.properties.heat_demand;
        cell.data.carbon.pv += row.data.properties.pv_generation;
        cell.data.carbon.gshp += row.data.properties.gshp_size;
      } else {
        cell.building_area = row.data.properties.building_area;
        // Initialize data structure
        cell.data = {
          costs: {
            ashp:
              row.data.properties.ashp_labour +
              row.data.properties.ashp_material,
            pv: row.data.properties.pv_labour + row.data.properties.pv_material,
            gshp:
              row.data.properties.gshp_labour +
              row.data.properties.gshp_material,
          },
          carbon: {
            ashp: row.data.properties.heat_demand,
            pv: row.data.properties.pv_generation,
            gshp: row.data.properties.gshp_size,
          },
        };
      }

      // --- Normalization ---
      // Create arrays for costs and carbon for normalization
      let costsData = Object.entries(cell.data.costs).map(([key, value]) => ({
        key,
        value,
      }));
      let carbonData = Object.entries(cell.data.carbon).map(([key, value]) => ({
        key,
        value,
      }));

      // Normalize costs and carbon data separately
      costsData = normaliseData(costsData, ["value"]);
      carbonData = normaliseData(carbonData, ["value"]);

      // Update cell.data with normalized values
      cell.data.costs = costsData.reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
      }, {});
      cell.data.carbon = carbonData.reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
      }, {});
    },

    postAggrFn: (cells, cellSize, global, panel) => {
      //add cell interaction
      let canvas = d3.select(panel).select("canvas").node();
    },

    preDrawFn: (cells, cellSize, ctx, global, panel) => {
      if (!cells || cells.length === 0) {
        console.error("No cells data available");
        return;
      }

      global.pathGenerator = d3.geoPath().context(ctx);
      global.colourScalePop = d3
        .scaleSequential(d3.interpolateBlues)
        .domain([0, d3.max(cells.map((row) => row.building_area))]);
    },

    drawFn: (cell, x, y, cellSize, ctx, global, panel) => {
      const boundary = cell.getBoundary(0);
      if (boundary[0] != boundary[boundary.length - 1]) {
        boundary.push(boundary[0]);
      }
      const boundaryFeat = turf.polygon([boundary]);

      ctx.beginPath();
      global.pathGenerator(boundaryFeat);
      ctx.fillStyle = global.colourScalePop(cell.building_area);
      ctx.fill();

      //add contour to clicked cells
      if (global.clickedCell == cell) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgb(250,250,250)";
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgb(50,50,50)";
        ctx.stroke();
      }

      //draw a radial glyph -> change the array to real data (between 0 and 1)
      // drawRadialMultivariateGlyph([0.5, 0.1, 0.9, 0.3], x, y, cellSize, ctx);
      let rg = new RadialGlyph([
        cell.data.carbon.ashp,
        cell.data.carbon.pv,
        cell.data.carbon.gshp,
        cell.data.costs.ashp,
        cell.data.costs.pv,
        cell.data.costs.gshp,
      ]);
      rg.draw(ctx, x, y, cellSize / 2);

      // console.log("boundary", boundary);
    },

    postDrawFn: (cells, cellSize, ctx, global, panel) => {},

    tooltipTextFn: (cell) => {
      if (cell) {
        console.log("cell on tooltip", cell);
        setDetailOnDemand(cell.data);
        return `Total Building Area: ${cell.building_area.toFixed(2)} m^2`;
      } else {
        return "no data";
      }
    },
  },
};
// display([...glyphMapSpec2()]);
```

```js
morph_factor; //causes code to run whenever the slider is moved
morphGlyphMap.setGlyph({
  discretiserFn: valueDiscretiser(tweenWGS84Lookup),
});
```

```js
const glyphMapSpecWgs84 = {
  ...glyphMapSpec,
  coordType: "mercator",
  initialBB: turf.bbox(regularGeodataLsoaWgs84),
  getLocationFn: (row) => geographyLsoaWgs84Lookup[row.code]?.centroid,
};
// display(glyphMapSpecWgs84);
```

```js
//morphGlyphMap as a factory function returning an object with setGlyph
function createMorphGlyphMap(width, height) {
  // Create the glyph map instance with the WGS84 specifications
  const glyphMapInstance = glyphMap({
    ...glyphMapSpecWgs84, //takes the base spec...
    width: width,
    height: height,
  });

  return glyphMapInstance;
}
const morphGlyphMap = createMorphGlyphMap(600, 400);
```

```js
// Coordinate transformation utilities
function transformCoordinates(coords) {
  if (coords.length === 4 && !Array.isArray(coords[0])) {
    // bounding box
    return [
      ...proj.toGeo([coords[0], coords[1]]),
      ...proj.toGeo([coords[2], coords[3]]),
    ];
  } else if (Array.isArray(coords[0])) {
    // arrays of coordinates
    return coords.map(transformCoordinates);
  } else {
    // individual coordinate pairs
    return proj.toGeo(coords);
  }
}

function transformGeometry(geometry) {
  if (geometry.type === "GeometryCollection") {
    return {
      ...geometry,
      geometries: geometry.geometries.map(transformGeometry),
    };
  }

  return {
    ...geometry,
    coordinates: transformCoordinates(geometry.coordinates),
  };
}

// Function to apply transformation to geographicShapes
function applyTransformationToShapes(geographicShapes) {
  return Object.fromEntries(
    Object.entries(geographicShapes).map(([code, feature]) => [
      code,
      {
        ...feature,
        geometry: transformGeometry(feature.geometry),
      },
    ])
  );
}

// check to see if it works
// display(transformCoordinates([547764, 180871]));
```

```js
function createGlyphMap(map_aggregate, { width, height }) {
  // console.log(width, height);
  if (map_aggregate == "Building Level") {
    return glyphMap({
      ...glyphMapSpecBasic(width, height),
    });
  } else if (map_aggregate == "LSOA Level") {
    return morphGlyphMap;
  }
}
```
