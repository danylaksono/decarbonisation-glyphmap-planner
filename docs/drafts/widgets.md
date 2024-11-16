---
title: Custom Dashboard Widgets
toc: false
sidebar: false
footer: false
sql:
  oxford: ./../data/oxford_decarbonisation_data.parquet
---

```js
import { BudgetAllocator } from "./../components/budgetAllocator.js";
import { MiniDecarbModel } from "./../components/miniDecarbModel.js";
```

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">

<link rel="stylesheet" href="./../styles/custom.css">

```js
function useState(value) {
  const state = Mutable(value);
  const setState = (value) => (state.value = value);
  return [state, setState];
}
const [selected, setSelected] = useState({});
const [getIntervention, setIntervention] = useState([]);
const [getResults, setResults] = useState([]);
```

<!-- ------------ Data ------------ -->

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
FROM oxford b;
```

```js
const newBuildings = [...oxford_data];
const columns = Object.keys(newBuildings[0]);
```

## Budget Allocator

```js
// Starting year
const total_budget = view(
  Inputs.text({
    label: html`<b>Total Budget</b>`,
    placeholder: "Available Budget in GBP",
    value: 100_000_000,
    submit: true,
  })
);

// Starting year
const start_year = view(
  Inputs.text({
    label: html`<b>Start Year</b>`,
    placeholder: "Starting year?",
    value: 2024,
    submit: true,
  })
);

// Project length
const projectLength = Inputs.range([0, 20], {
  label: html`<b>Project length in years</b>`,
  step: 1,
  value: 10,
});
projectLength.number.style["max-width"] = "60px";
Object.assign(projectLength, {
  oninput: (event) => event.isTrusted && event.stopImmediatePropagation(),
  onchange: (event) => event.currentTarget.dispatchEvent(new Event("input")),
});
const project_length = Generators.input(projectLength);
display(projectLength);

// Allocation type
const allocationType = view(
  Inputs.radio(["linear", "sqrt", "exp", "cubic"], {
    label: html`<b>Allocation Type</b>`,
    value: "linear",
  })
);
```

```js
const allocator = new BudgetAllocator(
  total_budget,
  Number(start_year),
  Number(project_length)
);
```

```js
let initialAllocations;
if (allocationType === "linear") {
  initialAllocations = allocator.allocateLinear();
} else {
  initialAllocations = allocator.allocateCustom(allocationType);
}

