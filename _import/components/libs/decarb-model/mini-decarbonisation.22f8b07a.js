import { PriorityQueue } from "./priority-queue.aea4e806.js";
import { log, warn, error } from "../logger.4f5bec9e.js";

// ------------------------ Building class ------------------------
class Building {
  constructor(id, properties) {
    this.id = id;
    this.properties = properties;
    this.isIntervened = false;
    this.interventionYear = null;
    this.interventionCost = null;
    this.carbonSaved = null;
    this.score = null;
    this.numInterventions = 0;

    // Multi-technology intervention support
    this.interventions = []; // Array of {tech, cost, carbonSaved, year, synergies}
    this.currentTechnologies = []; // Array of technology names currently applied
    this.hasMultipleInterventions = false; // Flag for multiple interventions
    this.interventionConflicts = []; // Track any conflicts that occurred
    this.synergyBonuses = {}; // Track synergy effects between technologies
  }

  // Add a new intervention to this building
  addIntervention(tech, cost, carbonSaved, year, synergies = {}) {
    const intervention = {
      tech: tech.name,
      techConfig: tech,
      cost,
      carbonSaved,
      year,
      synergies,
      timestamp: Date.now(),
    };

    this.interventions.push(intervention);
    this.currentTechnologies.push(tech.name);

    // Update aggregated values
    this.interventionCost = (this.interventionCost || 0) + cost;
    this.carbonSaved = (this.carbonSaved || 0) + carbonSaved;
    this.numInterventions++;

    // Set flags
    this.isIntervened = true;
    this.hasMultipleInterventions = this.interventions.length > 1;

    // Store synergy bonuses
    if (Object.keys(synergies).length > 0) {
      this.synergyBonuses = { ...this.synergyBonuses, ...synergies };
    }

    // Update intervention year to the latest
    this.interventionYear = year;

    return intervention;
  }

  // Check if a technology is compatible with existing interventions
  isCompatibleWith(techName, compatibilityMatrix = {}) {
    if (this.currentTechnologies.length === 0) return true;

    return this.currentTechnologies.every((existingTech) => {
      const compatibility = compatibilityMatrix[existingTech]?.[techName];
      return compatibility !== false; // Allow if not explicitly forbidden
    });
  }

  // Get total cost including synergy discounts
  getTotalCost() {
    const baseCost = this.interventions.reduce(
      (sum, intervention) => sum + intervention.cost,
      0
    );
    const synergyCostReduction = Object.values(this.synergyBonuses)
      .filter((bonus) => bonus.type === "cost_reduction")
      .reduce((sum, bonus) => sum + (bonus.value || 0), 0);

    return Math.max(0, baseCost - synergyCostReduction);
  }

  // Get total carbon savings including synergy bonuses
  getTotalCarbonSaved() {
    const baseSavings = this.interventions.reduce(
      (sum, intervention) => sum + intervention.carbonSaved,
      0
    );
    const synergyBonus = Object.values(this.synergyBonuses)
      .filter((bonus) => bonus.type === "carbon_bonus")
      .reduce((sum, bonus) => sum + (bonus.value || 0), 0);

    return baseSavings + synergyBonus;
  }
}

// ------------------------ Intervention Manager class ------------------------
export class InterventionManager {
  constructor(buildings, listOfTech) {
    this.buildings = buildings;
    this.listOfTech = listOfTech;
    this.interventionConfigs = [];
    this.results = [];
    this.currentRolloverBudget = 0;
    this.currentOrder = []; // Store order as an array of indices
    this.autoRun = false; // Flag to control automatic re-running. set to false by default
    this.nextModelId = 0; // Counter for model IDs
    this._cachedResults = null; // Cache results for stacking
  }

  // Method to modify an existing intervention configuration
  modifyIntervention(index, updates) {
    if (index < 0 || index >= this.interventionConfigs.length) {
      error("Invalid intervention index");
      return this;
    }

    // Update the configuration
    this.interventionConfigs[index] = {
      ...this.interventionConfigs[index],
      ...updates,
    };

    if (this.autoRun) {
      this.runInterventions();
    }

    return this;
  }

  // Method to modify and re-run specific intervention
  modifyAndRunIntervention(index, updates) {
    this.modifyIntervention(index, updates);
    return this.runInterventions();
  }

  // Add support for multi-technology interventions
  addIntervention(config) {
    this.interventionConfigs.push(config);
    this.currentOrder.push(this.interventionConfigs.length - 1); // Add new index to order

    if (this.autoRun) {
      log("Auto-run enabled. Running interventions...");
      this.runInterventions();
    }

    return this; // Allow method chaining
  }

  removeIntervention(indexOrId) {
    let index = indexOrId;

    // If string provided, assume it's an ID and find its index
    if (typeof indexOrId === "string") {
      index = this.interventionConfigs.findIndex(
        (config) => config.id === indexOrId
      );
    }

    if (index >= 0 && index < this.interventionConfigs.length) {
      // Store ID for logging
      const removedId = this.interventionConfigs[index].id;

      // Remove from configs array
      this.interventionConfigs.splice(index, 1);

      // Remove from order array
      const orderIndex = this.currentOrder.indexOf(index);
      if (orderIndex > -1) {
        this.currentOrder.splice(orderIndex, 1);
      }

      // Adjust remaining indices
      this.currentOrder = this.currentOrder.map((idx) =>
        idx > index ? idx - 1 : idx
      );

      // Clear cached results
      this._cachedResults = null;

      log(`Intervention ${removedId} at index ${index} removed.`);

      if (this.autoRun) {
        log("Auto-run enabled. Running interventions...");
        this.runInterventions();
      }
    } else {
      error(`Error: Invalid index or ID '${indexOrId}' for removal.`);
    }

    return this;
  }

  clearInterventions() {
    this.interventionConfigs = [];
    this.currentOrder = [];
    this.results = [];
    this.currentRolloverBudget = 0;
    log("All interventions cleared.");
    if (this.autoRun) {
      log("Auto-run enabled. Running interventions...");
      this.runInterventions();
    }
    return this;
  }

  // Updated to handle order dynamically
  setInterventionOrder(newOrder) {
    if (!this.isValidOrder(newOrder)) {
      error(
        "Error: Invalid intervention order. Check for duplicates or out-of-range indices."
      );
      return;
    }

    if (newOrder.length !== this.interventionConfigs.length) {
      error(
        "Error: newOrder array must have the same length as interventionConfigs."
      );
      return;
    }

    // Create a mapping from old index to new index
    const indexMapping = {};
    for (let i = 0; i < newOrder.length; i++) {
      indexMapping[this.currentOrder[i]] = newOrder[i];
    }

    // Update the interventionConfigs array based on the new order
    const orderedConfigs = newOrder.map(
      (index) => this.interventionConfigs[index]
    );
    this.interventionConfigs = orderedConfigs;

    // Update currentOrder to reflect the new order
    this.currentOrder = newOrder;

    log("New intervention order set:", this.currentOrder);

    if (this.autoRun) {
      log("Auto-run enabled. Running interventions...");
      this.runInterventions();
    }
    return this;
  }

  isValidOrder(order) {
    if (new Set(order).size !== order.length) {
      return false; // Contains duplicates
    }
    return order.every(
      (index) => index >= 0 && index < this.interventionConfigs.length
    );
  }

  setBuildings(newBuildings) {
    this.buildings = newBuildings;
    this._cachedResults = null;
    return this;
  }

