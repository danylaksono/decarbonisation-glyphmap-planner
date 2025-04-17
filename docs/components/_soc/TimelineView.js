// src/components/TimelineView.js - Timeline Component
// Purpose: Renders the decarbonization timeline and handles interactions.
// Inputs: state.
// Functions:
// renderTimeline(interventions, onChange, onClick): Uses createTimelineInterface.
// modifyIntervention, reorderIntervention, removeIntervention: Interaction handlers.
// Dependencies: timeline.js.

// src/components/TimelineView.js

// Import required dependencies
import { createTimelineInterface } from "../libs/decarb-model/timeline.js"; // Timeline renderer
import { html } from "npm:htl";

// TimelineView component
export function TimelineView(state, manager, runModel) {
  // Extract state getters and setters
  const {
    getInterventions,
    setInterventions,
    getTimelineModifications,
    setTimelineModifications,
    getSelectedInterventionIndex,
    setSelectedInterventionIndex,
  } = state;

  // Get current interventions from state
  const interventions = getInterventions();

  // Handle timeline changes
  function onTimelineChange(change) {
    console.log("Timeline changed", change);
    setTimelineModifications(change); // Store modifications in state
  }

  // Handle timeline clicks
  function onTimelineClick(click) {
    setSelectedInterventionIndex(click); // Set selected intervention index
    console.log("Clicked Interventions", click, interventions[click]);
  }

  // Modify an intervention
  function modifyIntervention(index, newConfig) {
    if (!newConfig) {
      console.info("No change detected for intervention", index);
      return;
    }

    const modifiedConfig = {
      ...newConfig,
      yearlyBudgets:
        newConfig.yearlyBudgets || interventions[index].yearlyBudgets,
      initialYear: newConfig.initialYear || interventions[index].initialYear,
      tech: newConfig.techName || interventions[index].tech,
      duration: newConfig.projectDuration || interventions[index].duration,
    };

    console.log("Modifying intervention:", index, modifiedConfig);
    manager.modifyIntervention(index, modifiedConfig); // Update in manager
    runModel(); // Re-run model to reflect changes
  }

  // Remove an intervention
  function removeIntervention(index) {
    console.log("Delete intervention:", index);
    manager.setAutoRun(true).removeIntervention(index); // Remove from manager
    runModel(); // Re-run model
  }

  // Reorder interventions
  function reorderIntervention(index, direction) {
    const currentOrder = manager.currentOrder || interventions.map((_, i) => i);
    console.log(
      "Reordering intervention:",
      interventions[index]?.interventionId,
      direction
    );

    let newArray = [...currentOrder];
    if (direction === "up" && index > 0) {
      [newArray[index - 1], newArray[index]] = [
        newArray[index],
        newArray[index - 1],
      ];
    } else if (direction === "down" && index < newArray.length - 1) {
      [newArray[index], newArray[index + 1]] = [
        newArray[index + 1],
        newArray[index],
      ];
    } else {
      console.warn("Invalid reorder operation");
      return;
    }

    manager.setInterventionOrder(newArray); // Update order in manager
    runModel(); // Re-run model
  }

  // Function to open Quickview
  function openQuickview(e) {
    e.stopPropagation();
    console.log("open quickview");
    const quickviewDefault = document.getElementById("quickviewDefault");
    if (quickviewDefault) {
      quickviewDefault.classList.add("is-active");
    } else {
      console.error("Quickview element not found");
    }
  }

  // Render the timeline view
  return html`
    <div class="card" style="overflow-y: hidden;">
      <header class="quickview-header">
        <p class="title">Decarbonisation Timeline</p>
      </header>
      <div class="card-content">
        <div class="content">
          <div id="graph-container">
            <div id="timeline-panel">
              ${createTimelineInterface(
                interventions,
                onTimelineChange,
                onTimelineClick,
                450, // Width
                220 // Height
              )}
            </div>
            <nav id="timeline-buttons">
              <button
                id="openQuickviewButton"
                class="btn tooltip"
                data-tooltip="Add New Intervention"
                aria-label="Add"
                onclick=${openQuickview}
              >
                <i class="fas fa-plus"></i>
              </button>
              <button
                class="btn edit tooltip"
                data-tooltip="Apply Modification"
                aria-label="Edit"
                onclick=${(e) => {
                  e.stopPropagation();
                  const index = getSelectedInterventionIndex();
                  const mods = getTimelineModifications();
                  modifyIntervention(index, mods[index]);
                }}
              >
                <i class="fas fa-edit" style="color:green;"></i>
              </button>
              <button
                class="btn erase tooltip"
                data-tooltip="Remove Intervention"
                aria-label="Delete"
                onclick=${(e) => {
                  e.stopPropagation();
                  removeIntervention(getSelectedInterventionIndex());
                }}
              >
                <i class="fas fa-trash" style="color:red;"></i>
              </button>
              <button
                class="btn move-up tooltip"
                data-tooltip="Move Up"
                aria-label="Move Up"
                onclick=${(e) => {
                  e.stopPropagation();
                  reorderIntervention(getSelectedInterventionIndex(), "up");
                }}
              >
                <i class="fas fa-arrow-up"></i>
              </button>
              <button
                class="btn move-down tooltip"
                data-tooltip="Move Down"
                aria-label="Move Down"
                onclick=${(e) => {
                  e.stopPropagation();
                  reorderIntervention(getSelectedInterventionIndex(), "down");
                }}
              >
                <i class="fas fa-arrow-down"></i>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>
  `;
}

// State: Expects state to include getters/setters for interventions, timeline modifications, and selected index.
// Manager: Requires an InterventionManager instance (manager) with methods like modifyIntervention, removeIntervention, setInterventionOrder.
// Run Model: Takes runModel as a callback to re-run the decarbonization model after changes.
// UI: Includes buttons for adding (linked to Quickview), modifying, deleting, and reordering interventions.
