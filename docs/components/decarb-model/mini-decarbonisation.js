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
  }
}

// Mini version of decarbonization model with additional features
export class MiniDecarbModel {
  constructor(modelConfig, buildings) {
    // Basic configuration
    this.modelId = modelConfig.id;
    this.initialYear = modelConfig.initial_year;
    this.rolledoverBudget = modelConfig.rolledover_budget; // from previous project
    this.yearlyBudgets = modelConfig.yearly_budgets; // Array of budgets per year
    this.numYears = this.yearlyBudgets.length;

    // Tech configuration - assuming single technology here
    this.tech = {
      name: modelConfig.tech.name,
      config: modelConfig.tech.config,
    };

    // Priority configurations
    this.priorities = modelConfig.priorities || []; // [{attribute: 'fuel_poverty', order: 'desc'}]

    // Tracking and model setup
    this.buildings = buildings.map((b) => new Building(b.id, b));
    this.suitableBuildings = []; // Filtered buildings
    this.remainingBudgets = [...this.yearlyBudgets];
    this.yearlyStats = {};

    this.appliedFilters = [];

    // Add optimization strategy
    this.optimizationStrategy =
      modelConfig.optimizationStrategy || "tech-first"; // or 'carbon-first'

    // For carbon-first optimization, we can include multiple technologies
    if (this.optimizationStrategy === "carbon-first") {
      this.availableTechs = modelConfig.technologies || [this.tech];
    }

    // Initialize the model
    this.filterSuitableBuildings();
    this.calculateBuildingScores();

    // Add cache for building costs
    this._buildingCosts = new Map(); // Cache for getBuildingCost
    // Track available buildings for intervention
    this._availableBuildings = null;
  }

  // Add a custom filter for buildings based on criteria
  addBuildingFilter(filterFn, filterName = "Custom filter") {
    this.suitableBuildings = this.suitableBuildings.filter(filterFn);
    this.appliedFilters.push(filterName);
  }

  // Filter suitable buildings early based on tech requirements
  filterSuitableBuildings() {
    this.suitableBuildings = this.buildings.filter(
      (b) => b.properties[this.tech.config.suitabilityKey]
    );
  }

  // Add a priority rule for sorting buildings
  addPriorityRule(attribute, order) {
    this.priorities.push({ attribute, order });
  }

  addPriorityRuleCustom(ruleConfig) {
    /* ruleConfig example:
    {
      attribute: 'multideprivation',
      scoreFunction: (value) => {
        // Custom scoring logic
        const scores = {
          'deprived': 1000,
          'not-deprived': 0
        };
        return scores[value] || 0;
      },
      weight: 1.0  // Optional weighting factor
    }
    */
    this.priorities.push(ruleConfig);
  }

  calculateBuildingScores() {
    // Calculate scores in a single pass
    const buildingCount = this.suitableBuildings.length;

    // Create an index for faster lookups
    const savingsIndex = new Map();
    this.suitableBuildings.forEach((building) => {
      savingsIndex.set(
        building,
        building.properties[this.tech.config.savingsKey]
      );
    });

    // Sort once using the index
    this.suitableBuildings.sort(
      (a, b) => savingsIndex.get(b) - savingsIndex.get(a)
    );

    // Apply scores and priorities in single pass
    this.suitableBuildings.forEach((building, index) => {
      // Base score from ranking
      let score = buildingCount - index;

      // Apply priority rules efficiently
      for (const rule of this.priorities) {
        const value = building.properties[rule.attribute];
        if (value !== undefined) {
          score += (rule.scoreFunction?.(value) ?? 0) * (rule.weight ?? 1.0);
        }
      }

      building.score = score;
    });
  }

  // test with memoization
  getBuildingCost(building, technology = this.tech) {
    const cacheKey = `${building.id}-${technology.name}`; // Create a unique key

    if (this._buildingCosts.has(cacheKey)) {
      return this._buildingCosts.get(cacheKey); // Return cached value
    }

    const labour = building.properties[technology.config.labourKey] || 0;
    const material = building.properties[technology.config.materialKey] || 0;
    const cost = labour + material;

    this._buildingCosts.set(cacheKey, cost); // Store in cache
    return cost;
  }

  // New method to calculate carbon savings per cost ratio
  calculateCarbonEfficiency(building, technology) {
    const cost = this.getBuildingCost(building, technology);
    const carbonSaved = building.properties[technology.config.savingsKey];
    return cost > 0 ? carbonSaved / cost : 0;
  }

