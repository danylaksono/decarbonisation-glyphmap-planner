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
import * as bulmaToast from "npm:bulma-toast";
import * as bulmaQuickview from "npm:bulma-quickview@2.0.0/dist/js/bulma-quickview.js";

import { sorterTable } from "./components/sorterTableClass.js";
import {
  TimeGlyph,
  GlyphCollection,
} from "./components/glyph-designs/timeGlyph.js";
import { StreamGraphGlyph } from "./components/glyph-designs/mirrorTimeGlyph.js";
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
import { LeafletMap } from "./components/leaflet/leaflet-map.js";

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
  normalisebyGroup,
  aggregateValues,
  // applyTransformationToShapes,
} from "./components/helpers.js";
```

```js
const proj = new OSGB();
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
    "Domestic Insulation Potential_EPC Rating" AS EPC_rating,
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
const [tableFiltered, setTableFiltered] = useState(null); // filtered table
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
              <!-- ${ObsTable} -->
              ${table.getNode()}
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
          ${mapAggregationInput}
          ${(map_aggregate === "Building Level") ? toggleGridmaps : ""}
          ${(map_aggregate === "LSOA Level") ? html`${playButton} ${morphFactorInput}` : ""}
          <!-- ${html`${playButton} ${morphFactorInput}`} -->
          ${resize((width, height) => createGlyphMap(map_aggregate, width, height))}
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
          <label class="label">Total Budget (in thousand £)</label>
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
display(html`<p>"DATA DATA DATA"</p>`);
display(data);
// --- Analyze Stacked Results ---
display(html`<p>"Stacked Recap.Summary:"</p>`);
display(stackedRecap.summary);

display(html`<p>"Stacked Recap.YearlySummary:"</p>`);
display(stackedRecap.yearlySummary);

display(html`<p>"Stacked Recap.Buildings:"</p>`);
display(stackedRecap.buildings);

display(html`<p>"Stacked Recap.IntervenedBuildings:"</p>`);
display(stackedRecap.intervenedBuildings);

display(html`<p>"List of Intervention Results recap:"</p>`);
display(stackedRecap.recap);

display(html`<p>"Selected Intervention"</p>`);
display(
  selectedInterventionIndex === null
    ? [...buildingsData]
    : interventions[selectedInterventionIndex].intervenedBuildings
);
```

```js
display(html`<p>"Grouped Intervention"</p>`);
const groupedData = MiniDecarbModel.group(data, ["lsoa", "interventionYear"]);
display(groupedData);
```

```js
display(html`<p>"Transformed Grouped Intervention"</p>`);
const timelineDataArray = [
  "interventionCost",
  "carbonSaved",
  "numInterventions",
];

const transformedGroupedData = transformInterventionData(
  groupedData,
  "E01035740",
  timelineDataArray
);
display(transformedGroupedData);
```

```js
function transformInterventionData(data, lsoaCode, fields) {
  // Get the specific LSOA data
  const lsoaData = data[lsoaCode];
  if (!lsoaData?.children) {
    return [];
  }

  // Transform the data
  return Object.entries(lsoaData.children).map(([year, interventions]) => {
    // Initialize yearData with the year
    const yearData = { year };

    // Initialize selected fields with 0
    fields.forEach((field) => {
      yearData[field] = 0;
    });

    // Aggregate data from all interventions in the year
    interventions.forEach((intervention) => {
      // console.log(">>> transforming interventions", intervention);
      if (intervention) {
        fields.forEach((field) => {
          if (intervention[field] !== undefined) {
            yearData[field] += intervention[field];
          }
        });
      }
    });

    // round all numerical values to 2 decimal places
    Object.keys(yearData).forEach((key) => {
      if (typeof yearData[key] === "number") {
        yearData[key] = Math.round(yearData[key] * 100) / 100;
      }
    });

    return yearData;
  });
}
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
  // Insulation: {
  //   name: "Insulation",
  //   config: {
  //     suitabilityKey: "insulation_rating",
  //     labourKey: "insulation_cwall_labour",
  //     materialKey: "insulation_cwall_materials",
  //     savingsKey: "insulation_cwall",
  //   },
  // },
};

