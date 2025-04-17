---
title: Decarbonisation Planner
toc: false
sidebar: false
footer: false
sql:
  oxford: ./data/oxford_decarbonisation_data.parquet
---

<!-------- Stylesheets -------->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.2/css/bulma.min.css">
<link rel="stylesheet" href="./styles/bulma-quickview.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet-draw/dist/leaflet.draw.css" />
<link rel="stylesheet" href="./styles/dashboard.css">
<link rel="icon" type="image/png" href="./assets/favicon.png" sizes="32x32">

<!-- ------------ Imports ------------ -->

```js
log(">> Importing libraries...");
const d3 = require("d3", "d3-geo-projection");
const flubber = require("flubber@0.4");

import { require } from "npm:d3-require";
import { Mutable } from "npm:@observablehq/stdlib";
import * as turf from "@turf/turf";
import * as bulmaToast from "npm:bulma-toast";
import * as bulmaQuickview from "npm:bulma-quickview@2.0.0/dist/js/bulma-quickview.js";

import { OSGB } from "./components/libs/osgb/index.js";
import { sorterTable } from "./components/libs/sorttable/sorterTableClass.js";
import {
  TimeGlyph,
  GlyphCollection,
} from "./components/libs/gridded-glyphmaps/glyph-designs/timeGlyph.js";
import { StreamGraphGlyph } from "./components/libs/gridded-glyphmaps/glyph-designs/mirrorTimeGlyph.js";
import { RadialGlyph } from "./components/libs/gridded-glyphmaps/glyph-designs/radialglyph.js";

import {
  glyphMap,
  createDiscretiserValue,
  _drawCellBackground,
} from "./components/libs/gridded-glyphmaps/index.min.js";

import { BudgetAllocator } from "./components/libs/decarb-model/budget-allocator.js";
import {
  InterventionManager,
  MiniDecarbModel,
} from "./components/libs/decarb-model/mini-decarbonisation.js";
import { createTimelineInterface } from "./components/libs/decarb-model/timeline.js";
import {
  plotOverallTimeline,
  plotOverallPotential,
} from "./components/libs/plots.js";
import { LeafletMap } from "./components/libs/leaflet/leaflet-map.js";

// import { animate } from "./components/libs/utils.js";
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
  // set,
  // applyTransformationToShapes,
} from "./components/libs/helpers.js";

import {
  log,
  warn,
  error,
  setDebugMode,
  startGroup,
  endGroup,
} from "./components/libs/logger.js";

// timer functions
import { startTimer, endTimer, perfTimings } from "./components/libs/timer.js";
```

```js
// Control debug output - set to true during development, false in production
const DEBUG = true;
setDebugMode(DEBUG);
startTimer("initialisation"); // Start the timer
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
startTimer("load_data_sql");
// >> declare data
log(">> Loading Data...");
const buildingsData = [...oxford_data];
// const buildingsData = oxford_data.slice(); // copy data
endTimer("load_data_sql");
```

```js
startTimer("load_data_json");
// const flatData = buildingsData.map((p) => ({ ...p })); // very slow
// const flatData = buildingsData.map((p) => Object.assign({}, p)); // even slower
const allColumns = Object.keys(buildingsData[0]);
log(">>  Loading Data Done");
endTimer("load_data_json");
```

```js
startTimer("load_data_geojson");
log(">> Define and Load boundary data...");
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
endTimer("load_data_geojson");
```

```js
startTimer("glyph_variables_and_colours");
log(">> Defining the glyph variables and colours...");
timeline_switch;
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
endTimer("glyph_variables_and_colours");
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
log(">> Getters and Setters...");
const [getSelectedAllocation, setSelectedAllocation] = useState([]); // selected allocation
const [detailOnDemand, setDetailOnDemand] = useState(null); // detail on demand on map
const [currentConfig, setCurrentConfig] = useState({}); // current configuration
const [tableFiltered, setTableFiltered] = useState([]); // filtered table
const [allocations, setAllocations] = useState([]);
```

```js
// ---- REMAPPING DATA FLOW ----
const [getInitialFilter, setInitialFilter] = useState(null); // INITIAL FILTER
const [getSelectedTableRow, setSelectedTableRow] = useState([]); // selected table row
const [getInterventions, setInterventions] = useState([]); // list of interventions
const [getResults, setResults] = useState([]); // list of results, from running model
const [selectedIntervention, setSelectedIntervention] = useState(null); // selected intervention in timeline
const [selectedInterventionIndex, setSelectedInterventionIndex] =
  useState(null); // selected intervention index
const [timelineModifications, setTimelineModifications] = useState([]); // list of budget allocations
```

