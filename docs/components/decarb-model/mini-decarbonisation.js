import { PriorityQueue } from "./priority-queue.js";

// Building class - minimal structure to track interventions
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

export class InterventionManager {
  constructor(buildings, listOfTech) {
    this.buildings = buildings;
    this.listOfTech = listOfTech;
    this.interventionConfigs = [];
    this.results = [];
    this.currentRolloverBudget = 0;
    this.currentOrder = []; // Store order as an array of indices
    this.autoRun = true; // Flag to control automatic re-running
  }

  addIntervention(config) {
    this.interventionConfigs.push(config);
    this.currentOrder.push(this.interventionConfigs.length - 1); // Add new index to order
    console.log("Intervention added:", config.id);
    if (this.autoRun) {
      this.runInterventions();
    }
    return this; // Allow method chaining
  }

  removeIntervention(index) {
    if (index >= 0 && index < this.interventionConfigs.length) {
      this.interventionConfigs.splice(index, 1);
      // Remove the corresponding index from currentOrder
      const orderIndex = this.currentOrder.indexOf(index);
      if (orderIndex > -1) {
        this.currentOrder.splice(orderIndex, 1);
      }
      // Adjust indices in currentOrder after removal
      this.currentOrder = this.currentOrder.map((idx) =>
        idx > index ? idx - 1 : idx
      );
      console.log(`Intervention at index ${index} removed.`);
      if (this.autoRun) {
        this.runInterventions();
      }
    } else {
      console.error(`Error: Invalid index ${index} for removal.`);
    }
    return this;
  }

  clearInterventions() {
    this.interventionConfigs = [];
    this.currentOrder = [];
    this.results = [];
    this.currentRolloverBudget = 0;
    console.log("All interventions cleared.");
    if (this.autoRun) {
      this.runInterventions();
    }
    return this;
  }

