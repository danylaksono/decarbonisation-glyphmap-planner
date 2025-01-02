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
console.log(">> Importing libraries...");
const d3 = require("d3", "d3-geo-projection");
const flubber = require("flubber@0.4");

import { require } from "npm:d3-require";
import { Mutable } from "npm:@observablehq/stdlib";
import * as turf from "@turf/turf";
// import { supercluster } from "npm:supercluster";

import * as bulmaToast from "npm:bulma-toast";
import * as bulmaQuickview from "npm:bulma-quickview@2.0.0/dist/js/bulma-quickview.js";

import {
  TimeGlyph,
  GlyphCollection,
} from "./components/glyph-designs/timeGlyph.js";
import { RadialGlyph } from "./components/radialglyph.js";
import {
  glyphMap,
  createDiscretiserValue,
  _drawCellBackground,
} from "./components/gridded-glyphmaps/index.min.js";
import { OSGB } from "./components/osgb/index.js";
import { BudgetAllocator } from "./components/decarb-model/budget-allocator.js";
import {
  InterventionManager,
  MiniDecarbModel,
} from "./components/decarb-model/mini-decarbonisation.js";
import { createTimelineInterface } from "./components/decarb-model/timeline.js";

import { createTable } from "./components/sorterTable.js";
import {
  inferTypes,
  enrichGeoData,
  normaliseData,
  insideCell,
  debounceInput,
  saveToSession,
  getFromSession,
} from "./components/helpers.js";
```

```js
const proj = new OSGB();
```

<script src="https://unpkg.com/supercluster@8.0.0/dist/supercluster.min.js"></script>

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
console.log(">> Loading Data...");
const buildingsData = [...oxford_data];
// const buildingsData = oxford_data.slice(); // copy data
```

```js
// const flatData = buildingsData.map((p) => ({ ...p })); // very slow
// const flatData = buildingsData.map((p) => Object.assign({}, p)); // even slower
const allColumns = Object.keys(buildingsData[0]);
console.log(">>  Loading Data Done");
```

```js
console.log(">> Define and Load boundary data...");
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
```

```js
console.log(">> Getters and Setters...");
const [selected, setSelected] = useState([]); // selected data in table
const [getInterventions, setInterventions] = useState([]); // list of interventions
const [getResults, setResults] = useState([]); // list of results, from running model
const [selectedIntervention, setSelectedIntervention] = useState(null); // selected intervention in timeline
const [selectedInterventionIndex, setSelectedInterventionIndex] =
  useState(null); // selected intervention index
const [detailOnDemand, setDetailOnDemand] = useState(null); // detail on demand on map
const [currentConfig, setCurrentConfig] = useState({}); // current configuration
```

```js
const [allocations, setAllocations] = useState([]); // list of budget allocations
```

<!-------- Stylesheets -------->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.2/css/bulma.min.css">
<link rel="stylesheet" href="./styles/bulma-quickview.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
<link rel="stylesheet" href="./styles/dashboard.css">

<!-- ---------------- HTML Layout ---------------- -->