// linear allocation
// const linearAllocation = allocator.allocateLinear();
// display(linearAllocation);
const { svg, getAllocations } = allocator.visualise(
  initialAllocations,
  (changes) => {
    // console.log("data changed:", changes);
    setSelected(changes);
  },
  400,
  200
);
display(svg);
```

```js
allocationType;
const allocations = selected ? getAllocations(selected) : initialAllocations;
// display(selected);
// display(allocations);
```

## Test New Model

```js
let interventions = getIntervention;
let results = getResults;
```

```js
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
  allocations,
  filters = [],
  priorities = []
) {
  const config = createConfigTemplate(start_year, allocations);
  config.tech = {
    name: techConfig.name,
    config: techConfig.config,
  };

  // Apply filters and priorities
  // filters.forEach((filter) =>
  //   config.filters ? config.filters.push(filter) : (config.filters = [filter])
  // );
  // priorities.forEach((priority) => config.priorities.push(priority));

  // Apply filters and priorities - append to existing
  config.filters = [...(config.filters || []), ...filters];
  config.priorities = [...(config.priorities || []), ...priorities];

  const newIntervention = { ...config, id: Date.now() }; // Unique ID for each intervention
  // interventions = [...interventions, newIntervention];

  // psuh to interventions list
  // interventions.push(newIntervention);
  setIntervention([...interventions, newIntervention]);
  let modelResult = runModel(newIntervention, newBuildings);
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
```

```js
// handle form submission
function addNewIntervention() {
  const start_year = document.getElementById("start_year").value;
  const techName = document.getElementById("technology").value;
  const allocations = document
    .getElementById("allocations")
    .value.split(",")
    .map((b) => ({ budget: Number(b.trim()) }));

  // Retrieve techConfig from the selected technology
  const techConfig = listOfTech[techName];

  // Example filters and priorities
  const filters = [(b) => b.properties["substation_headroom"] >= 500];
  const priorities = [{ name: "substation_capacity_rating", order: "asc" }];

  addIntervention(techConfig, start_year, allocations, filters, priorities);

  // Re-render the interventions list to update the view
  // document.getElementById("interventions-list").innerHTML = interventions
  //   .map(
  //     (config, index) =>
  //       `<li>${config.tech.name} (Start Year: ${config.initial_year}) - <button onclick="removeIntervention(${index})">Remove</button></li>`
  //   )
  //   .join("");
}
```

```js
function runModel(config, buildings) {
  const model = new MiniDecarbModel(config, buildings);
  model.runModel();
  return model.getRecap();
}
```

```js
function runAllInterventions() {
  interventions.forEach((config, index) => {
    const model = new MiniDecarbModel(config, newBuildings);
    model.runModel();
    const results = model.getRecap();
    console.log(`Results for intervention ${index + 1}:`, results);
  });
}

// Trigger running all models
runAllInterventions();
```

```js
const interventionForm = html`
  <form>
    <label
      >Start Year: <input type="number" id="start_year" value="2025" /></label
    ><br />
    <label
      >Technology:
      <select id="technology">
        <option value="ASHP">ASHP</option>
        <option value="PV">PV</option>
      </select> </label
    ><br />
    <label
      >Yearly Budget (comma-separated):
      <input type="text" id="allocations" value="1000,1500,2000" /></label
    ><br />
    <button type="button" onclick=${addNewIntervention}>
      Add Intervention
    </button>
  </form>

  <ul id="interventions-list">
    ${interventions.map(
      (config, index) =>
        html`<li>
          ${config.tech.name} (Start Year: ${config.initial_year}) -
          <button
            onclick=${() => removeIntervention(index)}
            style="border:none; background:none; cursor:pointer;"
          >
            <i class="fas fa-trash" style="color:red;"></i>
          </button>
        </li>`
    )}
  </ul>
`;
display(interventionForm);
// display(
//   html`<button onclick=${remove}>Remove last intervention</button>`
// );
// display(
//   html`<button onclick=${runAllInterventions}>Run All Interventions</button>`
// );
```

```js
display(interventions);
```

```js
display(results);
```

## Old code

<!-- --------------------------------------------------------- -->

```js
let config = {
  initial_year: Number(start_year),
  rolledover_budget: 0,
  yearly_budgets: allocations.map((item) => item.budget),
  tech: {},
  priorities: [],
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
};

// update config here
addTechConfig(listOfTech.ASHP);
// addPriority("substation_headroom", "asc");
```

Model Configuration:

```js
// display("Model Configuration");
display(config);
```

```js
// const configASHP = {
//   initial_year: 2024,
//   rolledover_budget: 50_000_000,
//   yearly_budgets: [1_200_000, 30000, 20000, 5000, 3000, 20000], // this will be assigned from budgetAllocator
//   tech: {
//     name: "ASHP",
//     config: {
//       suitabilityKey: "ashp_suitability",
//       labourKey: "ashp_labour",
//       materialKey: "ashp_material",
//       savingsKey: "heat_demand", // will be calculated from a lookup and stored in the building data
//     },
//   },
//   priorities: [
//     {
//       name: "substation_headroom", //sort by substation headroom
//       order: "asc",
//     },
//   ],
// };
// display("configuration SAHP");

// display(configASHP);
```

```js
// For priority rules:
// // Categorical priority
// model.addPriorityRuleCustom({
//   attribute: 'multideprivation',
//   scoreFunction: (value) => ({
//     'deprived': 1000,
//     'not-deprived': 0
//   })[value] || 0
// });

// // Numeric threshold priority
// model.addPriorityRuleCustom({
//   attribute: 'fuel_poverty',
//   scoreFunction: (value) => value > 0.5 ? 500 : 0,
//   weight: 2.0
// });

// // Complex scoring function
// model.addPriorityRuleCustom({
//   attribute: 'energy_rating',
//   scoreFunction: (value) => {
//     const ratings = {'A': 0, 'B': 200, 'C': 400, 'D': 600, 'E': 800, 'F': 1000};
//     return ratings[value] || 0;
//   }
// });
const modelASHP = new MiniDecarbModel(config, newBuildings);
// modelASHP.addBuildingFilter(
//   (b) => b.properties["substation_headroom"] >= 500,
//   "Substation Headroom >= 500"
// );

// modelASHP.addPriorityRuleCustom({
//   attribute: "substation_capacity_rating",
//   scoreFunction: (value) =>
//     ({
//       800: 500,
//       1500: 1000,
//     }[value] || 0),
// });

modelASHP.runModel();
// const results = modelASHP.getRecap();
// display(results);
```

```js
const data = Object.entries(results.yearlyStats).map(([year, stats]) => ({
  year: +year,
  budgetSpent: stats.budgetSpent,
  buildingsIntervened: stats.buildingsIntervened,
}));
```

```js
const v1 = (d) => d.budgetSpent;
const v2 = (d) => d.buildingsIntervened;
const y2 = d3.scaleLinear(d3.extent(data, v2), [0, d3.max(data, v1)]);

display(
  Plot.plot({
    x: {
      tickFormat: "", // display years without commas
      label: "Year",
    },
    y: {
      axis: "left",
      label: "Budget Spent (£)",
    },
    marks: [
      // Right axis for buildings intervened
      Plot.axisY(y2.ticks(), {
        color: "steelblue",
        anchor: "right",
        label: "Buildings Intervened",
        y: y2,
        tickFormat: y2.tickFormat(),
      }),
      // Rule at Y=0 for budget spent line baseline
      Plot.ruleY([0]),
      // Line for budget spent
      Plot.line(data, {
        x: "year",
        y: v1,
      }),
      // Line for buildings intervened with mapped y2 scale
      Plot.line(
        data,
        Plot.mapY((D) => D.map(y2), {
          x: "year",
          y: v2,
          stroke: "steelblue",
        })
      ),
    ],
  })
);
```

All suitable buildings, with attribute showing intervention or non-intervention:

```js
display(Inputs.table(results.allBuildings));
```

## Modal

<button id="openModalBtn">Open Modal</button>

<div class="modal" id="simpleModal">
  <div class="modal-content">
    <div class="modal-header">Are you sure?</div>
    <p>You are about to confirm this action.</p>
    <div class="modal-buttons">
      <button class="btn-confirm" id="confirmBtn">Confirm</button>
      <button class="btn-close" id="closeModalBtn">Close</button>
    </div>
  </div>
</div>

```js
const openModalBtn = document.getElementById("openModalBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const confirmBtn = document.getElementById("confirmBtn");
const modal = document.getElementById("simpleModal");

// Open modal
openModalBtn.addEventListener("click", () => {
  modal.style.display = "flex";
});

// Close modal
closeModalBtn.addEventListener("click", () => {
  modal.style.display = "none";
});

// Confirm action
confirmBtn.addEventListener("click", () => {
  alert("Action confirmed!");
  modal.style.display = "none";
});

// Close modal if clicking outside modal content
window.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.style.display = "none";
  }
});
```

<button class="toggle-button" id="toggleButton">Click More</button>

<div class="hidden-content" id="hiddenContent">
  <h3>More Information</h3>
  <p>
    This is additional content that was hidden. You can toggle this visibility
    by clicking the button again.
  </p>
</div>

```js
const toggleButton = document.getElementById("toggleButton");
const hiddenContent = document.getElementById("hiddenContent");

