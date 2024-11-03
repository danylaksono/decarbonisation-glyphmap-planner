// ========== Building class to represent each building ==========
class Building {
  constructor(id, properties) {
    this.id = id;
    this.properties = properties; // Object holding building properties like area, age, suitability, costs, etc.
    this.interventionStatus = false;
    this.interventions = []; // Track interventions per year
  }

  addIntervention(year, technology, cost, carbonSaved) {
    this.interventionStatus = true;
    this.interventions.push({ year, technology, cost, carbonSaved });
  }

  getYearInterventions(year) {
    return this.interventions.filter(
      (intervention) => intervention.year === year
    );
  }
}

// ========== Intervention Strategy for each technology ==========
class Intervention {
  constructor({ name, allocation, config }) {
    this.name = name;
    this.allocation = Number(allocation) || 0; // Ensure numeric value
    this.config = config;

    if (this.allocation < 0 || this.allocation > 1) {
        console.warn(`Invalid allocation ${this.allocation} for ${this.name}`);
    }
  }

  isSuitable(building) {
    return !!building.properties[this.config.suitabilityKey]; // Adjusts for boolean suitability
  }

  getCost(building) {
    // Calculate total cost using labour and material keys
    const labourCost = building.properties[this.config.labourKey] || 0;
    const materialCost = building.properties[this.config.materialKey] || 0;
    return labourCost + materialCost;
  }

  getCarbonSavings(building) {
    return building.properties[this.config.savingsKey] || 0;
  }
}

// Main Decarbonisation Model
export class DecarbonisationModel {
  constructor(modelSpec, buildings) {
    this.initialYear = modelSpec.initial_year;
    this.targetYears = modelSpec.target_years;
    this.uncappedMode = modelSpec.uncapped_mode || false;
    this.overallBudget = modelSpec.overall_budget;
    this.remainingBudget = modelSpec.overall_budget;
    this.technologies = modelSpec.technologies.map(tech => new Intervention(tech));
    this.buildings = buildings.map(b => new Building(b.id, b));

    // Initialize tracking variables
    this.carbonSaved = 0;
    this.totalSpent = 0;
    this.yearlyBudget = this.overallBudget / this.targetYears;
    this.yearlyCarbonSaved = {};

    // Initialize yearlyCarbonSaved for all years
    for (let year = this.initialYear; year < this.initialYear + this.targetYears; year++) {
        this.yearlyCarbonSaved[year] = 0;
    }

    // Add validation for uncapped mode
    if (this.uncappedMode) {
        console.log('Running in uncapped mode - no budget constraints');
        this.remainingBudget = Infinity;
        this.yearlyBudget = Infinity;
    }
  }

  runModel() {
    for (
      let year = this.initialYear;
      year < this.initialYear + this.targetYears;
      year++
    ) {
      this.processYear(year);
    }
  }

  processYear(year) {
    console.log(`Processing year ${year}`);
    this.yearlyCarbonSaved[year] = 0;

    if (this.uncappedMode) {
        this.processUncappedYear(year);
    } else {
        if (this.remainingBudget > 0) {
            this.processBudgetConstrainedYear(year);
        }
    }
  }

  processUncappedYear(year) {
    console.log(`Processing uncapped year ${year}`);

    for (const tech of this.technologies) {
        // Find all suitable buildings that haven't been treated
        const suitableBuildings = this.buildings
            .filter(b => !b.interventionStatus && tech.isSuitable(b))
            .sort((a, b) =>
                tech.config.scoreFn(b.properties) -
                tech.config.scoreFn(a.properties)
            );

        for (const building of suitableBuildings) {
            const cost = tech.getCost(building);
            const carbonSaved = tech.getCarbonSavings(building);

            // In uncapped mode, we implement all possible interventions
            building.addIntervention(year, tech.name, cost, carbonSaved);
            this.totalSpent += cost;
            this.yearlyCarbonSaved[year] += carbonSaved;
            this.carbonSaved += carbonSaved;
        }
    }

    console.log(`Year ${year} uncapped results:`, {
        carbonSaved: this.yearlyCarbonSaved[year],
        totalSpent: this.totalSpent
    });
  }