<div class="grid-container" style="padding:2px; height:100vh;">
  <div id="left-panel" style="overflow-x:hidden; overflow-y:hidden; height:96vh;">
    <div class="left-top">
      <div class="card" style="overflow-y: hidden;">
        <header class="quickview-header">
          <p class="title">Decarbonisation Timeline</p>
        </header>
        <div class="card-content">
          <div class="content">
            <div id="graph-container">
              <div id="timeline-panel">
                ${createTimelineInterface(
                interventions,
                (change) => {
                  console.log("timeline change", change);
                },
                (click) => {
                  setSelectedInterventionIndex(click);
                  console.log("Clicked Interventions", click, interventions[click]);
                },
                450,
                200
              )}
              </div> <!-- timeline panel -->
              <nav id="timeline-buttons">
                <button id="openQuickviewButton" data-show="quickview" class="btn" aria-label="Add">
                  <i class="fas fa-plus"></i>
                </button>
                <button class="btn edit" aria-label="Edit">
                  <i class="fas fa-edit" style="color:green;"></i>
                </button>
                ${html`<button class="btn erase" aria-label="Delete"
                  onclick=${(e) => {
                    e.stopPropagation();
                    console.log("Delete intervention ", selectedInterventionIndex);
                    manager.setAutoRun(true).removeIntervention(selectedInterventionIndex);
                    runModel();
                    //console.log(">>> removed selectedIntervention ID", getResults[selectedIntervention.index].interventionId);
                }}>
                <i class="fas fa-trash" style="color:red;"></i>
              </button>`}
              ${html`<button class="btn move-up" aria-label="Move Up"
                  onclick=${(e) => {
                    e.stopPropagation();
                    //reorderIntervention(interventions, selectedIntervention.index, "up");
                }}>
                <i class="fas fa-arrow-up"></i>
              </button>`}
                ${html`<button class="btn move-down" aria-label="Move Down"
                  onclick=${(e) => {
                    e.stopPropagation();
                    //reorderIntervention(interventions, selectedIntervention.index, "down");
                }}>
                <i class="fas fa-arrow-down"></i>
              </button>`}
              </nav>
            </div> <!-- graph container -->
          </div>
        </div>
      </div> <!-- card -->
    </div> <!-- left top -->
    <div class="left-bottom">
        <div class="card" style="overflow-x:hidden;">
          <header class="quickview-header">
            <p class="title">Table View </p>
          </header>
          <div class="card-content">
            <div class="content">
              <!-- ${table.getNode()} -->
              <!-- <div>No. of intervened buildings: ${JSON.stringify(stackedResults.summary.intervenedCount)}</div> -->
            </div>
          </div>
        </div>
    </div> <!-- left bottom -->
    </div> <!-- left panel -->
  <div id="main-panel">
    <div class="card" style="overflow-x:hidden; overflow-y:hidden; height:96vh;">
      <header class="quickview-header">
        <p class="title">Map View</p>
      </header>
      <div class="card-content">
        <div class="content">
          <!-- ${mapAggregationInput} -->
          ${(map_aggregate == "Building Level") ? ""
            : html`${playButton} ${morphFactorInput}`}
          <!-- ${html`${playButton} ${morphFactorInput}`} -->
          <!-- ${resize((width, height) => createGlyphMap(map_aggregate, {width, height}))} -->
        </div>
      </div>
    </div>
  </div>
</div>

<!-------- MODAL/QVIEW -------->
<div id="quickviewDefault" class="quickview is-left">
  <header class="quickview-header">
    <p class="title">New Budget Allocation</p>
    <span class="delete" data-dismiss="quickview" id="closeQuickviewButton"></span>
  </header>
  <div class="quickview-body">
    <div class="quickview-block">
      <form id="quickviewForm">
        <!-- Technology Selection -->
        <div class="field">
          <label class="label">Technology</label>
          <div class="control">
            <div class="select is-arrowless">
            ${techsInput}
            </div>
          </div>
        </div>
        <!-- Total Budget -->
        <div class="field">
          <label class="label">Total Budget</label>
          <div class="control">
            ${totalBudgetInput}
            <!-- <input id="totalBudgetInput" class="input" type="number" placeholder="Enter total budget" required> -->
          </div>
        </div>
        <!-- Start Year -->
        <div class="field">
          <label class="label">Start Year</label>
          <div class="control">
          ${startYearInput}
            <!-- <input id="startYearInput" class="input" type="number" placeholder="e.g., 2024" required> -->
          </div>
        </div>
        <!-- Project Length -->
        <div class="field">
          <label class="label">Project Length (years)</label>
          <div class="control">
            ${projectLengthInput}
            <!-- <input id="projectLengthInput" class="slider is-fullwidth" type="range" min="1" max="10" step="1" value="5"> -->
            <span id="projectLengthValue">${project_length}</span> years
          </div>
        </div>
        <!-- Budget Allocation Type -->
        <div class="field">
          <label class="label">Budget Allocation Type</label>
          <div class="control">
            ${allocationTypeInput}
            <!-- <label class="radio">
              <input type="radio" name="allocationType" value="linear" checked>
              Linear
            </label>
            <label class="radio">
              <input type="radio" name="allocationType" value="sqrt">
              Sqrt
            </label>
            <label class="radio">
              <input type="radio" name="allocationType" value="exp">
              Exp
            </label>
            <label class="radio">
              <input type="radio" name="allocationType" value="cubic">
              Cubic
            </label> -->
            </div>
          <div class="field">
            ${flipButtonInput}
          </div> <!-- control -->
        </div>
        <!-- visual budget allocator  -->
        <div class="field">
          ${budgetVisualiser}
        </div>
      </form>
    </div>
  </div>
  <footer class="quickview-footer">
    <button class="button is-light" id="cancelButton">Cancel</button>
    <button class="button is-success" id="addInterventionBtn">Add New Intervention</button>
  </footer>
