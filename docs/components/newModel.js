import * as d3 from "npm:d3";

export class Model {
  constructor(buildings, modelSpec) {
    this.buildings = buildings;
    this.nr_years = modelSpec.nr_years || 10;
    this.yearly_funding = modelSpec.yearly_funding || 300_000_000;
    this.tech_allocation = modelSpec.tech_allocation || { ASHP: 0.5, PV: 0.5 };
    this.remaining_budget = {};
    this.interventions = {}; // store interventions here

    // initialize remaining budget for each technology
    Object.keys(this.tech_allocation).forEach((tech) => {
      this.remaining_budget[tech] =
        this.yearly_funding * this.tech_allocation[tech];
    });
  }

  // Groupable classes
  #GroupableInterventions = class {
    constructor(interventions) {
      this.all = () => interventions;
      this.groupBy = (factor) =>
        new this.constructor(this.#groupInterventions(interventions, factor));
    }

    #groupInterventions(interventions, factor) {
      if (Array.isArray(interventions)) {
        let ret = Object();
        interventions.map((i) =>
          ret[i[factor]] != null
            ? ret[i[factor]].push(i)
            : (ret[i[factor]] = [i])
        );
        return ret;
      } else {
        Object.keys(interventions).map(
          (k) =>
            (interventions[k] = this.#groupInterventions(
              interventions[k],
              factor
            ))
        );
        return interventions;
      }
    }
  };

  #GroupableBuildings = class {
    constructor(buildings) {
      this.all = () => buildings;
      this.groupBy = (factor) =>
        new this.constructor(this.#groupBuildings(buildings, factor));
    }

    #groupBuildings(buildings, factor) {
      if (Array.isArray(buildings)) {
        let ret = Object();
        buildings.map((i) =>
          ret[i[factor]] != null
            ? ret[i[factor]].push(i)
            : (ret[i[factor]] = [i])
        );
        return ret;
      } else {
        Object.keys(buildings).map(
          (k) => (buildings[k] = this.#groupBuildings(buildings[k], factor))
        );
        return buildings;
      }
    }
  };

  // Modified getInterventions to return groupable interventions
  getInterventions() {
    return new this.#GroupableInterventions(this.interventions);
  }

  // Modified getBuildings to handle year-specific building state
  getBuildings(year) {
    // Restore original building state
    let yearBuildings = JSON.parse(this.originalBuildings);

    // Apply interventions up to the specified year
    this.interventions.forEach((i) => {
      if (i.year < year) {
        if (i.type === "PV") {
          yearBuildings[i.building].pv_suitability = false;
        } else if (i.type === "ASHP") {
          yearBuildings[i.building].ashp_suitability = false;
        }
      }
    });

    return new this.#GroupableBuildings(yearBuildings);
  }

  getBuildings(year) {
    // filter buildings based on characteristics
    return this.buildings[year].filter((b) => b.targeted_for_intervention);
  }

  getInterventions() {
    return this.interventions;
  }

  allocateBudget() {
    // Track the remaining budget per technology over the years
    let allocation = {};

    for (let year = 0; year < this.nr_years; year++) {
      allocation[year] = {};

      // For each technology, allocate the budget according to tech_allocation
      Object.keys(this.tech_allocation).forEach((tech) => {
        let available_budget = this.remaining_budget[tech];
        let allocated_budget = 0;

        let target_buildings = this.getBuildings(year).filter(
          (b) => b[tech.toLowerCase() + "_suitability"]
        );

        // prioritize buildings based on specific characteristics (e.g., deprived, fuel poverty)
        let prioritized_buildings = target_buildings.filter(
          (b) => b.deprived || b.fuel_poverty
        );

        // Perform interventions based on the remaining budget and building suitability
        prioritized_buildings.forEach((building) => {
          let intervention_cost = this.calculateInterventionCost(
            building,
            tech
          );

          if (available_budget >= intervention_cost) {
            allocated_budget += intervention_cost;
            available_budget -= intervention_cost;

            // register intervention
            if (!this.interventions[year]) {
              this.interventions[year] = {};
            }
            if (!this.interventions[year][tech]) {
              this.interventions[year][tech] = [];
            }

            this.interventions[year][tech].push({
              building: building.id,
              saved: this.calculateSavedEnergy(building, tech),
              cost: intervention_cost,
            });
          }
        });

        // Update remaining budget
        this.remaining_budget[tech] = available_budget;

        allocation[year][tech] = {
          allocated: allocated_budget,
          remaining: available_budget,
        };
      });
    }

    return allocation;
  }

  calculateInterventionCost(building, tech) {
    // Placeholder function to calculate the intervention cost for now
    if (tech === "ASHP") return building.heat_demand * 1000; // e.g., arbitrary cost based on heat demand
    if (tech === "PV") return building.roof_area * 500; // e.g., arbitrary cost based on roof area
    if (tech === "EV Charger") return 2000; // fixed cost for EV chargers
    if (tech === "GSHP") return building.heat_demand * 1200; // Ground Source Heat Pump (GSHP) cost
    return 0;
  }

  calculateSavedEnergy(building, tech) {
    // Placeholder function to calculate saved energy based on the building's characteristics
    if (tech === "ASHP") return building.heat_demand * 0.6; // e.g., 60% savings for ASHP
    if (tech === "PV") return building.roof_area * 0.4; // e.g., 40% savings for PV
    if (tech === "EV Charger") return 0; // no direct energy savings for EV chargers
    if (tech === "GSHP") return building.heat_demand * 0.7; // 70% savings for GSHP
    return 0;
  }

  getRemainingBudget() {
    return this.remaining_budget;
  }

  addNewTechnology(
    techName,
    allocationPercentage,
    suitabilityFn,
    costFn,
    savingFn
  ) {
    // Dynamically add new technologies to the model
    this.tech_allocation[techName] = allocationPercentage;

    this.remaining_budget[techName] =
      this.yearly_funding * allocationPercentage;

    // Extend intervention cost and saving logic
    this.calculateInterventionCost = (building, tech) => {
      if (tech === techName) return costFn(building);
      return this.calculateInterventionCost(building, tech); // fall back to existing techs
    };

    this.calculateSavedEnergy = (building, tech) => {
      if (tech === techName) return savingFn(building);
      return this.calculateSavedEnergy(building, tech); // fall back to existing techs
    };
  }
}