  runInterventionsWithRollover() {
    // Clear the cache when running interventions
    this._cachedResults = null;

    let currentRolloverBudget = 0; // Initialize rollover budget
    let previousYear = null; // Keep track of the last year of the previous intervention
    let previousRecap = null; // Keep track of the previous recap

    // Use map to create and run models, and collect recaps directly
    const recaps = this.interventionConfigs.map((config) => {
      // Create a deep copy of the config to avoid modifying the original
      const configCopy = JSON.parse(JSON.stringify(config));

      configCopy.modelId = this.nextModelId++; // Assign a new model ID

      log(
        `Running intervention: ${configCopy.id}, Initial Rollover: ${currentRolloverBudget}`
      );

      // --- Budget Carry-Over Logic ---
      if (previousRecap !== null) {
        const lastYearOfPreviousIntervention = Math.max(
          ...Object.keys(previousRecap.yearlyStats).map(Number)
        );

        // Check if the current intervention's initial year matches the last year of the previous intervention
        if (configCopy.initialYear === lastYearOfPreviousIntervention) {
          // Carry over the remaining budget to the first year's budget of the current intervention
          configCopy.yearlyBudgets[0] =
            (configCopy.yearlyBudgets[0] || 0) + currentRolloverBudget;
          // Round to 2 decimal places
          configCopy.yearlyBudgets[0] = parseFloat(
            configCopy.yearlyBudgets[0].toFixed(2)
          );

          log(
            `  config ${
              configCopy.id
            }: Remaining budget from previous intervention (${currentRolloverBudget}) added to year ${
              configCopy.initialYear
            }. New budget: ${configCopy.yearlyBudgets.join(", ")}`
          );

          // Reset currentRolloverBudget to 0 since it's been applied
          currentRolloverBudget = 0;
        } else {
          log(
            `  config ${configCopy.id}: No rollover applied (previous year: ${lastYearOfPreviousIntervention}, current year: ${configCopy.initialYear})`
          );
        }
      }

      // Defensive: Use config.buildings if valid, else fallback to this.buildings
      let buildingsToUse = JSON.parse(JSON.stringify(this.buildings)); // Deep copy of all original buildings
      if (Array.isArray(config.buildings) && config.buildings.length > 0) {
        // Defensive: check for valid building objects (must have id and properties)
        const valid = config.buildings.every(
          (b) => b && typeof b === "object" && "id" in b && "properties" in b
        );
        if (valid) {
          buildingsToUse = config.buildings;
        } else {
          warn(
            `Intervention ${config.id}: Invalid buildings array detected, falling back to manager's buildings.`
          );
        }
      }

      // Create the model
      const model = new MiniDecarbModel(buildingsToUse, configCopy.modelId);

      // Set initial year, optimization strategy, technologies, priorities, and filters (no changes)
      model.setInitialYear(configCopy.initialYear || 0);
      model.setOptimizationStrategy(
        configCopy.optimizationStrategy || "tech-first"
      );

      // Add technologies
      if (
        configCopy.optimizationStrategy === "carbon-first" &&
        configCopy.technologies &&
        configCopy.technologies.length > 0
      ) {
        configCopy.technologies.forEach((techName) => {
          if (this.listOfTech[techName]) {
            model.addTechnology(this.listOfTech[techName]);
          } else {
            error(`  Error: Technology "${techName}" not found in listOfTech.`);
          }
        });
      } else if (configCopy.tech && this.listOfTech[configCopy.tech]) {
        model.addTechnology(this.listOfTech[configCopy.tech]);
      }

      // Add priorities and filters
      (configCopy.priorities || []).forEach((priority) => {
        model.addPriority(
          priority.attribute,
          priority.order,
          priority.scoreFunction,
          priority.weight
        );
      });
      (configCopy.filters || []).forEach((filter) => {
        model.addBuildingFilter(filter.filterFunction, filter.filterName);
      });

      // Set yearly budgets from the config copy (now potentially modified with rollover)
      model.setYearlyBudgets(configCopy.yearlyBudgets || []);

      // Set the rollover budget (will be 0 if it was applied to the first year)
      model.setRolloverBudget(currentRolloverBudget);

      // Run the model
      const recap = model.run();

      // Update currentRolloverBudget from the recap for the next iteration
      currentRolloverBudget = parseFloat(recap.remainingBudget.toFixed(2));

      // Update previousYear for the next iteration
      previousYear = Math.max(...Object.keys(recap.yearlyStats).map(Number));

      // Update previousRecap for the next iteration
      previousRecap = recap;

      log(
        `  config ${configCopy.id}: Intervention run completed. Remaining budget: ${recap.remainingBudget}`
      );

      return recap;
    });

    log("All interventions with rollover successfully run. Recaps:", recaps);
    this._cachedResults = recaps; // Cache the results
    return recaps;
  }

  runInterventions() {
    const startTime = performance.now();
    this.results = []; // Clear previous results
    this.currentRolloverBudget = 0; // Reset rollover budget

    // Use the interventionConfigs array directly, which will be in the correct order
    for (const config of this.interventionConfigs) {
      // Defensive: Use config.buildings if valid, else fallback to this.buildings
      let buildingsToUse = this.buildings;
      // if (Array.isArray(config.buildings) && config.buildings.length > 0) {
      if (Array.isArray(config.buildings) && config.buildings.length > 0) {
        buildingsToUse = JSON.parse(JSON.stringify(config.buildings)); // Deep copy provided buildings
      } else {
        warn(
          `Intervention ${config.id}: Invalid buildings array detected, falling back to manager's buildings.`
        );
      }

      const model = new MiniDecarbModel(buildingsToUse, config.id);

      model.setInitialYear(config.initialYear || 0);
      model.setRolloverBudget(this.currentRolloverBudget); // Apply current rollover
      model.setYearlyBudgets(config.yearlyBudgets || []);
      model.setOptimizationStrategy(
        config.optimizationStrategy || "tech-first"
      );

      // Add technologies
      if (
        config.optimizationStrategy === "carbon-first" &&
        config.technologies &&
        config.technologies.length > 0
      ) {
        config.technologies.forEach((techName) => {
          if (this.listOfTech[techName]) {
            model.addTechnology(this.listOfTech[techName]);
          } else {
            error(`Error: Technology "${techName}" not found in listOfTech.`);
          }
        });
      } else if (config.tech) {
        if (this.listOfTech[config.tech]) {
          model.addTechnology(this.listOfTech[config.tech]);
        } else {
          error(`Error: Technology "${config.tech}" not found in listOfTech.`);
        }
      }

      // Add priorities
      if (config.priorities) {
        config.priorities.forEach((priority) => {
          model.addPriority(
            priority.attribute,
            priority.order,
            priority.scoreFunction,
            priority.weight
          );
        });
      }

      // Add filters
      if (config.filters) {
        config.filters.forEach((filter) => {
          model.addBuildingFilter(filter.filterFunction, filter.filterName);
        });
      }

      const recap = model.run();
      this.results.push(recap);

      // Update current rollover budget
      this.currentRolloverBudget = recap.remainingBudget;
    }

    log("Interventions run. Results:", this.results);
    // model runtime in seconds
    const endTime = performance.now();
    log("Model run time:", (endTime - startTime) / 1000, "s");

    return this.results;
  }

  getStackedResults() {
    // Use cached results if available, otherwise use the results array
    const results = this._cachedResults || this.results;
    return MiniDecarbModel.stackResults(results);
  }

  setAutoRun(autoRun) {
    this.autoRun = autoRun;
    return this; // Allow method chaining
  }

  logCurrentState() {
    log("Current Intervention Order:", this.currentOrder);
    log("Intervention Configurations:", this.interventionConfigs);
    log("Current Rollover Budget:", this.currentRolloverBudget);
    log("Results:", this.results);
  }
}

