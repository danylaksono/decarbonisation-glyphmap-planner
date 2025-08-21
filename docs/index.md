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
import { LineChartGlyph } from "./components/libs/gridded-glyphmaps/glyph-designs/lineChartGlyph.js";

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
  plotDualChartPanel,
  plotOverallStreamGraph,
} from "./components/libs/plots.js";

import { LeafletMap } from "./components/libs/leaflet/leaflet-map.js";

import { geoMorpher } from "./components/libs/geo-morpher/morphs.js";

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
  getNumericBudget,
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
const DEBUG = false;
setDebugMode(DEBUG);
// startTimer("initialisation"); // Start the timer
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
// startTimer("load_data_sql");
// >> declare data
// log(">> Loading Data...");
const buildingsData = [...oxford_data];
// const buildingsData = oxford_data.slice(); // copy data
// endTimer("load_data_sql");
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
log(">> Defining the glyph variables and colours...");
timeline_switch;
const glyphColours = [
  // Blues (High contrast in lightness) - Air Source Heat Pump (ashp)
  "#A6D8F0", // Light Blue
  "#4682B4", // SteelBlue (Medium)
  "#003366", // Dark Navy (Dark)

  // Purples - Ground Source Heat Pump (gshp)
  "#E1BEE7", // Light Purple
  "#9B59B6",  // Amethyst (Medium)
  "#4A235A", // Dark Purple

  // Greens - Photovoltaic (pv)
  "#A9DFBF", // Light Green
  "#27AE60", // Medium Green
  "#145A32", // Dark Forest Green
];
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
// const glyphColours = [
//   // ashp = bluish
//   "#1E90FF", // ashp_suitability: DodgerBlue
//   "#4682B4", // ashp_size: SteelBlue
//   "#5F9EA0", // ashp_total: CadetBlue

//   // gshp = orangeish
//   "#FFA500", // gshp_suitability: Orange
//   "#FF8C00", // gshp_size: DarkOrange
//   "#FFD700", // gshp_total: Gold

//   // pv = greenish
//   "#32CD32", // pv_suitability: LimeGreen
//   "#228B22", // pv_generation: ForestGreen
//   "#006400", // pv_total: DarkGreen
// ];
const timelineVariables = [
  "carbonSaved",
  "interventionCost",

  // "numInterventions",
  // "interventionTechs",
];
const timelineColours = [
    "#1B9E77", // carbonSaved
    "#D95F02", // interventionCost
  // "rgb(0, 255, 76)", // carbonSaved
  // "rgb(255, 0, 0)", // interventionCost
  // "#00FF00", // numInterventions
  // "#FF0000", // interventionTechs
];
```

<!-- ------------ Getter-Setter ------------ -->

```js
// wrapper to Observable's Mutable
function useState(value) {
  // console.trace("####### STATE #####");
  const state = Mutable(value);
  const setState = (value) => (state.value = value);
  return [state, setState];
}
```

```js
log(">> Getters and Setters...");
const [getSelectedAllocation, setSelectedAllocation] = useState([]); // selected allocation
```

```js
// ---- REMAPPING DATA FLOW ----
const [getInitialFilter, setInitialFilter] = useState(null); // INITIAL FILTER
const [getSelectedTableRow, setSelectedTableRow] = useState([]); // selected table row
const [getInterventions, setInterventions] = useState([]); // list of interventions
const [getResults, setResults] = useState([]); // list of results, from running model
// const [selectedIntervention, setSelectedIntervention] = useState(null); // selected intervention in timeline
const [selectedInterventionIndex, setSelectedInterventionIndex] =
  useState(null); // selected intervention index
const [timelineModifications, setTimelineModifications] = useState([]); // list of budget allocations
```

```js
// FLAGS
const [getModelProcessingFlag, setModelProcessingFlag] = useState(false);
const [getInterventionProcessingFlag, setInterventionProcessingFlag] =
  useState(false);
const [getPreviousInterventionConfig, setPreviousInterventionConfig] =
  useState(null);