<!------------ HANDLE BI-DIRECTIONAL SELECTION -------------->

```js
const [getInitialData, setInitialData] = useState(null); // INITIAL DATA
```

```js
startTimer("update_selection");
function updateSelection(
  targetSelection,
  newSelection,
  mode = "intersect",
  idField
) {
  if (mode === "single") {
    return newSelection;
  } else if (mode === "union") {
    const newIds = new Set(newSelection.map((obj) => obj[idField]));
    const additional = targetSelection.filter(
      (obj) => !newIds.has(obj[idField])
    );
    return [...newSelection, ...additional];
  } else if (mode === "intersect") {
    const currentIds = new Set(targetSelection.map((obj) => obj[idField]));
    return newSelection.filter((obj) => currentIds.has(obj[idField]));
  } else {
    throw new Error("Invalid mode");
  }
}
endTimer("update_selection");
```

```js
// Modified filterManager for cascading filtering, but without direct UI sync calls.
// Only updates state; UI sync is handled in reactive cells
const filterManager = {
  lastSource: null,
  currentIds: [],
  filters: {
    map: null,
    table: null,
  },
  applyMapToTableFilter(idValues) {
    this.filters.map = Array.isArray(idValues)
      ? idValues.filter((id) => id !== undefined && id !== null)
      : [];
    this.lastSource = "map";
    if (this.filters.table && this.filters.table.length > 0) {
      this.currentIds = this.filters.map.filter((id) =>
        this.filters.table.includes(id)
      );
    } else {
      this.currentIds = [...this.filters.map];
    }
    setInitialData(this.currentIds.map((id) => ({ id })));
    return true;
  },
  applyTableToMapFilter(idValues) {
    this.filters.table = Array.isArray(idValues)
      ? idValues.filter((id) => id !== undefined && id !== null)
      : [];
    this.lastSource = "table";
    if (this.filters.map && this.filters.map.length > 0) {
      this.currentIds = this.filters.table.filter((id) =>
        this.filters.map.includes(id)
      );
    } else {
      this.currentIds = [...this.filters.table];
    }
    setInitialData(this.currentIds.map((id) => ({ id })));
    return true;
  },
  reset() {
    this.lastSource = null;
    this.currentIds = [];
    this.filters.map = null;
    this.filters.table = null;
    setInitialData(null);
  },
};
```

```js
// Map filter to table sync
{
  // This cell executes when filterManager changes or getInitialData changes
  // log(
  //   "This cell executes when filterManager changes or getInitialData changes: on map"
  // );
  filterManager;
  getInitialData;

  // Only apply table filtering when map is the source
  if (filterManager.lastSource === "map" && filterManager.initialised) {
    log(
      `Syncing table with map filter (${filterManager.currentIds.length} IDs)`
    );

    // Format the IDs as objects with an id property as expected by the table
    const formattedIds = filterManager.currentIds.map((id) => ({ id }));

    log("Formatted IDs for table:", filterManager.currentIds);

    // Apply filter directly to table component with proper error handling
    try {
      log("Applying filter to table via setFilteredDataById:", formattedIds);
      table.setFilteredDataById(filterManager.currentIds);
      // table.setFilteredDataById([100120819411, 100120819410, 100120819409]);
      // const idSet = new Set(filterManager.currentIds);
      // table.applyCustomFilter((row) => idSet.has(row.id));
    } catch (error) {
      log(`Error applying filter to table: ${error.message}`);
    }
  }

  // Mark manager as initialised after first execution
  filterManager.initialised = true;
}
```

```js
// Table filter to map sync
{
  // This cell executes when filterManager changes or getInitialData changes
  // log(
  //   "This cell executes when filterManager changes or getInitialData changes"
  // );
  filterManager;
  getInitialData;

  // Only apply map filtering when table is the source
  if (filterManager.lastSource === "table" && filterManager.initialised) {
    log(
      `Syncing map with table filter (${filterManager.currentIds.length} IDs)`
    );

    // Apply filter to map component
    mapInstance.setFilteredData("buildings", { ids: filterManager.currentIds });
  }
}
```

<!-- ---------------- HTML Layout ---------------- -->