export class MiniDecarbModel {
  _getDefaultConfig() {
    return {
      initial_year: 2025,
      rolledover_budget: 0,
      yearly_budgets: [100000, 100000, 100000, 100000, 100000],
      optimizationStrategy: "tech-first",

      // Multi-technology intervention settings
      allowMultipleInterventions: false, // Flag to enable/disable multiple interventions
      maxInterventionsPerBuilding: 3, // Maximum number of interventions per building
      conflictResolutionStrategy: "priority", // "priority", "cost_effective", "carbon_first", "user_choice"

      // Technology compatibility and synergy rules
      technologyCompatibility: {
        // Define which technologies can be combined
        ASHP: { PV: true, Insulation: true, GSHP: false },
        PV: { ASHP: true, Insulation: true, GSHP: true },
        GSHP: { PV: true, Insulation: true, ASHP: false },
        Insulation: { ASHP: true, PV: true, GSHP: true },
      },

      technologySynergies: {
        // Define synergy effects between technologies
        "ASHP+Insulation": {
          type: "carbon_bonus",
          value: 0.15, // 15% additional carbon savings
          description: "Heat pumps work more efficiently with good insulation",
        },
        "PV+ASHP": {
          type: "carbon_bonus",
          value: 0.1, // 10% additional carbon savings
          description: "Solar PV can power heat pump with renewable energy",
        },
        "PV+Insulation": {
          type: "cost_reduction",
          value: 500, // £500 cost reduction for combined installation
          description: "Shared installation costs for roof work",
        },
      },

      tech: {
        name: "ASHP",
        config: {
          suitabilityKey: "ashp_suitability",
          labourKey: "ashp_labour",
          materialKey: "ashp_material",
          savingsKey: "heat_demand",
        },
      },
      technologies: [
        {
          name: "ASHP",
          config: {
            suitabilityKey: "ashp_suitability",
            labourKey: "ashp_labour",
            materialKey: "ashp_material",
            savingsKey: "heat_demand",
          },
        },
        {
          name: "PV",
          config: {
            suitabilityKey: "pv_suitability",
            labourKey: "pv_labour",
            materialKey: "pv_material",
            savingsKey: "pv_generation",
          },
        },
        {
          name: "GSHP",
          config: {
            suitabilityKey: "gshp_suitability",
            labourKey: "gshp_labour",
            materialKey: "gshp_material",
            savingsKey: "gshp_size",
          },
        },
        {
          name: "Insulation",
          config: {
            suitabilityKey: "insulation_rating",
            labourKey: "insulation_cwall_labour",
            materialKey: "insulation_cwall_materials",
            savingsKey: "insulation_cwall",
          },
        },
      ],
      priorities: [],
      filters: [],
      numYears: 5,
    };
  }

  constructor(buildings, modelId = "default_model") {
    this.config = this._getDefaultConfig();
    if (this.config.yearly_budgets) {
      this.config.numYears = this.config.yearly_budgets.length;
    }
    this.modelId = modelId;
    this.buildings = buildings.map((b) => new Building(b.id, b));
    this.suitableBuildings = [];
    this.suitableBuildingsNeedUpdate = true;
    this.yearlyStats = {};
    this.appliedFilters = [];
    this._buildingCosts = new Map();
    this._availableBuildings = null;
    this._potentialInterventions = null;
  }

  configure(configObj) {
    if (!configObj || typeof configObj !== "object") {
      error("Invalid configuration object provided to configure().");
      return this;
    }
    const schemaKeys = [
      "initial_year",
      "rolledover_budget",
      "yearly_budgets",
      "optimizationStrategy",
      "tech",
      "technologies",
      "priorities",
      "filters",
      "modelId",
      // Multi-technology configuration keys
      "allowMultipleInterventions",
      "maxInterventionsPerBuilding",
      "conflictResolutionStrategy",
      "technologyCompatibility",
      "technologySynergies",
    ];

    for (const key of schemaKeys) {
      if (configObj[key] !== undefined) {
        if (key === "tech") {
          this.config.tech = JSON.parse(JSON.stringify(configObj.tech));
        } else if (
          key === "technologies" ||
          key === "priorities" ||
          key === "filters" ||
          key === "technologyCompatibility" ||
          key === "technologySynergies"
        ) {
          this.config[key] = JSON.parse(JSON.stringify(configObj[key]));
        } else if (key === "yearly_budgets") {
          this.config.yearly_budgets = [...configObj.yearly_budgets];
          this.config.numYears = configObj.yearly_budgets.length;
        } else if (key === "modelId") {
          this.modelId = configObj.modelId;
        } else {
          this.config[key] = configObj[key];
        }
      }
    }

    // Validate multi-technology configuration
    if (this.config.allowMultipleInterventions) {
      if (
        !this.config.maxInterventionsPerBuilding ||
        this.config.maxInterventionsPerBuilding < 1
      ) {
        warn(
          "maxInterventionsPerBuilding should be at least 1 when allowMultipleInterventions is true"
        );
        this.config.maxInterventionsPerBuilding = 3;
      }

      const validStrategies = [
        "priority",
        "cost_effective",
        "carbon_first",
        "user_choice",
      ];
      if (!validStrategies.includes(this.config.conflictResolutionStrategy)) {
        warn(
          `Invalid conflictResolutionStrategy: ${this.config.conflictResolutionStrategy}. Using 'priority'.`
        );
        this.config.conflictResolutionStrategy = "priority";
      }
    }

    // --- PATCH: Convert filter configs to functions if needed ---
    if (Array.isArray(this.config.filters)) {
      this.config.filters = this.config.filters.map((filter) => {
        if (
          typeof filter.filterFunction !== "function" &&
          filter.attribute &&
          filter.operator &&
          filter.threshold !== undefined
        ) {
          return {
            ...filter,
            filterFunction: MiniDecarbModel.createDynamicFilter(
              filter.attribute,
              filter.operator,
              filter.threshold
            ),
          };
        }
        return filter;
      });
    }
    // -----------------------------------------------------------
    if (this.config.yearly_budgets) {
      this.config.numYears = this.config.yearly_budgets.length;
    }
    this.suitableBuildingsNeedUpdate = true;
    this._buildingCosts.clear();
    this._availableBuildings = null;
    this._potentialInterventions = null;
    this.appliedFilters = [];
    return this;
  }

  // Method to reset the model state
  reset() {
    // Reset building states
    this.buildings.forEach((building) => {
      building.isIntervened = false;
      building.interventionYear = null;
      building.interventionCost = null;
      building.carbonSaved = null;
      building.numInterventions = 0;
      building.interventionTechs = null;
    });

    // Reset model states
    this.yearlyStats = {};
    this._buildingCosts.clear();
    this._availableBuildings = null;
    this._potentialInterventions = null;
    this.suitableBuildingsNeedUpdate = true;

    return this;
  }

  // Method to modify configuration
  updateConfig(updates) {
    // Validate and apply updates
    if (updates.yearly_budgets) {
      this.config.yearly_budgets = updates.yearly_budgets;
      this.config.numYears = updates.yearly_budgets.length;
    }

    if (updates.initial_year !== undefined) {
      this.config.initial_year = updates.initial_year;
    }

    if (updates.rolledover_budget !== undefined) {
      this.config.rolledover_budget = updates.rolledover_budget;
    }

    if (updates.optimizationStrategy) {
      this.config.optimizationStrategy = updates.optimizationStrategy;
      if (updates.optimizationStrategy === "carbon-first") {
        this.config.technologies = [];
      }
    }

    // Force recalculation flags
    this.suitableBuildingsNeedUpdate = true;
    this._buildingCosts.clear();
    this._availableBuildings = null;
    this._potentialInterventions = null;

    return this;
  }

  // Convenience method to modify and re-run
  modifyAndRun(updates) {
    this.reset();
    this.updateConfig(updates);
    return this.run();
  }

  // Configuration Methods
  setInitialYear(year) {
    this.config.initial_year = year;
  }

  setRolloverBudget(budget) {
    this.config.rolledover_budget = budget;
  }

  setYearlyBudgets(budgets) {
    this.config.yearly_budgets = budgets;
    this.config.numYears = budgets.length;
  }