toggleButton.addEventListener("click", () => {
  if (
    hiddenContent.style.display === "none" ||
    hiddenContent.style.display === ""
  ) {
    hiddenContent.style.display = "block";
    toggleButton.textContent = "Show Less";
  } else {
    hiddenContent.style.display = "none";
    toggleButton.textContent = "Click More";
  }
});
```

## Selectable list

<ul id="selectableList"></ul>
<div class="output" id="output">Selected ID: None</div>

```js
const items = [
  { id: 1, name: "Item 1" },
  { id: 2, name: "Item 2" },
  { id: 3, name: "Item 3" },
  { id: 4, name: "Item 4" },
  { id: 5, name: "Item 5" },
];

// References to DOM elements
const listElement = document.getElementById("selectableList");
const outputElement = document.getElementById("output");

// Render list items from JavaScript array
items.forEach((item) => {
  const listItem = document.createElement("li");
  listItem.textContent = item.name;
  listItem.dataset.id = item.id; // Store the ID in a data attribute

  // Add click event listener for selecting
  listItem.addEventListener("click", () => {
    // Remove 'selected' class from all items
    document
      .querySelectorAll("#selectableList li")
      .forEach((li) => li.classList.remove("selected"));
    // Add 'selected' class to clicked item
    listItem.classList.add("selected");
    // Display selected ID
    outputElement.textContent = `Selected ID: ${listItem.dataset.id}`;
    setSelected(parseInt(listItem.dataset.id, 10));
  });

  // Create button container
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "buttons";

  // Edit button
  const editButton = document.createElement("button");
  editButton.innerHTML = '<i class="fas fa-edit"></i>';
  editButton.addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent triggering list item click
    const newName = prompt("Edit item name:", item.name);
    if (newName) {
      item.name = newName;
      listItem.firstChild.textContent = newName;
    }
  });

  // Remove button
  const removeButton = document.createElement("button");
  removeButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
  removeButton.addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent triggering list item click
    listElement.removeChild(listItem); // Remove from DOM
  });

  // Append buttons to button container
  buttonContainer.appendChild(editButton);
  buttonContainer.appendChild(removeButton);

  // Append button container to list item
  listItem.appendChild(buttonContainer);

  // Append list item to the list
  listElement.appendChild(listItem);
});
```

```js
// const ul = html`<ul style="list-style: none; padding: 0;"></ul>`;