<div class="grid-container" style="padding:2px; height:100vh;">
  <div id="left-panel" style="overflow-x:hidden; overflow-y:hidden; height:96vh;">
    <div class="left-top">
      <div class="card" style="overflow-x:hidden;">
          <header class="quickview-header">
            <p class="title">Table View </p>
          </header>              
          ${resize((width, height) => drawSorterTable(data, tableColumns, tableChanged, {
            width: width,
            height: height-100,
          })
          )
          }
        </div>
    </div> <!-- left top -->
    <div class="left-bottom">
        <div class="card" style="overflow-y: hidden;">
        <header class="quickview-header">
          <p class="title">Decarbonisation Timeline</p>
        </header>
            <div id="graph-container">
              <div id="timeline-panel">
                ${getInitialData ? html`<p> No. of Filtered Data: ${getInitialData.length} </p>`: "" }
                ${createTimelineInterface(
                getInterventions,
                (change) => {
                  log("Timeline changed", change);
                  setTimelineModifications(change);
                },
                (click) => {
                  if (click != null) {
                    setSelectedInterventionIndex(click);
                    log("Clicked Interventions", click, getInterventions[click]);
                  } // else do nothing
                },
                400,
                250
              )}
              </div> <!-- timeline panel -->
              <nav id="timeline-buttons">
                <button id="openQuickviewButton" data-show="quickview" class="btn tooltip" data-tooltip="Add New Intervention" aria-label="Add">
                  <i class="fas fa-plus"></i>
                </button>
                ${html`<button class="btn edit tooltip" data-tooltip="Apply Modification" aria-label="Edit"
                  onclick=${(e) => {
                    e.stopPropagation();
                    log("Modify intervention ", selectedInterventionIndex);
                    modifyIntervention(selectedInterventionIndex, timelineModifications[selectedInterventionIndex]);
                 }
                }>
                <i class="fas fa-edit" style="color:green;"></i>
              </button>`}
                ${html`<button class="btn erase tooltip" data-tooltip="Remove Intervention" aria-label="Delete"
                  onclick=${(e) => {
                    e.stopPropagation();
                    log("Delete intervention ", selectedInterventionIndex);
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
                    log(manager.currentOrder);
                    reorderIntervention(manager.currentOrder, selectedInterventionIndex, "down");
                    runModel();
                }}>
                <i class="fas fa-arrow-down"></i>
              </button>`}
              </nav>
            </div> <!-- graph container -->
      </div> <!-- card -->
    </div> <!-- left bottom -->
    </div> <!-- left panel -->

  <div id="main-panel">
    <div class="card" style="overflow-x:hidden; overflow-y:hidden; height:96vh;">
      <header class="quickview-header">
        <p class="title">Map View</p>
      </header>
          ${mapAggregationInput}
          ${(map_aggregate === "Building Level") ? "": timelineSwitchInput}
          ${(map_aggregate === "Building Level") ? toggleGridmaps : ""}
          ${(map_aggregate === "LSOA Level") ? html`${playButton} ${morphFactorInput}` : ""}
          <!-- ${html`${playButton} ${morphFactorInput}`} -->
          ${resize((width, height) => createGlyphMap(map_aggregate, width, height-80))}
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
    ${getInitialData ? html`<i> Using ${getInitialData.length} Filtered Data </i>`: "" }
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
  log("Open quickview");
});

closeQuickviewButton.addEventListener("click", () => {
  quickviewDefault.classList.remove("is-active");
});

cancelButton.addEventListener("click", () => {
  quickviewDefault.classList.remove("is-active");
});
```

```js
startTimer("grouped_intervention");
// display(html`<p>"Grouped Intervention"</p>`);
const groupedData = MiniDecarbModel.group(data, ["lsoa", "interventionYear"]);
endTimer("grouped_intervention");
```

```js
// display(html`<p>"Transformed Grouped Intervention"</p>`);
const timelineDataArray = [
  "interventionCost",
  "carbonSaved",
  "numInterventions",
];
```

```js
startTimer("transform_intervention_data");
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
      // log(">>> transforming interventions", intervention);
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
endTimer("transform_intervention_data");
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
// initial building data from get initial data's id if it exist
// else use the buildingsData
const initialIds = new Set(getInitialData.map((d) => d.id));
const matchedBuildings = buildingsData.filter((b) => initialIds.has(b.id));
const initialData = matchedBuildings ? matchedBuildings : buildingsData;