  setOptimizationStrategy(strategy) {
    this.config.optimizationStrategy = strategy;
    if (strategy === "carbon-first") {
      this.config.technologies = [];
    }
  }

  addTechnology(techConfig) {
    log("Adding technology", techConfig);
    if (this.config.optimizationStrategy === "carbon-first") {
      this.config.technologies.push(techConfig);
    } else {
      this.config.tech = techConfig;
    }
    this.filterSuitableBuildings();
    this.calculateBuildingScores();
    this.suitableBuildingsNeedUpdate = true;
  }

  // Filter suitable buildings early based on tech requirements
  filterSuitableBuildings() {
    if (!this.suitableBuildingsNeedUpdate) {
      return; // No need to filter if the flag is false
    }

    if (this.config.optimizationStrategy === "carbon-first") {
      // Handle multiple technologies
      this.suitableBuildings = this.buildings.filter((b) => {
        return this.config.technologies.some(
          (tech) => b.properties[tech.config.suitabilityKey]
          // (tech) => b[tech.config.suitabilityKey]
        );
      });
    } else {
      // Handle single technology (tech-first)
      this.suitableBuildings = this.buildings.filter(
        (b) => b.properties[this.config.tech.config.suitabilityKey]
      );
    }

    // Apply all added filters, if any:
    if (this.config.filters && this.config.filters.length > 0) {
      for (const filter of this.config.filters) {
        if (typeof filter.filterFunction === "function") {
          this.suitableBuildings = this.suitableBuildings.filter(
            filter.filterFunction
          );
        } else {
          warn(
            `Filter '${
              filter.filterName || "Unnamed filter"
            }' skipped: filterFunction is not a function.`
          );
        }
      }
    }

    // log("Suitable buildings", this.suitableBuildings);
    this.suitableBuildingsNeedUpdate = false; // Reset the flag after filtering
  }

  addAvailableTechnology(techConfig) {
    this.config.technologies.push(techConfig);
  }

  // Add a custom filter for buildings based on criteria
  addBuildingFilter(filterFn, filterName = "Custom filter") {
    if (!this.config.filters) {
      this.config.filters = [];
    }
    this.config.filters.push({ filterFunction: filterFn, filterName });

    // Apply the filter to the current suitable buildings
    const beforeCount = this.suitableBuildings.length;
    this.suitableBuildings = this.suitableBuildings.filter(filterFn);
    const afterCount = this.suitableBuildings.length;

    const filterResult = {
      name: filterName,
      buildingsBefore: beforeCount,
      buildingsAfter: afterCount,
      buildingsFiltered: beforeCount - afterCount,
    };

    this.appliedFilters.push(filterResult);

    this.suitableBuildingsNeedUpdate = true;

    log(`Filter "${filterName}" applied:`, filterResult);
    return this;

    // this.suitableBuildings = this.suitableBuildings.filter(filterFn);
    // this.appliedFilters.push(filterName);
    // this.suitableBuildingsNeedUpdate = true; // Need to re-filter when filters change
  }

  // Add a priority to the configuration, not directly to the model
  addPriority(attribute, order = "asc", scoreFunction = null, weight = 1.0) {
    this.config.priorities.push({ attribute, order, scoreFunction, weight });
  }

  getFilteredBuildings() {
    // Key improvement: Encapsulate filtered access
    if (this.suitableBuildingsNeedUpdate) {
      this.filterSuitableBuildings();
      this.suitableBuildingsNeedUpdate = false;
    }
    return this.suitableBuildings;
  }

  // Get available buildings sorted by score and filtered by intervention status
  getAvailableBuildings() {
    if (this.suitableBuildingsNeedUpdate) {
      // Key: Check if filtering applied
      this.filterSuitableBuildings();
      this.suitableBuildingsNeedUpdate = false; // Reset after filtering
    }
    if (!this._availableBuildings) {
      this._availableBuildings = this.suitableBuildings
        .filter((b) => !b.isIntervened)
        .sort((a, b) => b.score - a.score);
    }
    return this._availableBuildings;
  }

  // Reset available buildings cache when needed
  resetAvailableBuildings() {
    this._availableBuildings = null;
  }

  // Cache building costs for the current technology
  precalculateBuildingCosts() {
    this._buildingCosts.clear(); // Clear previous costs

    if (this.suitableBuildingsNeedUpdate) {
      // Key: Check if filtering applied
      this.filterSuitableBuildings();
      this.suitableBuildingsNeedUpdate = false; // Reset after filtering
    }

    if (this.config.optimizationStrategy === "carbon-first") {
      for (const building of this.suitableBuildings) {
        for (const tech of this.config.technologies) {
          // Calculate cost using getBuildingCost, which also caches the cost
          this.getBuildingCost(building, tech);
        }
      }
    } else {
      // Tech-first: Use the single technology
      for (const building of this.suitableBuildings) {
        // Calculate cost using getBuildingCost, which also caches the cost
        this.getBuildingCost(building);
      }
    }
    // log(
    //   "precalculateBuildingCosts buildingCosts Map:",
    //   this._buildingCosts
    // );
  }

  // test with memoization
  getBuildingCost(building, technology = this.tech) {
    // Determine cache key based on optimization strategy
    const cacheKey =
      this.config.optimizationStrategy === "carbon-first"
        ? `${building.id}-${technology.name}`
        : `${building.id}-${this.config.tech.name}`;

    // Check if the cost is already cached
    if (this._buildingCosts.has(cacheKey)) {
      return this._buildingCosts.get(cacheKey);
    }

    // Calculate the cost based on the optimization strategy
    let cost;
    if (this.config.optimizationStrategy === "carbon-first") {
      const labour = building.properties[technology.config.labourKey] || 0;
      const material = building.properties[technology.config.materialKey] || 0;
      cost = labour + material;
    } else {
      const labour =
        building.properties[this.config.tech.config.labourKey] || 0;
      const material =
        building.properties[this.config.tech.config.materialKey] || 0;
      cost = labour + material;
    }

    // Log the calculated cost and cache key for debugging
    // log("getBuildingCost - Building ID:", building.id, "Tech:", technology?.name, "Cost:", cost, "Cache Key:", cacheKey);

    // Store the calculated cost in the cache
    this._buildingCosts.set(cacheKey, cost);
    return cost;
  }

  calculateBuildingScores() {
    // if (this.suitableBuildingsNeedUpdate) {
    //   // Key: Check if filtering applied
    //   this.filterSuitableBuildings();
    //   this.suitableBuildingsNeedUpdate = false; // Reset after filtering
    // }

    this.filterSuitableBuildings();

    // Calculate scores in a single pass
    const buildingCount = this.suitableBuildings.length;

    // Create an index for faster lookups
    const savingsIndex = new Map();

    if (this.config.optimizationStrategy === "carbon-first") {
      // Carbon-first: Iterate through technologies and accumulate savings
      this.suitableBuildings.forEach((building) => {
        let totalSavings = 0;
        this.config.technologies.forEach((tech) => {
          totalSavings += building.properties[tech.config.savingsKey] || 0;
        });
        savingsIndex.set(building, totalSavings);
      });
    } else {
      // Tech-first: Use savings from the single technology
      this.suitableBuildings.forEach((building) => {
        savingsIndex.set(
          building,
          building.properties[this.config.tech.config.savingsKey]
        );
      });
    }

    // Sort once using the index
    this.suitableBuildings.sort(
      (a, b) => savingsIndex.get(b) - savingsIndex.get(a)
    );

    // Apply scores and priorities in single pass
    this.suitableBuildings.forEach((building, index) => {
      // Base score from ranking
      let score = buildingCount - index;

      // Apply priority rules efficiently
      for (const rule of this.config.priorities) {
        const value = building.properties[rule.attribute];
        if (value !== undefined) {
          score += (rule.scoreFunction?.(value) ?? 0) * (rule.weight ?? 1.0);
        }
      }

      building.score = score;
    });
  }