const [getGlyphTooltipData, setGlyphTooltipData] = useState(null); // mutable tooltip for onhover
```

```js
const [getAppState, setAppState] = useState(null); // APP STATE
```

<!------------ HANDLE BI-DIRECTIONAL TABLE-MAP SELECTION -------------->

```js
const [getInitialData, setInitialData] = useState(null); // INITIAL DATA
const [getModelData, setModelData] = useState(buildingsData); // MODEL DATA
const [getGlyphData, setGlyphData] = useState([]); // GLYPH DATA
// table
const [getTableRule, setTableRule] = useState([]);
const [getGroupedData, setGroupedData] = useState({});
```

```js
// Add a reset state flag to track when a reset has been requested
const [getResetRequested, setResetRequested] = useState(false);
```

```js
// function updateSelection(
//   targetSelection,
//   newSelection,
//   mode = "intersect",
//   idField
// ) {
//   if (mode === "single") {
//     return newSelection;
//   } else if (mode === "union") {
//     const newIds = new Set(newSelection.map((obj) => obj[idField]));
//     const additional = targetSelection.filter(
//       (obj) => !newIds.has(obj[idField])
//     );
//     return [...newSelection, ...additional];
//   } else if (mode === "intersect") {
//     const currentIds = new Set(targetSelection.map((obj) => obj[idField]));
//     return newSelection.filter((obj) => currentIds.has(obj[idField]));
//   } else {
//     throw new Error("Invalid mode");
//   }
// }
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
    saveToSession("initialids", this.currentIds);
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
    saveToSession("initialids", this.currentIds);
    return true;
  },
  reset() {
    this.lastSource = null;
    this.currentIds = [];
    this.filters.map = null;
    this.filters.table = null;
    setTableRule([]);
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
    // log(
    //   `Syncing table with map filter (${filterManager.currentIds.length} IDs)`
    // );

    // Format the IDs as objects with an id property as expected by the table
    const formattedIds = filterManager.currentIds.map((id) => ({ id }));

    // log("Formatted IDs for table:", filterManager.currentIds);

    // Apply filter directly to table component with proper error handling
    try {
      // log("Applying filter to table via setFilteredDataById:", formattedIds);
      table.setFilteredDataById(filterManager.currentIds);
      // table.setFilteredDataById([100120819411, 100120819410, 100120819409]);
      // const idSet = new Set(filterManager.currentIds);
      // table.applyCustomFilter((row) => idSet.has(row.id));
    } catch (error) {
      // log(`Error applying filter to table: ${error.message}`);
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
    // log(
    //   `Syncing map with table filter (${filterManager.currentIds.length} IDs)`
    // );

    // Apply filter to map component
    mapInstance.setFilteredData("Buildings", { ids: filterManager.currentIds });
  }
}
```

<!-- ---------------- HTML Layout ---------------- -->

<div class="grid-container" style="padding:2px; height:100vh;">
  <div id="left-panel" style="overflow-x:hidden; overflow-y:hidden; height:98vh;">
    <div class="left-top">
      <div class="card" style="overflow:hidden; padding: 5px;">
          <header class="quickview-header">
            <p class="title">Table View ${getAppState ? `(${getAppState.split(' - ')[0].replace(/[()]/g, '').trim()})` : ""} </p>
          </header>
          <div id="table-container" style="height:90%; overflow-y:hidden">
            ${resize(
                (width, height) => drawSorterTable({
                width: width,
                height: height,
              })
              )
            }
          </div>
          <footer class="card-footer" style="overflow: auto;">
          <p class="card-footer-item">
            <span>
              <small>
                <i>
                  ${
                    getTableRule && getTableRule.join("; ").length > 120
                      ? `<span title="${getTableRule.join("; ")}">${getTableRule.join("; ").slice(0, 120)}...</span>`
                      : getTableRule ? getTableRule.join("; ") : ""
                  }
                </i>
              </small>
            </span>
          </p>
        </footer>
      </div> <!-- card -->
    </div> <!-- left top -->
    <div class="left-bottom">
        <div class="card" style="overflow-y: hidden;">
        <header class="quickview-header">
          <p class="title">Decarbonisation Timeline</p>
        </header>
            <div id="graph-container">
              <div id="timeline-panel">
                ${resize((width, height) => {
                  const interventions = updateInterventions();
                  console.log("COMPOSING TIMELINE INTERFACE");
                  return createTimelineInterface(
                    interventions,
                    (change) => {
                      console.log("Timeline changed", change);
                      setTimelineModifications(change);
                    },
                    (click) => {
                      if (click != null && click <= 1000) {  // clicking on intervention
                        console.log("Clicked on intervention", click);
                        setSelectedInterventionIndex(click);
                        filterSelectedIntervention(click, interventions);
                        console.log("Clicked Interventions", click, interventions[click]);
                      } else if (click != null && click > 1000) {
                        // clicking on intervention year
                        console.log("Clicked on intervention year", click);
                      } else if (updateInterventions() && updateInterventions().length > 0)  {
                        // clicking on background when model output is available
                        console.log("No intervention selected");
                        setSelectedInterventionIndex(null);
                        filterStackedInterventions();
                      } else {
                        // clicking on background when no model output is available
                        console.log("No interventions available");
                        openQuickviewButton.click();
                      }
                    },
                    width || 800,
                    height || 300,
                    false, // tooltips disabled
                  );
                })}
              </div> <!-- timeline panel -->
              <nav id="timeline-buttons">
                <button id="openQuickviewButton" data-show="quickview" class="btn tooltip" data-tooltip="Add New Intervention" aria-label="Add">
                  <i class="fas fa-plus"></i>
                </button>
                <button id="resetAllButton" class="btn reset-all tooltip" data-tooltip="Start Over" aria-label="Move Down">
                  <i class="fas fa-sync-alt"></i>
                </button>
                <div class="button-separator"></div>
                <button id="editButton" class="btn edit tooltip" data-tooltip="Apply Modification" aria-label="Edit">
                  <i class="fas fa-edit" style="color:green;"></i>
                </button>
                <button id="deleteButton" class="btn erase tooltip" data-tooltip="Remove Intervention" aria-label="Delete">
                  <i class="fas fa-trash" style="color:red;"></i>
                </button>
                <button id="moveUpButton" class="btn move-up tooltip" data-tooltip="Move Up"
                aria-label="Move Up">
                  <i class="fas fa-arrow-up"></i>
                </button>
                <button id="moveDownButton" class="btn move-down tooltip" data-tooltip="Move Down" aria-label="Move Down">
                  <i class="fas fa-arrow-down"></i>
                </button>
              </nav>
            </div> <!-- graph container -->
      </div> <!-- card -->
    </div> <!-- left bottom -->
    </div> <!-- left panel -->

  <div id="main-panel">
    <div class="card" style="overflow-x:hidden; overflow-y:hidden; height:98vh;">
      <header class="quickview-header">
        <p class="title">Map View</p>
      </header>
          ${mapAggregationInput}
          ${(map_aggregate === "Aggregated Building" || map_aggregate === "LSOA Level" || map_aggregate === "LA Level" ) ? timelineSwitchInput : ""}
          ${(map_aggregate === "LSOA Level") ? html`${playButton} ${morphFactorInput}` : ""} 
          ${(map_aggregate === "Aggregated Building") ? html`${gridSizeSelector}` : ""}  
          ${resize((width, height) => createGlyphMap(map_aggregate, width, height-80))}
    </div>
  </div>
</div>

<!-------- MODAL/QVIEW -------->
<div id="quickviewDefault" class="quickview is-left">
  <header class="quickview-header">
    <p class="title">Create New Intervention</p>
    <span class="delete" data-dismiss="quickview" id="closeQuickviewButton"></span>
  </header>
  <div class="quickview-body">
    <div style="padding: 6px;">
      ${getInitialData ? html`<i> Using ${getInitialData.length} Filtered Data </i>`: "" }
    </div>
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
// ------------------ Timeline buttons and events ------------------
const openQuickviewButton = document.getElementById("openQuickviewButton");
const closeQuickviewButton = document.getElementById("closeQuickviewButton");
const quickviewDefault = document.getElementById("quickviewDefault");
const cancelButton = document.getElementById("cancelButton");

const editButton = document.getElementById("editButton");
const deleteButton = document.getElementById("deleteButton");
const moveUpButton = document.getElementById("moveUpButton");
const moveDownButton = document.getElementById("moveDownButton");
const resetAllButton = document.getElementById("resetAllButton");

// Map reset button
// const mapResetButton = document.getElementById("mapResetButton");

// Other button event listeners...
openQuickviewButton.addEventListener("click", () => {
  quickviewDefault.classList.add("is-active");
  // log("Open quickview");
});

// Existing event listeners...
closeQuickviewButton.addEventListener("click", () => {
  quickviewDefault.classList.remove("is-active");
});

cancelButton.addEventListener("click", () => {
  quickviewDefault.classList.remove("is-active");
});

editButton.addEventListener("click", (e) => {
  if (selectedInterventionIndex !== null) {
    // const selectedIntervention = getInterventions[selectedInterventionIndex];
    e.stopPropagation();
    // log("[TIMELINE] Modify intervention ", selectedInterventionIndex);
    modifyIntervention(
      selectedInterventionIndex,
      timelineModifications[selectedInterventionIndex]
    );
  } else {
    // log("No intervention selected for editing");
  }
});

deleteButton.addEventListener("click", (e) => {
  if (selectedInterventionIndex !== null) {
    e.stopPropagation();
    // log("[TIMELINE] Delete intervention ", selectedInterventionIndex);
    manager.setAutoRun(true).removeIntervention(selectedInterventionIndex);
    runModel();
  } else {
    // log("No intervention selected for deletion");
  }
});

moveUpButton.addEventListener("click", (e) => {
  if (selectedInterventionIndex !== null) {
    e.stopPropagation();
    // log("[TIMELINE] Move intervention up ", selectedInterventionIndex);
    reorderIntervention(manager.currentOrder, selectedInterventionIndex, "up");
    runModel();
  } else {
    // log("No intervention selected for moving up");
  }
});

moveDownButton.addEventListener("click", (e) => {
  if (selectedInterventionIndex !== null) {
    e.stopPropagation();
    // log("[TIMELINE] Move intervention down ", selectedInterventionIndex);
    reorderIntervention(
      manager.currentOrder,
      selectedInterventionIndex,
      "down"
    );
    runModel();
  } else {
    // log("No intervention selected for moving down");
  }
});

resetAllButton.addEventListener("click", (e) => {
  e.stopPropagation();
  // log("[TIMELINE] Reset all interventions");
  resetState();
});
```

```js
// startTimer("grouped_intervention");
// display(html`<p>"Grouped Intervention"</p>`);
// timeline_switch;
const groupedData = MiniDecarbModel.group(getModelData, [
  "lsoa",
  "interventionYear",
]);
// log("[DEBUG] Grouped Data: ", groupedData);
// endTimer("grouped_intervention");
```

```js
timeline_switch;
// display(html`<p>"Transformed Grouped Intervention"</p>`);
const timelineDataArray = [
  "interventionCost",
  "carbonSaved",
  "numInterventions",
];

// Pre-compute time series data for all LSOAs to optimize streamgraph rendering
// This creates a lookup object for quick access when drawing the timeseries glyphs
function normaliseTimeSeriesLookup(timeSeriesLookup, keysToNormalise) {
  const combined = [];

  // Step 1: Flatten all data with LSOA tracking
  for (const lsoa in timeSeriesLookup) {
    const series = timeSeriesLookup[lsoa];
    series.forEach((entry, i) => {
      combined.push({ ...entry, _lsoa: lsoa, _index: i }); // keep track of origin
    });
  }

  // Step 2: Normalize the combined array
  const normalisedCombined = normaliseData(combined, keysToNormalise);

  // Step 3: Rebuild timeSeriesLookup with normalized values
  const normalisedLookup = {};
  normalisedCombined.forEach((entry) => {
    const { _lsoa, _index, ...rest } = entry;
    if (!normalisedLookup[_lsoa]) {
      normalisedLookup[_lsoa] = [];
    }
    normalisedLookup[_lsoa][_index] = rest;
  });

  return normalisedLookup;
}
```

