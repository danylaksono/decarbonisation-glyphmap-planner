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
// const [detailOnDemand, setDetailOnDemand] = useState(null); // detail on demand on map
// const [currentConfig, setCurrentConfig] = useState({}); // current configuration
// const [tableFiltered, setTableFiltered] = useState([]); // filtered table
// const [allocations, setAllocations] = useState([]);
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
```

```js
const [getAppState, setAppState] = useState(null); // APP STATE
```

```js
console.log(">> Current App State: ", getAppState);
```

```js
// ---- REMAPPING APP STATE ----
{
  // DATA DATA DATA
  // updateInterventions();
  // console.log(">> App State", updateInterventions().length, "results length");
  // console.log(">> App State:", getAppState);
  if (updateInterventions() && updateInterventions().length > 0) {
    // Model has been run and results are available
    if (map_aggregate === "Aggregated Building") {
      // console.log( ">> App State: Model results available (Aggregated Building)");
      setAppState("Model Result - Aggregated Building");
      if (timeline_switch === "Decarbonisation Potentials") {
        setAppState(
          "Model Result - Aggregated Building - Decarbonisation Potentials"
        );
        setGlyphData(getModelData);
      } else if (timeline_switch === "Decarbonisation Timeline") {
        setAppState(
          "Model Result - Aggregated Building - Decarbonisation Timeline"
        );
        setGlyphData(getModelData); // will be aggregated in glyph function
      }
    } else if (map_aggregate === "LSOA Level") {
      // console.log(">> App State: Model results available (LSOA Level)");
      setAppState("Model Result - LSOA Level");
      if (timeline_switch === "Decarbonisation Potentials") {
        setAppState("Model Result - LSOA Level - Decarbonisation Potentials");
        setGlyphData(keydata);
      } else if (timeline_switch === "Decarbonisation Timeline") {
        setAppState("Model Result - LSOA Level - Decarbonisation Timeline");
        setGlyphData(normalisedTimeseriesLookup);
      }
    } else if (map_aggregate === "LA Level") {
      // console.log(">> App State: Model results available (Local Authority Level)");
      setAppState("Model Result - LA Level");
      if (timeline_switch === "Decarbonisation Potentials") {
        setAppState("Model Result - LA Level - Decarbonisation Potentials");
      } else if (timeline_switch === "Decarbonisation Timeline") {
        // setGlyphData(updateInterventions());
        setAppState("Model Result - LA Level - Decarbonisation Timeline");
      }
    } else {
      // console.log(
      //   ">> App State: Model results available (No specific aggregation, Individual Buildings)"
      // );
      setAppState("Model Result - Individual Buildings");
      setGlyphData(getModelData);
    }
  } else {
    // App state: No active model or model started over
    if (map_aggregate === "Aggregated Building") {
      // console.log(">> App State: No active model (Aggregated Building)");
      setAppState("All Data - Aggregated Building");
      if (timeline_switch === "Decarbonisation Potentials") {
        // setGlyphData(keydata);
        setAppState(
          "All Data - Aggregated Building - Decarbonisation Potentials"
        );
      } else if (timeline_switch === "Decarbonisation Timeline") {
        // setGlyphData(updateInterventions());
        setAppState(
          "All Data - Aggregated Building - Decarbonisation Timeline"
        );
      }
    } else if (map_aggregate === "LSOA Level") {
      // console.log(">> App State: No active model (LSOA Level)");
      setAppState("All Data - LSOA Level");
      if (timeline_switch === "Decarbonisation Potentials") {
        setAppState("All Data - LSOA Level - Decarbonisation Potentials");
        setGlyphData(keydata);
      } else if (timeline_switch === "Decarbonisation Timeline") {
        setAppState("All Data - LSOA Level - Decarbonisation Timeline");
        // no timeline should be shown when no model output is available
      }
    } else if (map_aggregate === "LA Level") {
      // console.log(">> App State: No active model (Local Authority Level)");
      // no glyphs for LA level, only charts
      setAppState("All Data - LA Level");
      if (timeline_switch === "Decarbonisation Potentials") {
        // setGlyphData(keydata);
        setAppState("All Data - LA Level - Decarbonisation Potentials");
      } else if (timeline_switch === "Decarbonisation Timeline") {
        // setGlyphData(updateInterventions());
        setAppState("All Data - LA Level - Decarbonisation Timeline");
      }
    } else {
      // console.log(">> App State: No active model (Individual Buildings)");
      setAppState("All Data - Individual Buildings");
      setGlyphData(buildingsData);
      // use individual buildings data for glyphs
      // setGlyphData(buildingsData);
    }
  }
}
```

```js
{
  // printing out variables
  console.log("============== Printing out variables ==============");
  console.log(" Current App STATE:", getAppState);
  console.log("  > getModelData:", getModelData);
  console.log("  > getGlyphData:", getGlyphData);
  console.log("  > groupedData:", groupedData);
  console.log("  > keydata:", keydata);
  console.log("  > normalisedTimeseriesLookup:", normalisedTimeseriesLookup);
  console.log("  > timeSeriesLookup:", timeSeriesLookup);
  console.log("============== End of variables ======================");
}
```

<!------------ HANDLE BI-DIRECTIONAL TABLE-MAP SELECTION -------------->

```js
const [getInitialData, setInitialData] = useState(null); // INITIAL DATA
const [getModelData, setModelData] = useState(buildingsData); // MODEL DATA
const [getGlyphData, setGlyphData] = useState([]); // GLYPH DATA
// table
const [getTableRule, setTableRule] = useState([]);
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
                      } else {
                        // clicking on background
                        console.log("No intervention selected");
                        setSelectedInterventionIndex(null);
                        filterStackedInterventions();
                      }
                    },
                    width || 800,
                    height || 300,
                    true // tooltips enabled
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
          <!-- ${(map_aggregate === "Building Level") ? toggleGridmaps : ""} -->
          ${(map_aggregate === "LSOA Level") ? html`${playButton} ${morphFactorInput}` : ""} 
          <!-- ${html`${playButton} ${morphFactorInput}`} -->
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
log("[DEBUG] Grouped Data: ", groupedData);
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
const toggleGridmaps = Inputs.toggle({ label: "Gridmaps?", value: true });
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
    const { stackedResults, formattedRecaps } = processIntervention(
      formData,
      buildingsForIntervention
    );

    // Only update state at the very end, minimizing reactivity
    setInterventions(formattedRecaps);
    setResults(stackedResults);

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
  // console.log("Updating time series lookup after new intervention...");
  // const newGroupedData = MiniDecarbModel.group(stackedResults.buildings, [
  //   "lsoa",
  //   "interventionYear",
  // ]);

  // Object.keys(newGroupedData).forEach((lsoaCode) => {
  //   // Try to get initialYear and duration from formattedRecaps for this LSOA
  //   let initialYear = null;
  //   let duration = null;
  //   if (formattedRecaps && Array.isArray(formattedRecaps)) {
  //     // Find the recap for this LSOA (if any)
  //     const recap = formattedRecaps.find(
  //       (r) => r.lsoa === lsoaCode || r.code === lsoaCode
  //     );
  //     if (recap) {
  //       initialYear = recap.initialYear;
  //       duration = recap.duration;
  //       console.log(
  //         `Using initialYear=${initialYear}, duration=${duration} for LSOA ${lsoaCode}`
  //       );
  //     } else {
  //       // If no specific recap for this LSOA, try to use overall intervention details
  //       // This ensures we have consistent timeline ranges across all LSOAs
  //       if (formattedRecaps.length > 0) {
  //         // Use the first intervention as a fallback
  //         initialYear = formattedRecaps[0].initialYear;
  //         duration = formattedRecaps[0].duration;
  //         console.log(
  //           `Using default initialYear=${initialYear}, duration=${duration} for LSOA ${lsoaCode}`
  //         );
  //       }
  //     }
  //   }
  //   const timeSeriesData = transformInterventionData(
  //     newGroupedData,
  //     lsoaCode,
  //     timelineDataArray,
  //     initialYear,
  //     duration
  //   );
  //   if (timeSeriesData && timeSeriesData.length > 0) {
  //     timeSeriesLookup[lsoaCode] = timeSeriesData;
  //   }
  // });

  // return the stacked results
  return {
    stackedResults,
    formattedRecaps,
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
const timeSeriesLookup = groupedData
  ? composeTimeseriesLookup(groupedData)
  : {};
```

```js
const normalisedTimeseriesLookup = normaliseTimeSeriesLookup(timeSeriesLookup, [
  "interventionCost",
  "carbonSaved",
  "numInterventions",
]);
// console.log("[DEBUG] timeSeriesLookup", timeSeriesLookup);
```

```js
// passing data for the glyphmaps
// old DATA DATA DATA
// {
//   if (
//     map_aggregate === "Individual Building" || // fallbacks
//     map_aggregate === "Aggregated Building" ||
//     map_aggregate === "LA Level" // fallbacks
//   ) {
//     // use the individual data
//     setGlyphData(buildingsData);
//   } else if (map_aggregate === "LSOA Level") {
//     // LSOA level data is presented as LSOA boundary
//     // use prepared rather than on the fly processing data
//     if (timeline_switch == "Decarbonisation Potentials") {
//       // use the aggregated LSOA decarbonisation potential
//       // console.log("Setting glyph data for LSOA level", keydata);
//       setGlyphData(keydata);
//     } else {
//       // timeline_switch == "Decarbonisation Timeline"
//       // console.log(
//       //   "[DEBUG] timeline_switch == Decarbonisation Timeline",
//       //   timeline_switch
//       // );
//       // use timeline data
//       setGlyphData(normalisedTimeseriesLookup);
//       // setGlyphData(timeSeriesLookup);
//     }
//   }
// }
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
function glyphMapSpec(width = 800, height = 600) {
  const config = {
    coordType: {
      "Individual Building": "mercator",
      "Aggregated Building": "mercator",
      "LSOA Level": "notmercator",
      "LA Level": "mercator", // fallback for LA Level.
    },
    dataSource: {
      // default, initial datasources
      "Individual Building": () => Object.values(getGlyphData),
      "Aggregated Building": () => Object.values(getGlyphData),
      "LSOA Level": () => Object.values(getGlyphData),
      "LA Level": () => Object.values(getModelData),
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

  const getCellData = (cell, aggregateLevel, timelineSwitch) => {
    // there are only four cases of cell.data in glyph maps:
    // aggregated building - decarbonisation potentials
    // aggregated building - decarbonisation timeline
    // lsoa level - decarbonisation potentials
    // lsoa level - decarbonisation timeline
    // + two combinations of selected intervention/all interventions

    if (!cell.records) return {};

    // console.log("APPSTATE", getAppState);

    // Performing aggregation based on the aggregate level
    if (aggregateLevel === "Aggregated Building") {
      return aggregateValues(cell.records, glyphVariables, "sum");
    } else {
      // LSOA Level

      //   for LSOA level, aggregate by boundary
      const lsoaCode = cell.records[0].code;

      if (timelineSwitch === "Decarbonisation Potentials") {
        // const glyphData = getGlyphData?.data?.[lsoaCode];
        const glyphData = getGlyphData?.[lsoaCode] || {};
        return glyphData;
      } else if (timelineSwitch === "Decarbonisation Timeline") {
        const glyphData = getGlyphData?.[lsoaCode];
        // console.log("[DEBUG] Decarbonisation Timeline glyph", getModelData);
        return cell.records[0].data || {};
        // return glyphData || {};
      }

      return glyphData; // fallback, should not happen
    }
  };

  const drawGlyph = (
    cell,
    x,
    y,
    cellSize,
    ctx,
    aggregateLevel,
    timelineSwitch
  ) => {
    const cellData = cell.records[0].data?.properties || cell.data;

    // Draw the glyph based on the timeline switch
    if (timelineSwitch === "Decarbonisation Potentials") {
      // console.log("[DEBUG] Decarbonisation Potentials glyph", cellData);
      const { variables, colors } = config.timelineConfig[timelineSwitch];
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
      // draw simple circle for debugging
      // console.log("DEBUGGING TIMESRIESS", timeline_switch, map_aggregate);
      // console.log("DEBUGGING TIMESRIESS 2", cellSize, config.coordType);
      // console.log("[DEBUG] Decarbonisation Timeline glyph", cellData);
      // const { variables, colors } = config.timelineConfig[timelineSwitch];
      // const lg = new LineChartGlyph(cellData, variables, null, colors);
      // lg.draw(ctx, x, y, 500, 500);
    } else {
      // Default case, draw a simple circle for debugging
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
    // coordType: "mercator",
    initialBB: transformCoordinates(turf.bbox(regular_geodata)),
    data: config.dataSource[map_aggregate](),
    getLocationFn: config.locationFn[map_aggregate],
    discretisationShape: "grid",
    interactiveCellSize: true,
    interactiveZoomPan: true,
    mapType: "CartoPositron",
    cellSize: 50,
    width,
    height,

    customMap: {
      scaleParams: [],

      initFn: (cells, cellSize, global, panel) => {
        // console.log("initFn global", cells, cellSize, global, panel);
        // console.log("initFn global", global);
      },

      preAggrFn: (cells, cellSize, global, panel) => {},

      aggrFn: (cell, row, weight, global, panel) => {
        cell.records = cell.records || [];
        cell.records.push(row);
      },

      postAggrFn: (cells, cellSize, global, panel) => {
        for (const cell of cells) {
          cell.data = getCellData(cell, map_aggregate, timeline_switch);
        }

        if (map_aggregate === "Aggregated Building") {
          const dataArray = cells.map((cell) => cell.data);
          const normalisedData = dataArray
            ? normaliseData(dataArray, glyphVariables)
            : [];
          cells.forEach((cell, index) => {
            cell.data = normalisedData[index];
          });
        }

        // const canvas = d3.select(panel).select("canvas").node();
        // canvas.addEventListener("click", function (evt) {
        //   const rect = canvas.getBoundingClientRect();
        //   const x = evt.clientX - rect.left;
        //   const y = evt.clientY - rect.top;
        //   global.clickedCell =
        //     cells.find((cell) => insideCell(cell, x, y)) || null;
        // });
      },

      preDrawFn: (cells, cellSize, ctx, global, panel) => {
        if (!cells?.length) {
          console.error("No cells data available");
          return;
        }

        global.pathGenerator = d3.geoPath().context(ctx);
        global.colourScalePop = "#cccccc";
      },

      drawFn: (cell, x, y, cellSize, ctx, global, panel) => {
        const boundary = cell.getBoundary(0);
        if (boundary[0] !== boundary[boundary.length - 1]) {
          boundary.push(boundary[0]);
        }

        // console.log(">>> drawFn boundary", boundary);

        const boundaryFeat = turf.polygon([boundary]);
        ctx.beginPath();
        global.pathGenerator(boundaryFeat);
        ctx.fillStyle = "#efefef";
        ctx.fill();

        ctx.lineWidth = 0.2;
        ctx.strokeStyle = "rgb(7, 77, 255)";
        ctx.stroke();

        if (global.clickedCell === cell) {
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgb(250,250,250)";
          ctx.stroke();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgb(50,50,50)";
          ctx.stroke();
        }

        // console.log("timeline_switch", timeline_switch, "xy", x, y);
        // console.log("timeline_switch ctx", ctx);

        drawGlyph(cell, x, y, cellSize, ctx, map_aggregate, timeline_switch);
      },

      postDrawFn: (cells, cellSize, ctx, global, panel) => {},
    },
  };
}
```

<!-- morph animation logic -->

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
      global.colourScalePop = "#cccccc";

      //draw a coloured background polygon
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
function createGlyphMap(mapAggregate, width, height) {
  console.log(
    "[createGlyphMap] mapAggregate:",
    mapAggregate,
    "timeline_switch:",
    timeline_switch,
    "toggle_grids:",
    toggle_grids
  );
  switch (mapAggregate) {
    case "Individual Building":
      return createLeafletMap(width, height).leafletContainer;
    case "Aggregated Building":
      // return toggle_grids
      // ? glyphMap({ ...glyphMapSpec(width, height) })
      // : createLeafletMap(width, height).leafletContainer;
      return glyphMap({ ...glyphMapSpec(width, height) });
    case "LSOA Level":
      return morphGlyphMap;
    case "LA Level":
      return timeline_switch === "Decarbonisation Potentials"
        ? plotOverallPotential(glyphData, glyphColours, glyphVariables)
        : plotOverallTimeline(yearlySummaryArray);
    default:
      console.warn("[createGlyphMap] Unknown mapAggregate:", mapAggregate);
      return null;
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
  fitBounds: true,
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
});

// map invalidation
if (leafletContainer && mapInstance && mapInstance.map) {
  const resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      if (entry.target === leafletContainer) {
        mapInstance.invalidateSize();
      }
    }
  });
  resizeObserver.observe(leafletContainer);
}
```

```js
// Leaflet map
function createLeafletMap(width, height) {
  log(">> Create Leaflet Map with... ", width, height);
  mapInstance.setDimensions(width, height);

  return { leafletContainer, mapInstance };

  mapInstance.invalidateSize(true);
}
```

<!-- ----------------  Main Plot  ---------------- -->

```js
// selectedInterventionIndex;
// Step 1: Transform recap object into an array for easier processing
const yearlySummaryArray = getResults.yearlySummary
  ? Object.entries(getResults.yearlySummary).map(([year, values]) => ({
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
