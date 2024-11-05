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

  getInterventions() {
    return this.interventions;
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
    // this.priorityRules = modelSpec.priorityRules || []; // [{attribute: 'deprivation_index', order: 'desc'}, ...]
    // Validate and set priority rules
    this.priorityRules = this.validatePriorityRules(modelSpec.priorityRules);

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

  addBuildingFilter(filterFn) {
    this.buildingFilters = this.buildingFilters || [];
    this.buildingFilters.push(filterFn);
  }

  getFilteredBuildings() {
    if (!this.buildings) {
      console.error('No buildings available');
      return [];
    }
    let filtered = this.buildings;
    if (this.buildingFilters) {
        for (const filter of this.buildingFilters) {
            filtered = filtered.filter(filter);
        }
        console.log(`Filtered from ${this.buildings.length} to ${filtered.length} buildings`);
    }
    return filtered;
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
        // Find suitable buildings
        // const suitableBuildings = this.buildings
        const suitableBuildings = this.getFilteredBuildings()
            .filter(b => !b.interventionStatus && tech.isSuitable(b));

        // Apply prioritization
        const prioritizedBuildings = this.applyPriorityRules(suitableBuildings, tech);

        for (const building of prioritizedBuildings) {
            const cost = tech.getCost(building);
            const carbonSaved = tech.getCarbonSavings(building);

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
        // const suitableBuildings = this.buildings
        const suitableBuildings = this.getFilteredBuildings()
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
            this.totalSpent += cost; // Track total spent
            this.yearlyCarbonSaved[year] += carbonSaved;
            this.carbonSaved += carbonSaved;
          } else {
            break; // Stop if we exceed budget for this technology
          }
        }
    }
  }

  validatePriorityRules(rules) {
    if (!rules) return [];

    return rules.map(rule => {
        // Validate rule structure
        if (!rule.attribute || !rule.order) {
            console.warn('Invalid priority rule structure:', rule);
            return null;
        }

        // Validate attributes exist in buildings
        const attributeExists = this.buildings.some(b =>
            rule.attribute in b.properties
        );
        if (!attributeExists) {
            console.warn(`Priority rule attribute '${rule.attribute}' not found in buildings`);
            return null;
        }

        // Validate order
        if (rule.order !== 'asc' && rule.order !== 'desc') {
            console.warn(`Invalid order '${rule.order}' in priority rule. Using 'desc'`);
            rule.order = 'desc';
        }

        return rule;
    }).filter(rule => rule !== null);
  }

  applyPriorityRules(buildings, tech) {
    if (!this.priorityRules || this.priorityRules.length === 0) {
        // If no priority rules, just use technology scoring
        return buildings.sort((a, b) =>
            tech.config.scoreFn(b.properties) -
            tech.config.scoreFn(a.properties)
        );
    }

    return buildings.sort((a, b) => {
        // First apply priority rules
        for (const rule of this.priorityRules) {
            const aValue = a.properties[rule.attribute];
            const bValue = b.properties[rule.attribute];

            if (aValue !== bValue) {
                return rule.order === 'desc' ?
                    (bValue - aValue) :
                    (aValue - bValue);
            }
        }

        // If buildings are equal on all priority rules, use tech scoring
        return tech.config.scoreFn(b.properties) -
               tech.config.scoreFn(a.properties);
    });
  }

  addPriorityRule(attribute, order = 'desc') {
    const newRule = { attribute, order };
    const validatedRule = this.validatePriorityRules([newRule])[0];
    if (validatedRule) {
        this.priorityRules.push(validatedRule);
        return true;
    }
    return false;
  }

  getGroupedInterventions() {
    const groupedInterventions = {};
    const filteredBuildings = this.getFilteredBuildings();

    if (!filteredBuildings || filteredBuildings.length === 0) {
      console.warn('No buildings match the current filters');
      return groupedInterventions;
    }

    // Iterate through each building
    // this.buildings.forEach((building) => {
    filteredBuildings.forEach((building) => {
      if (!building.getInterventions) {
        console.error('Invalid building object:', building);
        return;
      }
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
    // Use filtered buildings instead of all buildings
    return this.getFilteredBuildings()
        .map((b) => ({
            id: b.id,
            interventions: b.getYearInterventions(year)
        }))
        .filter((b) => b.interventions.length > 0);
  }

  getFinalStats() {
    // Get filtered buildings
    const filteredBuildings = this.getFilteredBuildings();

    // Calculate total spent from filtered buildings
    const totalSpent = filteredBuildings.reduce((total, b) =>
        total + b.getInterventions().reduce((sum, i) => sum + i.cost, 0), 0);

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

        // Calculate stats using filtered interventions
        interventions.forEach(building => {
            building.interventions.forEach(intervention => {
                const stats = techStats[intervention.technology];
                stats.buildingCount++;
                stats.spent += intervention.cost;
                stats.carbonSaved += intervention.carbonSaved;
            });
        });

        yearlyStats[year] = techStats;
    }

    // Return complete stats
    return {
        initialBudget: this.overallBudget,
        totalCarbonSaved: this.carbonSaved,
        totalBudgetSpent: totalSpent,
        remainingBudget: this.remainingBudget,
        yearlyStats,
        filters: this.buildingFilters ? {
            totalBuildings: this.buildings.length,
            filteredBuildings: filteredBuildings.length,
            numberOfFilters: this.buildingFilters.length
        } : null,
        priorityRules: this.priorityRules || null
    };
  }
}