// --- Create an InterventionManager instance ---
const manager = new InterventionManager(buildingsData, listOfTech);
```

<!-- ---------------- Input form declarations ---------------- -->

```js
// --- technology ---
const techsInput = Inputs.select(["PV", "ASHP", "GSHP", "Optimise All"], {
  // label: html`<b>Technology</b>`,
  value: "ASHP",
  // submit: true,
  // disabled: selectedIntervention ? true : false,
});
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
  value="100"
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
const mapAggregationInput = Inputs.radio(
  ["LA Level", "LSOA Level", "Building Level"],
  {
    label: "Level of Detail",
    value: "LSOA Level",
  }
);
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
// toggle between raw building data and gridded glyphmaps
const toggleGridmaps = Inputs.toggle({ label: "Gridmaps?", value: false });
const toggle_grids = Generators.input(toggleGridmaps);
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
  // console.log("getNumericBudget", value);
  // Remove commas and parse the value as a number
  let budget = parseFloat(value.replace(/,/g, "").replace(/£/g, ""));
  // console.log("budget in billions", budget * 1e6);
  return budget * 1000;
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
// console.log(">> DATA DATA DATA", data);
```

```js
// Table Data
const excludedColumns = ["properties", "x", "y", "score"]; // columns to exclude from the table
const customOrder = [
  { column: "id", unique: true },
  "lsoa",
  "msoa",
  // ...(isIntervened ? ["isIntervened"] : []),
  "EPC_rating",
];

// const customOrder2 = ["id", "lsoa", "score"]; // custom order for columns
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
// console.log(">> Define table columns...", tableColumns);
```

```js
function tableChanged(event) {
  console.log("Table changed:", event);

  if (event.type === "filter") {
    console.log("Filtered indices:", event.indeces);
    console.log("Filter rule:", event.rule);

    setTableFiltered(event.indeces);
  }

  if (event.type === "sort") {
    console.log("Sorted indices:", event.indeces);
    console.log("Sort criteria:", event.sort);
  }

  if (event.type === "selection") {
    console.log("Selected rows:", event.selection);
    setSelected(event.selection);
    console.log("Selection rule:", event.rule);
  }
}
```

```js
const tableFilteredData = tableFiltered.map((index) => {
  return table.data[index];
});

console.log("Filtered data:", tableFilteredData);
```

```js
// Define cell renderers
// const cellRenderers = {
//   pv_generation: (value, rowData) => {
//     const max = d3.max(data, (d) => d.pv_generation); // Calculate max dynamically
//     return sparkbar(max, colorScale)(value, rowData); // Call sparkbar with calculated max
//   },
//   ashp_size: (data) => {
//     const span = document.createElement("span");
//     span.innerText = data >= 180 ? "More" : "Less";
//     return span;
//   },
// };
```

```js
// test table
const table = new sorterTable(data, customOrder, tableChanged, {
  height: "300px",
});
```

```js
// display(table.getNode());
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
// const tableFormat = createTableFormat(data);
```

```js
// const ObsTable = Inputs.table(data, {
//   columns: tableColumns,
//   format: tableFormat,
//   layout: "auto",
// });
// // Object.assign(ObsTable, {
// //   oninput: (event) => event.isTrusted && event.stopImmediatePropagation(),
// //   onchange: (event) => event.currentTarget.dispatchEvent(new Event("input")),
// // });

// // Listening to change events
// ObsTable.addEventListener("change", (event) => {
//   console.log("Table changed:", event); // Access the event target
// });
// const selectedRow = Generators.input(ObsTable);
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

// define the aggregation function for each column
// const aggregations = {
//   building_area: "sum",
//   ashp_labour: "sum",
//   ashp_material: "sum",
//   pv_labour: "sum",
//   pv_material: "sum",
//   gshp_labour: "sum",
//   gshp_material: "sum",
//   gshp_size: "sum",
//   heat_demand: "sum", // type inferrence need to deal with some nullish values
//   pv_generation: "sum", // type inferrence need to deal with some nullish values
//   ashp_suitability: "count",
//   pv_suitability: "count",
//   gshp_suitability: "count",
// };

