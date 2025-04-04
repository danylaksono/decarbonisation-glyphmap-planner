// src/components/BudgetAllocator.js - Budget Allocator
// Purpose: Manages budget allocation logic.
// Functions: Extends existing BudgetAllocator class with modular exports.
// Dependencies: budget-allocator.js.

// src/components/BudgetAllocator.js

import { BudgetAllocator as BaseBudgetAllocator } from "./libs/decarb-model/budget-allocator.5c9a0a07.js"; // Assuming this exists
import { html } from "../../_npm/htl@0.3.1/_esm.js";

// BudgetAllocator class extending the base implementation
export class BudgetAllocator extends BaseBudgetAllocator {
  constructor(totalBudget, startYear, projectLength) {
    super(totalBudget, startYear, projectLength); // Call parent constructor
    this.allocations = []; // Store current allocations
  }

  // Allocate budget using a custom method (linear, sqrt, exp, cubic)
  allocateCustom(method, options = {}, flip = false) {
    let allocations;
    switch (method) {
      case "linear":
        allocations = this.allocateLinear();
        break;
      case "sqrt":
        allocations = this.allocateCustomCurve((x) => Math.sqrt(x), options);
        break;
      case "exp":
        allocations = this.allocateCustomCurve((x) => Math.exp(x), options);
        break;
      case "cubic":
        allocations = this.allocateCustomCurve((x) => Math.pow(x, 3), options);
        break;
      default:
        allocations = this.allocateLinear();
    }
    if (flip) allocations.reverse();
    this.allocations = allocations;
    return allocations;
  }

  // Get current allocations
  getAllocations() {
    return this.allocations;
  }

  // Visualize allocations (assuming the base class has this method)
  visualise(allocations, onChange, width = 400, height = 200) {
    this.allocations = allocations; // Update internal state
    const viz = super.visualise(
      allocations,
      (changes) => {
        this.allocations = changes; // Update on user interaction
        onChange(changes);
      },
      width,
      height
    );
    return viz;
  }
}

// Factory function to create and initialize a BudgetAllocator instance
export function createBudgetAllocator(
  totalBudget,
  startYear,
  projectLength,
  allocationType,
  flip,
  state
) {
  const allocator = new BudgetAllocator(totalBudget, startYear, projectLength);
  const initialAllocations = allocator.allocateCustom(
    allocationType,
    { exponent: 4 },
    flip
  );
  const viz = allocator.visualise(initialAllocations, (changes) => {
    state.setSelectedAllocation(changes); // Update state on change
  });
  state.setSelectedAllocation(initialAllocations); // Initial state update
  return { allocator, viz };
}

// Dependencies: Assumes budget-allocator.js provides a BudgetAllocator base class with allocateLinear, allocateCustomCurve, and visualise methods.
// State: Updates state.setSelectedAllocation with allocations.
// Usage: createBudgetAllocator initializes and returns both the allocator and its visualization.