  // New method to calculate carbon savings per cost ratio
  //   calculateCarbonEfficiency(building, technology) {
  //     // Carbon-first: tech is passed as argument
  //     if (this.config.optimizationStrategy === "carbon-first") {
  //       const cost = this.getBuildingCost(building, technology);
  //       const carbonSaved = building.properties[technology.config.savingsKey];
  //       return cost > 0 ? carbonSaved / cost : 0;
  //     } else {
  //       const cost = this.getBuildingCost(building);
  //       const carbonSaved =
  //         building.properties[this.config.tech.config.savingsKey];
  //       return cost > 0 ? carbonSaved / cost : 0;
  //     }
  //   }

  calculateCarbonEfficiency(building, technology) {
    const startTime = performance.now();
    let carbonEfficiency;

    if (this.config.optimizationStrategy === "carbon-first") {
      // Carbon-first: tech is passed as argument
      const cost = this.getBuildingCost(building, technology);
      if (cost === undefined) {
        warn(
          `Warning: Cost not found for building ${building.id} and tech ${technology.name}. Check getBuildingCost.`
        );
        return 0; // Or handle it in some other appropriate way, like returning a very large negative number
      }

      const carbonSaved = building.properties[technology.config.savingsKey];

      if (carbonSaved === undefined) {
        warn(
          `Warning: Carbon savings not found for building ${building.id} and tech ${technology.name}. Check technology config.`
        );
        return 0; // Or handle it appropriately
      }

      carbonEfficiency = cost > 0 ? carbonSaved / cost : 0;
    } else {
      // Tech-first: this.config.tech is used
      const cost = this.getBuildingCost(building);
      if (cost === undefined) {
        warn(
          `Warning: Cost not found for building ${building.id} and tech ${this.config.tech.name}. Check getBuildingCost.`
        );
        return 0; // Or handle it appropriately
      }
      const carbonSaved =
        building.properties[this.config.tech.config.savingsKey];

      if (carbonSaved === undefined) {
        warn(
          `Warning: Carbon savings not found for building ${building.id} and tech ${this.config.tech.name}. Check technology config.`
        );
        return 0; // Or handle it appropriately
      }

      carbonEfficiency = cost > 0 ? carbonSaved / cost : 0;
    }

    const endTime = performance.now();

    // DEBUG: Log building ID, tech name, and carbon efficiency
    // log(
    //   `Building ID: ${building.id}, Tech: ${
    //     technology ? technology.name : this.config.tech.name
    //   }, Carbon Efficiency: ${carbonEfficiency}`
    // );

    return carbonEfficiency;
  }

  calculatePotentialInterventions() {
    if (this.suitableBuildingsNeedUpdate) {
      this.filterSuitableBuildings();
      this.suitableBuildingsNeedUpdate = false;
    }

    if (!this._potentialInterventions) {
      this._potentialInterventions = new Map();

      for (const building of this.suitableBuildings) {
        const buildingInterventions = [];

        if (this.config.allowMultipleInterventions) {
          // Generate technology bundles for multi-technology interventions
          const technologyBundles = this.generateTechnologyBundles(building);

          for (const bundle of technologyBundles) {
            const cost = this.calculateCombinedCost(building, bundle);
            const carbonSaved = this.calculateCombinedCarbonSavings(
              building,
              bundle
            );
            const carbonEfficiency = cost > 0 ? carbonSaved / cost : 0;

            buildingInterventions.push({
              building,
              tech: bundle, // Array of technologies or single technology
              technologies: bundle,
              carbonEfficiency,
              cost,
              carbonSaved,
              isBundle: bundle.length > 1,
              bundleSize: bundle.length,
            });
          }
        } else {
          // Single technology mode (existing behavior)
          for (const tech of this.config.technologies) {
            if (building.properties[tech.config.suitabilityKey]) {
              const cost = this.getBuildingCost(building, tech);
              const carbonEfficiency = this.calculateCarbonEfficiency(
                building,
                tech
              );
              const carbonSaved =
                building.properties[tech.config.savingsKey] || 0;

              buildingInterventions.push({
                building,
                tech,
                technologies: [tech],
                carbonEfficiency,
                cost,
                carbonSaved,
                isBundle: false,
                bundleSize: 1,
              });
            }
          }
        }

        if (buildingInterventions.length > 0) {
          this._potentialInterventions.set(building.id, buildingInterventions);
        }
      }
    }

    return this._potentialInterventions;
  }

  runCarbonFirstModel() {
    let remainingBudget = this.config.rolledover_budget || 0;
    const interventions = this.calculatePotentialInterventions();

    if (this.suitableBuildingsNeedUpdate) {
      this.filterSuitableBuildings();
      this.suitableBuildingsNeedUpdate = false;
    }

    // Create a priority queue for interventions, ordered by carbon efficiency (descending)
    const pq = new PriorityQueue(
      (a, b) => b.carbonEfficiency - a.carbonEfficiency
    );

    // Add all available interventions to the priority queue initially
    for (const buildingInterventions of interventions.values()) {
      for (const intervention of buildingInterventions) {
        pq.enqueue(intervention);
      }
    }

    for (let year = 0; year < this.config.numYears; year++) {
      const yearBudget = this.config.yearly_budgets[year] + remainingBudget;
      let spent = 0;
      const buildingsIntervened = [];
      const processedInterventions = new Set();
      const conflictLog = [];

      while (pq.size() > 0 && spent + pq.peek().cost <= yearBudget) {
        const intervention = pq.dequeue();
        const { building, tech, technologies, cost, isBundle } = intervention;

        // Skip if this intervention has already been processed in this year
        if (processedInterventions.has(intervention)) continue;
        processedInterventions.add(intervention);

        // Check if building is available for intervention
        if (this.config.allowMultipleInterventions) {
          // Check if we can add more interventions to this building
          const canAddMore =
            building.interventions.length <
            this.config.maxInterventionsPerBuilding;

          // Check compatibility with existing interventions
          const isCompatible = isBundle
            ? this.areCompatible([
                ...building.currentTechnologies
                  .map((name) =>
                    this.config.technologies.find((t) => t.name === name)
                  )
                  .filter(Boolean),
                ...technologies,
              ])
            : building.isCompatibleWith(
                tech.name,
                this.config.technologyCompatibility
              );

          if (canAddMore && isCompatible) {
            const success = this.applyIntervention(
              building,
              isBundle ? technologies : tech,
              cost,
              year
            );
            if (success) {
              spent += cost;
              buildingsIntervened.push(building);

              // Log successful intervention
              log(
                `Multi-tech intervention applied: Building ${
                  building.id
                }, Tech: ${
                  isBundle
                    ? technologies.map((t) => t.name).join(" + ")
                    : tech.name
                }, Cost: ${cost}`
              );
            }
          } else {
            // Log conflict
            conflictLog.push({
              building: building.id,
              technology: isBundle
                ? technologies.map((t) => t.name).join(" + ")
                : tech.name,
              reason: !canAddMore
                ? "max_interventions_reached"
                : "incompatible_technology",
              existing: building.currentTechnologies,
            });
          }
        } else {
          // Single intervention mode (existing behavior)
          if (!building.isIntervened) {
            const success = this.applyIntervention(
              building,
              isBundle ? technologies : tech,
              cost,
              year
            );
            if (success) {
              spent += cost;
              buildingsIntervened.push(building);
            }
          }
        }
      }

      // Remove processed interventions from the queue
      pq._heap = pq._heap.filter(
        (intervention) => !processedInterventions.has(intervention)
      );
      pq._heapify();

      // Log conflicts for this year
      if (conflictLog.length > 0) {
        log(`Year ${this.config.initial_year + year} conflicts:`, conflictLog);
      }

      this.updateYearlyStats(
        year,
        spent,
        buildingsIntervened,
        yearBudget - spent
      );
      remainingBudget = yearBudget - spent;
    }
  }

