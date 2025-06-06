import { PriorityQueue } from "./priority-queue.js";
import { log, warn, error } from "../logger.js";

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

  addIntervention(config) {
    this.interventionConfigs.push(config);
    this.currentOrder.push(this.interventionConfigs.length - 1); // Add new index to order
    log("Intervention added:", config.id);
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
      let buildingsToUse = this.buildings;
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
      const model = new MiniDecarbModel(buildingsToUse, this.nextModelId++);

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
      //   const valid = config.buildings.every(
      //     (b) => b && typeof b === "object" && "id" in b && "properties" in b
      //   );
      //   if (valid) {
      //     buildingsToUse = config.buildings;
      //   } else {
      //     warn(
      //       `Intervention ${config.id}: Invalid buildings array detected, falling back to manager's buildings.`
      //     );
      //   }
      // }
      if (Array.isArray(config.buildings) && config.buildings.length > 0) {
        buildingsToUse = config.buildings;
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
      yearly_budgets: [],
      optimizationStrategy: "tech-first",
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
      numYears: 0, // Will be derived from yearly_budgets
    };
  }

  constructor(buildings, modelId = "default_model") {
    this.config = this._getDefaultConfig();
    if (this.config.yearly_budgets) {
      this.config.numYears = this.config.yearly_budgets.length;
    }

    this.modelId = modelId;
    this.buildings = buildings.map((b) => new Building(b.id, b)); // Assuming 'b' itself contains properties
    this.suitableBuildings = [];
    this.suitableBuildingsNeedUpdate = true; // Flag to indicate if filtering is needed
    this.yearlyStats = {};
    this.appliedFilters = [];
    this._buildingCosts = new Map();
    this._availableBuildings = null;
    this._potentialInterventions = null;
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
      // Check for existence and length
      for (const filter of this.config.filters) {
        this.suitableBuildings = this.suitableBuildings.filter(
          filter.filterFunction
        );
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
      // Key: Check if filtering applied
      this.filterSuitableBuildings();
      this.suitableBuildingsNeedUpdate = false; // Reset after filtering
    }

    // TEST: Calculate once and cache
    if (!this._potentialInterventions) {
      this._potentialInterventions = new Map();

      for (const building of this.suitableBuildings) {
        const buildingInterventions = [];

        for (const tech of this.config.technologies) {
          if (building.properties[tech.config.suitabilityKey]) {
            const cost = this.getBuildingCost(building, tech);
            const carbonEfficiency = this.calculateCarbonEfficiency(
              building,
              tech
            );

            buildingInterventions.push({
              building,
              tech,
              carbonEfficiency,
              cost,
            });
          }
        }

        if (buildingInterventions.length > 0) {
          this._potentialInterventions.set(building.id, buildingInterventions);
        }

        // log("Potential Interventions:", buildingInterventions);
      }
    }

    return this._potentialInterventions;
  }

  runCarbonFirstModel() {
    let remainingBudget = this.config.rolledover_budget || 0;
    const interventions = this.calculatePotentialInterventions();

    if (this.suitableBuildingsNeedUpdate) {
      // Key: Check if filtering applied
      this.filterSuitableBuildings();
      this.suitableBuildingsNeedUpdate = false; // Reset after filtering
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

    // log("pq:", pq);
    // log("Priority Queue (before interventions):", pq._heap);

    for (let year = 0; year < this.config.numYears; year++) {
      const yearBudget = this.config.yearly_budgets[year] + remainingBudget;
      let spent = 0;
      const buildingsIntervened = [];

      // Keep track of processed interventions in this year
      const processedInterventions = new Set();

      while (pq.size() > 0 && spent + pq.peek().cost <= yearBudget) {
        const intervention = pq.dequeue();
        const { building, tech, cost } = intervention;

        // Skip if this intervention has already been processed in this year
        if (processedInterventions.has(intervention)) continue;
        processedInterventions.add(intervention);

        // Check again if the building has been intervened in the meantime
        // log(
        //   "Building ID:",
        //   building.id,
        //   "Intervened:",
        //   building.isIntervened
        // );
        if (!building.isIntervened) {
          this.applyIntervention(building, tech, cost, year);
          spent += cost;
          buildingsIntervened.push(building);

          //   log("Intervention applied:", building.id, tech.name, cost);
          //   log("Spent this year:", spent, "Year Budget:", yearBudget);
        }
      }

      // Remove processed interventions from the queue
      pq._heap = pq._heap.filter(
        (intervention) => !processedInterventions.has(intervention)
      );
      pq._heapify();

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

  applyIntervention(building, tech, cost, year) {
    building.isIntervened = true;
    building.interventionYear = this.config.initial_year + year;
    building.interventionCost = cost;
    building.numInterventions++;

    if (this.config.optimizationStrategy === "carbon-first") {
      building.interventionTechs = tech.name;
      building.carbonSaved = building.properties[tech.config.savingsKey];
    } else {
      building.interventionTechs = this.config.tech.name;
      building.carbonSaved =
        building.properties[this.config.tech.config.savingsKey];
    }
  }

  // --- Model Running Method ---

  run() {
    // const startTime = performance.now();
    // Initialize the model
    this.filterSuitableBuildings(); // already applied in score calculation
    this.calculateBuildingScores();

    // Set tech to the first technology if optimization strategy is not carbon-first and only one technology is available
    if (
      this.config.optimizationStrategy !== "carbon-first" &&
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
      // Key: Check if filtering applied
      this.filterSuitableBuildings();
      this.suitableBuildingsNeedUpdate = false; // Reset after filtering
    }

    // Calculate remaining budget correctly
    let remainingBudget = 0;
    const numYears = Object.keys(this.yearlyStats).length;
    if (numYears > 0) {
      const lastYear = Math.max(...Object.keys(this.yearlyStats).map(Number));
      remainingBudget = this.yearlyStats[lastYear].remainingBudget;
    }

    return {
      modelId: this.modelId,
      techName:
        this.config.optimizationStrategy === "carbon-first"
          ? this.config.technologies.map((tech) => tech.name)
          : this.config.tech.name, // Handle carbon-first tech name(s)
      initialBudget: this.config.yearly_budgets.reduce((a, b) => a + b, 0), // total initial budget
      yearlyBudgets: this.config.yearly_budgets,
      totalBudgetSpent: totalAllocated,
      remainingBudget: remainingBudget, // remaining budget after last year
      projectDuration: numYears,
      yearlyStats: this.yearlyStats,
      intervenedBuildings: this.suitableBuildings.filter((b) => b.isIntervened),
      // untouchedBuildings: this.suitableBuildings.filter((b) => !b.isIntervened),
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
    };
  }

  // Helper method to stack results for visualisation
  static stackResults(modelRecaps) {
    const buildingMap = new Map();
    const yearlySummary = {};

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
          };
        }

        yearlySummary[year].budgetSpent += stats.budgetSpent;
        yearlySummary[year].buildingsIntervened += stats.buildingsIntervened;
        stats.intervenedBuildings.forEach((building) => {
          yearlySummary[year].intervenedBuildingIds.add(building.id);
        });
        if (stats.buildingsIntervened > 0) {
          yearlySummary[year].technologies.add(modelRecap.techName);
        }
        yearlySummary[year].totalCarbonSaved +=
          stats.intervenedBuildings.reduce(
            (sum, b) => sum + (b.carbonSaved || 0),
            0
          );
      });

      // process all buildings from the recap
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
            numInterventions: building.numInterventions,
          });
        }

        const target = buildingMap.get(building.id);

        // Process interventions if the building was intervened in this model
        if (building.isIntervened) {
          const intervention = {
            tech: modelRecap.techName,
            year: building.interventionYear,
            cost: building.interventionCost,
            carbonSaved: building.carbonSaved,
            interventionID: modelRecap.intervenetionId,
            interventionID: modelRecap.modelId,
          };

          target.isIntervened = true;
          target.totalCost += building.interventionCost;
          target.totalCarbonSaved += building.carbonSaved;
          target.interventionHistory.push(intervention);
          target.interventionYears.push(building.interventionYear);
          if (!target.interventionTechs.includes(modelRecap.techName)) {
            target.interventionTechs.push(modelRecap.techName);
          }
        }
      });
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
      summary,
      yearlySummary,
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
}