```js
function composeTimeseriesLookup(modelData) {
  const timeSeriesLookup = {};
  const timelineFields = timelineDataArray;

  console.log("Pre-computing time series data for all LSOAs...");

  // Step 1: Determine global min and max year
  let globalMinYear = Infinity;
  let globalMaxYear = -Infinity;

  Object.values(modelData).forEach((lsoaData) => {
    if (!lsoaData?.children) return;

    const years = Object.keys(lsoaData.children).map(Number);
    if (years.length > 0) {
      const localMin = Math.min(...years);
      const localMax = Math.max(...years);
      globalMinYear = Math.min(globalMinYear, localMin);
      globalMaxYear = Math.max(globalMaxYear, localMax);
    }
  });

  if (!isFinite(globalMinYear) || !isFinite(globalMaxYear)) {
    console.warn("No valid year range found in model data.");
    return {};
  }

  const globalDuration = globalMaxYear - globalMinYear + 1;
  console.log(
    `Using global year range ${globalMinYear}–${globalMaxYear} (${globalDuration} years)`
  );

  // Step 2: Build time series using consistent range
  Object.keys(modelData).forEach((lsoaCode) => {
    const timeSeriesData = transformInterventionData(
      modelData,
      lsoaCode,
      timelineFields,
      globalMinYear,
      globalDuration
    );

    if (!timeSeriesData || timeSeriesData.length !== globalDuration) {
      console.warn(
        `[WARN] LSOA ${lsoaCode} returned inconsistent time series (${
          timeSeriesData?.length ?? 0
        } years)`
      );
    }

    timeSeriesLookup[lsoaCode] = timeSeriesData;
  });

  console.log(
    `✅ Time series data pre-computed for ${
      Object.keys(timeSeriesLookup).length
    } LSOAs`
  );

  return timeSeriesLookup;
}

// console.log("[DEBUG] the time series data:", timeseriesLookup);
```

```js
// startTimer("transform_intervention_data");
function transformInterventionData(
  getModelData,
  lsoaCode,
  fields,
  initialYear = null,
  duration = null
) {
  const lsoaData = getModelData[lsoaCode];

  if (!lsoaData?.children) {
    console.warn(`[SKIP] No children found for LSOA ${lsoaCode}`);
    return [];
  }

  const childYears = Object.keys(lsoaData.children).map(Number);
  let minYear, maxYear;

  if (initialYear !== null && duration !== null) {
    minYear = initialYear;
    maxYear = initialYear + duration - 1;
  } else if (childYears.length > 0) {
    minYear = Math.min(...childYears);
    maxYear = Math.max(...childYears);
  } else {
    console.warn(
      `[SKIP] No intervention years and no range for LSOA ${lsoaCode}`
    );
    return [];
  }

  const yearDataMap = {};
  Object.entries(lsoaData.children).forEach(([year, interventions]) => {
    const numericYear = Number(year);
    const yearData = { year: numericYear };
    fields.forEach((field) => (yearData[field] = 0));

    interventions.forEach((intervention) => {
      if (intervention) {
        fields.forEach((field) => {
          if (typeof intervention[field] === "number") {
            yearData[field] += intervention[field];
          }
        });
      }
    });

    fields.forEach((field) => {
      yearData[field] = Math.round(yearData[field] * 100) / 100;
    });

    yearDataMap[numericYear] = yearData;
  });

  const fullTimeSeries = [];
  for (let y = minYear; y <= maxYear; y++) {
    if (yearDataMap[y]) {
      fullTimeSeries.push(yearDataMap[y]);
    } else {
      const empty = { year: y };
      fields.forEach((field) => (empty[field] = 0));
      fullTimeSeries.push(empty);
    }
  }

  return fullTimeSeries;
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
```

```js
// --- Create an InterventionManager instance ---
const manager = new InterventionManager(buildingsData, listOfTech);
// const manager = createInterventionManager(initialData, listOfTech);

// log(
//   "[MODEL] Running InterventionManager with initial data: ",
//   initialData.length
// );
```

<!-- ---------------- Input form declarations ---------------- -->

```js
// --- technology ---
const techsInput = Inputs.select(
  new Map([
    ["Rooftop Solar PV", "PV"],
    ["Air Source Heat Pump", "ASHP"],
    ["Ground Source Heat Pump", "GSHP"],
    ["Optimise All", "Optimise All"],
  ]),
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
  ["Individual Building", "Aggregated Building", "LSOA Level", "LA Level"],
  {
    label: "Level of Aggregation",
    value: "Individual Building",
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
    // value: "Decarbonisation Timeline",
  }
);
const timeline_switch = Generators.input(timelineSwitchInput);
```

```js
// --- grid size for aggregated  ---
const gridSizeSelector = Inputs.range([50, 200], {
  label: "Grid Size",
  value: 50,
  step: 10,
});
const grid_size_selector = Generators.input(gridSizeSelector);
```

```js
// --- show relative glyph overlay  ---
const showRelativeGlyph = Inputs.toggle({
  label: "Show Relative",
  value: false,
});
const show_relative = Generators.input(showRelativeGlyph);
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
const filterByIds = (suitableIds) => {
  return {
    filterName: `Buildings with IDs in provided list (${suitableIds.length} buildings)`,
    filterFunction: (building) => suitableIds.includes(building.id),
  };
};
```

<!--------------- Budget Allocator ---------------->

```js
// log(">> Budget Allocator...");

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
    // update if the budget is changed
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

```js
// ----------------- QuickView Event Listeners -----------------
const addInterventionBtn = document.getElementById("addInterventionBtn");
// console.log("interview btn", addInterventionBtn);
log("Attaching listener to addInterventionBtn");
// console.trace("###[TRACE]### addInterventionBtn called");
```

```js
{
  // let interventionProcessing = false;

  // Add New Intervention button logic
  addInterventionBtn.addEventListener("click", () => {
    console.log("Intervention button clicked");

    // check for carbon-first or tech-first
    const OPTIMISE_ALL = "Optimise All";
    const isOptimiseAll = techsInput.value === OPTIMISE_ALL;

    const strategy = isOptimiseAll ? "carbon-first" : "tech-first";
    const techs = isOptimiseAll ? Object.keys(listOfTech) : techsInput.value;

    // Get filtered building IDs (if any), sorted and limited for efficiency
    // const buildingsForIntervention = getFilteredBuildingsData();
    // const buildingIds = buildingsForIntervention
    //   .map((b) => b.id)
    //   .sort()
    //   .slice(0, 10) // limit to first 10 for performance
    //   .join("_");

    // // Deterministic ID based on key attributes
    // const formDataId = [
    //   Array.isArray(techs) ? techs.join("+") : techs,
    //   startYearInput.value,
    //   projectLengthInput.value,
    //   allocationTypeInput.value,
    //   buildingIds,
    // ].join("_");

    const buildingsForIntervention = getFilteredBuildingsData();
    const buildingIds = buildingsForIntervention
      .map((b) => b.id)
      .sort()
      .slice(0, 10) // limit to first 10 for performance
      .join("_");

    // Get current budget allocation from session
    const allocations = getFromSession("allocations") || [];
    // Serialize yearly budgets for uniqueness
    const budgetString = allocations.map((a) => a.budget).join("-");

    // Deterministic ID based on key attributes + budget allocation
    const formDataId = [
      Array.isArray(techs) ? techs.join("+") : techs,
      startYearInput.value,
      projectLengthInput.value,
      allocationTypeInput.value,
      buildingIds,
      budgetString, // add budget allocation here
    ].join("_");

    const formData = {
      // id: techsInput.value + "_" + startYearInput.value.toString(),
      id: formDataId,
      initialYear: Number(startYearInput.value),
      rolloverBudget: 0,
      optimizationStrategy: strategy,
      tech: techs,
      technologies: techs, // for optimise all
      priorities: [],
      filters: [],
    };

    // if ID already exists, skip further processing
    if (
      getInterventions.some((intervention) => intervention.id === formData.id)
    ) {
      console.log(
        "TEST Intervention ID already exists. Skipping further processing."
      );
      return;
    }

    // legacy
    // addNewIntervention(formData);
    // const buildingsForIntervention = getFilteredBuildingsData();

    // try: UNIFIED INTERVENTION PROCESS
    const { stackedResults, formattedRecaps, newGroupedData } =
      processIntervention(formData, buildingsForIntervention);

    // Only update state at the very end, minimizing reactivity
    setInterventions(formattedRecaps);
    setResults(stackedResults);
    setGroupedData(newGroupedData);

    quickviewDefault.classList.remove("is-active"); // Close quickview after submission

    // reset states
    // resetState();
  });
}
```

<!-- ---------------- Functions ---------------- -->

```js
// buildings
// const initialBuildings = getFromSession("initialids");
// let filteredBuildingsData = null;
// if (getInitialData && getInitialData.length > 0) {
//   const initialIds = new Set(getInitialData.map((d) => d.id));
//   filteredBuildingsData = buildingsData.filter((b) => initialIds.has(b.id));
// } else {
//   filteredBuildingsData = buildingsData;
// }
// console.log("INITIAL BUILDINGS", filteredBuildingsData);
function getFilteredBuildingsData() {
  log("get filtered buildings data");
  const initialBuildings = getFromSession("initialids");
  if (initialBuildings && initialBuildings.length > 0) {
    const initialIds = new Set(initialBuildings);
    return buildingsData.filter((b) => initialIds.has(b.id));
  } else {
    return buildingsData;
  }
}
```

<!-- Intervention functions -->

```js
// // Handle form submission: add new intervention
// function addNewIntervention(initialForm) {
//   // console.trace("###[TRACE]### addNewIntervention called");
//   // log(Date.now(), "Checking allocations now:", allocations);
//   const currentAllocation = getFromSession("allocations");
//   const yearlyBudgets = currentAllocation.map((item) => item.budget);

