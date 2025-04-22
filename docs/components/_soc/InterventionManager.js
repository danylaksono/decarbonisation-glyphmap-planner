// src/components/InterventionManager.js - Model Logic
// Purpose: Manages decarbonization interventions and results.
// Functions: Extends InterventionManager with runModel, modifyIntervention, etc.
// Dependencies: mini-decarbonisation.js.

// src/components/InterventionManager.js

import {
  InterventionManager as BaseInterventionManager,
  MiniDecarbModel,
} from "../libs/decarb-model/mini-decarbonisation.js"; // Assuming this exists

// InterventionManager class extending the base implementation
export class InterventionManager extends BaseInterventionManager {
  constructor(buildingsData, listOfTech) {
    super(buildingsData, listOfTech); // Call parent constructor
    this.currentOrder = []; // Track intervention order
  }

  // Add an intervention and update order
  addIntervention(config) {
    super.addIntervention(config);
    this.currentOrder.push(this.interventionConfigs.length - 1);
  }

  // Modify an intervention at a specific index
  modifyIntervention(index, config) {
    if (index >= 0 && index < this.interventionConfigs.length) {
      this.interventionConfigs[index] = {
        ...this.interventionConfigs[index],
        ...config,
      };
    } else {
      console.error("Invalid intervention index:", index);
    }
  }

  // Remove an intervention and update order
  removeIntervention(index) {
    super.removeIntervention(index);
    this.currentOrder = this.currentOrder
      .filter((i) => i !== index)
      .map((i) => (i > index ? i - 1 : i));
  }

  // Set intervention order
  setInterventionOrder(order) {
    if (order.length === this.interventionConfigs.length) {
      this.currentOrder = order;
      return true;
    }
    return false;
  }

  // Run interventions and return formatted results
  runInterventions() {
    const recaps = super.runInterventions();
    return recaps.map((r) => ({
      ...r,
      interventionId: r.modelId,
      initialYear: Number(Object.keys(r.yearlyStats)[0]),
      tech: r.techName,
      duration: r.projectDuration,
    }));
  }

  // Get stacked results (assuming base class provides this)
  getStackedResults() {
    return super.getStackedResults();
  }

  // Group data for timeline visualization
  static group(data, keys) {
    return MiniDecarbModel.group(data, keys);
  }
}

// Factory function to create an InterventionManager instance
export function createInterventionManager(buildingsData, listOfTech) {
  return new InterventionManager(buildingsData, listOfTech);
}

// Dependencies: Assumes mini-decarbonisation.js provides InterventionManager and MiniDecarbModel.
// Features: Extends base functionality with order tracking and formatted results.
// Usage: createInterventionManager initializes the manager with data and tech configs.
