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
    this._buildingCosts = new Map();
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

  // calculateBuildingScores() {
  //   // Rank buildings based on carbon savings potential
  //   const rankedBuildings = [...this.suitableBuildings].sort((a, b) => {
  //     return (
  //       b.properties[this.tech.config.savingsKey] -
  //       a.properties[this.tech.config.savingsKey]
  //     );
  //   });

  //   // Assign initial score based on suitability 4cvranking
  //   rankedBuildings.forEach((building, index) => {
  //     building.score = rankedBuildings.length - index;
  //   });

  //   // Apply custom priority rules
  //   this.suitableBuildings.forEach((building) => {
  //     this.priorities.forEach((rule) => {
  //       const value = building.properties[rule.attribute];
  //       if (value !== undefined) {
  //         const priorityScore = rule.scoreFunction(value);
  //         const weight = rule.weight || 1.0;
  //         building.score += priorityScore * weight;
  //       }
  //     });
  //   });

  //   // Sort by final score in descending order
  //   this.suitableBuildings.sort((a, b) => b.score - a.score);
  // }

    calculateBuildingScores() {
      // Calculate scores in a single pass
      const buildingCount = this.suitableBuildings.length;

      // Create an index for faster lookups
      const savingsIndex = new Map();
      this.suitableBuildings.forEach((building) => {
        savingsIndex.set(building, building.properties[this.tech.config.savingsKey]);
      });

      // Sort once using the index
      this.suitableBuildings.sort((a, b) =>
        savingsIndex.get(b) - savingsIndex.get(a)
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


  // Get intervention cost for a building
  getBuildingCost(building, technology = this.tech) {
    const labour = building.properties[technology.config.labourKey] || 0;
    const material = building.properties[technology.config.materialKey] || 0;
    return labour + material;
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
            const carbonEfficiency = this.calculateCarbonEfficiency(building, tech);

            buildingInterventions.push({
              building,
              tech,
              carbonEfficiency,
              cost
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

    for (let year = 0; year < this.numYears; year++) {
      const yearBudget = this.yearlyBudgets[year] + remainingBudget;
      let spent = 0;
      const buildingsIntervened = [];

      const availableInterventions = Array.from(interventions.values())
        .flat()
        .filter(({ building }) => !building.isIntervened)
        .sort((a, b) => b.carbonEfficiency - a.carbonEfficiency);

      for (const intervention of availableInterventions) {
        if (spent + intervention.cost <= yearBudget) {
          const { building, tech, cost } = intervention;

          this.applyIntervention(building, tech, cost, year);

          spent += cost;
          buildingsIntervened.push(building);
        }
      }

      this.updateYearlyStats(year, spent, buildingsIntervened, yearBudget - spent);
      remainingBudget = yearBudget - spent;
    }
  }

  updateYearlyStats(year, spent, buildings, remainingBudget) {
    this.yearlyStats[this.initialYear + year] = {
      budgetSpent: spent,
      buildingsIntervened: buildings.length,
      remainingBudget,
      intervenedBuildings: buildings
    };
  }


  // runTechFirstModel() {
  //   let remainingBudget = this.rolledoverBudget || 0; // Rollover budget from previous projects

  //   for (let year = 0; year < this.numYears; year++) {
  //     const yearBudget = this.yearlyBudgets[year] + remainingBudget;
  //     let spent = 0;
  //     let buildingsIntervened = 0;
  //     let intervenedBuildings = [];

  //     for (const building of this.suitableBuildings) {
  //       if (building.isIntervened) continue;

  //       const cost = this.getBuildingCost(building);
  //       if (spent + cost <= yearBudget) {
  //         building.isIntervened = true;
  //         building.interventionTechs = this.tech.name;
  //         building.interventionYear = this.initialYear + year;
  //         building.interventionCost = cost;
  //         building.carbonSaved =
  //           building.properties[this.tech.config.savingsKey];

  //         spent += cost;
  //         buildingsIntervened++;
  //         intervenedBuildings.push(building);
  //       }
  //     }

  //     // Track stats and rollover remaining budget
  //     remainingBudget = yearBudget - spent;
  //     this.yearlyStats[this.initialYear + year] = {
  //       budgetSpent: spent,
  //       buildingsIntervened, // Number of buildings intervened in this year
  //       remainingBudget: remainingBudget, //year === this.numYears - 1 ? remainingBudget : 0,
  //       intervenedBuildings: intervenedBuildings,
  //     };
  //   }
  // }


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
        .filter(b => !b.isIntervened)
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

      this.updateYearlyStats(year, spent, buildingsIntervened, yearBudget - spent);
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
        carbonSaved: building.properties[this.tech.config.savingsKey]
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
      intervenedBuildings
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
}