</div>

```js
const openQuickviewButton = document.getElementById("openQuickviewButton");
const closeQuickviewButton = document.getElementById("closeQuickviewButton");
const quickviewDefault = document.getElementById("quickviewDefault");
const cancelButton = document.getElementById("cancelButton");

openQuickviewButton.addEventListener("click", () => {
  quickviewDefault.classList.add("is-active");
});

closeQuickviewButton.addEventListener("click", () => {
  quickviewDefault.classList.remove("is-active");
});

cancelButton.addEventListener("click", () => {
  quickviewDefault.classList.remove("is-active");
});
```

### Interventions

```js
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
```

<!-- ---------------- Intervention Managers ---------------- -->

```js
// --- Define the list of technologies ---
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

// --- Create an InterventionManager instance ---
const manager = new InterventionManager(buildingsData, listOfTech);
```

<!-- ---------------- Input form declarations ---------------- -->

```js
// --- technology ---
const techsInput = Inputs.select(
  ["PV", "ASHP", "GSHP", "Insulation", "Optimise All"],
  {
    // label: html`<b>Technology</b>`,
    value: "ASHP",
    // submit: true,
    // disabled: selectedIntervention ? true : false,
  }
);
// techsInput.style["max-width"] = "300px";
Object.assign(techsInput, {
  oninput: (event) => event.isTrusted && event.stopImmediatePropagation(),
  onchange: (event) => event.currentTarget.dispatchEvent(new Event("input")),
});
const technology = Generators.input(techsInput);
// display(techsInput);
```

```js
// --- total budget ---
const totalBudgetInput = html`<input
  id="totalBudgetInput"
  class="input"
  value="10,000"
  type="text"
  placeholder="Enter total budget"
/>`;
// totalBudgetInput.style["max-width"] = "300px";
Object.assign(totalBudgetInput, {
  oninput: (event) => event.isTrusted && event.stopImmediatePropagation(),
  onchange: (event) => event.currentTarget.dispatchEvent(new Event("input")),
});
const total_budget = Generators.input(totalBudgetInput);
// console.log("totalBudgetInput total: ", total_budget);

totalBudgetInput.addEventListener("input", (event) => {
  // Remove existing formatting
  const value = event.target.value.replace(/,/g, "").replace(/£/g, "");
  // Format the number with commas and add the £ sign
  event.target.value = "£" + value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
});

totalBudgetInput.addEventListener("blur", (event) => {
  // Ensure proper formatting on blur
  const value = event.target.value.replace(/,/g, "").replace(/£/g, "");
  event.target.value = "£" + parseInt(value, 10).toLocaleString();
});

totalBudgetInput.addEventListener("focus", (event) => {
  // Remove formatting to allow direct editing
  event.target.value = event.target.value.replace(/,/g, "").replace(/£/g, "");
});
```

```js
// --- start year ---
const startYearInput = html`<input
  class="input"
  type="number"
  value="2025"
  step="1"
  min="2025"
  max="2080"
  label="Start Year"
/>`;
Object.assign(startYearInput, {
  oninput: (event) => event.isTrusted && event.stopImmediatePropagation(),
  onchange: (event) => event.currentTarget.dispatchEvent(new Event("input")),
});
// console.log("startYearInput.style", startYearInput.columns);
const start_year = Generators.input(startYearInput);
```

