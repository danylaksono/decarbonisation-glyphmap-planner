---
title: Testing sortableTable
toc: false
sidebar: false
footer: false
sql:
  oxford: ./../data/oxford_decarbonisation_data.parquet
---

```js
// import { createTable } from "./../components/sorterTable.js";
import { sorterTable } from "./../components/sorterTableClass.js";
```

# Table Experiments 2

```sql id=oxford_data
  SELECT DISTINCT
    "UPRN" AS id,
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
FROM oxford b
WHERE substation_peakload >= 500 AND pv_generation is not null;
```

```js
const buildings = [...oxford_data];
// const flattenned = buildings.map((p) => ({ ...p }));
// display(buildings);
// display(flattenned);
```

```js
// const cols = [
//   { column: "lsoa", nominals: null },
//   {
//     column: "insulation_rating",
//     ordinals: ["Unknown", "A", "B", "C", "D", "E", "F", "G"],
//   },
//   {
//     column: "insulation_ewall",
//     // ordinals: null,
//     nominals: null,
//     // ordinals: ["Unknown", "A", "B", "C", "D", "E", "F", "G"],
//   },
//   {
//     column: "pv_generation",
//     thresholds: [
//       0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000,
//       30000, 40000, 50000,
//     ],
//   },
//   {
//     column: "ashp_size",
//     thresholds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50],
//   },
// ];
```

```js
function useState(value) {
  const state = Mutable(value);
  const setState = (value) => (state.value = value);
  return [state, setState];
}
const [selected, setSelected] = useState({});
```

```js
const columns = [
  { column: "id", unique: true },
  "lsoa",
  "insulation_rating",
  "insulation_ewall",
  { column: "pv_generation", alias: "PV Generation" },
  "ashp_size",
  "substation_demand",
];
```

```js
const table = new sorterTable(buildings, columns, tableChanged, {
  cellRenderers,
  containerWidth: 300,
});
```

```js
display(table.getNode());
```

```js
function tableChanged(event) {
  console.log("Table changed:", event);

  if (event.type === "filter") {
    console.log("Filtered indices:", event.indeces);
    console.log("Filter rule:", event.rule);
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
html`Selected`;
display(selected);
```

```js
// const sortButton = document.createElement("button");
// sortButton.textContent = "Sort by LSOA (Descending)";
// // document.body.appendChild(sortButton);

// sortButton.addEventListener("click", () => {
//   const ageSortCtrl = table.sortControllers.find(
//     (ctrl) => ctrl.getColumn() === "lsoa"
//   );
//   ageSortCtrl.setDirection("down");
//   table.sortChanged(ageSortCtrl);
// });
```

```js
// Create a color scale (example)
const colorScale = d3
  .scaleSequential(d3.interpolateViridis)
  .domain([0, d3.max(buildings, (d) => d.pv_generation)]);
// display(colorScale(1000));
```

```js
// Define cell renderers
const cellRenderers = {
  pv_generation: (value, rowData) => {
    const max = d3.max(buildings, (d) => d.pv_generation); // Calculate max dynamically
    return sparkbar(max, colorScale)(value, rowData); // Call sparkbar with calculated max
  },
  ashp_size: (data) => {
    const span = document.createElement("span");
    span.innerText = data >= 180 ? "More" : "Less";
    return span;
  },
};
```

```js
function sparkbar(max, colorScale, alpha = 0.6) {
  return (x, rowData) => {
    // console.log("Rendering sparkbar for:", x, rowData);
    // Now takes 'x' (cell value) and 'rowData' (entire row)
    const color = d3.color(colorScale(x));
    color.opacity = alpha;
    const div = document.createElement("div");
    div.style.background = color;
    div.style.width = `${(100 * x) / max}%`;
    div.style.float = "right";
    div.style.paddingRight = "3px";
    div.style.boxSizing = "border-box";
    div.style.overflow = "visible";
    div.style.display = "flex";
    div.style.justifyContent = "end";
    div.innerText = x.toLocaleString("en");
    return div;
  };
}
```

```js
function sparkarea(data, rowData, options = {}) {
  const {
    width = 240,
    height = 20,
    fillColor = "#faa",
    strokeColor = "red",
  } = options;

  // Extract x and y values from the data (assuming your data has a 'history' property)
  const X = data.map((d) => d.date); // Assuming 'date' property for x-axis
  const Y = data.map((d) => d.value); // Assuming 'value' property for y-axis

  // Handle cases where there is not enough data for an area chart
  if (X.length < 2 || Y.length < 2) {
    const message = document.createElement("div");
    message.innerText = "Not enough data";
    return message;
  }

  const x = d3
    .scaleTime() // Use scaleTime for dates
    .domain(d3.extent(X))
    .range([0, width]);
  const y = d3.scaleLinear().domain(d3.extent(Y)).range([height, 0]);

  const area = d3
    .area()
    .x((d, i) => x(X[i]))
    .y1((d, i) => y(Y[i]))
    .y0(height)
    .defined((d, i) => !isNaN(X[i]) && !isNaN(Y[i]));

  // Create the SVG element
  const svg = d3
    .create("svg")
    .attr("width", width)
    .attr("height", height)
    .style("vertical-align", "middle")
    .style("margin", "-3px 0")
    .node(); // Get the actual SVG element

  // Add the area path
  d3.select(svg).append("path").attr("fill", fillColor).attr("d", area(data));

  // Add the outline path
  d3.select(svg)
    .append("path")
    .attr("fill", "none")
    .attr("stroke", strokeColor)
    .attr("d", area.lineY1()(data));

  // Create a container div
  const container = document.createElement("div");
  container.appendChild(svg);

  return container;
}
```

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.min.css" />

<style>
table {
  font-family: Roboto, Helvetica, sans-serif;
  font-size: 10px;
  border-collapse: collapse;
  width: 100%;
}

.sorter-table tbody tr:nth-child(even) {
  background-color: #f8f8f8; /* Zebra striping */
}

.sorter-table tbody tr:hover {
  background-color: #f0f0f0; /* Highlight on hover */
}

.sorter-table thead {
  background-color: #e0e0e0; /* Header background */
}

.sorter-table th {
  text-align: left;
  padding: 8px;
  font-size: 10px;
  border-bottom: 2px solid #ddd;
}

.sorter-table td {
  padding: 8px;
  border: 1px solid #ddd;
  text-align: left;
  vertical-align: middle;
}


.sorter-table .sidebar { /* Target the sidebar using the table's class */
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 50px; /* Adjust as needed */
  padding: 10px;
  border-right: 1px solid #ccc;
}

.sorter-table .sidebar i { /* Target icons within the sidebar */
  margin-bottom: 15px;
  cursor: pointer;
  color: gray;
}

.sorter-table .sidebar i:hover {
  color: black; /* Highlight on hover */
} 

/* .unique-values-text {
  font-size: 12px; /* Adjust font size to match histogram labels */
  color: #666; /* Adjust color to match histogram text */
  text-align: center;
  width: 100%; /* Ensure the span takes up the full width of the cell */
  display: block; /* Make the span a block element */
} */
</style>