// dum
const aggregations = {
  // "id": 200004687243,
  isIntervened: "count",
  interventionYear: "sum",
  interventionCost: "sum",
  carbonSaved: "sum",
  // "score": 21179,
  numInterventions: "sum",
  interventionTechs: "count",
  // // "lsoa": "E01028540",
  // // "msoa": "E02005945",
  // "x": -1.22156225350691,
  // "y": 51.7575669032743,
  building_area: "sum",
  garden_area: "sum",
  ashp_suitability: "count",
  ashp_size: "sum",
  ashp_labour: "sum",
  ashp_material: "sum",
  ashp_total: "sum",
  gshp_suitability: "count",
  gshp_size: "sum",
  gshp_labour: "sum",
  gshp_material: "sum",
  gshp_total: "sum",
  heat_demand: "sum",
  insulation_rating: "count",
  insulation_cwall: "count",
  insulation_cwall_labour: "sum",
  insulation_cwall_materials: "sum",
  insulation_cwall_total: "sum",
  insulation_ewall: "count",
  insulation_ewall_labour: "sum",
  insulation_ewall_materials: "sum",
  insulation_ewall_total: "sum",
  insulation_roof: "count",
  insulation_roof_labour: "sum",
  insulation_roof_materials: "sum",
  insulation_roof_total: "sum",
  insulation_floor: "count",
  insulation_floor_labour: "sum",
  insulation_floor_materials: "sum",
  insulation_floor_total: "sum",
  pv_suitability: "count",
  pv_size: "sum",
  pv_generation: "sum",
  pv_labour: "sum",
  pv_material: "sum",
  pv_total: "sum",
  // substation_name: "count",
  substation_capacity_rating: "sum",
  substation_peakload: "sum",
  substation_headroom: "sum",
  substation_headroom_pct: "sum",
  substation_demand: "count",
  deprivation_score: "sum",
  deprivation_rank: "sum",
  deprivation_decile: "sum",
  fuel_poverty_households: "sum",
  fuel_poverty_proportion: "sum",
};

const regular_geodata_withproperties = enrichGeoData(
  // buildingsData,
  data,
  regular_geodata,
  "lsoa",
  "code",
  aggregations
);

console.log(
  "regular_geodata_withproperties_enriched",
  regular_geodata_withproperties
);

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
// this is already aggregated by LSOA in EnrichGeoData
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
console.log(">>> Keydata", keydata);

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
const glyphVariables = [
  "ashp_suitability",
  "ashp_size",
  "ashp_total",
  "gshp_suitability",
  "gshp_size",
  "gshp_total",
  "pv_suitability",
  "pv_generation",
  "pv_total",
];
const glyphColours = [
  // ashp = bluish
  "#1E90FF", // ashp_suitability: DodgerBlue
  "#4682B4", // ashp_size: SteelBlue
  "#5F9EA0", // ashp_total: CadetBlue

  // gshp = orangeish
  "#FFA500", // gshp_suitability: Orange
  "#FF8C00", // gshp_size: DarkOrange
  "#FFD700", // gshp_total: Gold

  // pv = greenish
  "#32CD32", // pv_suitability: LimeGreen
  "#228B22", // pv_generation: ForestGreen
  "#006400", // pv_total: DarkGreen
];

