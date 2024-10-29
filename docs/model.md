---
title: Testing data
toc: false
sidebar: false
footer: false
sql:
  oxford: ./data/oxford_decarbonisation_data.parquet
---

```js
import {
  TimeGlyph,
  GlyphCollection,
} from "./components/glyph-designs/timeGlyph.js";
import { Model } from "./components/model.js";
// import * as L from "npm:leaflet";
import maplibregl from "npm:maplibre-gl@2.0.0";
// import font awesome
```

<!-------- Stylesheets -------->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/bulma@1.0.0/css/bulma.min.css"
>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css">
<link href="https://unpkg.com/maplibre-gl@2.1.9/dist/maplibre-gl.css" rel="stylesheet" />
<link
  rel="stylesheet"
  href="./styles/dashboard.css"
>

<style>
body, html {
  height: 100%;
  margin: 0 !important;
  overflow: hidden;
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
    grid-template-rows: 1fr 1fr; /* Two equal rows */
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
    grid-template-columns: 1fr 3fr; /* Split bottom row into 1/3 ratio */
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
  cursor: grabbing;}

</style>

<!-------- HTML Layout -------->

<div class="grid-container" style="padding:8px; height:92vh;">
  <!-- Left panel (two boxes, stacked vertically) -->
  <!-- HTML Structure -->
  <div id="left-panel">
    <div id="project-properties" class="card">
      <h1>Decarbonisation Dashboard</h1>
      <br><br>
      <div class="form-group">
        <label for="years-slider">No. of years:</label>
        ${yearsInput}
        <span id="years-value">${years}</span>
      </div>
      <div class="form-group">
        <label for="total-budget">Total Budget:</label>
        <input type="text" id="total-budget" placeholder="Enter budget">
      </div>
      <br>
      <button class="create-btn">Create Project</button>
    </div>
    <div class="card">
      Interventions
      <nav class="panel" id="panel">
        <!-- <p class="panel-heading"></p> -->
        <!-- List generated here -->
      </nav>
      <button class="create-btn">Add interventions</button>
      </div>
  </div>

  <!-- Main panel (right side) -->
  <div id="main-panel">
    <div class="main-top">
      <div class="card">
        <div id="map-container" style="min-width: 20em; height: 100%;">
        </div>
      </div>
      <div class="card" style="min-width: 30em;">
        ${Inputs.table(newBuildings, {  
            rows: 18,
            maxWidth: 840,
            multiple: true,
        })}
        </div>
    </div>
    <div class="main-bottom">
      <div class="card">Sculptable glyph/Details on demand
        ${resize((width, height) => showGlyphs(width-20, height-30))}
      </div>
      <div class="card">
        General Overview graph
        ${resize((width, height) => showPlot(width-20, height-30))}
        </div>
    </div>
  </div>
</div>

