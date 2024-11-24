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

    // Initialize the model
    this.filterSuitableBuildings();
    this.calculateBuildingScores();
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
    // Rank buildings based on carbon savings potential
    const rankedBuildings = [...this.suitableBuildings].sort((a, b) => {
      return (
        b.properties[this.tech.config.savingsKey] -
        a.properties[this.tech.config.savingsKey]
      );
    });

    // Assign initial score based on suitability 4cvranking
    rankedBuildings.forEach((building, index) => {
      building.score = rankedBuildings.length - index;
    });

    // Apply custom priority rules
    this.suitableBuildings.forEach((building) => {
      this.priorities.forEach((rule) => {
        const value = building.properties[rule.attribute];
        if (value !== undefined) {
          const priorityScore = rule.scoreFunction(value);
          const weight = rule.weight || 1.0;
          building.score += priorityScore * weight;
        }
      });
    });

    // Sort by final score in descending order
    this.suitableBuildings.sort((a, b) => b.score - a.score);
  }

  // Calculate score based on carbon savings and priorities
  //   calculateBuildingScores() {
  //     // Rank buildings based on carbon savings potential
  //     const rankedBuildings = [...this.suitableBuildings].sort((a, b) => {
  //       return (
  //         b.properties[this.tech.config.savingsKey] -
  //         a.properties[this.tech.config.savingsKey]
  //       );
  //     });

  //     // Assign initial score based on ranking
  //     rankedBuildings.forEach((building, index) => {
  //       building.score = rankedBuildings.length - index; // Higher rank gets higher score
  //     });

  //     // Apply priority adjustments
  //     this.suitableBuildings.forEach((building) => {
  //       this.priorities.forEach((priority) => {
  //         const value = building.properties[priority.attribute] || 0;
  //         building.score += value * (priority.order === "desc" ? 1 : -1);
  //       });
  //     });

  //     // Sort by final score in descending order
  //     this.suitableBuildings.sort((a, b) => b.score - a.score);
  //   }

  // Get intervention cost for a building
  getBuildingCost(building) {
    const labour = building.properties[this.tech.config.labourKey] || 0;
    const material = building.properties[this.tech.config.materialKey] || 0;
    return labour + material;
  }

  // Run the model year by year with budget rollover
  runModel() {
    // let remainingBudget = 0;
    let remainingBudget = this.rolledoverBudget || 0; // Rollover budget from previous projects

    for (let year = 0; year < this.numYears; year++) {
      const yearBudget = this.yearlyBudgets[year] + remainingBudget;
      let spent = 0;
      let buildingsIntervened = 0;
      let intervenedBuildings = [];

      for (const building of this.suitableBuildings) {
        if (building.isIntervened) continue;

        const cost = this.getBuildingCost(building);
        if (spent + cost <= yearBudget) {
          building.isIntervened = true;
          building.interventionTechs = this.tech.name;
          building.interventionYear = this.initialYear + year;
          building.interventionCost = cost;
          building.carbonSaved =
            building.properties[this.tech.config.savingsKey];

          spent += cost;
          buildingsIntervened++;
          intervenedBuildings.push(building);
        }
      }

      // Track stats and rollover remaining budget
      remainingBudget = yearBudget - spent;
      this.yearlyStats[this.initialYear + year] = {
        budgetSpent: spent,
        buildingsIntervened, // Number of buildings intervened in this year
        remainingBudget: remainingBudget, //year === this.numYears - 1 ? remainingBudget : 0,
        intervenedBuildings: intervenedBuildings,
      };
    }
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
      // initialBudget: d3.sum(this.yearlyBudgets),
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

  // stack results from getRecap() method
  stackResults(results) {
    const buildingMap = new Map();

    // Initialize with ALL buildings from first result
    results[0].allBuildings.forEach((building) => {
      buildingMap.set(building.id, {
        ...building,
        isIntervened: false,
        totalCost: 0,
        totalCarbonSaved: 0,
        interventionHistory: [],
        interventionYears: [],
        interventionTechs: [],
      });
    });

    // Process interventions
    results.forEach((result) => {
      result.intervenedBuildings.forEach((building) => {
        const existing = buildingMap.get(building.id);
        const intervention = {
          tech: result.techName,
          year: building.interventionYear,
          cost: building.interventionCost,
          carbonSaved: building.carbonSaved,
          interventionID: result.interventionID,
        };

        existing.isIntervened = true;
        existing.totalCost += building.interventionCost;
        existing.totalCarbonSaved += building.carbonSaved;
        existing.interventionHistory.push(intervention);
        existing.interventionYears.push(building.interventionYear);
        if (!existing.interventionTechs.includes(result.techName)) {
          existing.interventionTechs.push(result.techName);
        }
      });
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
      intervenedBuildings: buildings.filter((b) => b.isIntervened),
      untouchedBuildings: buildings.filter((b) => !b.isIntervened),
    };
  }
}
