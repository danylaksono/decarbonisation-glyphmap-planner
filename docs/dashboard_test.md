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
  SummarizeColumn,
  createTableFormat,
} from "./components/input-table/input-table.js";
import {
  inferTypes,
  enrichGeoData,
  normaliseData,
  insideCell,
  debounceInput,
  saveToSession,
  getFromSession,
  transformCoordinates,
  transformGeometry,
  applyTransformationToShapes,
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
// mutable modified timeline
const [timelineModifications, setTimelineModifications] = useState([]); // list of budget allocations
```

```js
// mutable list of budget allocations
const [allocations, setAllocations] = useState([]);
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
                  console.log("Timeline changed", change);
                  setTimelineModifications(change);
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
                <button id="openQuickviewButton" data-show="quickview" class="btn tooltip" data-tooltip="Add New Intervention" aria-label="Add">
                  <i class="fas fa-plus"></i>
                </button>
                ${html`<button class="btn edit tooltip" data-tooltip="Apply Modification" aria-label="Edit"
                  onclick=${(e) => {
                    e.stopPropagation();
                    console.log("Modify intervention ", selectedInterventionIndex);
                    modifyIntervention(selectedInterventionIndex, timelineModifications[selectedInterventionIndex]);
                 }
                }>
                <i class="fas fa-edit" style="color:green;"></i>
              </button>`}
                ${html`<button class="btn erase tooltip" data-tooltip="Remove Intervention" aria-label="Delete"
                  onclick=${(e) => {
                    e.stopPropagation();
                    console.log("Delete intervention ", selectedInterventionIndex);
                    manager.setAutoRun(true).removeIntervention(selectedInterventionIndex);
                    runModel();
                 }
                }>
                <i class="fas fa-trash" style="color:red;"></i>
              </button>`}
              ${html`<button class="btn move-up tooltip" data-tooltip="Move Up" aria-label="Move Up"
                  onclick=${(e) => {
                    e.stopPropagation();
                    reorderIntervention(manager.currentOrder, selectedInterventionIndex, "up");
                    runModel();
                }}>
                <i class="fas fa-arrow-up"></i>
              </button>`}
                ${html`<button class="btn move-down tooltip" data-tooltip="Move Down" aria-label="Move Down"
                  onclick=${(e) => {
                    e.stopPropagation();
                    console.log(manager.currentOrder);
                    reorderIntervention(manager.currentOrder, selectedInterventionIndex, "down");
                    runModel();
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
          <!-- <header class="quickview-header">
            <p class="title">Table View </p>
          </header> -->
          <div class="card-content">
            <div class="content">
            ${Inputs.table(data, 
              {
              columns: tableColumns,
              format: tableFormat,
              layout: "auto",
              })
            }
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
          ${resize((width, height) => createGlyphMap(map_aggregate, {width, height}))}
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

display(html`<p>"Selected Intervention"</p>`);
display(
  selectedInterventionIndex === null
    ? [...buildingsData]
    : interventions[selectedInterventionIndex].intervenedBuildings
);
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
const playButton = html`<button class="btn edit" style="margin-top: 5px;">
  <i class="fas fa-play fa-large"></i>&nbsp;
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
  // if (newValue >= 1 || newValue <= 0) {
  //   direction *= -1;
  //   newValue = Math.max(0, Math.min(1, newValue)); // Clamp value between 0 and 1
  // }
  if (newValue >= 1 || newValue <= 0) {
    newValue = Math.max(0, Math.min(1, newValue)); // Clamp value
    playing = false; // Pause animation
    playButton.innerHTML = '<i class="fas fa-play"></i>'; // Update button
    cancelAnimationFrame(animationFrame);
    return; // Stop animation loop
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
  console.log(
    ">> Reordering intervention...",
    getInterventions[index].interventionId,
    direction
  );
  try {
    // Validate inputs
    if (!Array.isArray(array) || array.length === 0) {
      throw new Error("Invalid intervention array");
    }

    if (index < 0 || index >= array.length) {
      throw new Error("Invalid index for reordering");
    }

    // Check if manager exists and array length matches interventions
    if (manager && array.length !== manager.interventionConfigs.length) {
      throw new Error("Array length doesn't match number of interventions");
    }

    // Perform reordering
    let newArray = [...array]; // Create copy to avoid modifying original
    if (direction === "up" && index > 0) {
      [newArray[index - 1], newArray[index]] = [
        newArray[index],
        newArray[index - 1],
      ];
    } else if (direction === "down" && index < array.length - 1) {
      [newArray[index], newArray[index + 1]] = [
        newArray[index + 1],
        newArray[index],
      ];
    } else {
      throw new Error("Invalid direction or index for reordering");
    }

    // Update manager
    if (manager) {
      if (!manager.setInterventionOrder(newArray)) {
        throw new Error("Failed to update intervention order");
      }
      console.log("Interventions reordered:", newArray);
    }

    return newArray;
  } catch (error) {
    console.error("Reorder failed:", error.message);
    return array; // Return original array if reordering fails
  }
}
```

```js
// update timeline drawing
function updateTimeline() {
  const timelinePanel = document.getElementById("timeline-panel");
  timelinePanel.innerHTML = "";
  timelinePanel.appendChild(
    createTimelineInterface(
      interventions,
      (change) => {
        console.log("timeline change", change);
      },
      (click) => {
        setSelectedInterventionIndex(click);
        console.log("timeline clicked block", interventions[click]);
      },
      450,
      200
    )
  );
}
```

```js
// function to update the selected intervention
function modifyIntervention(index, newConfig) {
  if (!newConfig) {
    console.info("No change detected for intervention", index);
    return;
  }

  console.log(" The new config", index, newConfig);

  // const currentConfig = interventions[index];
  let yearlyBudgets;

  if (newConfig.duration !== newConfig.projectDuration) {
    console.log("Assigning new budget allocations..");

    // calculate yearlyBudgets by creating an array of newConfig.projectDuration length where each item's value is from initialBudget divided by newConfig.projectDuration.
    const initialBudget = newConfig.initialBudget;
    yearlyBudgets = Array(newConfig.duration)
      .fill(initialBudget / newConfig.duration)
      .map((item) => Math.round(item));
  } else {
    yearlyBudgets = newConfig.yearlyBudgets;
  }

  console.log("GIVEN Yearly budgets", yearlyBudgets);

  const modifiedConfig = {
    ...newConfig,
    yearlyBudgets: yearlyBudgets,
    initialYear: newConfig.initialYear,
    tech: newConfig.techName,
    duration: newConfig.projectDuration,
  };

  console.log(">> Modifying intervention.. ", index, modifiedConfig);
  // const newResults = manager.modifyAndRunIntervention(index, modifiedConfig);
  // console.log(" result from modifications", newResults);
  // store to current interventions
  // setInterventions(newResults);
  // const stackedRecap = manager.getStackedResults();
  // setResults(stackedRecap);
  // updateTimeline();
  manager.modifyIntervention(index, modifiedConfig);
  runModel();
  //   const newResults = manager.modifyAndRunIntervention(index, {
  //   yearlyBudgets: [150000, 250000, 300000]
  // });
}
```

<!-- ----------------  D A T A  ---------------- -->

```js
const selectedIntervenedBuildings =
  interventions[selectedInterventionIndex]?.intervenedBuildings;

const flatData = selectedIntervenedBuildings?.map((p) => ({
  ...p,
  ...p.properties,
}));

console.log(">> Intervened buildings", flatData);

const data =
  selectedInterventionIndex === null
    ? stackedRecap?.buildings ?? buildingsData
    : flatData;
console.log(">> DATA DATA DATA", data);
```

```js
// Table Data
const excludedColumns = ["properties", "x", "y"]; // columns to exclude from the table
const customOrder = ["id", "lsoa", "msoa", "isIntervened", "score"]; // custom order for columns
const customOrder2 = ["id", "lsoa", "score"]; // custom order for columns
// const tableColumns = customOrder2;

// const customHeader = {
//   id: createTableHeader(50, 20, "#4a90e2", "id"),
//   lsoa: createTableHeader(50, 20, "#4a90e2", "LSOA"),
//   score: createTableHeader(50, 20, "#4a90e2", "Score"),
// };

const tableColumns = Object.keys(data[0])
  .filter((key) => !excludedColumns.includes(key))
  .sort((a, b) => {
    const indexA = customOrder.indexOf(a);
    const indexB = customOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b); // Sort alphabetically if not in customOrder
    if (indexA === -1) return 1; // Put a after b
    if (indexB === -1) return -1; // Put b after a
    return indexA - indexB; // Sort based on customOrder
  });
console.log(">> Define table columns...", tableColumns);
```

```js
// test table
html`<h1>Summarize</h1>`;
// display(SummarizeColumn(data, "lsoa"));
```

```js
// create a function which return rectangle svg node, given width, height, fill
function createRectangle(width, height, fill) {
  const rect = d3
    .select("body")
    .append("svg")
    .attr("width", width)
    .attr("height", height);
  rect
    .append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", fill);
  return rect;
  // return rect;
}

function createTableHeader(fill, headerText) {
  const header = d3
    .select("body")
    .append("svg")
    .attr("viewBox", "0 0 100 100")
    .attr("preserveAspectRatio", "none")
    .style("width", "100%")
    .style("height", "100%")
    .style("overflow", "visible");

  // Create the rectangle background
  header
    .append("rect")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("fill", fill)
    .style("stroke", "#000")
    .style("stroke-width", "1px");

  // Add centered text
  header
    .append("text")
    .attr("x", "50%")
    .attr("y", "50%")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("fill", "#ffffff")
    .style("font-family", "Arial, sans-serif")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .text(headerText);

  return header;
}
```

```js
const tableFormat = createTableFormat(data);
```

<!-- ---------------- Sortable Table ---------------- -->

```js
console.log(">> Define sortable table columns...");
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
console.log(">> Create sortable table...");
const tableData = null;
// const tableData = selectedIntervention
//   ? stackedResults.buildings
//   : buildingsData;

// const table = new createTable(tableData, cols, (changes) => {
//   console.log("Table changed:", changes);
//   setSelected(changes.selection);
// });
```

<!-- ---------------- Glyph Maps ---------------- -->

```js
console.log(">> Geo-enrichment...");
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
  // buildingsData,
  data,
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
  // buildingsData,
  data,
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
console.log(">> Data processing functions: Regular LSOA...");
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
// Data processing functions
console.log(">> Data processing functions: Cartogram LSOA...");
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
console.log(">> Create lookup tables...");
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
// Flubber interpolations
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
console.log(">> Initialize the GlyphMap Specification...");
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

      canvas.addEventListener("click", function (evt) {
        //check which cell the click was in
        const rect = canvas.getBoundingClientRect();
        let x = evt.clientX - rect.left;
        let y = evt.clientY - rect.top;
        global.clickedCell = null;
        for (let i = 0; i < cells.length; i++)
          if (insideCell(cells[i], x, y)) global.clickedCell = cells[i];
      });
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

      //draw a coloured polygon
      // ctx.beginPath();
      // ctx.rect(0, 0, panel.getWidth(), panel.getHeight());
      // const colour = d3.color("#fff");
      // colour.opacity = morph_factor;
      // ctx.fillStyle = colour;
      // ctx.fill();
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

      ctx.lineWidth = 0.2;
      ctx.strokeStyle = "rgb(7, 77, 255)";
      ctx.stroke();

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
{
  console.log(">> Morphing...", morph_factor);
  morph_factor; //causes code to run whenever the slider is moved
  morphGlyphMap.setGlyph({
    discretiserFn: valueDiscretiser(tweenWGS84Lookup),
    preDrawFn: (cells, cellSize, ctx, global, panel) => {
      //unfortunately need to repeat what's in the base
      global.pathGenerator = d3.geoPath().context(ctx);
      global.colourScalePop = d3
        .scaleSequential(d3.interpolateBlues)
        .domain([0, d3.max(cells.map((row) => row.building_area))]);

      //draw a coloured polygon
      ctx.beginPath();
      ctx.rect(0, 0, panel.getWidth(), panel.getHeight());
      const colour = d3.color("#fff");
      colour.opacity = morph_factor; //morphFactorInput;
      ctx.fillStyle = colour;
      ctx.fill();
    },
  });
}
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
const morphGlyphMap = createMorphGlyphMap(1000, 800);
```

```js
function createGlyphMap(map_aggregate, { width, height }) {
  // console.log(width, height);
  if (map_aggregate == "Building Level") {
    return null; //createLeafletMap(selected, width, height);
  } else if (map_aggregate == "LSOA Level") {
    return morphGlyphMap;
  }
}
```