```sql id=oxford_data
  SELECT DISTINCT
    "LSOA code" AS lsoa,
    "MSOA code" AS msoa,
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
function createCanvas(width, height) {
  //CREATE CANVAS AND GLYPHS
  let canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = width;

  //MODEL BUILDING

  //repack actual data in a more compact format

  //configure model specifications (for now only two tech, ASHP and PV, hardcoded)
  let modelSpec = {
    nr_years: 10,
    yearly_funding: 300000000,
    tech_allocation: { ASHP: 0.5, PV: 0.5 },
  };

  //create (and run) model
  let model = new Model(newBuildings, modelSpec);

  //to support global normalisations and, in the future, mirrored interactions
  // let glyphCollection = new GlyphCollection();

  //we start prepping the data that goes into the glyphs

  //we group interventions first by lsoa, then technology, then year
  let lsoaTechYear = model
    .getInterventions()
    .groupBy("lsoa")
    .groupBy("type")
    .groupBy("year")
    .all();
  console.log("Interventions (grouped lsoa->tech->year)", lsoaTechYear);

  //get building data at each simulation year, split by lsoa
  let buildingsYearLsoas = d3
    .range(modelSpec.nr_years)
    .map((y) => model.getBuildings(y).groupBy("lsoa").all());
  console.log("Buildings by year (grouped lsoa)", buildingsYearLsoas);

  //prepare glyphs, for now two options:
  //1. show all technologies (ASHP and PV for now) stacked on top of each other,
  //either cummulatively or not (allTech = true)
  //2. show one tech (ASHP for now) with yearly savings and cummulative potential for saving (allTech = false)

  let allTech = false; //allTech will show all technologies as stacked time chart
  //!allTech will show ASHP saved and potential
  let cummulative = false; //cummulative savings?
  //only used when !allTech
  let sqrt = true; // potential for saving is much larger than actual saving and
  //showing it in sqrt scale might be handy
  let stacked = false; //stacked=false (overlaid) is better for non-cummulative, !allTech, overlaid is better

  let glyphCollection = prepareGlyphs({
    lsoaTechYear,
    buildingsYearLsoas,
    modelSpec,
    allTech,
    cummulative,
    sqrt,
    stacked,
  });

  // console.log(glyphCollection.glyphs);
  glyphCollection.glyphs.map((g, i) =>
    g.draw(ctx, Math.floor(i / 10) * 50, (i % 10) * 50, 40, 50)
  );

  return canvas;
}
```

```js
// Modularise glyph preparation
function prepareGlyphs({
  lsoaTechYear,
  buildingsYearLsoas,
  modelSpec,
  allTech = true,
  cummulative = false,
  sqrt = false,
  stacked = false,
  tech = "ASHP",
}) {
  let glyphCollection = new GlyphCollection();

  // Adjust settings based on allTech flag
  if (allTech) {
    cummulative = false;
    stacked = true;
  } else {
    cummulative = false;
    sqrt = true;
    stacked = false;
  }

  // Loop through each LSOA
  Object.keys(lsoaTechYear).map((lsoaCode, i) => {
    let lsoa = lsoaTechYear[lsoaCode];
    let glyphData = {};

    // Stacked glyph with saved MW for all categories
    if (allTech) {
      Object.keys(modelSpec.tech_allocation).map((tech) => {
        glyphData[tech] = d3
          .range(modelSpec.nr_years)
          .map((year) =>
            lsoa[tech][year] == null
              ? 0
              : d3.sum(lsoa[tech][year].map((i) => i.saved))
          );
      });
    } else {
      // Stacked glyph with saved MW vs. total saving potential
      glyphData["potential"] = d3
        .range(modelSpec.nr_years)
        .map((year) =>
          d3.sum(
            buildingsYearLsoas[year][lsoaCode]
              .filter((b) => b.ashp_suitability)
              .map((b) => b.heat_demand)
          )
        );
      if (sqrt)
        glyphData["potential"] = glyphData["potential"].map((v) =>
          Math.sqrt(v)
        );

      // Cumulative or individual savings
      let sum = 0;
      glyphData[tech] = d3.range(modelSpec.nr_years).map((year) => {
        if (cummulative)
          sum +=
            lsoa[tech][year] == null
              ? 0
              : d3.sum(lsoa[tech][year].map((i) => i.saved));
        else
          sum =
            lsoa[tech][year] == null
              ? 0
              : d3.sum(lsoa[tech][year].map((i) => i.saved));

        return sum;
      });

      if (sqrt) glyphData[tech] = glyphData[tech].map((v) => Math.sqrt(v));
    }

    let tg = new TimeGlyph(glyphData, glyphCollection, stacked);
    glyphCollection.add(tg);
  });

  glyphCollection.recalculate = function () {
    glyphCollection.norm = d3.max(this.glyphs.map((g) => g.maxAllTime()));
    console.log("norm val: " + glyphCollection.norm);
  };
  glyphCollection.recalculate();

  return glyphCollection;
}
```