```js
// --- project length ---
const projectLengthInput = html`<input
  id="projectLengthInput"
  class="slider is-fullwidth"
  type="range"
  min="1"
  max="10"
  step="1"
  value="5"
/>`;

Object.assign(projectLengthInput, {
  oninput: (event) => event.isTrusted && event.stopImmediatePropagation(),
  onchange: (event) => event.currentTarget.dispatchEvent(new Event("input")),
});
const project_length = Generators.input(projectLengthInput);
```

```js
// --- allocation type ---
const allocationTypeInput = Inputs.radio(["linear", "sqrt", "exp", "cubic"], {
  // label: html`<b>Allocation Type</b>`,
  value: "linear",
});
Object.assign(allocationTypeInput, {
  oninput: (event) => event.isTrusted && event.stopImmediatePropagation(),
  onchange: (event) => event.currentTarget.dispatchEvent(new Event("input")),
});
const allocation_type = Generators.input(allocationTypeInput);
```

```js
// --- building priority ---
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
```

```js
// --- building filter ---
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
```

```js
// --- glyphmap type ---
const glyphmapTypeInput = Inputs.radio(
  ["Interventions", "Decarbonisation Time series"],
  {
    label: "Type of map",
    value: "Interventions",
  }
);
const glyphmapType = Generators.input(glyphmapTypeInput);
```

```js
// --- map aggregation ---
const mapAggregationInput = Inputs.radio(["LSOA Level", "Building Level"], {
  label: "Map Aggregated at",
  value: "LSOA Level",
});
const map_aggregate = Generators.input(mapAggregationInput);
```

```js
// --- morph factor ---
const morphFactorInput = html`<input
  style="width: 100%; max-width:450px;"
  type="range"
  value="0"
  step="0.05"
  min="0"
  max="1"
/>`;
Object.assign(morphFactorInput, {
  // oninput: (event) => event.isTrusted && event.stopImmediatePropagation(),
  onchange: (event) => event.currentTarget.dispatchEvent(new Event("input")),
});
const morph_factor = Generators.input(morphFactorInput);
```

```js
// --- flip button ---
const flipButtonInput = Inputs.toggle({ label: "Flip", value: false });
Object.assign(flipButtonInput, {
  // oninput: (event) => event.isTrusted && event.stopImmediatePropagation(),
  onchange: (event) => event.currentTarget.dispatchEvent(new Event("input")),
});
const flip_budget = Generators.input(flipButtonInput);
```

```js
// --- play button ---
const playButton = html`<button class="btn edit" style="margin-top: 10px;">
  <i class="fas fa-play"></i>&nbsp;
</button>`;
```

```js
// ----------------- QuickView Event Listeners -----------------
const addInterventionBtn = document.getElementById("addInterventionBtn");

// Add New Intervention button logic
addInterventionBtn.addEventListener("click", () => {
  // console.log("Intervention button clicked");

  const formData = {
    id: techsInput.value + "_" + startYearInput.value.toString(),
    initialYear: Number(startYearInput.value),
    rolloverBudget: 0,
    optimizationStrategy: "tech-first",
    tech: techsInput.value,
    priorities: [],
  };

  addNewIntervention(formData);
  quickviewDefault.classList.remove("is-active"); // Close quickview after submission
});
```

```js
const getNumericBudget = (value) => {
  // Remove commas and parse the value as a number
  return parseFloat(value.replace(/,/g, "").replace(/£/g, ""));
};
```

<!--------------- Budget Allocator ---------------->

```js
console.log(">> Budget Allocator...");

// Budget Allocator
const allocator = new BudgetAllocator(
  Number(getNumericBudget(total_budget)),
  Number(start_year),
  Number(project_length)
);

let initialAllocations;
if (allocation_type === "linear") {
  initialAllocations = allocator.allocateLinear();
} else {
  initialAllocations = allocator.allocateCustom(
    allocation_type,
    { exponent: 4 },
    flip_budget
  );
}
```

```js
const budgetVisualiser = allocator.visualise(
  initialAllocations,
  (changes) => {
    // console.log("On Budget Updated", changes);
    setSelected(changes);
  },
  400,
  200
);
```