  // Updated to handle order dynamically
  setInterventionOrder(newOrder) {
    if (!this.isValidOrder(newOrder)) {
      console.error(
        "Error: Invalid intervention order. Check for duplicates or out-of-range indices."
      );
      return;
    }

    if (newOrder.length !== this.interventionConfigs.length) {
      console.error(
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

    console.log("New intervention order set:", this.currentOrder);

    if (this.autoRun) {
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

  runInterventions() {
    this.results = []; // Clear previous results
    this.currentRolloverBudget = 0; // Reset rollover budget

    // Use the interventionConfigs array directly, which will be in the correct order
    for (const config of this.interventionConfigs) {
      const model = new MiniDecarbModel(this.buildings, config.id);

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
            console.error(
              `Error: Technology "${techName}" not found in listOfTech.`
            );
          }
        });
      } else if (config.tech) {
        if (this.listOfTech[config.tech]) {
          model.addTechnology(this.listOfTech[config.tech]);
        } else {
          console.error(
            `Error: Technology "${config.tech}" not found in listOfTech.`
          );
        }
      }

      // Add priorities
      if (config.priorities) {
        config.priorities.forEach((priority) => {
          model.addPriorityToConfig(
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

    console.log("Interventions run. Results:", this.results);
    return this.results;
  }

  getStackedResults() {
    return MiniDecarbModel.stackResults(this.results);
  }

  setAutoRun(autoRun) {
    this.autoRun = autoRun;
    return this; // Allow method chaining
  }

  logCurrentState() {
    console.log("Current Intervention Order:", this.currentOrder);
    console.log("Intervention Configurations:", this.interventionConfigs);
    console.log("Current Rollover Budget:", this.currentRolloverBudget);
    console.log("Results:", this.results);
  }
}

export class MiniDecarbModel {
  constructor(buildings) {
    // Initialize with default config
    this.config = {
      initial_year: 0,
      rolledover_budget: 0,
      yearly_budgets: [],
      tech: {},
      priorities: [],
      optimizationStrategy: "tech-first",
      technologies: [],
    };

    this.buildings = buildings.map((b) => new Building(b.id, b));
    this.suitableBuildings = [];
    this.yearlyStats = {};
    this.appliedFilters = [];
    this._buildingCosts = new Map();
    this._availableBuildings = null;
    this._potentialInterventions = null;
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
    console.log("Adding technology", techConfig);
    if (this.config.optimizationStrategy === "carbon-first") {
      this.config.technologies.push(techConfig);
    } else {
      this.config.tech = techConfig;
    }
    this.filterSuitableBuildings();
    this.calculateBuildingScores();
  }

  // Filter suitable buildings early based on tech requirements
  filterSuitableBuildings() {
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
    // console.log("Suitable buildings", this.suitableBuildings);
  }

  addAvailableTechnology(techConfig) {
    this.config.technologies.push(techConfig);
  }

  // Add a custom filter for buildings based on criteria
  addBuildingFilter(filterFn, filterName = "Custom filter") {
    this.suitableBuildings = this.suitableBuildings.filter(filterFn);
    this.appliedFilters.push(filterName);
  }

  // Add a priority to the configuration, not directly to the model
  addPriority(attribute, order = "asc", scoreFunction = null, weight = 1.0) {
    this.config.priorities.push({ attribute, order, scoreFunction, weight });
  }

  // Get available buildings sorted by score and filtered by intervention status
  getAvailableBuildings() {
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
    // console.log(
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
    // console.log("getBuildingCost - Building ID:", building.id, "Tech:", technology?.name, "Cost:", cost, "Cache Key:", cacheKey);

    // Store the calculated cost in the cache
    this._buildingCosts.set(cacheKey, cost);
    return cost;
  }

  calculateBuildingScores() {
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
  calculateCarbonEfficiency(building, technology) {
    // Carbon-first: tech is passed as argument
    if (this.config.optimizationStrategy === "carbon-first") {
      const cost = this.getBuildingCost(building, technology);
      const carbonSaved = building.properties[technology.config.savingsKey];
      return cost > 0 ? carbonSaved / cost : 0;
    } else {
      const cost = this.getBuildingCost(building);
      const carbonSaved =
        building.properties[this.config.tech.config.savingsKey];
      return cost > 0 ? carbonSaved / cost : 0;
    }
  }

  calculatePotentialInterventions() {
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
      }
    }

    return this._potentialInterventions;
  }

  runCarbonFirstModel() {
    let remainingBudget = this.config.rolledover_budget || 0;
    const interventions = this.calculatePotentialInterventions();

    // Create a priority queue for interventions, ordered by carbon efficiency (ascending)
    const pq = new PriorityQueue(
      (a, b) => a.carbonEfficiency - b.carbonEfficiency
    );

    // Add all available interventions to the priority queue
    const allInterventions = [];
    for (const buildingInterventions of interventions.values()) {
      for (const intervention of buildingInterventions) {
        if (!intervention.building.isIntervened) {
          allInterventions.push(intervention);
        }
      }
    }

    // Set the heap to all interventions and then heapify:
    pq._heap = allInterventions;
    pq._heapify();

    for (let year = 0; year < this.config.numYears; year++) {
      const yearBudget = this.config.yearly_budgets[year] + remainingBudget;
      let spent = 0;
      const buildingsIntervened = [];

      while (pq.size() > 0 && spent + pq.peek().cost <= yearBudget) {
        const intervention = pq.dequeue();
        const { building, tech, cost } = intervention;

        // Check again if the building has been intervened in the meantime (might happen in multi-year scenarios)
        if (!building.isIntervened) {
          this.applyIntervention(building, tech, cost, year);

          spent += cost;
          buildingsIntervened.push(building);
        }
      }

      this.updateYearlyStats(
        year,
        spent,
        buildingsIntervened,
        yearBudget - spent
      );
      remainingBudget = yearBudget - spent;

      // After each year, re-enqueue any interventions for non-intervened buildings
      // (in case budget changes or new buildings become available)
      pq._heap = []; // Clear the existing heap
      for (const buildingInterventions of interventions.values()) {
        for (const intervention of buildingInterventions) {
          if (!intervention.building.isIntervened) {
            pq.enqueue(intervention);
          }
        }
      }
    }
  }

  runTechFirstModel() {
    // Calculate and cache building costs
    this.precalculateBuildingCosts();

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
        // console.log(
        //   "Building ID:",
        //   building.id,
        //   "Tech:",
        //   this.config.tech.name,
        //   "Cost:",
        //   cost
        // );

        if (cost === undefined) {
          console.warn(
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
    // Set tech to the first technology if optimization strategy is not carbon-first and only one technology is available
    if (
      this.config.optimizationStrategy !== "carbon-first" &&
      this.config.technologies.length > 0
    ) {
      this.config.tech = this.config.technologies[0];
    }

    // Initialize the model
    this.filterSuitableBuildings();
    this.calculateBuildingScores();

    if (this.config.optimizationStrategy === "carbon-first") {
      this.runCarbonFirstModel();
    } else {
      this.runTechFirstModel();
    }

    return this.getRecap();
  }

  // Recap of model configuration, yearly allocation, and total allocation check
  getRecap() {
    const totalAllocated = Object.values(this.yearlyStats).reduce(
      (sum, year) => sum + year.budgetSpent,
      0
    );

    // Calculate remaining budget correctly
    let remainingBudget = 0;
    const numYears = Object.keys(this.yearlyStats).length;
    if (numYears > 0) {
      const lastYear = Math.max(...Object.keys(this.yearlyStats).map(Number));
      remainingBudget = this.yearlyStats[lastYear].remainingBudget;
    }

    return {
      interventionId: Date.now(), //this.modelId,
      techName:
        this.config.optimizationStrategy === "carbon-first"
          ? this.config.technologies.map((tech) => tech.name)
          : this.config.tech.name, // Handle carbon-first tech name(s)
      initialBudget: this.config.yearly_budgets.reduce((a, b) => a + b, 0),
      yearlyBudgets: this.config.yearly_budgets,
      totalBudgetSpent: totalAllocated,
      remainingBudget: remainingBudget,
      yearlyStats: this.yearlyStats,
      intervenedBuildings: this.suitableBuildings.filter((b) => b.isIntervened),
      untouchedBuildings: this.suitableBuildings.filter((b) => !b.isIntervened),
      allBuildings: this.suitableBuildings,
      appliedFilters: this.appliedFilters,
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
        // yearlySummary[year].technologies.add(modelRecap.techName);
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
            // ...building.properties,
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
            tech: modelRecap.techName, // Get techName from recap
            year: building.interventionYear,
            cost: building.interventionCost,
            carbonSaved: building.carbonSaved,
            interventionID: modelRecap.interventionId, // Get interventionId from recap
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

    return {
      buildings,
      summary,
      yearlySummary,
      intervenedBuildings: buildings.filter((b) => b.isIntervened),
      untouchedBuildings: buildings.filter((b) => !b.isIntervened),
    };
  }
}