```js
function showGlyphs(width, height) {
  // Dummy data for testing the TimeGlyph drawing function
  const dummyData = {
    ASHP: [0.1, 0.2, 0.3, 0.4, 0.5],
    PV: [0.2, 0.1, 0.4, 0.3, 0.2],
  };

  // Create a new TimeGlyph instance with the dummy data
  const timeGlyph = new TimeGlyph(dummyData);

  // Create a canvas context for drawing
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Draw the glyph on the canvas
  timeGlyph.draw(ctx, 50, 50, 400, 400);

  return canvas;
}
```

```js
const unemployment = Array.from({ length: 100 }, (_, i) => {
  const date = new Date(2020, 0, i); // Generate dates in 2020
  return [
    { date, unemployed: Math.random() * 500 + 200, industry: "Manufacturing" },
    { date, unemployed: Math.random() * 400 + 150, industry: "Retail" },
    { date, unemployed: Math.random() * 300 + 100, industry: "Healthcare" },
    { date, unemployed: Math.random() * 250 + 120, industry: "Construction" },
    { date, unemployed: Math.random() * 200 + 80, industry: "Education" },
  ];
}).flat();

function showPlot(width, height) {
  return Plot.plot({
    marginLeft: 50,
    width: width,
    height: height,
    y: {
      grid: true,
      label: "↑ Unemployed (thousands)",
    },
    marks: [
      Plot.areaY(unemployment, {
        x: "date",
        y: "unemployed",
        fill: "industry",
        title: "industry",
      }),
      Plot.ruleY([0]),
    ],
  });
}
```

```js
const yearsInput = html`<input
  style="max-width: 300px;"
  type="range"
  step="1"
  min="1"
  max="20"
/>`;
```

```js
const years = Generators.input(yearsInput);
```

```js
const map = new maplibregl.Map({
  boxZoom: true,
  pitch: 0,
  bearing: 0,
  maplibreLogo: true,
  container: "map-container",
  center: [110, -7],
  zoom: 12,
  style:
    "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
  // see more: https://deck.gl/docs/api-reference/carto/basemap
  scrollZoom: true,
});

map.fitBounds([
  [93.216, -12.922],
  [143.07, 7.738],
]);

// invalidation.then(() => map.remove());
```

```js
const repositories = [
  { id: 1, name: "Air Source heatpump", icon: "fa fa-bolt" },
  { id: 2, name: "Solar PV Panel", icon: "fa fa-book" },
  {
    id: 3,
    name: "Ground Source Heat Pump",
    icon: "fa fa-thermometer-full",
  },
];

// Drag behavior for reordering
const drag = d3
  .drag()
  .on("start", function (event, d) {
    d3.select(this).classed("dragging", true);
    d3.select(this).raise(); // Bring the dragged item to the top
  })
  .on("drag", function (event, d) {
    d3.select(this).style("transform", `translateY(${event.y}px)`);
  })
  .on("end", function (event, d) {
    d3.select(this).classed("dragging", false).style("transform", "none");

    // Determine the new order based on the positions
    const newOrder = [...d3.selectAll(".panel-block").nodes()]
      .sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
      )
      .map((node) =>
        repositories.find((repo) => repo.id == node.getAttribute("data-id"))
      );

    // Update repositories and re-render
    repositories.length = 0;
    repositories.push(...newOrder);
    generateList(repositories);
  });

// Function to generate the list dynamically
function generateList(repos) {
  const panel = d3.select("#panel");

  // Bind data to elements
  panel
    .selectAll(".panel-block")
    .data(repos, (d) => d.id)
    .join((enter) =>
      enter
        .append("p")
        .attr("class", "panel-block")
        .attr("data-id", (d) => d.id)
        .call(drag) // Attach drag behavior
        .html(
          (d) =>
            `<span class="panel-icon"><i class="${d.icon}" aria-hidden="true"></i></span> ${d.name}`
        )
    );
}

// Initialize the list
generateList(repositories);
```
