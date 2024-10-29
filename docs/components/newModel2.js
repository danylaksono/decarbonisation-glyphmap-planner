import * as d3 from "npm:d3";

export class Model {
  constructor(buildings, modelSpec) {
    this.buildings = d3.shuffle(buildings);
    this.savedBuildings = JSON.stringify(buildings);
    this.interventions = [];

    // Core model parameters
    this.nr_years = modelSpec.nr_years || 10;
    this.yearly_funding = modelSpec.yearly_funding || 300_000_000;
    this.tech_allocation = {};
    this.techConfigs = {};

    // Initialize budget tracking structure for all years upfront
    this.budgetProgression = {
      yearly: Array(this.nr_years)
        .fill()
        .map(() => ({})),
      rollover: Array(this.nr_years)
        .fill()
        .map(() => ({})),
      final: Array(this.nr_years).fill(0),
    };

    // Initialize with provided technologies
    if (modelSpec.technologies) {
      modelSpec.technologies.forEach((tech) => {
        this.addTechnology(tech.name, tech.allocation, tech.config);
      });
    }
  }

  addTechnology(techName, allocation, config) {
    console.log(
      `Adding technology ${techName} with allocation ${allocation}`,
      config
    );
    this.techConfigs[techName] = config;
    this.tech_allocation[techName] = allocation;
    console.log("Current techConfigs:", this.techConfigs);
    this.buildingPotentials = this.calculateBuildingPotentials();
  }

  calculateBuildingPotentials() {
    console.log("Calculating building potentials");
    const potentials = {};
    for (const [tech, config] of Object.entries(this.techConfigs)) {
      console.log(`Processing tech ${tech}:`, config);
      if (config && typeof config.scoreFn === "function") {
        potentials[tech] = d3
          .range(this.buildings.length)
          .sort(
            (b1, b2) =>
              config.scoreFn(this.buildings[b2]) -
              config.scoreFn(this.buildings[b1])
          );
        console.log(
          `Sorted buildings for ${tech}:`,
          potentials[tech].slice(0, 5)
        );
      }
    }
    return potentials;
  }

  processInterventions(tech, year, funding) {
    const config = this.techConfigs[tech];
    let remainingFunding = funding;

    // Track initial allocation
    if (!this.budgetProgression.yearly[year]) {
      this.budgetProgression.yearly[year] = {};
      this.budgetProgression.rollover[year] = {};
    }
    this.budgetProgression.yearly[year][tech] = funding;

    // Sort buildings by suitability score
    const sortedBuildings = this.buildingPotentials[tech].filter(
      (buildingIndex) => this.buildings[buildingIndex][config.suitabilityKey]
    );

    // Process buildings in priority order
    for (const buildingIndex of sortedBuildings) {
      const building = this.buildings[buildingIndex];
      const cost = building[config.costKey];

      if (remainingFunding >= cost) {
        // Add intervention
        const intervention = {
          year,
          type: tech,
          lsoa: building.lsoa,
          building: buildingIndex,
          labour: building[config.labourKey],
          material: building[config.materialKey],
          saved: building[config.savingsKey],
          budgetLeft: remainingFunding - cost,
        };
        this.interventions.push(intervention);
        console.log(`Added intervention:`, intervention);

        building[config.suitabilityKey] = false;
        remainingFunding -= cost;
      }
    }

    // Track remaining after this technology
    this.budgetProgression.rollover[year][tech] = remainingFunding;

    // Track final remaining budget for the year
    if (
      Object.keys(this.techConfigs).indexOf(tech) ===
      Object.keys(this.techConfigs).length - 1
    ) {
      this.budgetProgression.final[year] = remainingFunding;
    }

    return remainingFunding;
  }
  getBudgetProgression() {
    return {
      initialAllocations: this.budgetProgression.yearly,
      rollovers: this.budgetProgression.rollover,
      finalRemaining: this.budgetProgression.final,
    };
  }

  runModel() {
    console.log(
      "Running model with technologies:",
      Object.keys(this.techConfigs)
    );
    for (let year = 0; year < this.nr_years; year++) {
      let yearlyFunding = this.yearly_funding;
      let remainingFunding = yearlyFunding;

      Object.keys(this.tech_allocation).forEach((tech) => {
        const techFunding =
          yearlyFunding * this.tech_allocation[tech] + remainingFunding;
        console.log(`Year ${year}, ${tech}: Allocated funding ${techFunding}`);
        remainingFunding = this.processInterventions(tech, year, techFunding);
      });
    }

    this.buildings = JSON.parse(this.savedBuildings);
  }

  getInterventions() {
    return {
      all: () => this.interventions,
      groupBy: (factor) =>
        this.createGroupableInterventions(
          this.groupInterventions(this.interventions, factor)
        ),
    };
  }

  getBuildings(year) {
    let yearBuildings = JSON.parse(this.savedBuildings);

    this.interventions.forEach((i) => {
      if (i.year < year) {
        if (i.type === "PV") yearBuildings[i.building].pv_suitability = false;
        else if (i.type === "ASHP")
          yearBuildings[i.building].ashp_suitability = false;
      }
    });

    return {
      all: () => yearBuildings,
      groupBy: (factor) =>
        this.createGroupableInterventions(
          this.groupBuildings(yearBuildings, factor)
        ),
    };
  }

  groupInterventions(interventions, factor) {
    if (Array.isArray(interventions)) {
      let ret = {};
      interventions.forEach((i) => {
        if (!ret[i[factor]]) ret[i[factor]] = [];
        ret[i[factor]].push(i);
      });
      return ret;
    }
    Object.keys(interventions).forEach((k) => {
      interventions[k] = this.groupInterventions(interventions[k], factor);
    });
    return interventions;
  }

  groupBuildings(buildings, factor) {
    if (Array.isArray(buildings)) {
      let ret = {};
      buildings.forEach((b) => {
        if (!ret[b[factor]]) ret[b[factor]] = [];
        ret[b[factor]].push(b);
      });
      return ret;
    }
    Object.keys(buildings).forEach((k) => {
      buildings[k] = this.groupBuildings(buildings[k], factor);
    });
    return buildings;
  }

  createGroupableInterventions(data) {
    return {
      all: () => data,
      groupBy: (factor) =>
        this.createGroupableInterventions(
          this.groupInterventions(data, factor)
        ),
    };
  }
}