```js
setSelected(allocator.getAllocations());
```

```js
// ----------------- Assign budget -----------------
{
  allocator;
  // const newAllocation = selected ? selected : allocator.getAllocations();
  // console.log("newAllocation", newAllocation);
  saveToSession("allocations", selected);
}
```

```js
// <!-- dealing with observable input reactivity -->
// two ways Obs input
function set(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  // console.log("input value:", input.value);
}
```

<!-- morph animation logic -->

```js
console.log(">> Morph animation logic...");
let playing = false; // Track play/pause state
let direction = 1; // Controls the animation direction (0 to 1 or 1 to 0)
let animationFrame; // Stores the requestAnimationFrame ID

function animate(currentValue) {
  // Increment or decrement the value
  let newValue = currentValue + 0.01 * direction;

  // Reverse direction if boundaries are reached
  if (newValue >= 1 || newValue <= 0) {
    direction *= -1;
    newValue = Math.max(0, Math.min(1, newValue)); // Clamp value between 0 and 1
  }

  // Update the slider and dispatch the "input" event for reactivity
  set(morphFactorInput, newValue);

  if (playing) {
    animationFrame = requestAnimationFrame(() => animate(newValue)); // Pass the updated value
  }
}

// Button click event listener
playButton.addEventListener("click", () => {
  playing = !playing; // Toggle play/pause state
  playButton.innerHTML = playing
    ? '<i class="fas fa-pause"></i>'
    : '<i class="fas fa-play"></i>';

  if (playing) {
    // Start the animation with the current slider value
    const currentValue = parseFloat(morphFactorInput.value);
    requestAnimationFrame(() => animate(currentValue));
  } else {
    cancelAnimationFrame(animationFrame); // Stop the animation
  }
});
```

<!-- ---------------- Functions ---------------- -->

<!-- Intervention functions -->

```js
// Handle form submission: add new intervention
function addNewIntervention(data) {
  // console.log(Date.now(), "Checking allocations now:", allocations);
  const currentAllocation = getFromSession("allocations");

  const yearlyBudgets = currentAllocation.map((item) => item.budget);

  const newConfig = {
    ...data,
    yearlyBudgets: yearlyBudgets,
  };
  console.log(">> CONFIG from session", newConfig);

  // add the new intervention to the model
  manager.addIntervention(newConfig);

  // run the model
  runModel();
}
```

```js
// This updates the stored interventions
const interventions = getInterventions;
console.log(">> Interventions", interventions);
```

```js
const stackedRecap = getResults;
```

```js
// function to run the model
function runModel() {
  console.log(">>>> Running the decarbonisation model...");
  const recaps = manager.runInterventions();
  const formatRecaps = recaps.map((r) => {
    return {
      ...r,
      interventionId: r.modelId,
      initialYear: Number(Object.keys(r.yearlyStats)[0]), // first year in the array
      tech: r.techName,
      duration: r.projectDuration,
    };
  });

  // store to current interventions
  setInterventions(formatRecaps);
  const stackedRecap = manager.getStackedResults();
  setResults(stackedRecap);
}
```

```js
// Reorder intervention
function reorderIntervention(array, index, direction) {
  if (direction === "up" && index > 0) {
    // Swap with the previous item
    [array[index - 1], array[index]] = [array[index], array[index - 1]];
  } else if (direction === "down" && index < array.length - 1) {
    // Swap with the next item
    [array[index], array[index + 1]] = [array[index + 1], array[index]];
  }
  console.log("Interventions reordered:", array);
  // updateTimeline();

  // Update the InterventionManager with the new order
  if (manager) {
    manager.setInterventionOrder(array); // Pass the new order to the manager
  }

  return array;
}

// remove intervention
// function removeIntervention(index) {
//   if (index >= 0 && index < interventions.length) {
//     setInterventions(interventions.filter((_, i) => i !== index));

//     // when intervention is removed, remove the corresponding results
//     setResults(results.filter((_, i) => i !== index));
//     // updateTimeline();
//   } else {
//     console.log("Invalid index.");
//   }
// }
```