  runTechFirstModel() {
    // Calculate and cache building costs
    this.precalculateBuildingCosts();

    if (this.suitableBuildingsNeedUpdate) {
      // Key: Check if filtering applied
      this.filterSuitableBuildings();
      this.suitableBuildingsNeedUpdate = false; // Reset after filtering
    }

    let remainingBudget = this.config.rolledover_budget || 0;

    for (let year = 0; year < this.config.numYears; year++) {
      const yearBudget = this.config.yearly_budgets[year] + remainingBudget;
      let spent = 0;
      const buildingsIntervened = [];

      const availableBuildings = this.getAvailableBuildings();

      for (const building of availableBuildings) {
        // In tech-first, use the precalculated cost for the single tech
        const cost = this._buildingCosts.get(
          `${building.id}-${this.config.tech.name}`
        );

        // Log for debugging
        // log(
        //   "Building ID:",
        //   building.id,
        //   "Tech:",
        //   this.config.tech.name,
        //   "Cost:",
        //   cost
        // );

        if (cost === undefined) {
          warn(
            `Warning: Cost not found for building ${building.id} and tech ${this.config.tech.name}. Check precalculateBuildingCosts.`
          );
          continue;
        }

        if (spent + cost > yearBudget) {
          continue;
        }

        this.applyIntervention(building, this.config.tech, cost, year);

        spent += cost;
        buildingsIntervened.push(building);
      }

      this.updateYearlyStats(
        year,
        spent,
        buildingsIntervened,
        yearBudget - spent
      );
      remainingBudget = yearBudget - spent;
      this.resetAvailableBuildings();
    }
  }

  updateYearlyStats(year, spent, buildings, remainingBudget) {
    this.yearlyStats[this.config.initial_year + year] = {
      budgetSpent: spent,
      buildingsIntervened: buildings.length,
      remainingBudget,
      intervenedBuildings: buildings,
    };
  }

  applyIntervention(building, techOrBundle, cost, year) {
    // Handle both single technology and technology bundles
    const technologies = Array.isArray(techOrBundle)
      ? techOrBundle
      : [techOrBundle];
    const interventionYear = this.config.initial_year + year;

    // Check if multiple interventions are allowed
    if (!this.config.allowMultipleInterventions && building.isIntervened) {
      warn(
        `Building ${building.id} already has an intervention and multiple interventions are disabled`
      );
      return false;
    }

    // Check compatibility with existing interventions
    for (const tech of technologies) {
      if (
        !building.isCompatibleWith(
          tech.name,
          this.config.technologyCompatibility
        )
      ) {
        const conflict = {
          buildingId: building.id,
          newTechnology: tech.name,
          existingTechnologies: building.currentTechnologies,
          reason: "incompatible_technologies",
        };
        building.interventionConflicts.push(conflict);
        warn(
          `Technology ${tech.name} is incompatible with existing interventions on building ${building.id}`
        );
        return false;
      }
    }

    // Calculate synergies
    const allTechnologies = [
      ...building.currentTechnologies
        .map((name) => this.config.technologies.find((t) => t.name === name))
        .filter(Boolean),
      ...technologies,
    ];

    const synergies = this.calculateSynergies(allTechnologies);

    // Apply interventions
    if (technologies.length === 1) {
      // Single technology intervention
      const tech = technologies[0];
      const carbonSaved = building.properties[tech.config.savingsKey] || 0;

      building.addIntervention(
        tech,
        cost,
        carbonSaved,
        interventionYear,
        synergies
      );

      if (this.config.optimizationStrategy === "carbon-first") {
        building.interventionTechs = building.currentTechnologies.join(", ");
      } else {
        building.interventionTechs = tech.name;
      }
    } else {
      // Multiple technology intervention (bundle)
      const bundleCost = this.calculateCombinedCost(building, technologies);
      const bundleCarbonSaved = this.calculateCombinedCarbonSavings(
        building,
        technologies
      );

      // Add each technology as separate intervention but in the same year
      for (const tech of technologies) {
        const techCost =
          building.properties[tech.config.labourKey] +
          building.properties[tech.config.materialKey];
        const techCarbonSaved =
          building.properties[tech.config.savingsKey] || 0;

        building.addIntervention(
          tech,
          techCost,
          techCarbonSaved,
          interventionYear,
          synergies
        );
      }

      // Update aggregated values to reflect bundle totals including synergies
      building.interventionCost = bundleCost;
      building.carbonSaved = bundleCarbonSaved;
      building.interventionTechs = technologies.map((t) => t.name).join(" + ");
    }

    building.numInterventions = building.interventions.length;

    log(
      `Applied intervention to building ${building.id}: ${technologies
        .map((t) => t.name)
        .join(" + ")} (Cost: ${cost}, Carbon: ${building.carbonSaved})`
    );

    return true;
  }

  // --- Model Running Method ---

  run() {
    // const startTime = performance.now();
    // Initialize the model
    this.filterSuitableBuildings(); // already applied in score calculation
    this.calculateBuildingScores();

    // Set tech to the first technology if optimization strategy is not carbon-first and only if tech is not set
    if (
      this.config.optimizationStrategy !== "carbon-first" &&
      (!this.config.tech || Object.keys(this.config.tech).length === 0) &&
      this.config.technologies.length > 0
    ) {
      this.config.tech = this.config.technologies[0];
    }

    if (this.config.optimizationStrategy === "carbon-first") {
      log("Running carbon-first model");
      this.runCarbonFirstModel();
    } else {
      log("Running tech-first model");
      this.runTechFirstModel();
    }

    // // model runtime in seconds
    // const endTime = performance.now();
    // log("Model run time:", (endTime - startTime) / 1000, "s");

    return this.getRecap();
  }

  // Recap of model configuration, yearly allocation, and total allocation check
  getRecap() {
    const totalAllocated = Object.values(this.yearlyStats).reduce(
      (sum, year) => sum + year.budgetSpent,
      0
    );

    if (this.suitableBuildingsNeedUpdate) {
      this.filterSuitableBuildings();
      this.suitableBuildingsNeedUpdate = false;
    }

    // Calculate remaining budget correctly
    let remainingBudget = 0;
    const numYears = Object.keys(this.yearlyStats).length;
    if (numYears > 0) {
      const lastYear = Math.max(...Object.keys(this.yearlyStats).map(Number));
      remainingBudget = this.yearlyStats[lastYear].remainingBudget;
    }

    // Multi-technology intervention statistics
    const multiTechStats = this.calculateMultiTechStats();

    return {
      modelId: this.modelId,
      techName:
        this.config.optimizationStrategy === "carbon-first"
          ? this.config.technologies.map((tech) => tech.name)
          : this.config.tech.name,
      initialBudget: this.config.yearly_budgets.reduce((a, b) => a + b, 0),
      yearlyBudgets: this.config.yearly_budgets,
      totalBudgetSpent: totalAllocated,
      remainingBudget: remainingBudget,
      projectDuration: numYears,
      yearlyStats: this.yearlyStats,
      intervenedBuildings: this.suitableBuildings.filter((b) => b.isIntervened),
      allBuildings: this.suitableBuildings,
      appliedFilters: this.appliedFilters.map((filter) => ({
        name: filter.name,
        buildingsBefore: filter.buildingsBefore,
        buildingsAfter: filter.buildingsAfter,
        buildingsFiltered: filter.buildingsFiltered,
      })),
      priorityRules: this.config.priorities.map((rule) => ({
        attribute: rule.attribute,
        hasCustomScore: !!rule.scoreFunction,
        weight: rule.weight || 1.0,
      })),

      // Multi-technology intervention data
      multiTechnologySettings: {
        allowMultipleInterventions: this.config.allowMultipleInterventions,
        maxInterventionsPerBuilding: this.config.maxInterventionsPerBuilding,
        conflictResolutionStrategy: this.config.conflictResolutionStrategy,
        technologyCompatibility: this.config.technologyCompatibility,
        technologySynergies: this.config.technologySynergies,
      },

      multiTechnologyStats: multiTechStats,

      // Conflicts and issues
      conflicts: this.suitableBuildings
        .filter((b) => b.interventionConflicts.length > 0)
        .map((b) => ({
          buildingId: b.id,
          conflicts: b.interventionConflicts,
        })),
    };
  }

