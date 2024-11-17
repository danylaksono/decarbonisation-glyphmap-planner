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
import { inferTypes, normaliseData } from "./components/helpers.js";
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
const buildingsData = [...oxford_data];
const flatData = buildingsData.map((p) => ({ ...p }));
const allColumns = Object.keys(buildingsData[0]);
```

```js
// oxford boundary data
const lsoa_boundary = FileAttachment(
  "./data/oxford_lsoa_boundary.geojson"
).json();
// display(lsoa_boundary);
```

<!-- ------------ Getter-Setter ------------ -->

```js
function useState(value) {
  const state = Mutable(value);
  const setState = (value) => (state.value = value);
  return [state, setState];
}
const [selected, setSelected] = useState({});
const [getIntervention, setIntervention] = useState([]);
const [getResults, setResults] = useState([]);
const [selectedIntervention, setSelectedIntervention] = useState(null);
const [detailOnDemand, setDetailOnDemand] = useState(null);
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
    gap: 8px; /* gap between grid items */
    padding: 8px;
    height: 92vh;
  }

  /* Left panel boxes */
  #left-panel {
     /* Spans 2 rows */
    display: grid;
    /* grid-template-rows: 1fr 1fr; Two equal rows */
    gap: 8px;
  }


  /* Right panel boxes */
  #main-panel {
    /*grid-row: span 2;  Spans 2 rows */
    display: grid;
    grid-template-rows: 4fr 2fr;
    height: 92vh;
    gap: 8px;
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
        ${startYearInput}
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
        ${html`<button class="create-btn" type="button" onclick=${addNewIntervention}>
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
      Sortable Table
      ${table.getNode()}
      </div>
      <div class="card" style="overflow-x:hidden; min-width: 400px;">
      Map View
      ${glyphmapTypeInput}
      ${resize((width, height) => glyphMap(glyphMapSpec(width, height)))}
      ${morphFactorInput}
      </div>
    </div>
    <div class="main-bottom">
      <div class="card">
      <h2> General overview graph </h2>
      <br>
      <div id="graph-container">
      <!-- List generated here -->
          <ul id="interventions-list">
            ${html`${interventions.map(
              (config, index) =>
                html`<li
                  onclick=${() => selectIntervention(index)} 
                  style="cursor: pointer; padding: 8px; border-bottom: 1px solid #ddd;"
                >
                  <span>${config.tech.name} (Start Year: ${config.initial_year})</span>
                  <button
                    onclick=${(e) => {
                      e.stopPropagation();
                    }}
                    style="border:none; background:none; cursor:pointer; margin-left: 8px;"
                  >
                    <i class="fas fa-edit" style="color:green;"></i>
                  </button>
                  <button
                    onclick=${(e) => {
                      e.stopPropagation(); // Prevent the click event on the list item
                      removeIntervention(index);
                    }}
                    style="border:none; background:none; cursor:pointer; margin-left: 8px;"
                  >
                    <i class="fas fa-trash" style="color:red;"></i>
                  </button>
                </li>`
            )}`}
          </ul>
      </div>
    </div>
    <div class="card">
    Details on demand
    ${resize((width, height) => drawDetailOnDemand(width, height))}
    </div>
  </div>
</div>

```js
// for dealing with selected list items
let selectedInterventionIndex = null; // Track the selected intervention index

function selectIntervention(index) {
  // Update the selected index
  selectedInterventionIndex = index;

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
    value: "ASHP",
  }
);
techsInput.style["max-width"] = "300px";
const technology = Generators.input(techsInput);
// display(techsInput);

// Total Budget
const totalBudgetInput = Inputs.text({
  label: html`<b>Total Budget</b>`,
  placeholder: "Available Budget in GBP",
  value: 100_000_000,
  // submit: html`<button class="create-btn" style="color:white;">Submit</button>`,
});
totalBudgetInput.style["max-width"] = "300px";
const total_budget = Generators.input(totalBudgetInput);

// Start Year
const startYearInput = Inputs.text({
  label: html`<b>Start Year</b>`,
  placeholder: "Starting year?",
  value: 2024,
  // submit: html`<button class="create-btn" style="color:white;">Submit</button>`,
});
startYearInput.style["max-width"] = "300px";
// console.log("startYearInput.style", startYearInput.columns);
const start_year = Generators.input(startYearInput);

// Project Length
const projectLengthInput = Inputs.range([0, 20], {
  // label: html`<b>Project length in years</b>`,
  step: 1,
  value: 10,
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
});
const allocation_type = Generators.input(allocationTypeInput);

const priorityInput = Inputs.form([
  Inputs.select([...allColumns, "None"], {
    label: html`<b>Sorting Priority</b>`,
    value: "None",
  }),
  Inputs.radio(["asc", "desc"], {
    label: "Order",
    value: "asc",
  }),
]);
const priority_input = Generators.input(priorityInput);

const filterInput = Inputs.form([
  Inputs.select([...allColumns, "None"], {
    label: html`<b>Filter Column</b>`,
    value: "None",
  }),
  Inputs.text({
    label: "Filter Value",
    placeholder: "Enter filter value",
  }),
]);
const filter_input = Generators.input(filterInput);

const glyphmapTypeInput = Inputs.radio(
  ["Decarbonisation Time series", "Interventions"],
  {
    label: "Type of map",
    value: "Polygons",
  }
);
const glyphmapType = Generators.input(glyphmapTypeInput);

const morphFactorInput = html`<input
  style="width: 100%; max-width:450px;"
  type="range"
  value="1"
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
// store intervention results
let interventions = getIntervention;
let results = getResults;
```

<!-- ---------------- Functions ---------------- -->

```js
// create config template
function createConfigTemplate(start_year, allocations) {
  return {
    initial_year: Number(start_year),
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

// handle form submission
function addNewIntervention() {
  const new_start_year = start_year;
  const new_tech = technology;
  const new_allocations = allocations;

  // Retrieve techConfig from the selected technology
  const techConfig = listOfTech[new_tech];
  // console.log("techConfig", techConfig);

  // Example filters and priorities
  const filters = [(b) => b.properties["substation_headroom"] >= 500];
  const priorities = [{ name: "substation_capacity_rating", order: "asc" }];

  addIntervention(
    techConfig,
    new_start_year,
    new_allocations,
    filters,
    priorities
  );
}
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
console.log("selectedIntervention", selectedIntervention);
```

<!-- ---------------- Sortable Table ---------------- -->

```js
// columns to show in the table
const cols = [
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
  {
    column: "intervention",
    nominals: null,
  },
];
```

```js
const tableData = selectedIntervention
  ? selectedIntervention.allBuildings.map((building) => ({
      ...building.properties,
      intervention: building.isIntervened,
    }))
  : flatData;

const table = new createTable(tableData, cols, (changes) => {
  console.log("Table changed:", changes);
  setSelected(changes.selection);
});
```

```js
console.log("Test inferring data types", inferTypes(tableData));
```

<!-- ---------------- Glyph Maps ---------------- -->

```js
// glyphmap basic specs
function glyphMapSpec(width = 800, height = 600) {
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
          setDetailOnDemand(cell.data);
          return `Total Building Area: ${cell.building_area.toFixed(2)} m^2`;
        }
      },
    },
  };
}
```

```js
const glyphMapSpecWgs84 = {
  ...glyphMapSpec,
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
