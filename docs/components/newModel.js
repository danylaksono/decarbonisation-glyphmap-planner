/**
 * @param {Array} buildings - Array of building objects
 * @param {Object} spec - Model specification
 * @param {number} spec.yearly_funding - Available funding per year
 * @param {Object} spec.tech_allocation - Technology allocation percentages
 */

import * as d3 from "npm:d3";

export class Model {
  constructor(buildings, spec) {
    this.buildings = d3.shuffle(buildings);
    this.spec = spec;
    this.savedBuildings = JSON.stringify(buildings);
    this.interventions = [];

    // Initial sort of buildings by potential
    this.ashpPotential = d3
      .range(buildings.length)
      .sort(
        (b1, b2) =>
          this.scoreASHP(buildings[b2]) - this.scoreASHP(buildings[b1])
      );

    this.pvPotential = d3
      .range(buildings.length)
      .sort(
        (b1, b2) => this.scorePV(buildings[b2]) - this.scorePV(buildings[b1])
      );

    // Run the model immediately after creation
    this.runModel();
  }

  scoreASHP(building) {
    if (!building.ashp_suitability) return 0;
    return building.heat_demand / (building.ashp_size * 24 * 365);
  }

  scorePV(building) {
    if (!building.pv_suitability) return 0;
    return building.pv_generation / building.pv_size;
  }

  runModel() {
    for (let i = 0; i < this.spec.nr_years; i++) {
      let funding = this.spec.yearly_funding;

      // ASHP installations
      let ashpFunding = funding * this.spec.tech_allocation.ASHP;
      for (let j = 0; j < this.ashpPotential.length; j++) {
        let building = this.buildings[this.ashpPotential[j]];
        if (!building.ashp_suitability) continue;

        if (ashpFunding - building.ashp_total >= 0) {
          this.interventions.push({
            year: i,
            type: "ASHP",
            lsoa: building.lsoa,
            building: this.ashpPotential[j],
            labour: building.ashp_labour,
            material: building.ashp_material,
            saved: building.heat_demand,
          });
          building.ashp_suitability = false;
          ashpFunding -= building.ashp_total;
        }
      }

      // PV installations with remaining ASHP funding
      let pvFunding = funding * this.spec.tech_allocation.PV + ashpFunding;
      for (let j = 0; j < this.pvPotential.length; j++) {
        let building = this.buildings[this.pvPotential[j]];
        if (!building.pv_suitability) continue;

        if (pvFunding - building.pv_total >= 0) {
          this.interventions.push({
            year: i,
            type: "PV",
            lsoa: building.lsoa,
            building: this.pvPotential[j],
            labour: building.pv_labour,
            material: building.pv_material,
            saved: building.pv_generation,
            budgetLeft: pvFunding - building.pv_total,
          });
          building.pv_suitability = false;
          pvFunding -= building.pv_total;
        }
      }
    }

    // Restore original building values
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