  // Calculate statistics for multi-technology interventions
  calculateMultiTechStats() {
    const stats = {
      totalBuildings: this.suitableBuildings.length,
      buildingsWithInterventions: 0,
      buildingsWithMultipleInterventions: 0,
      averageInterventionsPerBuilding: 0,
      totalInterventions: 0,
      technologyCombinations: {},
      synergyEffects: {},
      conflictCount: 0,
      costSavingsFromSynergies: 0,
      carbonBonusFromSynergies: 0,
    };

    for (const building of this.suitableBuildings) {
      if (building.isIntervened) {
        stats.buildingsWithInterventions++;
        stats.totalInterventions += building.interventions.length;

        if (building.hasMultipleInterventions) {
          stats.buildingsWithMultipleInterventions++;
        }

        // Track technology combinations
        const techCombo = building.currentTechnologies.sort().join(" + ");
        stats.technologyCombinations[techCombo] =
          (stats.technologyCombinations[techCombo] || 0) + 1;

        // Track synergy effects
        for (const [synergyKey, synergy] of Object.entries(
          building.synergyBonuses
        )) {
          if (!stats.synergyEffects[synergyKey]) {
            stats.synergyEffects[synergyKey] = { count: 0, totalValue: 0 };
          }
          stats.synergyEffects[synergyKey].count++;
          stats.synergyEffects[synergyKey].totalValue += synergy.value;

          if (synergy.type === "cost_reduction") {
            stats.costSavingsFromSynergies += synergy.value;
          } else if (synergy.type === "carbon_bonus") {
            stats.carbonBonusFromSynergies += synergy.value;
          }
        }

        // Count conflicts
        stats.conflictCount += building.interventionConflicts.length;
      }
    }

    if (stats.buildingsWithInterventions > 0) {
      stats.averageInterventionsPerBuilding =
        stats.totalInterventions / stats.buildingsWithInterventions;
    }

    return stats;
  }

  // Helper method to stack results for visualisation
  static stackResults(modelRecaps) {
    const buildingMap = new Map();
    const yearlySummary = {};
    const multiTechSummary = {
      totalMultiTechBuildings: 0,
      totalConflicts: 0,
      synergyEffects: {},
      technologyCombinations: {},
    };

    modelRecaps.forEach((modelRecap) => {
      // Process yearlyStats for overall summary
      Object.entries(modelRecap.yearlyStats).forEach(([year, stats]) => {
        if (!yearlySummary[year]) {
          yearlySummary[year] = {
            budgetSpent: 0,
            buildingsIntervened: 0,
            totalCarbonSaved: 0,
            technologies: new Set(),
            intervenedBuildingIds: new Set(),
            multiTechBuildings: 0,
            conflictsResolved: 0,
          };
        }

        yearlySummary[year].budgetSpent += stats.budgetSpent;
        yearlySummary[year].buildingsIntervened += stats.buildingsIntervened;
        stats.intervenedBuildings.forEach((building) => {
          yearlySummary[year].intervenedBuildingIds.add(building.id);

          // Track multi-technology buildings
          if (building.hasMultipleInterventions) {
            yearlySummary[year].multiTechBuildings++;
          }
        });

        if (stats.buildingsIntervened > 0) {
          const techName = Array.isArray(modelRecap.techName)
            ? modelRecap.techName
            : [modelRecap.techName];
          techName.forEach((tech) =>
            yearlySummary[year].technologies.add(tech)
          );
        }

        yearlySummary[year].totalCarbonSaved +=
          stats.intervenedBuildings.reduce(
            (sum, b) => sum + (b.carbonSaved || 0),
            0
          );
      });

      // Process all buildings from the recap
      modelRecap.allBuildings.forEach((building) => {
        if (!buildingMap.has(building.id)) {
          buildingMap.set(building.id, {
            ...building.properties,
            ...building,
            isIntervened: false,
            totalCost: 0,
            totalCarbonSaved: 0,
            interventionHistory: [],
            interventionYears: [],
            interventionTechs: [],
            numInterventions: 0,

            // Multi-technology specific properties
            hasMultipleInterventions: false,
            interventions: [],
            currentTechnologies: [],
            synergyBonuses: {},
            interventionConflicts: [],
            maxInterventionsReached: false,
          });
        }

        const target = buildingMap.get(building.id);

        // Process interventions if the building was intervened in this model
        if (building.isIntervened) {
          // Handle multi-technology interventions
          if (building.interventions && building.interventions.length > 0) {
            // Building has detailed intervention data
            building.interventions.forEach((intervention) => {
              const interventionRecord = {
                tech: intervention.tech,
                year: intervention.year,
                cost: intervention.cost,
                carbonSaved: intervention.carbonSaved,
                modelId: modelRecap.modelId,
                synergies: intervention.synergies,
              };

              target.interventionHistory.push(interventionRecord);
              target.interventionYears.push(intervention.year);

              if (!target.interventionTechs.includes(intervention.tech)) {
                target.interventionTechs.push(intervention.tech);
              }

              if (!target.currentTechnologies.includes(intervention.tech)) {
                target.currentTechnologies.push(intervention.tech);
              }
            });

            // Copy multi-tech properties
            target.hasMultipleInterventions = building.hasMultipleInterventions;
            target.interventions = [
              ...target.interventions,
              ...building.interventions,
            ];
            target.synergyBonuses = {
              ...target.synergyBonuses,
              ...building.synergyBonuses,
            };
            target.interventionConflicts = [
              ...target.interventionConflicts,
              ...building.interventionConflicts,
            ];
          } else {
            // Legacy single intervention format
            const intervention = {
              tech: Array.isArray(modelRecap.techName)
                ? modelRecap.techName.join(" + ")
                : modelRecap.techName,
              year: building.interventionYear,
              cost: building.interventionCost,
              carbonSaved: building.carbonSaved,
              modelId: modelRecap.modelId,
            };

            target.interventionHistory.push(intervention);
            target.interventionYears.push(building.interventionYear);

            const techNames = Array.isArray(modelRecap.techName)
              ? modelRecap.techName
              : [modelRecap.techName];
            techNames.forEach((tech) => {
              if (!target.interventionTechs.includes(tech)) {
                target.interventionTechs.push(tech);
              }
            });
          }

          target.isIntervened = true;
          target.totalCost += building.interventionCost || 0;
          target.totalCarbonSaved += building.carbonSaved || 0;
          target.numInterventions = Math.max(
            target.numInterventions,
            building.numInterventions || 1
          );
        }
      });

      // Aggregate multi-technology statistics
      if (modelRecap.multiTechnologyStats) {
        multiTechSummary.totalMultiTechBuildings +=
          modelRecap.multiTechnologyStats.buildingsWithMultipleInterventions;
        multiTechSummary.totalConflicts +=
          modelRecap.multiTechnologyStats.conflictCount;

        // Merge synergy effects
        Object.entries(modelRecap.multiTechnologyStats.synergyEffects).forEach(
          ([key, value]) => {
            if (!multiTechSummary.synergyEffects[key]) {
              multiTechSummary.synergyEffects[key] = {
                count: 0,
                totalValue: 0,
              };
            }
            multiTechSummary.synergyEffects[key].count += value.count;
            multiTechSummary.synergyEffects[key].totalValue += value.totalValue;
          }
        );

        // Merge technology combinations
        Object.entries(
          modelRecap.multiTechnologyStats.technologyCombinations
        ).forEach(([combo, count]) => {
          multiTechSummary.technologyCombinations[combo] =
            (multiTechSummary.technologyCombinations[combo] || 0) + count;
        });
      }
    });

    // Finalize the yearly summary
    Object.values(yearlySummary).forEach((yearData) => {
      yearData.technologies = Array.from(yearData.technologies);
      yearData.intervenedBuildingIds = Array.from(
        yearData.intervenedBuildingIds
      );
    });

    const buildings = Array.from(buildingMap.values());
    const summary = {
      totalBuildings: buildings.length,
      intervenedCount: buildings.filter((b) => b.isIntervened).length,
      untouchedCount: buildings.filter((b) => !b.isIntervened).length,
      multiTechCount: buildings.filter((b) => b.hasMultipleInterventions)
        .length,
      totalCost: buildings.reduce((sum, b) => sum + b.totalCost, 0),
      totalCarbonSaved: buildings.reduce(
        (sum, b) => sum + b.totalCarbonSaved,
        0
      ),
      uniqueTechs: [
        ...new Set(
          buildings.flatMap((b) => b.interventionTechs).filter(Boolean)
        ),
      ],
      uniqueTechCombinations: [
        ...new Set(
          buildings
            .filter((b) => b.interventionTechs.length > 1)
            .map((b) => b.interventionTechs.sort().join(" + "))
        ),
      ],
      interventionYearRange: buildings.some((b) => b.interventionYears.length)
        ? [
            Math.min(...buildings.flatMap((b) => b.interventionYears)),
            Math.max(...buildings.flatMap((b) => b.interventionYears)),
          ]
        : null,
    };

    const stackedResultObject = {
      buildings,
      intervenedBuildings: buildings.filter((b) => b.isIntervened),
      multiTechBuildings: buildings.filter((b) => b.hasMultipleInterventions),
      summary,
      yearlySummary,
      multiTechSummary,
      recap: modelRecaps,
    };

    return stackedResultObject;
  }