//   // this is the building that is resulted from filter
//   // which will be used to run the model intervention
//   const buildingsForIntervention = getFilteredBuildingsData();

//   // console.log("VALIDATE THIS BUILDING", [...buildingsForIntervention]);

//   const newConfig = {
//     ...initialForm,
//     buildings: [...buildingsForIntervention],
//     // filters: [],
//     // priorities: [],
//     yearlyBudgets: yearlyBudgets,
//   };
//   console.log(">> CONFIG from session", newConfig);

//   // add the new intervention to the model
//   manager.addIntervention(newConfig);

//   // run the model
//   // startTimer("run_model");
//   // log(">> Running the decarbonisation model...");
//   runModel();
//   // endTimer("run_model");
// }
```

```js
// function to run the model
startTimer("run_model");
function runModel() {
  // console.trace("###[TRACE]### runModel called");
  log("[MODEL] Running the decarbonisation model...");
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
  // store interventions to session to avoid reactive loop
  // saveToSession("interventions", formatRecaps); // data exveed session storage capacity

  let stacked = manager.getStackedResults();
  setResults(stacked);

  // Reset table and map after intervention is applied
  // filterStackedInterventions();
}
endTimer("run_model");
```

```js
function filterStackedInterventions() {
  log(
    "[INTERVENTION] Processing table and map selections for new intervention"
  );

  // Reset the filter manager
  filterManager.reset();

  // Reset to full dataset
  // setInitialData(null);

  // filter table and map based on stacked intervention
  // format the IDs as objects with an id property as expected by the table
  let buildingsArray = getResults ? getResults?.buildings : [];

  // UPDATE MODEL DATA
  setModelData(buildingsArray);

  // let currentIdObject =
  //   buildingsArray?.map((building) => ({ id: building.id })) || [];
  // let currentIdList = buildingsArray?.map((building) => building.id) || [];

  // log("current ID for stackedRecap filtering", currentIdList);
  // table.resetTable();
  // table.setFilteredDataById(currentIdList);
  // // mapfiltering accept array
  // // let currentIdList = buildingsArray?.map((building) => building.id) || [];
  // mapInstance.setFilteredData("buildings", { ids: currentIdList });
}
```

```js
function filterSelectedIntervention(index, interventions) {
  // update interventions
  // if commented - tried getting from the timeline instead
  // let interventions = updateInterventions();

  log(
    "[INTERVENTION] Processing table and map selections for clicked intervention",
    interventions[index]
  );

  // Reset the filter manager
  // filterManager.reset();

  // Reset to full dataset
  // setInitialData(null);

  // setup flatdata
  // let selectedIntervenedBuildings =
  //   index === null
  //     ? null
  //     : Array.isArray(index)
  //     ? index.flatMap((i) => interventions[i]?.intervenedBuildings ?? [])
  //     : interventions[index]?.intervenedBuildings;

  let selectedIntervenedBuildings = interventions[index]?.intervenedBuildings;
  // flatData is from a single intervetntion
  // flatten the intervened buildings

  let flatData = selectedIntervenedBuildings?.map((p) => ({
    ...p,
    ...p.properties,
  }));

  // UPDATE MODEL DATA
  setModelData(flatData);

  // filter table and map based on stacked intervention
  // format the IDs as objects with an id property as expected by the table
  // let currentIdObject =
  //   flatData?.map((building) => ({ id: building.id })) || [];
  // let currentIdList = flatData?.map((building) => building.id) || [];

  // log("currently selected flat data", currentIdList);

  // table.resetTable();
  // table.setFilteredDataById(currentIdList);
  // // mapfiltering accept array
  // // let currentIdList = flatData?.map((building) => building.id) || [];
  // mapInstance.setFilteredData("buildings", { ids: currentIdList });
}
```

```js
// Reorder intervention
function reorderIntervention(array, index, direction) {
  // log(
  //   ">> Reordering intervention...",
  //   getInterventions[index].interventionId,
  //   direction
  // );
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
    // log("No change detected for intervention", index);
    return;
  }

  log(" The new config", index, newConfig);

  // const currentConfig = interventions[index];
  let yearlyBudgets;

  if (newConfig.duration !== newConfig.projectDuration) {
    log("Assigning new budget allocations..");

    // calculate yearlyBudgets by creating an array of newConfig.projectDuration length
    // where each item's value is from initialBudget divided by newConfig.projectDuration.
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
// update timeline drawing
function updateTimeline() {
  const timelinePanel = document.getElementById("timeline-panel");
  timelinePanel.innerHTML = "";

  const interventions = updateInterventions();

  timelinePanel.appendChild(
    createTimelineInterface(
      interventions,
      (change) => {
        log("[TIMELINE] timeline change", change);
      },
      (click) => {
        setSelectedInterventionIndex(click);
        console.log("[TIMELINE] timeline clicked block", interventions[click]);
      },
      450,
      200
    )
  );
}
```

<!-- ----------------  D A T A  ---------------- -->

```js
// MAIN INTERVENTION PROCESSOR
startTimer("process_intervention");
log("process intervention");

function processIntervention(config, buildings) {
  // 1. get allocation from session
  const currentAllocation = getFromSession("allocations");
  const yearlyBudgets = currentAllocation.map((item) => item.budget);

  // 2. create complete intervention config
  const interventionConfig = {
    ...config,
    buildings: [...buildings],
    yearlyBudgets: yearlyBudgets,
  };

  // Create a lightweight signature for comparison
  const configSignature = {
    ...config,
    buildingCount: buildings.length,
    yearlyBudgets: yearlyBudgets,
  };

  log("previous signature", getPreviousInterventionConfig);
  log("current signature", configSignature);

  // reactivity police - compare only the signature, not the full configuration
  if (
    getPreviousInterventionConfig &&
    _.isEqual(getPreviousInterventionConfig, configSignature)
  ) {
    log("[WARN] accidental reactivity. skip processing");
    return;
  }

  // Store just the signature for future comparisons
  setPreviousInterventionConfig(configSignature);

  // 3. add intervention to manager
  const addSuccess = manager.addIntervention(interventionConfig);
  if (!addSuccess) return null;

  // 4. run interventions
  const recaps = manager.runInterventions();

  // 5. format intervention data
  const formattedRecaps = recaps.map((r) => ({
    ...r,
    interventionId: r.modelId,
    initialYear: Number(Object.keys(r.yearlyStats)[0]),
    tech: r.techName,
    duration: r.projectDuration,
  }));

  // 6. get stacked results
  const stackedResults = manager.getStackedResults();

  // 7. Update the time series lookup with the new grouped data
  console.log("Updating time series lookup after new intervention...");
  const newGroupedData = MiniDecarbModel.group(stackedResults.buildings, [
    "lsoa",
    "interventionYear",
  ]);

  // const timeSeriesLookup = composeTimeseriesLookup(newGroupedData);
  // const normalisedTimeseriesLookup = normaliseTimeSeriesLookup(timeSeriesLookup, [
  //   "interventionCost",
  //   "carbonSaved",
  //   "numInterventions",
  // ]);

  // return the stacked results
  return {
    stackedResults,
    formattedRecaps,
    newGroupedData,
  };
}
endTimer("process_intervention");
```

```js
function updateInterventions() {
  // console.trace("###[TRACE]### updateInterventions called");
  // log("updating intervention");
  // const interventions = getFromSession("interventions"); // data exceed storage capacity
  const interventions = getInterventions;
  if (interventions && interventions.length > 0) {
    return interventions;
  } else {
    return [];
  }
}
```

```js
// this updates stackedRecap from getResults
// const stackedRecap = getResults;
// console.log(">> Stacked Recap", stackedRecap);
```

```js
timeline_switch;
// log(">> Switching variables...", glyphVariables);

// aggregate and normalise data for whole LA
const overall_data = aggregateValues(getModelData, glyphVariables, "sum", true);
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
  // "score",
  "ashp_labour",
  "ashp_material",
  "pv_labour",
  "pv_material",
  "gshp_labour",
  "gshp_material",
  "interventions",
  // "ashp_suitability",
  // "pv_suitability",
  // "gshp_suitability",
  "substation_headroom_pct",
  "substation_peakload",
  "deprivation_decile",
  "interventionHistory",
  "interventionYears",
]; // columns to exclude from the table