// // Re-render the list whenever items change
// function render() {
//   ul.innerHTML = ""; // Clear previous content
//   for (const item of items) {
//     const li = html`<li
//       style="display: flex; align-items: center; margin-bottom: 5px; padding: 10px;
//         border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;"
//     >
//       <span style="flex-grow: 1; cursor: pointer;"> ${item.name} </span>
//       <button style="margin-left: 10px;">Edit</button>
//       <button style="margin-left: 10px;">Remove</button>
//     </li>`;
//     ul.appendChild(li);
//   }
// }

display(selected);
```

## New test

```js
function renderSelectableList(
  items,
  listElementId,
  outputElementId,
  setSelected
) {
  // References to DOM elements
  const listElement = document.getElementById(listElementId);
  const outputElement = document.getElementById(outputElementId);

  // Clear the existing list if any
  listElement.innerHTML = "";

  // Render list items from JavaScript array
  items.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = item.name;
    listItem.dataset.id = item.id; // Store the ID in a data attribute

    // Add click event listener for selecting
    listItem.addEventListener("click", () => {
      // Remove 'selected' class from all items
      document
        .querySelectorAll(`#${listElementId} li`)
        .forEach((li) => li.classList.remove("selected"));
      // Add 'selected' class to clicked item
      listItem.classList.add("selected");
      // Display selected ID
      outputElement.textContent = `Selected ID: ${listItem.dataset.id}`;
      setSelected(parseInt(listItem.dataset.id, 10));
    });

    // Create button container
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "buttons";

    // Edit button
    const editButton = document.createElement("button");
    editButton.innerHTML = '<i class="fas fa-edit"></i>';
    // editButton.addEventListener("click", (e) => {
    //   e.stopPropagation(); // Prevent triggering list item click
    //   const newName = prompt("Edit item name:", item.name);
    //   if (newName) {
    //     item.name = newName;
    //     listItem.firstChild.textContent = newName;
    //   }
    // });

    // Remove button
    const removeButton = document.createElement("button");
    removeButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
    // removeButton.addEventListener("click", (e) => {
    //   e.stopPropagation(); // Prevent triggering list item click
    //   listElement.removeChild(listItem); // Remove from DOM
    // });

    // Append buttons to button container
    buttonContainer.appendChild(editButton);
    buttonContainer.appendChild(removeButton);

    // Append button container to list item
    listItem.appendChild(buttonContainer);

    // Append list item to the list
    listElement.appendChild(listItem);
  });
}

function handleSelected(id) {
  console.log("Selected ID:", id);
}

renderSelectableList(items, "selectableList", "output", handleSelected);
```

<div>
  <ul id="selectableList"></ul>
  <div id="output">Selected ID: None</div>
</div>