  calculatePotentialInterventions() {
    // TEST: Calculate once and cache
    if (!this._potentialInterventions) {
      this._potentialInterventions = new Map();

      for (const building of this.suitableBuildings) {
        const buildingInterventions = [];

        for (const tech of this.availableTechs) {
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

  // Run the model year by year with budget rollover
  runModel() {
    if (this.optimizationStrategy === "carbon-first") {
      this.runCarbonFirstModel();
    } else {
      this.runTechFirstModel(); // existing implementation
    }
  }

  runCarbonFirstModel() {
    let remainingBudget = this.rolledoverBudget || 0;
    const interventions = this.calculatePotentialInterventions();

    // Create a priority queue for interventions, ordered by carbon efficiency (ascending)
    const pq = new PriorityQueue(
      (a, b) => a.carbonEfficiency - b.carbonEfficiency
    );

    // Add all available interventions to the priority queue
    // for (const buildingInterventions of interventions.values()) {
    //   for (const intervention of buildingInterventions) {
    //     if (!intervention.building.isIntervened) {
    //       pq.enqueue(intervention);
    //     }
    //   }
    // }
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

    for (let year = 0; year < this.numYears; year++) {
      const yearBudget = this.yearlyBudgets[year] + remainingBudget;
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

  updateYearlyStats(year, spent, buildings, remainingBudget) {
    this.yearlyStats[this.initialYear + year] = {
      budgetSpent: spent,
      buildingsIntervened: buildings.length,
      remainingBudget,
      intervenedBuildings: buildings,
    };
  }

  // Cache building costs for the current technology
  precalculateBuildingCosts() {
    if (this._buildingCosts.size === 0) {
      for (const building of this.suitableBuildings) {
        const cost = this.getBuildingCost(building);
        if (cost > 0) {
          this._buildingCosts.set(building.id, cost);
        }
      }
    }
    return this._buildingCosts;
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

  runTechFirstModel() {
    const buildingCosts = this.precalculateBuildingCosts();
    let remainingBudget = this.rolledoverBudget || 0;

    for (let year = 0; year < this.numYears; year++) {
      const yearBudget = this.yearlyBudgets[year] + remainingBudget;
      let spent = 0;
      const buildingsIntervened = [];

      const availableBuildings = this.getAvailableBuildings();

      for (const building of availableBuildings) {
        const cost = buildingCosts.get(building.id);

        if (spent + cost <= yearBudget) {
          this.applyIntervention(building, this.tech, cost, year);

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
      this.resetAvailableBuildings();
    }
  }

  processYearTechFirst(year, yearBudget, buildingCosts) {
    let spent = 0;
    const intervenedBuildings = [];

    // Get available buildings for this year
    const availableBuildings = this.getAvailableBuildings();

    // Process buildings until budget is exhausted
    for (const building of availableBuildings) {
      const cost = buildingCosts.get(building.id);

      // Skip if cost exceeds remaining budget
      if (spent + cost > yearBudget) continue;

      // Apply intervention
      this.applyIntervention(building, {
        year: this.initialYear + year,
        cost: cost,
        techName: this.tech.name,
        carbonSaved: building.properties[this.tech.config.savingsKey],
      });

      spent += cost;
      intervenedBuildings.push(building);
    }

    // Reset available buildings cache as interventions have been made
    this.resetAvailableBuildings();

    // Return year statistics
    return {
      budgetSpent: spent,
      buildingsIntervened: intervenedBuildings.length,
      remainingBudget: yearBudget - spent,
      intervenedBuildings,
    };
  }

  applyIntervention(building, tech, cost, year) {
    building.isIntervened = true;
    building.interventionTechs = tech.name;
    building.interventionYear = this.initialYear + year;
    building.interventionCost = cost;
    building.carbonSaved = building.properties[tech.config.savingsKey];
  }

  // Recap of model configuration, yearly allocation, and total allocation check
  getRecap() {
    const totalAllocated = Object.values(this.yearlyStats).reduce(
      (sum, year) => sum + year.budgetSpent,
      0
    );

    // Get remaining budget from final year
    const finalYear = Math.max(...Object.keys(this.yearlyStats).map(Number));
    const remainingBudget = this.yearlyStats[finalYear].remainingBudget;

    return {
      interventionId: this.modelId,
      techName: this.tech.name,
      initialBudget: this.yearlyBudgets.reduce((a, b) => a + b, 0),
      yearlyBudgets: this.yearlyBudgets,
      totalBudgetSpent: totalAllocated,
      remainingBudget: remainingBudget,
      yearlyStats: this.yearlyStats,
      intervenedBuildings: this.suitableBuildings.filter((b) => b.isIntervened),
      untouchedBuildings: this.suitableBuildings.filter((b) => !b.isIntervened),
      allBuildings: this.suitableBuildings,
      appliedFilters: this.appliedFilters,
      priorityRules: this.priorities.map((rule) => ({
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
        stats.intervenedBuildings.forEach(building => {
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
      yearData.intervenedBuildingIds = Array.from(yearData.intervenedBuildingIds);
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