const timelineVariables = [
  "interventionCost",
  "carbonSaved",
  "numInterventions",
  "interventionTechs",
];
const timelineColours = [
  "#000000", // interventionCost: Black
  "#0000FF", // carbonSaved: Blue
  "#00FF00", // numInterventions: Green
  "#FF0000", // interventionTechs: Red
];
```

```js
console.log(">> Initialize the GlyphMap Specification...");
// console.log("Sample x y from Data in Glyph", [data[0].x, data[0].y]);
function glyphMapSpec(width = 800, height = 600) {
  // const glyphMapSpec = {
  return {
    coordType: map_aggregate == "Building Level" ? "mercator" : "notmercator",
    initialBB: transformCoordinates(turf.bbox(regular_geodata)),
    // if map_aggregate == "Building Level", use Individual data. otherwise use Aggregated data
    data:
      map_aggregate === "Building Level"
        ? Object.values(data)
        : Object.values(keydata),
    getLocationFn: (row) =>
      map_aggregate == "Building Level"
        ? [row.x, row.y] // from individual building data
        : regularGeodataLookup[row.code]?.centroid, // aggregated LSOA's centroid
    discretisationShape: "grid",
    interactiveCellSize: true,
    interactiveZoomPan: true,
    mapType: "CartoPositron",
    cellSize: 50,

    width: width || 800,
    height: height || 600,

    customMap: {
      scaleParams: [],

      initFn: (cells, cellSize, global, panel) => {
        // console.log("initFn", cells, cellSize, global, panel);
      },

      preAggrFn: (cells, cellSize, global, panel) => {
        // console.log("preaggregate cells", cells);
      },

      aggrFn: (cell, row, weight, global, panel) => {
        // console.log("  >> Data aggregation in GlyphMap...", row);
        if (!cell.records) cell.records = []; //if the cell doesn't currently have a records property, make one
        cell.records.push(row);

        // aggregate data into cell.data
      },

      postAggrFn: (cells, cellSize, global, panel) => {
        // data normalisation
        // const normalData = normaliseData(cells, glyphVariables);

        for (const cell of cells) {
          cell.data = {};

          if (cell.records && map_aggregate === "LSOA Level") {
            cell.data = transformInterventionData(
              groupedData,
              cell.records[0].code,
              timelineDataArray
            );
          } else if (cell.records && map_aggregate === "Building Level") {
            // aggregate data for each cell
            cell.data = aggregateValues(cell.records, glyphVariables, "sum");
          } else {
            cell.data = {};
          }
        }

        // Normalisation
        const dataArray = cells.map((cell) => cell.data);
        const normalisedData = normaliseData(dataArray, glyphVariables);
        // Map normalized data back to cells
        const normalisedCells = cells.map((cell, index) => ({
          ...cell,
          data: normalisedData[index],
        }));

        // transformInterventionData

        // Update cells with normalized data
        cells.forEach((cell, index) => {
          cell.data = normalisedData[index];
        });
        // console.log(">>>> cells data ", normalisedCells);

        // Prepare cell interaction
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
        global.colourScalePop = "#cccccc";
        // global.colourScalePop = d3
        //   .scaleSequential(d3.interpolateBlues)
        //   .domain([0, 1]);
        // .domain([0, d3.max(cells.map((row) => row.building_area))]);
      },

      drawFn: (cell, x, y, cellSize, ctx, global, panel) => {
        const cellData = cell.records[0].data?.properties
          ? cell.records[0].data.properties
          : cell.data; // when map_aggregate == "Building Level", use individual data

        // console.log("cell data to draw >>>", cellData);
        let timeData = cell.data[0];
        // console.log("timeData", timeData);

        const boundary = cell.getBoundary(0);
        if (boundary[0] != boundary[boundary.length - 1]) {
          boundary.push(boundary[0]);
        }
        const boundaryFeat = turf.polygon([boundary]);

        ctx.beginPath();
        global.pathGenerator(boundaryFeat);
        ctx.fillStyle = "#efefef";
        // ctx.fillStyle = global.colourScalePop(cell.building_area);
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

        // if (map_aggregate === "Building Level") {
        //   let rg = new RadialGlyph(
        //     glyphVariables.map((key) => cellData[key]),
        //     glyphColours
        //   );
        //   rg.draw(ctx, x, y, cellSize / 2);
        // } else if (map_aggregate === "LSOA Level") {
        //   console.log;
        //   // format config for streamgraph
        //   let customConfig = {
        //     upwardKeys: ["carbonSaved"],
        //     downwardKeys: ["interventionCost"],
        //   };

        //   let tg = new StreamGraphGlyph(timeData, "year", null, customConfig);
        //   tg.draw(ctx, x, y, cellSize / 2);
        // }
        // console.log(
        //   "Drawn in order >>>",
        //   glyphVariables.map((key) => cellData[key])
        // );
        let rg = new RadialGlyph(
          glyphVariables.map((key) => cellData[key]),
          glyphColours
        );
        rg.draw(ctx, x, y, cellSize / 2);
      },

      postDrawFn: (cells, cellSize, ctx, global, panel) => {},

      tooltipTextFn: (cell) => {
        if (cell) {
          console.log("cell on tooltip", cell.data);
          // console.log("cell on tooltip", cell.records[0].code);
          // setDetailOnDemand(cell.data);
          // return cell.data.ashp_total;
          return glyphVariables
            .map((key) => {
              const label = key.replace(/_/g, " ").toUpperCase();
              const value = cell.data[key].toFixed(2);
              return `<div class="tooltip-row">
                <span class="label">${label}:</span>
                <span class="value">${value}</span>
              </div>`;
            })
            .join("");
          // return `Total Building Area: ${cell.building_area.toFixed(2)} m^2`;
        } else {
          return "no data";
        }
      },
    },
  };
}
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
// extend the glyphMapSpec
const glyphMapSpecWgs84 = {
  ...glyphMapSpec(),
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
function createGlyphMap(map_aggregate, width, height) {
  // console.log(width, height);
  if (map_aggregate == "Building Level") {
    if (toggle_grids) {
      return glyphMap({
        ...glyphMapSpec(width, height),
      });
    } else {
      return createLeafletMap(data, width, height).leafletContainer;
    }
  } else if (map_aggregate == "LSOA Level") {
    return morphGlyphMap;
  } else if (map_aggregate == "LA Level") {
    try {
      return createOverallPlot(yearlySummaryArray);
    } catch (error) {
      // console.error("Error in createOverallPlot:", error);
      return {};
    }
  }
}
```

```js
function interactiveDrawFn(mode) {
  return function drawFn(cell, x, y, cellSize, ctx, global, panel) {
    if (!cell) return;
    const padding = 2;

    ctx.globalAlpha = 1;
  };
}
```

```js
{
  // glyphMode;
  // decarbonisationGlyph.setGlyph({
  //   drawFn: interactiveDrawFn(glyphMode),
  // });
}
```

```js
// Leaflet map
function createLeafletMap(data, width, height) {
  const leafletContainer = document.createElement("div");
  document.body.appendChild(leafletContainer);

  // console.log(">> Create Leaflet Map with... ", width, height);

  const mapInstance = new LeafletMap(leafletContainer, {
    width: width,
    height: height || "600px",
    tooltipFormatter: (props) => `<strong>${props.id}</strong>`,
  });

  mapInstance.addLayer("buildings", data, {
    clusterRadius: 50,
    fitBounds: true,
  });

  mapInstance.addGeoJSONLayer("LSOA Boundary", lsoa_boundary, {
    style: {
      color: "#f7a55e",
      weight: 2,
      opacity: 0.65,
    },
    onEachFeature: (feature, layer) => {
      layer.bindPopup(feature.properties.LSOA21NM);
    },
  });

  return { leafletContainer, mapInstance };
}

// display(leafletContainer);
```

<!-- ----------------  Link Table to Leaflet Map  ---------------- -->

```js
// get last element of the selectedRow if more than one columns are selected,
// else return the first element
function getSelectedRow() {
  if (selectedRow.length > 1) {
    return selectedRow[selectedRow.length - 1];
  } else {
    return selectedRow[0];
  }
}

// if (selectedRow) {
//   await mapInstance.flyTo({
//     x: getSelectedRow().x,
//     y: getSelectedRow().y,
//   });
// } else {
//   console.log("No selected row");
//   mapInstance.zoomtoDataBounds();
// }

// display([getSelectedRow().x, getSelectedRow().y]);
```

<!-- ----------------  Main Plot  ---------------- -->

```js
selectedInterventionIndex;
// Step 1: Transform recap object into an array for easier processing
const yearlySummaryArray = stackedRecap.yearlySummary
  ? Object.entries(stackedRecap.yearlySummary).map(([year, values]) => ({
      year: Number(year),
      ...values,
    }))
  : null;

// Step 2: Normalize the data
let keysToNormalise = [
  "budgetSpent",
  "buildingsIntervened",
  "totalCarbonSaved",
];
// const normalisedYearlyRecap = normaliseData(
//   yearlySummaryArray,
//   keysToNormalise
// );
// console.log(">> Normalised Recap", normalisedYearlyRecap);
```

```js
function createOverallPlot(data, width = 900, height = 600) {
  const margin = { top: 30, right: 150, bottom: 120, left: 80 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Create container with message styling
  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.justifyContent = "center";
  container.style.fontFamily = "Arial, sans-serif";
  container.style.fontSize = "16px";
  container.style.color = "#666";

  // Comprehensive data validation
  if (!data) {
    container.textContent = "Please provide intervention data";
    return container;
  }

  if (!Array.isArray(data)) {
    container.textContent = "Data must be an array";
    return container;
  }

  if (data.length === 0) {
    container.textContent = "Please add intervention data to start";
    return container;
  }

  // Check if data has required properties
  const requiredFields = [
    "year",
    "budgetSpent",
    "buildingsIntervened",
    "totalCarbonSaved",
  ];
  const invalidItems = data.filter(
    (item) =>
      !item ||
      typeof item !== "object" ||
      !requiredFields.every((field) => {
        if (field === "year") {
          return Number.isInteger(item[field]);
        }
        return typeof item[field] === "number" && !isNaN(item[field]);
      })
  );

  if (invalidItems.length > 0) {
    container.textContent =
      "Invalid data format. Each data point must include: year (integer), budgetSpent (number), buildingsIntervened (number), and totalCarbonSaved (number)";
    return container;
  }

  // Clear container styles used for error messages
  container.style.display = "block";
  container.style.alignItems = "";
  container.style.justifyContent = "";
  container.style.fontFamily = "";
  container.style.fontSize = "";
  container.style.color = "";

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const chart = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const years = [...new Set(data.map((d) => d.year))].sort((a, b) => a - b);

  const longData = data.flatMap((d) => [
    { year: d.year, value: d.budgetSpent, category: "Budget Spent" },
    {
      year: d.year,
      value: d.buildingsIntervened,
      category: "Buildings Intervened",
    },
    { year: d.year, value: d.totalCarbonSaved, category: "Total Carbon Saved" },
  ]);

  const stackedMaxValue = data.reduce(
    (max, d) => Math.max(max, d.budgetSpent + d.totalCarbonSaved),
    0
  );

  const maxBuildingsIntervened = d3.max(data, (d) => d.buildingsIntervened);

  const xScale = d3
    .scaleBand()
    .domain(years)
    .range([0, innerWidth])
    .padding(0.1);

  const yScale = d3
    .scaleLinear()
    .domain([0, stackedMaxValue * 1.1])
    .range([innerHeight, 0]);

  const yScaleRight = d3
    .scaleLinear()
    .domain([0, maxBuildingsIntervened * 1.1])
    .range([innerHeight, 0]);

  const colorScale = d3
    .scaleOrdinal()
    .domain(["Budget Spent", "Buildings Intervened", "Total Carbon Saved"])
    .range([
      "#2C699A", // Darker blue for budget
      "#E63946", // Bright red for buildings line
      "#2D936C", // Forest green for carbon savings
    ]);

  const stack = d3
    .stack()
    .keys(["Budget Spent", "Total Carbon Saved"])
    .value((group, key) => group.find((d) => d.category === key)?.value || 0);

  // Group data safely
  const groupedData = Array.from(
    d3.group(longData, (d) => d.year),
    ([key, value]) => value
  );
  const stackedData = stack(groupedData);

  const area = d3
    .area()
    .x((d, i) => xScale(years[i]) + xScale.bandwidth() / 2)
    .y0((d) => yScale(d[0]))
    .y1((d) => yScale(d[1]))
    .curve(d3.curveMonotoneX);

  // Add areas
  chart
    .selectAll(".area")
    .data(stackedData)
    .join("path")
    .attr("class", "area")
    .attr("fill", (d) => colorScale(d.key))
    .attr("d", area)
    .attr("opacity", 0.8);

  // Add line
  const line = d3
    .line()
    .x((d) => xScale(d.year) + xScale.bandwidth() / 2)
    .y((d) => yScaleRight(d.buildingsIntervened))
    .curve(d3.curveMonotoneX);

  chart
    .append("path")
    .datum(data)
    .attr("class", "line")
    .attr("fill", "none")
    .attr("stroke", colorScale("Buildings Intervened"))
    .attr("stroke-width", 3.5)
    .attr("opacity", 0.9)
    .attr("d", line)
    .raise();

  // Add axes
  chart
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format("d")))
    .selectAll("text")
    .style("text-anchor", "middle");

  chart
    .append("g")
    .call(d3.axisLeft(yScale))
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -60)
    .attr("x", -innerHeight / 2)
    .attr("fill", "black")
    .attr("text-anchor", "middle")
    .text("Budget & Carbon Saved");

  chart
    .append("g")
    .attr("transform", `translate(${innerWidth}, 0)`)
    .call(d3.axisRight(yScaleRight))
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 50)
    .attr("x", -innerHeight / 2)
    .attr("fill", "black")
    .attr("text-anchor", "middle")
    .text("Buildings Intervened");

  // Add tooltip
  const tooltip = d3
    .select(container)
    .append("div")
    .style("position", "absolute")
    .style("visibility", "hidden")
    .style("background", "rgba(255, 255, 255, 0.9)")
    .style("border", "1px solid #ddd")
    .style("color", "#333")
    .style("padding", "8px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("box-shadow", "2px 2px 6px rgba(0, 0, 0, 0.1)");

  // Add invisible overlay for tooltip
  const overlay = chart.append("g").attr("class", "overlay");

  overlay
    .selectAll("rect")
    .data(years)
    .join("rect")
    .attr("x", (d) => xScale(d))
    .attr("y", 0)
    .attr("width", xScale.bandwidth())
    .attr("height", innerHeight)
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .on("mousemove", function (event, year) {
      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const yearData = data.find((d) => d.year === year);

      if (yearData) {
        tooltip
          .style("visibility", "visible")
          .style("left", `${mouseX + margin.left - 100}px`)
          .style("top", `${mouseY - 80}px`).html(`
            <strong>Year:</strong> ${year}<br>
            <span style="color: ${colorScale(
              "Budget Spent"
            )}"><strong>Budget Spent:</strong> ${yearData.budgetSpent.toFixed(
          2
        )}</span><br>
            <span style="color: ${colorScale(
              "Total Carbon Saved"
            )}"><strong>Carbon Saved:</strong> ${yearData.totalCarbonSaved.toFixed(
          2
        )}</span><br>
            <span style="color: ${colorScale(
              "Buildings Intervened"
            )}"><strong>Buildings:</strong> ${
          yearData.buildingsIntervened
        }</span>
          `);
      }
    })
    .on("mouseout", function () {
      tooltip.style("visibility", "hidden");
    });

  // Add legend
  const legend = svg
    .append("g")
    .attr(
      "transform",
      `translate(${margin.left}, ${height - margin.bottom + 50})`
    );

  const legendSpacing = innerWidth / 3;

  legend
    .selectAll("rect")
    .data(colorScale.domain())
    .join("rect")
    .attr("x", (d, i) => i * legendSpacing)
    .attr("y", 0)
    .attr("width", 15)
    .attr("height", 15)
    .attr("fill", (d) => colorScale(d));

  legend
    .selectAll("text")
    .data(colorScale.domain())
    .join("text")
    .attr("x", (d, i) => i * legendSpacing + 20)
    .attr("y", 12)
    .text((d) => d)
    .style("font-size", "12px");

  return container;
}

