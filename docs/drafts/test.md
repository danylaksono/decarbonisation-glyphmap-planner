---
title: Test New Model
toc: false
sidebar: false
footer: false
sql:
  oxford: ./../data/oxford_decarbonisation_data.parquet
---

```js
import {
  TimeGlyph,
  GlyphCollection,
} from "./../components/glyph-designs/timeGlyph.js";
import { DecarbonisationModel } from "./../components/decarbonisationModel.js";
// import { Model } from "./components/model.js";
```

<!-- ## Test UI -->

<!-- <label for="decarbonisation-slider">Decarbonisation Progress:</label> -->

```js
// const n = html`<input
//   style="width: 800px;"
//   type="range"
//   step="0.1"
//   min="0"
//   max="1"
// />`;
```

```js
// const nn = Generators.input(n);
// display(n);
```

```js
// display(nn);
```

## Test New Model

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
```

```js
// model specifications
const modelSpec = {
  initial_year: 2024,
  target_years: 5,
  overall_budget: overall_budget || 50_000_000,
  uncapped_mode: false,
  technologies: [
    {
      name: "PV",
      allocation: 0.4,
      config: {
        scoreFn: (building) => {
          if (!building.pv_suitability) return 0;
          return building.pv_generation / building.pv_size;
        },
        suitabilityKey: "pv_suitability",
        labourKey: "pv_labour",
        materialKey: "pv_material",
        savingsKey: "pv_generation", // assuming 1kWh = 1kg CO2
      },
    },
    {
      name: "ASHP",
      allocation: 0.6,
      config: {
        scoreFn: (building) => {
          if (!building.ashp_suitability) return 0;
          return building.heat_demand / building.ashp_size;
        },
        suitabilityKey: "ashp_suitability",
        labourKey: "ashp_labour",
        materialKey: "ashp_material",
        savingsKey: "heat_demand", // assuming full heat demand offset
      },
    },
  ],
  // priorityRules: [
  //       {attribute: 'deprivation_index', order: 'desc'},
  //       {attribute: 'fuel_poverty', order: 'desc'}
  // ]
};
```

```js
const model = new DecarbonisationModel(modelSpec, newBuildings);
model.addBuildingFilter((b) => b.properties.substation_headroom >= 500); // custom filtering
// model.addPriorityRule('multideprivation', 'asc'); // arbitrary priority rule

model.runModel();

// console.log("Yearly Interventions in 2024:", model.getYearInterventions(2024));

// display(model.getYearInterventions(2024));
// Get interventions grouped by year and technology
display(model.getGroupedYearTechInterventions()[2024]);

// Custom groupings interventions
// display(model.getInterventions()
//     .groupBy('year')
//     .groupBy('technology')
//     .groupBy('buildingProperties.lsoa')
//     .all()
//     );

// Get final stats
display(model.getFinalStats());
```

## Uncapped Model

```js
// testing uncapped
const uncappedModel = new DecarbonisationModel(
  {
    ...modelSpec,
    overall_budget: null,
    uncapped_mode: true,
  },
  newBuildings
);

// uncappedModel.runModel();

// console.log(
//   "Yearly Interventions in 2024:",
//   uncappedModel.getYearInterventions(2024)
// );

// // Get interventions grouped by year and technology
// console.log(uncappedModel.getGroupedInterventions());

// // Get final stats
// console.log(uncappedModel.getFinalStats());

// display(uncappedModel.getFinalStats());
```

## Test UI

```js
function useState(value) {
  const state = Mutable(value);
  const setState = (value) => (state.value = value);
  return [state, setState];
}
const [config, setConfig] = useState({});
const [slider, setSlider] = useState(0);
```

```js
// Overall Budget
const overallBudgetInput = Inputs.range([0, 100_000_000], {
  label: "Overall Buget",
  step: 500_000,
  value: 50_000_000,
});
overallBudgetInput.number.style["max-width"] = "60px";
Object.assign(overallBudgetInput, {
  oninput: (event) => event.isTrusted && event.stopImmediatePropagation(),
  onchange: (event) => event.currentTarget.dispatchEvent(new Event("input")),
});
display(overallBudgetInput);
```

```js
const overall_budget = Generators.input(overallBudgetInput);
```

${overall_budget}