log("[MODEL] Running InterventionManager with initial data: ", initialData);
const manager = new InterventionManager(initialData, listOfTech);
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
// log("totalBudgetInput total: ", total_budget);

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
// log("startYearInput.style", startYearInput.columns);
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
  ["Building Level", "LSOA Level", "LA Level"],
  {
    label: "Level of Detail",
    value: "Building Level",
  }
);
const map_aggregate = Generators.input(mapAggregationInput);
```

```js
// --- potentials and timeline  ---
const timelineSwitchInput = Inputs.radio(
  ["Decarbonisation Potentials", "Decarbonisation Timeline"],
  {
    label: "Show Data",
    value: "Decarbonisation Potentials",
  }
);
const timeline_switch = Generators.input(timelineSwitchInput);
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
const filterByIds = (suitableIds) => {
  return {
    filterName: `Buildings with IDs in provided list (${suitableIds.length} buildings)`,
    filterFunction: (building) => suitableIds.includes(building.id),
  };
};
```

```js
// ----------------- QuickView Event Listeners -----------------
const addInterventionBtn = document.getElementById("addInterventionBtn");

// Add New Intervention button logic
addInterventionBtn.addEventListener("click", () => {
  // log("Intervention button clicked");

  const formData = {
    id: techsInput.value + "_" + startYearInput.value.toString(),
    initialYear: Number(startYearInput.value),
    rolloverBudget: 0,
    optimizationStrategy: "tech-first",
    tech: techsInput.value,
    priorities: [],
    filters: [],
  };

  addNewIntervention(formData);
  quickviewDefault.classList.remove("is-active"); // Close quickview after submission
});
```

```js
const getNumericBudget = (value) => {
  // Remove commas and parse the value as a number
  let budget = parseFloat(value.replace(/,/g, "").replace(/£/g, ""));
  // log("budget in billions", budget * 1e6);
  return budget * 1000;
};
```

<!--------------- Budget Allocator ---------------->

```js
log(">> Budget Allocator...");

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
    // log("On Budget Updated", changes);
    setSelectedAllocation(changes);
  },
  400,
  200
);
```

```js
setSelectedAllocation(allocator.getAllocations());
```

```js
// ----------------- Assign budget -----------------
{
  allocator;
  // const newAllocation = selected ? selected : allocator.getAllocations();
  // log("newAllocation", newAllocation);
  saveToSession("allocations", getSelectedAllocation);
}
```

<!-- morph animation logic -->

```js
log(">> Morph animation logic...");
let playing = false; // Track play/pause state
let direction = 1; // Controls the animation direction (0 to 1 or 1 to 0)
let animationFrame; // Stores the requestAnimationFrame ID
// let currentValue = 0; // Current value of the morph factor

let currentValue = parseFloat(morphFactorInput.value); // Initialize currentValue with the slider value

// Animation loop
animate(currentValue, animationFrame, playing, direction);