  processBudgetConstrainedYear(year) {
    let yearlyBudget = this.yearlyBudget;

    console.log(`Processing year ${year}`);
    console.log(`Remaining budget: ${this.remainingBudget}`);

    for (const tech of this.technologies) {
        const techBudget = yearlyBudget * tech.allocation;
        console.log(`Budget for ${tech.name}: ${techBudget}`);
        let techSpent = 0;

        // Filter and prioritize buildings based on suitability and score function
        const suitableBuildings = this.buildings
          .filter((b) => !b.interventionStatus && tech.isSuitable(b))
          .sort(
            (a, b) =>
              tech.config.scoreFn(b.properties) -
              tech.config.scoreFn(a.properties)
          );

        for (const building of suitableBuildings) {
          const cost = tech.getCost(building);
          const carbonSaved = tech.getCarbonSavings(building);

          // Check if we can afford this intervention for the building
          if (techSpent + cost <= techBudget && this.remainingBudget >= cost) {
            building.addIntervention(year, tech.name, cost, carbonSaved);
            techSpent += cost;
            this.remainingBudget -= cost;
            this.totalSpent += cost; // Add this line
            this.yearlyCarbonSaved[year] += carbonSaved;
            this.carbonSaved += carbonSaved;
          } else {
            break; // Stop if we exceed budget for this technology
          }
        }
    }
  }

  getGroupedInterventions() {
    const groupedInterventions = {};

    // Iterate through each building
    this.buildings.forEach((building) => {
      building.interventions.forEach((intervention) => {
        const { year, technology, cost, carbonSaved } = intervention;

        // Initialize year and technology entries if they don't exist
        if (!groupedInterventions[year]) {
          groupedInterventions[year] = {};
        }
        if (!groupedInterventions[year][technology]) {
          groupedInterventions[year][technology] = [];
        }

        // Add intervention data
        groupedInterventions[year][technology].push({
          buildingId: building.id,
          cost,
          carbonSaved,
        });
      });
    });

    return groupedInterventions;
  }

  getYearInterventions(year) {
    return this.buildings
      .map((b) => ({ id: b.id, interventions: b.getYearInterventions(year) }))
      .filter((b) => b.interventions.length > 0);
  }

  getFinalStats() {
    // Calculate total spent from tracked value instead
    const totalSpent = this.totalSpent;

    // Get yearly stats by technology
    const yearlyStats = {};
    const yearRange = Array.from(
      { length: this.targetYears },
      (_, i) => this.initialYear + i
    );

    for (const year of yearRange) {
      const interventions = this.getYearInterventions(year);
      const techStats = {};

      // Initialize counters for each technology
      this.technologies.forEach((tech) => {
        techStats[tech.name] = {
          buildingCount: 0,
          spent: 0,
          carbonSaved: 0,
        };
      });

      // Count interventions by technology
      interventions.forEach((building) => {
        building.interventions.forEach((intervention) => {
          techStats[intervention.technology].buildingCount++;
          techStats[intervention.technology].spent += intervention.cost;
          techStats[intervention.technology].carbonSaved +=
            intervention.carbonSaved;
        });
      });

      yearlyStats[year] = {
        technologies: techStats,
        totalBuildingsIntervened: interventions.length,
        yearlyBudgetSpent: Object.values(techStats).reduce(
          (acc, curr) => acc + curr.spent,
          0
        ),
        yearlyCarbonSaved: this.yearlyCarbonSaved[year],
      };
    }

    return {
      totalCarbonSaved: this.carbonSaved,
      initialBudget: this.overallBudget,
      remainingBudget: this.remainingBudget,
      totalBudgetSpent: totalSpent,
      budgetUtilization:
        ((totalSpent / this.overallBudget) * 100).toFixed(2) + "%",
      yearlyStats: yearlyStats,
      mode: this.uncappedMode ? "Uncapped" : "Budget-constrained",
    };
  }
}