```js
// Technology Name
const techNameInput = html`<input
  type="text"
  placeholder="Technology Name"
  style="max-width: 300px;"
/>`;
const tech_name = Generators.input(techNameInput);

// Allocation
const techAllocationInput = html`<input
  type="range"
  min="0"
  max="1"
  step="0.1"
  placeholder="Allocation"
  style="max-width: 300px;"
/>`;
const tech_allocation = Generators.input(techAllocationInput);

// Suitability Key
const techSuitabilityKeyInput = html`<input
  type="text"
  placeholder="Suitability Key"
  style="max-width: 300px;"
/>`;
const tech_suitabilityKey = Generators.input(techSuitabilityKeyInput);

// Labour Key
const techLabourKeyInput = html`<input
  type="text"
  placeholder="Labour Key"
  style="max-width: 300px;"
/>`;
const tech_labourKey = Generators.input(techLabourKeyInput);

// Material Key
const techMaterialKeyInput = html`<input
  type="text"
  placeholder="Material Key"
  style="max-width: 300px;"
/>`;
const tech_materialKey = Generators.input(techMaterialKeyInput);

// Savings Key
const techSavingsKeyInput = html`<input
  type="text"
  placeholder="Savings Key"
  style="max-width: 300px;"
/>`;
const tech_savingsKey = Generators.input(techSavingsKeyInput);
```

<!--
```js
// Initial Year
const initialYearInput = html`<input type="number" min="2023" max="2030" value="2024" style="max-width: 300px;" />`;
const initial_year = Generators.input(initialYearInput);

// Target Years
const targetYearsInput = html`<input type="range" min="1" max="20" step="1" value="5" style="max-width: 300px;" />`;
const target_years = Generators.input(targetYearsInput);

// Overall Budget
const overallBudgetInput = html`<input type="range" min="1000000" max="100000000" step="500000" value="50000000" style="max-width: 300px;" />`;
const overall_budget = Generators.input(overallBudgetInput);

// Uncapped Mode Checkbox
const uncappedModeInput = html`<input type="checkbox" />`;
const uncapped_mode = Generators.input(uncappedModeInput);
```

```js
// PV Technology Allocation
const pvAllocationInput = html`<input type="range" min="0" max="1" step="0.1" value="0.4" style="max-width: 300px;" />`;
const pv_allocation = Generators.input(pvAllocationInput);

// PV Suitability Key
const pvSuitabilityKeyInput = html`<input type="text" value="pv_suitability" style="max-width: 300px;" />`;
const pv_suitabilityKey = Generators.input(pvSuitabilityKeyInput);

// ASHP Technology Allocation
const ashpAllocationInput = html`<input type="range" min="0" max="1" step="0.1" value="0.6" style="max-width: 300px;" />`;
const ashp_allocation = Generators.input(ashpAllocationInput);

// ASHP Suitability Key
const ashpSuitabilityKeyInput = html`<input type="text" value="ashp_suitability" style="max-width: 300px;" />`;
const ashp_suitabilityKey = Generators.input(ashpSuitabilityKeyInput);

```


```js
// Priority Rule Attribute Selector
const priorityAttrInput = html`<select style="max-width: 300px;">
  <option value="deprivation_index">Deprivation Index</option>
  <option value="fuel_poverty">Fuel Poverty</option>
</select>`;
const priority_attribute = Generators.input(priorityAttrInput);

// Priority Rule Order Selector
const priorityOrderInput = html`<select style="max-width: 300px;">
  <option value="asc">Ascending</option>
  <option value="desc">Descending</option>
</select>`;
const priority_order = Generators.input(priorityOrderInput);

```


```js
function* modelSpecv2() {
  while (true) {
    yield {
      initial_year,
      target_years,
      overall_budget,
      uncapped_mode,
      technologies: [
        {
          name: "PV",
          allocation: pv_allocation,
          config: {
            suitabilityKey: pv_suitabilityKey,
          },
        },
        {
          name: "ASHP",
          allocation: ashp_allocation,
          config: {
            suitabilityKey: ashp_suitabilityKey,
            // add more later
          },
        },
      ],
      priorityRules: [
        { attribute: priority_attribute, order: priority_order },
      ]
    };
  }
}

``` -->