// Button click event listener
playButton.addEventListener("click", () => {
  playing = !playing; // Toggle play/pause state
  playButton.innerHTML = playing
    ? '<i class="fas fa-pause"></i>'
    : '<i class="fas fa-play"></i>';

  if (playing) {
    // Start the animation with the current slider value
    // const currentValue = parseFloat(morph_factor);
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
  // log(Date.now(), "Checking allocations now:", allocations);
  const currentAllocation = getFromSession("allocations");

  log(">> Current Allocation from session", currentAllocation);
  const yearlyBudgets = currentAllocation.map((item) => item.budget);

  const newConfig = {
    ...data,
    // filters: [],
    // priorities: [],
    yearlyBudgets: yearlyBudgets,
  };
  log(">> CONFIG from session", newConfig);

  // add the new intervention to the model
  manager.addIntervention(newConfig);

  // run the model
  startTimer("run_model");
  log(">> Running the decarbonisation model...");
  runModel();
  endTimer("run_model");
}
```

```js
// function to run the model
function runModel() {
  log(">>>> Running the decarbonisation model...");
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
  log(
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
      log("Interventions reordered:", newArray);
    }

    return newArray;
  } catch (error) {
    error("Reorder failed:", error.message);
    return array; // Return original array if reordering fails
  }
}
```

```js
// function to update the selected intervention
function modifyIntervention(index, newConfig) {
  if (!newConfig) {
    log("No change detected for intervention", index);
    return;
  }

  log(" The new config", index, newConfig);

  // const currentConfig = interventions[index];
  let yearlyBudgets;

  if (newConfig.duration !== newConfig.projectDuration) {
    log("Assigning new budget allocations..");

    // calculate yearlyBudgets by creating an array of newConfig.projectDuration length where each item's value is from initialBudget divided by newConfig.projectDuration.
    const initialBudget = newConfig.initialBudget;
    yearlyBudgets = Array(newConfig.duration)
      .fill(initialBudget / newConfig.duration)
      .map((item) => Math.round(item));
  } else {
    yearlyBudgets = newConfig.yearlyBudgets;
  }

  log("GIVEN Yearly budgets", yearlyBudgets);

  const modifiedConfig = {
    ...newConfig,
    yearlyBudgets: yearlyBudgets,
    initialYear: newConfig.initialYear,
    tech: newConfig.techName,
    duration: newConfig.projectDuration,
  };

  log(">> Modifying intervention.. ", index, modifiedConfig);
  // const newResults = manager.modifyAndRunIntervention(index, modifiedConfig);
  // log(" result from modifications", newResults);
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

```js
// function to update building filter
function updateBuildingFilter(column, value) {
  log(">> Updating building filter...", column, value);
  const filter = filterByIds(
    table.data
      .filter((d) => d[column] === value)
      .map((d) => d?.id)
      .filter(Boolean)
  );
  log(">> Filter", filter);
  manager.addFilter(filter);
  runModel();
}
```

```js
// update timeline drawing
function updateTimeline() {
  const timelinePanel = document.getElementById("timeline-panel");
  timelinePanel.innerHTML = "";
  timelinePanel.appendChild(
    createTimelineInterface(
      getInterventions,
      (change) => {
        log("[TIMELINE] timeline change", change);
      },
      (click) => {
        setSelectedInterventionIndex(click);
        log("[TIMELINE] timeline clicked block", getInterventions[click]);
      },
      450,
      200
    )
  );
}
```

<!-- ----------------  D A T A  ---------------- -->

```js
const selectedIntervenedBuildings =
  selectedInterventionIndex === null
    ? null
    : Array.isArray(selectedInterventionIndex)
    ? selectedInterventionIndex.flatMap(
        (i) => getInterventions[i]?.intervenedBuildings ?? []
      )
    : getInterventions[selectedInterventionIndex]?.intervenedBuildings;

// log(`[DATA] Selected Intervened buildings`, getInterventions[0]);

console.log("[DATA] Get Interventions", getInterventions[0]);

const flatData = selectedIntervenedBuildings?.map((p) => ({
  ...p,
  ...p.properties,
}));

log("[DATA] Intervened buildings", flatData);

const data =
  selectedInterventionIndex === null
    ? stackedRecap?.buildings ?? buildingsData
    : flatData;
log("[DATA] DATA DATA DATA", data);
```

```js
// This updates the stored interventions
// const interventions = getInterventions;
log(">> Interventions", interventions);
```

```js
const stackedRecap = getResults;
```

```js
timeline_switch;
log(">> Switching variables...", glyphVariables);

// aggregate and normalise data for whole LA
const overall_data = aggregateValues(data, glyphVariables, "sum", true);
const glyphData = glyphVariables.map((key) => overall_data[key]);
```

<!-- ---------------- Sortable Table ---------------- -->

```js
// Table Data
const excludedColumns = [
  // "id",
  "properties",
  "x",
  "y",
  "score",
  "ashp_labour",
  "ashp_material",
  "pv_labour",
  "pv_material",
  "gshp_labour",
  "gshp_material",
  // "ashp_suitability",
  // "pv_suitability",
  // "gshp_suitability",
  "substation_headroom_pct",
  "substation_peakload",
  "deprivation_decile",
]; // columns to exclude from the table

const customOrder = ["id", "lsoa", "msoa", "EPC_rating"];

const tableColumns = [
  { column: "id", unique: true },
  ...Object.keys(data[0])
    .filter((key) => !excludedColumns.includes(key) && key !== "id")
    .sort((a, b) => {
      const indexA = customOrder.indexOf(a);
      const indexB = customOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    }),
];

log("[TABLE] Define table columns...", tableColumns);
```

```js
// Table events
function tableChanged(event) {
  log("Table changed:", event);

  if (event.type === "filter") {
    // log("Filtered indices:", event.indeces);
    // log("Filter rule:", event.rule);
    // saveToSession("tableFiltered", event.indeces);
    log("Filtered IDs:", event.ids);

    // Use the new filterState to handle filtering
    const idValues = event.ids.map((item) => item.id);
    filterManager.applyTableToMapFilter(idValues);

    // Store the filtered data in app state
    // setInitialData(event.ids);
  }

  if (event.type === "sort") {
    log("Sorted indices:", event.indeces);
    log("Sort criteria:", event.sort);
  }

  if (event.type === "selection") {
    setSelectedTableRow(event.selection);
    log("Selection rule:", event.rule);
  }
}
```

```js
// Filter table data
// const tableFilteredData = tableFiltered
//   .map((index) => table.data?.[index])
//   .filter(Boolean);

log("Initial Data Fixed: ", getInitialData);
```

```js
startTimer("create_sorter_table");
log("[TABLE] Create table using columns", tableColumns);
const table = new sorterTable(data, tableColumns, tableChanged);

function drawSorterTable(data, columns, callback, options) {
  table.setContainerSize(options);
  return table.getNode();
}
endTimer("create_sorter_table");
```

<!-- ---------------- Glyph Maps ---------------- -->

```js
log(">> Geo-enrichment...");
// geo-enrichment - combine geodata with building level properties

// define the aggregation function for each column
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

log("regular_geodata_withproperties_enriched", regular_geodata_withproperties);

const cartogram_geodata_withproperties = enrichGeoData(
  // buildingsData,
  data,
  cartogram_geodata,
  "lsoa",
  "code",
  aggregations
);
```

```js
// Data processing functions
log(">> Data processing functions: Regular LSOA...");
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
log(">> Data processing functions: Cartogram LSOA...");
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
log(">> Create lookup tables...");
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
log(">>> Keydata", keydata);

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
log(">> Initialize the GlyphMap Specification...");
// log("Sample x y from Data in Glyph", [data[0].x, data[0].y]);
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
        // log("initFn", cells, cellSize, global, panel);
      },

      preAggrFn: (cells, cellSize, global, panel) => {
        // log("preaggregate cells", cells);
      },

      aggrFn: (cell, row, weight, global, panel) => {
        // log("  >> Data aggregation in GlyphMap...", row);
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

        // Update cells with normalized data
        cells.forEach((cell, index) => {
          cell.data = normalisedData[index];
        });
        // log(">>>> cells data ", normalisedCells);

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

        // log("cell data to draw >>>", cellData);
        let timeData = cell.data[0];
        // log("timeData", timeData);

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
        //   log;
        //   // format config for streamgraph
        //   let customConfig = {
        //     upwardKeys: ["carbonSaved"],
        //     downwardKeys: ["interventionCost"],
        //   };

        //   let tg = new StreamGraphGlyph(timeData, "year", null, customConfig);
        //   tg.draw(ctx, x, y, cellSize / 2);
        // }
        // log(
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
          log("cell on tooltip", cell.data);
          // log("cell on tooltip", cell.records[0].code);
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
// set and animate needs to be in here

function set(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  // console.log("input value:", input.value);
}

function animate(currentValue, animationFrame, playing = false, direction = 1) {
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
```

```js
// Trigger Morphing function
{
  log(">> Morphing...", morph_factor);
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
  // log(width, height);
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
    if (timeline_switch == "Decarbonisation Potentials") {
      return plotOverallPotential(glyphData, glyphColours, glyphVariables);
    } else {
      return plotOverallTimeline(yearlySummaryArray);
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
// interactive draw function - change glyphs based on mode
// {
// glyphMode;
// decarbonisationGlyph.setGlyph({
//   drawFn: interactiveDrawFn(glyphMode),
// });
// }
```

```js
const leafletContainer = document.createElement("div");
document.body.appendChild(leafletContainer);

const mapInstance = new LeafletMap(leafletContainer, {
  width: "300px",
  height: "300px",
  // onSelect: (selectedFeatures) => log("Map Selected:", selectedFeatures),
  onFilter: (filteredFeatures) => {
    // Transform features to just the IDs we need, making sure we have valid IDs
    const idValues = filteredFeatures
      .map((feature) => feature.properties?.id)
      .filter((id) => id !== undefined && id !== null);

    // Log filtering event
    log(`Map filtered: ${idValues.length} buildings`);

    // Apply filter using the filter manager
    filterManager.applyMapToTableFilter(idValues);
  },
  tooltipFormatter: (props) => `<strong>${props.id}</strong>`,
});

mapInstance.addLayer("buildings", data, {
  clusterRadius: 50,
  fitBounds: true,
});

mapInstance.setSelectionLayer("buildings");

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
```

```js
// Leaflet map
function createLeafletMap(data, width, height) {
  // log(">> Create Leaflet Map with... ", width, height);
  mapInstance.setDimensions(width, height);

  return { leafletContainer, mapInstance };
}

// display(leafletContainer);
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
```