// function createOverallPlot(data, width = 900, height = 600) {
//   // Set up margins and dimensions
//   const margin = { top: 20, right: 150, bottom: 60, left: 60 };
//   const innerWidth = width - margin.left - margin.right;
//   const innerHeight = height - margin.top - margin.bottom;

//   // Create a div container for the chart
//   const container = document.createElement("div");
//   container.style.position = "relative";
//   container.style.width = `${width}px`;
//   container.style.height = `${height}px`;

//   if (data == null) {
//     return "add intervention to start";
//   }

//   // Create SVG container
//   const svg = d3
//     .select(container)
//     .append("svg")
//     .attr("width", width)
//     .attr("height", height);

//   const chart = svg
//     .append("g")
//     .attr("transform", `translate(${margin.left},${margin.top})`);

//   // Extract unique years
//   const years = [...new Set(data.map((d) => d.year))];

//   // Flatten data into a long format for stacking
//   const longData = data.flatMap((d) => [
//     { year: d.year, value: d.budgetSpent, category: "Budget Spent" },
//     {
//       year: d.year,
//       value: d.buildingsIntervened,
//       category: "Buildings Intervened",
//     },
//     { year: d.year, value: d.totalCarbonSaved, category: "Total Carbon Saved" },
//   ]);

//   // Calculate the maximum value from the data
//   const maxValue = d3.max(longData, (d) => d.value);