  static group(data, keys, useMap = false) {
    if (
      !Array.isArray(data) ||
      !data.length ||
      !Array.isArray(keys) ||
      !keys.length
    ) {
      return data;
    }

    const grouped = useMap ? new Map() : {};
    const [currentKey, ...remainingKeys] = keys;

    // Group by current key
    for (const item of data) {
      const key = item[currentKey];

      if (useMap) {
        if (!grouped.has(key)) {
          grouped.set(
            key,
            remainingKeys.length ? { items: [], children: new Map() } : []
          );
        }

        if (remainingKeys.length) {
          const group = grouped.get(key);
          group.items.push(item);
        } else {
          grouped.get(key).push(item);
        }
      } else {
        if (!grouped[key]) {
          grouped[key] = remainingKeys.length
            ? { items: [], children: {} }
            : [];
        }

        if (remainingKeys.length) {
          grouped[key].items.push(item);
        } else {
          grouped[key].push(item);
        }
      }
    }

    // Recursively group remaining keys
    if (remainingKeys.length) {
      if (useMap) {
        for (const [key, group] of grouped) {
          group.children = this.group(group.items, remainingKeys, useMap);
        }
      } else {
        for (const key in grouped) {
          grouped[key].children = this.group(
            grouped[key].items,
            remainingKeys,
            useMap
          );
        }
      }
    }

    return grouped;
  }

  static traverse(grouped, callback, depth = 0) {
    const entries =
      grouped instanceof Map ? grouped.entries() : Object.entries(grouped);

    for (const [key, value] of entries) {
      callback(key, value, depth);
      if (value.children) {
        this.traverse(value.children, callback, depth + 1);
      }
    }
  }

  // ------- Helper method to create dynamic filters

  static createDynamicFilter(attribute, operator, threshold) {
    // Helper method to create building filters
    // Example use:
    // const userFilterFunction = InterventionManager.createDynamicFilter(
    //   userAttribute,
    //   userOperator,
    //   userThreshold
    // );

    // const userConfig = {
    //   filters: [
    //     {
    //       filterName: `${userAttribute} ${userOperator} ${userThreshold}`,
    //       filterFunction: userFilterFunction,
    //     },
    //   ],
    // };
    // Validate attribute
    if (typeof attribute !== "string" || attribute.trim() === "") {
      throw new Error(
        "Invalid attribute: Attribute must be a non-empty string."
      );
    }

    // Validate operator
    const validOperators = [">", ">=", "<", "<=", "==", "!="];
    if (!validOperators.includes(operator)) {
      throw new Error(
        `Invalid operator: Supported operators are ${validOperators.join(
          ", "
        )}.`
      );
    }

    // Validate threshold
    if (typeof threshold !== "number" && typeof threshold !== "string") {
      throw new Error(
        "Invalid threshold: Threshold must be a number or a string."
      );
    }

    // Return the filter function with proper error handling
    return function (building) {
      if (!building || typeof building !== "object") {
        warn("Invalid building object passed to the filter function.");
        return false; // Exclude invalid buildings
      }

      const value = building.properties?.[attribute];
      if (value === undefined) {
        warn(`Attribute "${attribute}" not found in building properties.`);
        return false; // Exclude buildings missing the attribute
      }

      // Perform comparison
      try {
        switch (operator) {
          case ">":
            return value > threshold;
          case ">=":
            return value >= threshold;
          case "<":
            return value < threshold;
          case "<=":
            return value <= threshold;
          case "==":
            return value == threshold;
          case "!=":
            return value != threshold;
          default:
            throw new Error(`Unexpected operator: ${operator}`);
        }
      } catch (error) {
        error(
          `Error evaluating filter: ${attribute} ${operator} ${threshold} - ${error.message}`
        );
        return false; // Exclude buildings if an error occurs
      }
    };
  }

  // Helper methods for multi-technology interventions

  // Calculate synergy effects between technologies
  calculateSynergies(technologies) {
    const synergies = {};
    const techNames = technologies.map((tech) => tech.name).sort();

    for (const [synergyKey, synergyEffect] of Object.entries(
      this.config.technologySynergies
    )) {
      const synergyTechs = synergyKey.split("+").sort();

      if (synergyTechs.every((tech) => techNames.includes(tech))) {
        synergies[synergyKey] = synergyEffect;
      }
    }

    return synergies;
  }

  // Check if technologies are compatible
  areTechnologiesCompatible(technologies) {
    for (let i = 0; i < technologies.length; i++) {
      for (let j = i + 1; j < technologies.length; j++) {
        const techA = technologies[i];
        const techB = technologies[j];

        if (!this.config.technologyCompatibility[techA.name]?.[techB.name]) {
          return false;
        }
      }
    }

    return true;
  }

  // Generate technology bundles for a building
  generateTechnologyBundles(building) {
    if (!this.config.allowMultipleInterventions) {
      return [];
    }

    const suitableTechs = this.config.technologies.filter(
      (tech) => building.properties[tech.config.suitabilityKey]
    );

    const bundles = [];

    // Single technologies
    suitableTechs.forEach((tech) => bundles.push([tech]));

    // Combinations of technologies
    for (let size = 2; size <= suitableTechs.length; size++) {
      bundles.push(...this.getCombinations(suitableTechs, size));
    }

    return bundles;
  }

  // Generate combinations of technologies
  getCombinations(technologies, size) {
    if (size === 1) {
      return technologies.map((tech) => [tech]);
    }

    const combinations = [];

    technologies.forEach((tech, index) => {
      const smallerCombinations = this.getCombinations(
        technologies.slice(index + 1),
        size - 1
      );

      smallerCombinations.forEach((combo) => {
        combinations.push([tech, ...combo]);
      });
    });

    return combinations;
  }
}