const customOrder = [
  "id",
  "lsoa",
  "msoa",
  "score",
  "EPC_rating",
  "ashp_suitability",
  "pv_suitability",
  "gshp_suitability",
];

const tableColumns = [
  { column: "id", unique: true },
  ...Object.keys(getModelData[0])
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

// log("[TABLE] Define table columns...", tableColumns);
```

```js
// Table events
function tableChanged(event) {
  log("Table changed:", event);

  if (event.type === "filter") {
    // log("Filtered indices:", event.indeces);
    log("Filter rule:", event.rule);
    // log("Filtered IDs:", event.ids);

    // set table rule
    setTableRule(event.rule);

    // Use the new filterState to handle filtering
    const idValues = event.ids.map((item) => item.id);
    filterManager.applyTableToMapFilter(idValues);

    // Store the filtered data in app state
    // setInitialData(event.ids);
  }

  if (event.type === "sort") {
    // log("Sorted indices:", event.indeces);
    // log("Sort criteria:", event.sort);
  }

  if (event.type === "reset") {
    log("[TABLE] Table Reset", event);
    // Reset everything when table reset is triggered
    // resetState();
    setInitialData(null);
    setTableRule([]);
  }

  if (event.type === "selection") {
    setSelectedTableRow(event.selection);
    log("selected row", event.selection[0].data);
    // mapInstance.flyTo(
    //   { x: event.selection[0].data.x, y: event.selection[0].data.y },
    //   18
    // );
    // log("Selection rule:", event.rule);
  }
}
```

```js
startTimer("create_sorter_table");
injectGlobalLoadingOverlay();
showGlobalLoading(true);
// log("[TABLE] Create table using data", data.length);
const table = new sorterTable(getModelData, tableColumns, tableChanged);
showGlobalLoading(false);

function drawSorterTable(options) {
  // console.log("setting table size", options);
  table.setContainerSize(options);
  return table.getNode();
}
endTimer("create_sorter_table");
```

```js
// spinner especially for table
// Function to show/hide loading spinner
function showTableSpinner(show) {
  const container = document.getElementById("table-container");
  if (!container) return;

  // Remove existing spinner if any
  const existingSpinner = container.querySelector(".spinner-container");
  if (existingSpinner) {
    container.removeChild(existingSpinner);
  }

  // Add new spinner if requested
  if (show) {
    const spinnerContainer = document.createElement("div");
    spinnerContainer.className = "spinner-container";
    spinnerContainer.style.cssText =
      "position:absolute; top:0; left:0; right:0; bottom:0; display:flex; justify-content:center; align-items:center; background-color:rgba(255,255,255,0.7); z-index:10;";

    const spinner = document.createElement("div");
    spinner.className = "loader is-loading";
    spinner.style.cssText = "height:80px; width:80px;";

    spinnerContainer.appendChild(spinner);
    container.appendChild(spinnerContainer);
  }
}
```

```js
function showGlobalLoading(show = true) {
  const overlay = document.getElementById("global-loading-overlay");
  if (!overlay) return;
  overlay.style.display = show ? "flex" : "none";
  log("### global loading...", show, overlay.style.display);
  // Optionally, blur the main content
  document.body.style.overflow = show ? "hidden" : "";
}
```

```js
function injectGlobalLoadingOverlay() {
  if (!document.getElementById("global-loading-overlay")) {
    const overlay = document.createElement("div");
    overlay.id = "global-loading-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
      <div class="loading-modal">
        <div class="spinner"></div>
        <div class="loading-text">Loading, please wait...</div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
}
```

<!-- ---------------- Prepared Data for GlyphMaps ---------------- -->

```js
// this works but causing lags due to passing data back and forth
// const {
//   keydata,
//   regularGeodataLookup,
//   regularGeodataLsoaWgs84,
//   cartogramGeodataLsoaLookup,
//   geographyLsoaWgs84Lookup,
//   cartogramLsoaWgs84Lookup,
//   tweenWGS84Lookup,
// } = geoMorpher({
//   aggregations,
//   regular_geodata,
//   cartogram_geodata,
//   getModelData,
//   morph_factor,
// });

// define the aggregation function for each column
const aggregations = {
  // "id": 200004687243,
  isIntervened: "count",
  interventionYear: "array",
  interventionCost: "sum",
  carbonSaved: "sum",
  numInterventions: "sum",
  interventionTechs: "categories",
  building_area: "sum",
  ashp_suitability: "categories",
  ashp_size: "sum",
  ashp_labour: "sum",
  ashp_material: "sum",
  ashp_total: "sum",
  gshp_suitability: "categories",
  gshp_size: "sum",
  gshp_labour: "sum",
  gshp_material: "sum",
  gshp_total: "sum",
  heat_demand: "sum",
  pv_suitability: "categories",
  pv_size: "sum",
  pv_generation: "sum",
  pv_labour: "sum",
  pv_material: "sum",
  pv_total: "sum",
  deprivation_score: "sum",
  deprivation_rank: "array",
  deprivation_decile: "sum",
  fuel_poverty_households: "sum",
  fuel_poverty_proportion: "sum",
};
```

```js
const regular_geodata_withproperties = enrichGeoData(
  // buildingsData,
  getModelData,
  regular_geodata,
  "lsoa", // aggregation level
  "code", // lookup key
  aggregations
);

// console.log(
//   "[DEBUG] regular_geodata_withproperties_enriched",
//   regular_geodata_withproperties,
//   "\n based on",
//   getModelData
// );

const cartogram_geodata_withproperties = enrichGeoData(
  // buildingsData,
  getModelData,
  cartogram_geodata,
  "lsoa",
  "code",
  aggregations
);
```

```js
// Data processing functions
// log(">> Data processing functions: Regular LSOA...");
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
// log(">> Data processing functions: Cartogram LSOA...");
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
// log(">> Create lookup tables...");
const keydata = _.keyBy(
  regular_geodata_withproperties.features.map((feat) => {
    return {
      ...feat.properties, // flatten all properties
      code: feat.properties.code,
      population: +feat.properties.population,
      carbonSaved: feat.properties.carbonSaved
        ? +feat.properties.carbonSaved
        : 0,
      interventionCost: feat.properties.interventionCost
        ? +feat.properties.interventionCost
        : 0,
      numInterventions: feat.properties.numInterventions
        ? +feat.properties.numInterventions
        : 0,
    };
  }),
  "code"
);

// log(">>> Keydata", keydata);

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
// endTimer("create_lookup_tables"); /// DEBUG: this took 5 minutes!!
```

```js
// startTimer("create_flubber_interpolations");
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
// endTimer("create_flubber_interpolations");
```

```js
// map_aggregate;
// timeline_switch;
// Group and aggregate data for time series lookup
const timeSeriesLookup = composeTimeseriesLookup(groupedData);

const normalisedTimeseriesLookup = normaliseTimeSeriesLookup(timeSeriesLookup, [
  "interventionCost",
  "carbonSaved",
  "numInterventions",
]);
// console.log("[DEBUG] timeSeriesLookup", timeSeriesLookup);
```

<!-- ---------------- Setting Up Application State ---------------- -->

```js
// ---- REMAPPING APP STATE ----
{
  const modelAvailable =
    updateInterventions() && updateInterventions().length > 0;
  const scope = modelAvailable ? "Model Result" : "All Data";
  const level = map_aggregate;
  const view = timeline_switch;

  // Compose state string consistently
  const stateKey = `${scope} - ${level}${view ? ` - ${view}` : ""}`;
  setAppState(stateKey);

  // Set glyph data depending on state
  if (modelAvailable) {
    // setting up app data

    if (level === "Aggregated Building") {
      setGlyphData(getModelData); // will be aggregated later
    } else if (level === "LSOA Level") {
      if (view === "Decarbonisation Potentials") {
        setGlyphData(keydata); // preaggregated
      } else if (view === "Decarbonisation Timeline") {
        setGlyphData(normalisedTimeseriesLookup); // time series
      }
    } else if (level === "Individual Building") {
      setGlyphData(getModelData); // individual results
    }
    // LA Level handled elsewhere — no glyphs needed
  } else {
    if (level === "LSOA Level") {
      if (view === "Decarbonisation Potentials") {
        setGlyphData(keydata); // base dataset
      }
      // timeline view with no model = skip glyphData
    } else if (level === "Individual Building") {
      setGlyphData(buildingsData); // base building dataset
    }
    // Aggregated + LA level: no glyph data in non-model mode
  }
}
```

```js
{
  // printing out variables for debugging
  console.log("============== Printing out variables ==============");
  console.log(" Current App STATE:", getAppState);
  // console.log("  > getModelData:", getModelData);
  // console.log("  > getGlyphData:", getGlyphData);
  console.log("  > groupedData:", groupedData);
  // console.log("  > keydata:", keydata);
  console.log("  > normalisedTimeseriesLookup:", normalisedTimeseriesLookup);
  // console.log("  > timeSeriesLookup:", timeSeriesLookup);
  console.log("============== End of variables ======================");
}
```

<!-- ---------------- Glyph Maps ---------------- -->

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
map_aggregate;
timeline_switch;
function glyphMapSpec(width = 800, height = 600) {
  const config = {
    coordType: {
      "Individual Building": "mercator",
      "Aggregated Building": "mercator",
      "LSOA Level": "notmercator",
      "LA Level": "mercator", // fallback
    },
    locationFn: {
      "Individual Building": (row) => [row.x, row.y],
      "Aggregated Building": (row) => [row.x, row.y],
      "LSOA Level": (row) => regularGeodataLookup[row.code]?.centroid,
      "LA Level": (row) => regularGeodataLookup[row.code]?.centroid,
    },
    timelineConfig: {
      "Decarbonisation Potentials": {
        variables: glyphVariables,
        colors: glyphColours,
      },
      "Decarbonisation Timeline": {
        variables: ["numInterventions", "interventionCost", "carbonSaved"],
        colors: {
          numInterventions: "#1f77b4",
          interventionCost: "#ff7f0e",
          carbonSaved: "#2ca02c",
        },
      },
    },
  };

  const groupAndAggregateByYear = (records, variables, normalize = false) => {
    const yearMap = {};
    for (const rec of records) {
      const d = rec.data?.properties || rec;
      const year = d.interventionYear || d.year;
      if (!year) continue;

      yearMap[year] = yearMap[year] || {};
      for (const v of variables) {
        yearMap[year][v] = (yearMap[year][v] || 0) + (+d[v] || 0);
      }
    }

    if (!normalize) {
      return Object.entries(yearMap).map(([year, values]) => ({
        year: +year,
        ...values,
      }));
    }

    const flatValues = {};
    for (const v of variables) flatValues[v] = [];
    for (const year in yearMap) {
      for (const v of variables) {
        flatValues[v].push(yearMap[year][v]);
      }
    }

    const minMax = {};
    for (const v of variables) {
      const min = Math.min(...flatValues[v]);
      const max = Math.max(...flatValues[v]);
      minMax[v] = { min, max };
    }

    const normYearMap = {};
    for (const year in yearMap) {
      normYearMap[year] = {};
      for (const v of variables) {
        const { min, max } = minMax[v];
        const val = yearMap[year][v];
        normYearMap[year][v] = max > min ? (val - min) / (max - min) : 0;
      }
    }

    return Object.entries(normYearMap).map(([year, values]) => ({
      year: +year,
      ...values,
    }));
  };

  const getCellData = (cell, aggregateLevel, timelineSwitch) => {
    if (!cell.records) return {};
    const lsoaCode = cell.records[0]?.code;

    if (aggregateLevel === "Aggregated Building") {
      if (timelineSwitch === "Decarbonisation Potentials") {
        return aggregateValues(cell.records, glyphVariables, "sum");
      } else if (timelineSwitch === "Decarbonisation Timeline") {
        return groupAndAggregateByYear(cell.records, timelineVariables, true);
      }
    } else if (aggregateLevel === "LSOA Level" && lsoaCode) {
      return getGlyphData?.[lsoaCode] ?? {};
    }

    return cell.records[0]?.data?.properties || cell.data;
  };

  // Glyph rendering function (Radial for Potentials, StreamGraph for Timeline)
  const drawGlyph = (
    cell,
    x,
    y,
    cellSize,
    ctx,
    aggregateLevel,
    timelineSwitch
  ) => {
    const cellData = cell.data;

    if (timelineSwitch === "Decarbonisation Potentials") {
      const glyphVariables_lsoa = [
        "ashp_suitability_true",
        "ashp_size",
        "ashp_total",
        "gshp_suitability_true",
        "gshp_size",
        "gshp_total",
        "pv_suitability_true",
        "pv_generation",
        "pv_total",
      ];
      const rg = new RadialGlyph(
        glyphVariables_lsoa.map((key) => cellData[key]),
        glyphColours
      );
      rg.draw(ctx, x, y, cellSize / 2);
    } else if (timelineSwitch === "Decarbonisation Timeline") {
      const glyph = new StreamGraphGlyph(cellData, "year", null, {
        upwardKeys: ["carbonSaved"],
        downwardKeys: ["interventionCost"],
        colors: {
          carbonSaved: timelineColours[0],
          interventionCost: timelineColours[1],
        },
      });

      glyph.draw(ctx, x, y, cellSize, cellSize);
    } else {
      // fallback: simple debug circle
      ctx.beginPath();
      ctx.arc(x, y, cellSize / 2, 0, 2 * Math.PI);
      ctx.fillStyle = "#ff1a1ade";
      ctx.fill();
      ctx.lineWidth = 0.2;
      ctx.strokeStyle = "rgb(7, 77, 255)";
      ctx.stroke();
      ctx.closePath();
    }
  };

  return {
    coordType: config.coordType[map_aggregate],
    initialBB: transformCoordinates(turf.bbox(regular_geodata)),

    // Use getGlyphData as a unified input source
    data: (() => {
      const data = getGlyphData;
      if (Array.isArray(data)) return data;
      return Object.entries(data).map(([code, d]) => ({ code, data: d }));
    })(),

    // Coordinate function based on aggregation level
    getLocationFn: (row) => {
      const level = map_aggregate;
      if (level === "LSOA Level" || level === "LA Level") {
        return regularGeodataLookup[row.code]?.centroid;
      }
      return [row.x, row.y];
    },

    discretisationShape: "grid",
    interactiveCellSize: true,
    interactiveZoomPan: true,
    mapType: "CartoPositron",
    cellSize: grid_size_selector || 50,
    width,
    height,

    customMap: {
      scaleParams: [],

      initFn: (cells, cellSize, global, panel) => {
        // Optional initialization logic
      },

      preAggrFn: (cells, cellSize, global, panel) => {
        // No-op pre-aggregation step
      },

      aggrFn: (cell, row, weight, global, panel) => {
        cell.records = cell.records || [];
        cell.records.push(row);
      },

      postAggrFn: (cells, cellSize, global, panel) => {
        // Step 1: Attach data to each real cell
        for (const cell of cells) {
          cell.data = getCellData(cell, map_aggregate, timeline_switch);
        }

        // Step 2: Only normalize if Aggregated Building + Potentials
        if (
          map_aggregate === "Aggregated Building" &&
          timeline_switch === "Decarbonisation Potentials"
        ) {
          const dataArray = cells.map((cell) => cell.data);
          const normalisedData = dataArray
            ? normaliseData(dataArray, glyphVariables)
            : [];
          cells.forEach((cell, index) => {
            cell.data = normalisedData[index];
          });
        }

        // ✅ Step 3: If LSOA Level, ensure all LSOAs are represented
        if (map_aggregate === "LSOA Level") {
          const existingCodes = new Set(cells.map((c) => c.code));
          const missingLSOAs = Object.entries(regularGeodataLookup)
            .filter(([code, geo]) => geo?.centroid && !existingCodes.has(code))
            .map(([code, geo]) => ({
              code,
              data: {}, // no chart data
              getBoundary: () => geo.boundary, // assuming you store boundary here
            }));

          cells.push(...missingLSOAs);
        }
      },

      preDrawFn: (cells, cellSize, ctx, global, panel) => {
        if (!cells?.length) {
          console.error("No cells data available");
          return;
        }
        global.pathGenerator = d3.geoPath().context(ctx);
        global.colourScalePop = "rgba(211, 209, 209, 0.4)";
      },

      drawFn: (cell, x, y, cellSize, ctx, global, panel) => {
        const boundary = cell.getBoundary(0);
        if (boundary[0] !== boundary[boundary.length - 1]) {
          boundary.push(boundary[0]);
        }

        const boundaryFeat = turf.polygon([boundary]);
        ctx.beginPath();
        global.pathGenerator(boundaryFeat);
        ctx.fillStyle = "rgba(210,210,210,0.5)";
        ctx.fill();

        if (map_aggregate == "LSOA Level") {
          ctx.lineWidth = 0.4;
          ctx.strokeStyle = "rgb(156, 156, 156)";
          // ctx.strokeStyle = "rgb(250, 250, 250, 0.4)";
          ctx.stroke();
        } else {
          ctx.lineWidth = 2;
          // ctx.strokeStyle = "rgb(156, 156, 156)";
          ctx.strokeStyle = "rgb(250, 250, 250, 0.4)";
          ctx.stroke();
          //
        }

        if (global.clickedCell === cell) {
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgb(250,250,250)";
          ctx.stroke();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgb(50,50,50)";
          ctx.stroke();
        }

        drawGlyph(cell, x, y, cellSize, ctx, map_aggregate, timeline_switch);
      },

      postDrawFn: (cells, cellSize, ctx, global, panel) => {
        const isTimeline = timeline_switch === "Decarbonisation Timeline";
        const selectedParameters = isTimeline
          ? ["Carbon Saved tCO₂", "Total Intervention Costs (£)"]
          : [
              "ASHP Suitability",
              "ASHP Recommended Heat Pump Size [kW]",
              "ASHP Total Cost",
              "GSHP Suitability",
              "GSHP Recommended Heat Pump Size [kW]",
              "GSHP Total Cost",
              "Rooftop PV Suitability",
              "Rooftop PV Annual Generation [kWh]",
              "Rooftop PV Total Cost",
            ];
        const selectedColours = isTimeline ? timelineColours : glyphColours;

        drawLegend(ctx, panel, selectedParameters, selectedColours);
      },

      // tooltipTextFn: (cell) => {
      //   // setGlyphTooltipData(cell.data);
      // },
    },
  };
}
```

```js
function drawLegend(
  ctx,
  panel,
  selectedParameters,
  colours,
  colourMapping = {}
) {
  // Increase font size from 10px to 14px or 16px
  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const maxTextWidth = d3.max(
    selectedParameters.map((item) => ctx.measureText(item).width)
  );

  // Increase padding from 20 to 30
  const x = panel.getWidth() - maxTextWidth - 30;
  // Increase line spacing from 15 to 20
  let y = panel.getHeight() - selectedParameters.length * 20 - 50;

  // Increase background padding and height
  ctx.fillStyle = "#fff8";
  ctx.fillRect(x, y, maxTextWidth + 20, selectedParameters.length * 20);

  for (let i = 0; i < selectedParameters.length; i++) {
    const parameter = selectedParameters[i];
    const color = colourMapping[parameter] || colours[i % colours.length];

    // Increase color box size from 10x10 to 12x12 or 14x14
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 14, 14);

    // Adjust text position to align with larger color box
    ctx.fillStyle = "#333";
    ctx.fillText(parameter, x + 20, y + 7);

    // Increase line spacing from 15 to 20
    y += 20;
  }
}
```

<!-- ------------------- morph animation logic -->

```js
// set and animate needs to be in here for reactivity
function set(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

let playing = false;
let direction = 1;
let animationFrame = null;

function animate(currentValue) {
  let newValue = currentValue + 0.01 * direction;

  if (newValue >= 1 || newValue <= 0) {
    direction *= -1;
    newValue = Math.max(0, Math.min(1, newValue));
    playing = false;
    playButton.innerHTML = '<i class="fas fa-play"></i>';
    cancelAnimationFrame(animationFrame);
    return;
  }

  set(morphFactorInput, newValue);

  if (playing) {
    animationFrame = requestAnimationFrame(() => animate(newValue));
  }
}

let currentValue = parseFloat(morphFactorInput.value);

playButton.addEventListener("click", () => {
  playing = !playing;
  playButton.innerHTML = playing
    ? '<i class="fas fa-pause"></i>'
    : '<i class="fas fa-play"></i>';

  if (playing) {
    currentValue = parseFloat(morphFactorInput.value);
    animationFrame = requestAnimationFrame(() => animate(currentValue));
  } else {
    cancelAnimationFrame(animationFrame);
  }
});
```

```js
// Trigger Morphing function
{
  // log(">> Morphing...", morph_factor);
  morph_factor; //causes code to run whenever the slider is moved
  morphGlyphMap.setGlyph({
    discretiserFn: valueDiscretiser(tweenWGS84Lookup),
    preDrawFn: (cells, cellSize, ctx, global, panel) => {
      //unfortunately need to repeat what's in the base
      global.pathGenerator = d3.geoPath().context(ctx);
      // global.colourScalePop = d3
      //   .scaleSequential(d3.interpolateBlues)
      //   .domain([0, d3.max(cells.map((row) => row.building_area))]);
      // polygon background
      global.colourScalePop = "#cccccc";

      //draw a coloured background polygon
      ctx.beginPath();
      ctx.rect(0, 0, panel.getWidth(), panel.getHeight());
      const colour = d3.color("#fff");
      colour.opacity = morph_factor; //morphFactorInput;
      ctx.fillStyle = colour;
      ctx.fill();
    },
    postDrawFn: (cells, cellSize, ctx, global, panel) => {
      const isTimeline = timeline_switch === "Decarbonisation Timeline";
      const selectedParameters = isTimeline
        ? ["Carbon Saved tCO₂", "Total Intervention Costs (£)"]
        : [
            "ASHP Suitability",
            "ASHP Recommended Heat Pump Size [kW]",
            "ASHP Total Cost",
            "GSHP Suitability",
            "GSHP Recommended Heat Pump Size [kW]",
            "GSHP Total Cost",
            "Rooftop PV Suitability",
            "Rooftop PV Annual Generation [kWh]",
            "Rooftop PV Total Cost",
          ];
      const selectedColours = isTimeline ? timelineColours : glyphColours;

      drawLegend(ctx, panel, selectedParameters, selectedColours);
    },
  });
}
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

// Create the morphGlyphMap using the specified width and height
const morphGlyphMap = createMorphGlyphMap(1150, 820);
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
function createPlaceholderCanvas(
  width,
  height,
  message = "Please Add Intervention to see the decarbonisation timeline"
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f8f8f8";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#333";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, width / 2, height / 2);

  return canvas;
}
```

```js
function createGlyphMap(mapAggregate, width, height) {
  const modelAvailable =
    updateInterventions() && updateInterventions().length > 0;
  const needsModel =
    timeline_switch === "Decarbonisation Timeline" &&
    ["Aggregated Building", "LSOA Level", "LA Level"].includes(mapAggregate);

  if (needsModel && !modelAvailable) {
    return createPlaceholderCanvas(width, height);
  }

  switch (mapAggregate) {
    case "Individual Building":
      return createLeafletMap(width, height).leafletContainer;
    case "Aggregated Building":
      return glyphMap({ ...glyphMapSpec(width, height) });
    case "LSOA Level":
      // morphGlyphMap = createMorphGlyphMap(width, height);
      return morphGlyphMap;
    case "LA Level":
      return timeline_switch === "Decarbonisation Potentials"
        ? plotOverallPotential(glyphData, glyphColours, glyphVariables)
        : plotOverallStreamGraph(yearlySummaryArray, width, height, true, {
            totalCarbonSaved: timelineColours[0], // A green color for carbon saved
            budgetSpent: timelineColours[1], // A red color for budget spent
          });
    default:
      console.warn("[createGlyphMap] Unknown mapAggregate:", mapAggregate);
      return null;
  }
}
```

```js
// function interactiveDrawFn() {
//   console.log("calling interactive drawfn")
//   return function drawFn(cell, x, y, cellSize, ctx, global, panel) {
//     const cellData = cell.data;
//     const boundary = cell.getBoundary(0);
//     if (boundary[0] !== boundary[boundary.length - 1]) {
//       boundary.push(boundary[0]);
//     }

//     const boundaryFeat = turf.polygon([boundary]);
//     ctx.beginPath();
//     global.pathGenerator(boundaryFeat);
//     ctx.fillStyle = "rgba(210,210,210,0.5)";
//     ctx.fill();

//     ctx.lineWidth = 0.2;
//     ctx.strokeStyle = "rgb(156, 156, 156)";
//     ctx.stroke();

//     // interactive overlap drawing
//     // need to repeat some bits from the base
//     // drawGlyph(cell, x, y, cellSize, ctx, map_aggregate, timeline_switch);
//     if (timeline_switch === "Decarbonisation Potentials") {
//       const glyphVariables_lsoa = [
//         "ashp_suitability_true",
//         "ashp_size",
//         "ashp_total",
//         "gshp_suitability_true",
//         "gshp_size",
//         "gshp_total",
//         "pv_suitability_true",
//         "pv_generation",
//         "pv_total",
//       ];
//       // const rg = new RadialGlyph(
//       //   glyphVariables_lsoa.map((key) => cellData[key]),
//       //   glyphColours
//       // );
//       // rg.draw(ctx, x, y, cellSize / 2);

//       // draw the overlay
//       const rg_overlay = new RadialGlyph(
//         glyphVariables_lsoa.map((key) => getGlyphTooltipData[key]),
//         glyphColours,
//         {outlineOnly: true}
//       )
//       rg_overlay.draw(ctx, x, y, cellSize / 2);

//     } else if (timeline_switch === "Decarbonisation Timeline") {
//       const glyph = new StreamGraphGlyph(cellData, "year", null, {
//         upwardKeys: ["carbonSaved"],
//         downwardKeys: ["interventionCost"],
//           colors: {
//           "carbonSaved": timelineColours[0],
//           "interventionCost": timelineColours[1]
//         }
//       });

//       glyph.draw(ctx, x, y, cellSize, cellSize);
//     }

//   };
// }
```

```js
// interactive draw function - update on relative mode
// {
// show_relative;
// getGlyphTooltipData;
// console.log("Calling interactive draw function")
// morphGlyphMap.setGlyph({
//   drawFn: interactiveDrawFn(show_relative),
// });
// }
```

<!-- -------------- Leaflet Map Instantiation --------------- -->

```js
// const leafletContainer = document.createElement("div");
// document.body.appendChild(leafletContainer);

// safe remove leafletContainer
// remove existing leafletContainer if it exists
const existingLeafletContainer = document.getElementById("leafletContainer");
if (existingLeafletContainer) {
  existingLeafletContainer.remove();
}

const leafletContainer = document.createElement("div");
leafletContainer.id = "leafletContainer";
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
    // log(`Map filtered: ${idValues.length} buildings`);

    // Apply filter using the filter manager
    filterManager.applyMapToTableFilter(idValues);
  },
  onReset: () => {
    console.log(">> Map reset");
    setInitialData(null);
  },
  // tooltipFormatter: (props) => `<strong>${props.id}</strong>`,
  tooltipFormatter: (props) => `
    <div style="max-height:150px; max-width:200px; overflow-y:auto; padding:4px; font-size:12px;">
      <strong>${props.id}</strong>
      <hr style="margin:3px 0">
      ${Object.entries(props)
        .filter(([key]) => key !== "id" && key !== "geometry")
        .map(
          ([key, value]) =>
            `<div><span style="font-weight:bold">${key}:</span> ${value}</div>`
        )
        .join("")}
    </div>
  `,
});

mapInstance.addLayer("Buildings", getModelData, {
  clusterRadius: 50,
  fitBounds: false,
});

mapInstance.setSelectionLayer("Buildings");

mapInstance.addGeoJSONLayer("LSOA Boundary", lsoa_boundary, {
  style: {
    color: "#f7a55e",
    weight: 2,
    opacity: 0.65,
  },
  onEachFeature: (feature, layer) => {
    layer.bindPopup(feature.properties.LSOA21NM);
  },
  fitBounds: false,
});

mapInstance.zoomToDataBounds(true);

// map invalidation
// --- Robust ResizeObserver Implementation ---
const resizeObserver = new ResizeObserver((entries) => {
  // We only care about the container we are observing.
  for (let entry of entries) {
    if (entry.target === leafletContainer) {
      // CRITICAL CHECK: Ensure the map instance and its internal 'map' object exist
      // before trying to call Leaflet methods on them.
      if (mapInstance && mapInstance.map) {
        mapInstance.invalidateSize();
        mapInstance.zoomToDataBounds(true);
      }
    }
  }
});

resizeObserver.observe(leafletContainer);

// --- Cleanup Logic ---
// This will run when the environment determines the cell's output is no longer needed.
// `invalidation` is a common pattern in platforms like ObservableHQ.
if (typeof invalidation !== "undefined") {
  invalidation.then(() => {
    console.log("Cleaning up map resources...");
    // 1. Disconnect the observer FIRST to prevent it from firing again.
    resizeObserver.disconnect();

    // 2. Then, safely remove the map. Check if it exists before removal.
    if (mapInstance && mapInstance.map) {
      mapInstance.map.remove(); // Destroys the Leaflet map instance.
    }
  });
}
```

```js
// Leaflet map
function createLeafletMap(width, height) {
  log(">> Create Leaflet Map with... ", width, height);
  mapInstance.setDimensions(width, height);
  mapInstance.invalidateSize(true);
  return { leafletContainer, mapInstance };
}
```

<!-- ----------------  Main Plot  ---------------- -->

```js
// selectedInterventionIndex;
// Transform recap object into an array for easier processing
const yearlySummaryArray = getResults.yearlySummary
  ? Object.entries(getResults.yearlySummary).map(([year, values]) => ({
      year: Number(year),
      ...values,
    }))
  : null;

console.log("yearlySummaryArray", yearlySummaryArray);
console.log("getResults.yearlySummary", getResults.yearlySummary);
console.log("getResults", getResults);

// Normalize the data for chart
let keysToNormalise = [
  "budgetSpent",
  "buildingsIntervened",
  "totalCarbonSaved",
];
```

<!--------------- Reset everything and move on --------------->

```js
function resetState() {
  log("[RESET] Requesting application state reset...");
  setResetRequested(true);
}
```

```js
// Handle component resets to avoid circular references
{
  // This cell responds to reset requests
  getResetRequested;

  if (getResetRequested) {
    log("[RESET] Processing application state reset...");

    try {
      // // Reset the table - clear filters and restore original data
      // table.resetTable();
      // mapInstance.resetMap();
      setTableRule([]);
      setSelectedInterventionIndex(null);
      setInitialData(null);

      // cleaning up session storages
      // sessionStorage.removeItem("initialids");
      // sessionStorage.removeItem("allocations");

      // Reset model data to the original buildings data
      setModelData(buildingsData);
    } catch (err) {
      error("[RESET] Error during reset:", err);
    }
    // Reset the flag after processing
    setResetRequested(false);
  }
}
```
