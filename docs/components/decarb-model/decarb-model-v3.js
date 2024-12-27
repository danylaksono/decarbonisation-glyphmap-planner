class Building {
    constructor(id, properties) {
      this.id = id;
      this.properties = properties;
      this.interventions = new Map(); // year -> intervention[]
      this.cumulativeStats = {
        cost: 0,
        carbonSaved: 0
      };
    }

    addIntervention(year, intervention) {
      if (!this.interventions.has(year)) {
        this.interventions.set(year, []);
      }
      this.interventions.get(year).push(intervention);
      this.updateStats(intervention);
    }

    updateStats(intervention) {
      this.cumulativeStats.cost += intervention.cost;
      this.cumulativeStats.carbonSaved += intervention.carbonSaved;
    }
  }

  class InterventionManager {
    constructor(config) {
      this.yearlyBudgets = new Map();
      this.technologies = new Map();
      this.initialize(config);
    }

    initialize(config) {
      config.budgets.forEach(({year, amount}) => {
        this.yearlyBudgets.set(year, {
          total: amount,
          remaining: amount
        });
      });

      config.technologies.forEach(tech => {
        this.technologies.set(tech.id, tech);
      });
    }

    canApply(building, tech, year) {
      const budget = this.yearlyBudgets.get(year);
      const cost = this.calculateCost(building, tech);
      return budget.remaining >= cost;
    }
  }

  class DecarbModelV3 {
    constructor(config) {
      this.buildings = new Map();
      this.interventionManager = new InterventionManager(config);
      this.yearlyStats = new Map();
    }

    processInterventions(interventions) {
      interventions.forEach(intervention => {
        const {year, techId, buildingIds} = intervention;

        buildingIds.forEach(id => {
          const building = this.buildings.get(id);
          if (this.interventionManager.canApply(building, techId, year)) {
            this.applyIntervention(building, techId, year);
          }
        });
      });
    }

    getResults() {
      return {
        buildings: Array.from(this.buildings.values()),
        yearlyStats: this.convertYearlyStats(),
        summary: this.generateSummary()
      };
    }
  }