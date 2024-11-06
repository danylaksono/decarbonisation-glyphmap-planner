import * as d3 from "npm:d3";

export function Model(buildings, spec) {

  //spec is of form:
  //{nr_years : 10, yearly_funding : 500000000, tech_allocation : {ASHP:0.5, PV:0.5}}

  //Shuffling the order of buildings because otherwise
  //they are orderd in LSOA order and it biases the model
  //(depending on how models will be build this likely won't be
  //necessary)
  buildings = d3.shuffle(buildings);

  let savedBuildings = JSON.stringify(buildings);

  //stored interventions
  let interventions = [];

  //sort buildings by how 'good' different types of interventions are for them
  //the sorting uses building-scoring functions that depend on intervention type
  //(see lower)

  let ashpPotential = d3
    .range(buildings.length)
    .sort((b1, b2) => scoreASHP(buildings[b2]) - scoreASHP(buildings[b1]));
  let pvPotential = d3
    .range(buildings.length)
    .sort((b1, b2) => scorePV(buildings[b2]) - scorePV(buildings[b1]));


  //issue! we probably need to resort the lists at the beginning of each model
  //year since as projects progress the properties of buildings change, potentially
  //making them amenable to different interventions (consider scenario where buildings
  //are prioritised for ashp only if they have ep rating  better than C).


  //simple model computation
  for (let i = 0; i < spec.nr_years; i++) {

    let funding = spec.yearly_funding;

    //manually go through one tech at a time

    //ASHP
    let ashpFunding = funding * spec.tech_allocation.ASHP;


    // console.log("initial ASHP funding :", ashpFunding);

    //go through ashp sorted list of buildings, pick best
    //suitable one until funding depleted
    for (let j = 0; j < ashpPotential.length; j++) {

      let building = buildings[ashpPotential[j]];
      if (!building.ashp_suitability) continue;

      //pick the next best suitable building that fits in the
      //budget


      // console.log("current ashp funding " + i + ":", ashpFunding);


      if (ashpFunding - building.ashp_total >= 0) {
        let intervention = {
          year: i,
          type: "ASHP",

          lsoa: building.lsoa,
          building: ashpPotential[j],
          labour: building.ashp_labour,
          material: building.ashp_material,
          saved: building.heat_demand,

        };
        interventions.push(intervention);
        building.ashp_suitability = false; //upgraded, no longer suitable!
        ashpFunding -= building.ashp_total;
      }
    }

    //PV
    let pvFunding = funding * spec.tech_allocation.PV + ashpFunding;


    // console.log("current pv funding:", pvFunding);

    for (let j = 0; j < pvPotential.length; j++) {

      let building = buildings[pvPotential[j]];
      if (!building.pv_suitability) continue;

      //keep picking the next best suitable building in the
      //sorted list until funding runs out

      if (pvFunding - building.pv_total >= 0) {
        let intervention = {
          year: i,
          type: "PV",
          lsoa: building.lsoa,
          building: pvPotential[j],
          labour: building.pv_labour,
          material: building.pv_material,
          saved: building.pv_generation,
          budgetLeft: pvFunding - building.pv_total,

        };
        interventions.push(intervention);
        building.pv_suitability = false;
        pvFunding -= building.pv_total;
      }
    }

  }


  //once we are done computing the model we want to restore the original building values!
  //we could also do this by reversing stored interventions
  buildings = JSON.parse(savedBuildings);

  //get modelled interventioned in a groupable way
  this.getInterventions = () => {
    return new GroupableInterventions(interventions);

  };


  //gets the state of buildings for a particular year in a groupable way
  this.getBuildings = (year) => {
    //we have to copy the year=0 building status
    let yearBuildings = JSON.parse(savedBuildings);

    //and simulate the interventions on buildigns up to year = year

    interventions.map((i) => {
      if (i.year < year) {
        if (i.type == "PV") yearBuildings[i.building].pv_suitability = false;
        else if (i.type == "ASHP")
          yearBuildings[i.building].ashp_suitability = false;
      }
    });
    return new GroupableBuildings(yearBuildings);
  };


  //groupable interventions and buildings means they accept a
  //groupBy call which can group the interventions or buildings
  //by any of their properties. One can call groupBy multiple type
  //to hierarchically group interventions/buildings along multiple facets:
  //For example, model.getInterventions().groupBy("lsoa").groupBy("type").groupBy("year").all()
  //will get an object with lsoa keys; its values will have objects with tech type keys;
  //those values will have objects with year keys; and finally areas of interventions.

  function GroupableInterventions(interventions) {
    this.all = () => interventions;
    this.groupBy = (factor) =>
      new GroupableInterventions(groupInterventions(interventions, factor));
  }

  function groupInterventions(interventions, factor) {
    if (Array.isArray(interventions)) {
      let ret = Object();
      interventions.map((i) =>
        ret[i[factor]] != null ? ret[i[factor]].push(i) : (ret[i[factor]] = [i])
      );
      return ret;
    } else {
      Object.keys(interventions).map(
        (k) => (interventions[k] = groupInterventions(interventions[k], factor))

      );
      return interventions;
    }
  }


  function GroupableBuildings(buildings) {
    this.all = () => buildings;
    this.groupBy = (factor) =>
      new GroupableBuildings(groupBuildings(buildings, factor));
  }

  function groupBuildings(buildings, factor) {
    if (Array.isArray(buildings)) {
      let ret = Object();
      buildings.map((i) =>
        ret[i[factor]] != null ? ret[i[factor]].push(i) : (ret[i[factor]] = [i])
      );
      return ret;
    } else {
      Object.keys(buildings).map(
        (k) => (buildings[k] = groupBuildings(buildings[k], factor))

      );
      return buildings;
    }
  }


  function scoreASHP(building) {
    //a building scores higher if the heatpump is properly sized
    //(i.e., meets its heat_demand)
    if (!building.ashp_suitability) return 0;
    return building.heat_demand / (building.ashp_size * 24 * 365);
  }
  function scorePV(building) {

    //note on data: I noticed that building.pv_generation / building.pv_total_cost was
    //always the same; the labour to material cost ratio was also the same (about 13%).
    //This probably means tht AITL came up with a constant cost per kW PV generated
    //and worked their way backward to labour and material costs. So.. the estimated
    //costs are likely not particularly grounded in how much it costs to purchase and
    //install a PV panel.

    //This is a bit silly because it makes no distinction between roofs that are better and
    //worse for PV! and it makes the model a bit random.

    //a building scores higher if it can produce more power per panel
    if (!building.pv_suitability) return 0;

    return building.pv_generation / building.pv_size;
  }
}