<!-- <div>
  <h3>Model Specification</h3>
  <label>Initial Year: ${initialYearInput}</label><br>
  <label>Target Years: ${targetYearsInput} ${target_years}</label><br>
  <label>Overall Budget: ${overallBudgetInput} ${overall_budget}</label><br>
  <label>Uncapped Mode: ${uncappedModeInput}</label><br>

  <h4>Technologies</h4>
  <h5>PV</h5>
  <label>Allocation: ${pvAllocationInput}</label><br>
  <label>Suitability Key: ${pvSuitabilityKeyInput}</label><br>

  <h5>ASHP</h5>
  <label>Allocation: ${ashpAllocationInput}</label><br>
  <label>Suitability Key: ${ashpSuitabilityKeyInput}</label><br>

  <h4>Priority Rules</h4>
  <label>Attribute: ${priorityAttrInput}</label><br>
  <label>Order: ${priorityOrderInput}</label><br>
</div> -->

```js
let technologies = [];
const addTechnologyButton = html`<button>Add Technology</button>`;
addTechnologyButton.onclick = () => {
  const newTechnology = {
    name: tech_name,
    allocation: tech_allocation,
    config: {
      suitabilityKey: tech_suitabilityKey,
      labourKey: tech_labourKey,
      materialKey: tech_materialKey,
      savingsKey: tech_savingsKey,
    },
  };

  technologies.push(newTechnology);

  // Log to check the technologies array is updated
  console.log("Technologies:", technologies);
};
display(addTechnologyButton);
```

<!-------- MODAL -------->
<dialog>
    <div id="project-properties" class="card">
      <div class="form-group">
        ${techsInput}
      </div>
      <div class="form-group">
        ${totalBudgetInput}
      </div>
      <div class="form-group">
        <div style="display:flex; flex-direction: row; align-items: center; min-height: 25.5px; gap: 60px;">
          <span><b>Start Year</b></span> ${startYearInput}
        </div>
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
        ${html`
          <button class="create-btn" type="button" onclick=${addNewIntervention}>
            Add New Intervention
          </button>
        `}
      </div>
    </div>
</dialog>

<button data-show-modal>Show Modal</button>

```js
let btn = document.querySelector("[data-show-modal]");
let modal = document.querySelector("dialog");

// Show the modal
btn.addEventListener("click", function () {
  modal.showModal();
});
```

## Play button

```js
// populate mutable slider using getter/setter
// const sliderValue = 0.5;
```

```js
// Create the slider input
const morphFactorInput = html`<input
  style="width: 100%; max-width: 450px;"
  type="range"
  value="0"
  step="0.05"
  min="0"
  max="1"
/>`;
const morph_factor = Generators.input(morphFactorInput);

// Create the play button
const playButton = html`<button style="margin-top: 10px;">Play</button>`;
```

```js
// Append the slider and button to the view
display(html`${morphFactorInput} ${playButton}`);
```

```js
// Animation logic
let playing = false; // Track play/pause state
let direction = 1; // Controls the animation direction (0 to 1 or 1 to 0)
let animationFrame; // Stores the requestAnimationFrame ID

function animate() {
  const currentValue = parseFloat(morphFactorInput.value);
  let newValue = currentValue + 0.01 * direction;

  // Reverse direction if boundaries are reached
  if (newValue >= 1 || newValue <= 0) {
    direction *= -1;
    newValue = Math.max(0, Math.min(1, newValue)); // Clamp value between 0 and 1
  }

  console.log("newValue:", newValue);
  set(morphFactorInput, newValue);

  if (playing) {
    animationFrame = requestAnimationFrame(animate); // Continue the animation
  }
}

// Button click event listener
playButton.addEventListener("click", () => {
  playing = !playing; // Toggle play/pause state
  playButton.textContent = playing ? "Pause" : "Play";

  if (playing) {
    requestAnimationFrame(animate); // Start the animation
  } else {
    invalidation.then(() => cancelAnimationFrame(animationFrame));
    cancelAnimationFrame(animationFrame); // Stop the animation
  }
});
```

```js
// Expose the `morph_factor` value
const i = Inputs.input(42);
```

<h2>${morph_factor}</h2>

```js
function set(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
```

```js
display(
  Inputs.button([
    ["Set to 0", () => set(morphFactorInput, 0)],
    ["Set to 100", () => set(morphFactorInput, 100)],
  ])
);
```