//   // Define scales
//   const xScale = d3
//     .scaleBand()
//     .domain(years)
//     .range([0, innerWidth])
//     .padding(0.1);

//   const yScale = d3
//     .scaleLinear()
//     .domain([0, maxValue]) // Adjust domain based on data
//     .range([innerHeight, 0]);

//   const colorScale = d3
//     .scaleOrdinal()
//     .domain(["Budget Spent", "Buildings Intervened", "Total Carbon Saved"])
//     .range(["#4C78A8", "#F58518", "#E45756"]);

//   // Group data by category
//   const stack = d3
//     .stack()
//     .keys(["Budget Spent", "Buildings Intervened", "Total Carbon Saved"])
//     .value((group, key) => group.find((d) => d.category === key)?.value || 0);

//   const stackedData = stack(d3.group(longData, (d) => d.year).values());

//   // Define area generator
//   const area = d3
//     .area()
//     .x((d, i) => xScale(years[i]) + xScale.bandwidth() / 2)
//     .y0((d) => yScale(d[0]))
//     .y1((d) => yScale(d[1]))
//     .curve(d3.curveMonotoneX);

//   // Add x-axis
//   chart
//     .append("g")
//     .attr("transform", `translate(0,${innerHeight})`)
//     .call(d3.axisBottom(xScale).tickFormat(d3.format("d")))
//     .selectAll("text")
//     .style("text-anchor", "middle");

