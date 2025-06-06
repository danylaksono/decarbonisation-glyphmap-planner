# ChangeLogs for MiniDecarbModel

### 06/06/2025: Refactor model to support new `configure()` method

```
// --- Example 1: Using the new configure() method ---
const model1 = new MiniDecarbModel(buildingsData); // modelId can be set in configObj

const fullConfig = {
  modelId: "intervention_scenario_A",
  initial_year: 2026,
  rolledover_budget: 15000,
  yearly_budgets: [75000, 70000],
  optimizationStrategy: "carbon-first",
  technologies: [
    { name: "ASHP", config: { suitabilityKey: "ashp_suitability", labourKey: "ashp_labour", materialKey: "ashp_material", savingsKey: "heat_demand" }},
    { name: "Insulation", config: { suitabilityKey: "insulation_rating", labourKey: "insulation_cwall_labour", materialKey: "insulation_cwall_materials", savingsKey: "insulation_cwall" }}
  ],
  priorities: [
    { attribute: "total_floor_area", order: "desc", weight: 1.5 }
  ],
  filters: [
    {
      filterName: "Large Buildings",
      filterFunction: (building) => building.properties.total_floor_area > 200 // Pass actual function
    }
  ]
};

model1.configure(fullConfig);
const results1 = model1.run();
// console.log(`Results from ${model1.modelId}:`, results1);

// --- Example 2: Using existing setter methods (maintaining backward compatibility) ---
const model2 = new MiniDecarbModel(buildingsData, "legacy_model_setup");

model2.setInitialYear(2025);
model2.setRolloverBudget(0);
model2.setYearlyBudgets([100000, 90000, 80000]);
model2.setOptimizationStrategy("tech-first"); // Default tech (ASHP) will be used
// Or add a specific one:
// model2.addTechnology({ name: "PV", config: { suitabilityKey: "pv_suitability", labourKey: "pv_labour", materialKey: "pv_material", savingsKey: "pv_generation" }});
model2.addPriority("current_epc_rating", "asc");
model2.addBuildingFilter(
  (building) => building.properties.construction_year < 1950,
  "Pre-1950 Buildings"
);

const results2 = model2.run();
// console.log(`Results from ${model2.modelId}:`, results2);

// --- Example 3: Using configure() and then overriding with a setter ---
const model3 = new MiniDecarbModel(buildingsData);
const baseConfig = {
  modelId: "hybrid_setup_model",
  initial_year: 2027,
  yearly_budgets: [50000],
  optimizationStrategy: "tech-first",
  tech: { name: "PV", config: { suitabilityKey: "pv_suitability", labourKey: "pv_labour", materialKey: "pv_material", savingsKey: "pv_generation" }}
};
model3.configure(baseConfig);
model3.setRolloverBudget(2500); // Override/add rollover budget after initial configure

const results3 = model3.run();
// console.log(`Results from ${model3.modelId} (Rollover: ${model3.config.rolledover_budget}):`, results3);
```