//   // Add y-axis
//   chart.append("g").call(d3.axisLeft(yScale));

//   // Add areas
//   chart
//     .selectAll(".area")
//     .data(stackedData)
//     .join("path")
//     .attr("class", "area")
//     .attr("fill", (d) => colorScale(d.key))
//     .attr("d", area);

//   // Add tooltips
//   const tooltip = d3
//     .select(container)
//     .append("div")
//     .style("position", "absolute")
//     .style("visibility", "hidden")
//     .style("background", "rgba(169, 151, 151, 0.7)")
//     .style("color", "#fff")
//     .style("padding", "5px")
//     .style("border-radius", "4px")
//     .style("font-size", "12px");

//   chart
//     .selectAll(".area")
//     .on("mousemove", function (event, d) {
//       const [x] = d3.pointer(event, this); // Get x position
//       const yearIndex = Math.floor((x / innerWidth) * years.length); // Calculate year index
//       const year = years[yearIndex]; // Get year from index

//       if (yearIndex >= 0 && yearIndex < d.length) {
//         const segment = d[yearIndex]; // Get the stack segment for the year
//         const category = d.key; // Get the category (e.g., "Budget Spent")
//         const value = segment[1] - segment[0]; // Calculate value from stacked data

//         tooltip
//           .html(
//             `<strong>Year:</strong> ${year}<br><strong>Category:</strong> ${category}<br><strong>Value:</strong> ${value.toFixed(
//               2
//             )}`
//           )
//           .style("top", `${event.offsetY - 30}px`)
//           .style("left", `${event.offsetX + 10}px`)
//           .style("visibility", "visible");
//       }
//     })
//     .on("mouseout", function () {
//       tooltip.style("visibility", "hidden");
//     });

//   // Add legend
//   const legend = svg
//     .append("g")
//     .attr(
//       "transform",
//       `translate(${width - margin.right + 10}, ${margin.top})`
//     );

//   legend
//     .selectAll("rect")
//     .data(colorScale.domain())
//     .join("rect")
//     .attr("x", 0)
//     .attr("y", (d, i) => i * 20)
//     .attr("width", 15)
//     .attr("height", 15)
//     .attr("fill", (d) => colorScale(d));

//   legend
//     .selectAll("text")
//     .data(colorScale.domain())
//     .join("text")
//     .attr("x", 20)
//     .attr("y", (d, i) => i * 20 + 12)
//     .text((d) => d)
//     .style("font-size", "12px");

//   return container;
// }
```
