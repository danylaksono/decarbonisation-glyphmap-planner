import * as Inputs from "../../_observablehq/stdlib/inputs.js";
import { Generators } from "../../_observablehq/stdlib.js";
import { html } from "../../_npm/htl@0.3.1/_esm.js";
import { createBudgetAllocator } from "./BudgetAllocator.6610fd6c.js";

// QuickviewForm component
export function QuickviewForm(state, manager, runModel, tableFilteredData) {
  const { getSelectedAllocation, setSelectedAllocation, getTableFiltered } =
    state;

  // Form inputs
  const techsInput = Inputs.select(["PV", "ASHP", "GSHP", "Optimise All"], {
    value: "ASHP",
  });
  const totalBudgetInput = html`<input
    class="input"
    value="100"
    type="text"
    placeholder="Enter total budget"
  />`;
  const startYearInput = html`<input
    class="input"
    type="number"
    value="2025"
    step="1"
    min="2025"
    max="2080"
  />`;
  const projectLengthInput = html`<input
    class="slider is-fullwidth"
    type="range"
    min="1"
    max="10"
    step="1"
    value="5"
  />`;
  const allocationTypeInput = Inputs.radio(["linear", "sqrt", "exp", "cubic"], {
    value: "linear",
  });
  const flipButtonInput = Inputs.toggle({ label: "Flip", value: false });

  // Event listeners for budget formatting
  totalBudgetInput.addEventListener("input", (e) => {
    const value = e.target.value.replace(/,/g, "").replace(/£/g, "");
    e.target.value = "£" + value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  });
  totalBudgetInput.addEventListener("blur", (e) => {
    const value = e.target.value.replace(/,/g, "").replace(/£/g, "");
    e.target.value = "£" + parseInt(value, 10).toLocaleString();
  });
  totalBudgetInput.addEventListener("focus", (e) => {
    e.target.value = e.target.value.replace(/,/g, "").replace(/£/g, "");
  });

  // Close Quickview function
  function closeQuickview(e) {
    e.stopPropagation();
    console.log("close quickview"); // Debug log
    const quickviewDefault = document.getElementById("quickviewDefault");
    if (quickviewDefault) {
      quickviewDefault.classList.remove("is-active");
    } else {
      console.error("Quickview element not found");
    }
  }

  console.log({
    techsInput,
    totalBudgetInput,
    startYearInput,
    projectLengthInput,
    allocationTypeInput,
    flipButtonInput,
  });

  // Render the quickview form with all logic inside the template
  return html`
    <div id="quickviewDefault" class="quickview is-left">
      <header class="quickview-header">
        <p class="title">New Budget Allocation</p>
        <span
          class="delete"
          data-dismiss="quickview"
          id="closeQuickviewButton"
          onclick=${closeQuickview}
        ></span>
      </header>
      <div class="quickview-body">
        ${tableFilteredData
          ? html`<i> Using ${tableFilteredData.length} Filtered Data </i>`
          : ""}
        <div class="quickview-block">
          <form id="quickviewForm">
            <div class="field">
              <label class="label">Technology</label>
              <div class="control">${techsInput}</div>
            </div>
            <div class="field">
              <label class="label">Total Budget (in thousand £)</label>
              <div class="control">${totalBudgetInput}</div>
            </div>
            <div class="field">
              <label class="label">Start Year</label>
              <div class="control">${startYearInput}</div>
            </div>
            <div class="field">
              <label class="label">Project Length (years)</label>
              <div class="control">
                ${projectLengthInput}
                <span>${Generators.input(projectLengthInput)} years</span>
              </div>
            </div>
            <div class="field">
              <label class="label">Budget Allocation Type</label>
              <div class="control">${allocationTypeInput}</div>
            </div>
            <div class="field">${flipButtonInput}</div>
            <div class="field">
              ${
                // Inline budget allocator creation
                (() => {
                  const techValue = Generators.input(techsInput);
                  const budgetValue = Generators.input(totalBudgetInput);
                  const startValue = Generators.input(startYearInput);
                  const lengthValue = Generators.input(projectLengthInput);
                  const typeValue = Generators.input(allocationTypeInput);
                  const flipValue = Generators.input(flipButtonInput);

                  const numericBudget = () => {
                    if (typeof budgetValue === "string") {
                      return (
                        parseFloat(
                          budgetValue.replace(/,/g, "").replace(/£/g, "")
                        ) * 1000
                      );
                    } else {
                      console.log(budgetValue);
                      console.error(
                        "budgetValue is not a string:",
                        budgetValue
                      );
                      return 0;
                    }
                  };
                  const { viz } = createBudgetAllocator(
                    numericBudget(),
                    startValue,
                    lengthValue,
                    typeValue,
                    flipValue,
                    state
                  );
                  return viz;
                })()
              }
            </div>
          </form>
        </div>
      </div>
      <footer class="quickview-footer">
        <button
          class="button is-light"
          id="cancelButton"
          onclick=${closeQuickview}
        >
          Cancel
        </button>
        <button
          class="button is-success"
          id="addInterventionBtn"
          onclick=${() => {
            const techValue = Generators.input(techsInput);
            const budgetValue = Generators.input(totalBudgetInput);
            const startValue = Generators.input(startYearInput);
            const lengthValue = Generators.input(projectLengthInput);
            const typeValue = Generators.input(allocationTypeInput);
            const flipValue = Generators.input(flipButtonInput);

            const numericBudget = () =>
              parseFloat(budgetValue.replace(/,/g, "").replace(/£/g, "")) *
              1000;
            const { allocator } = createBudgetAllocator(
              numericBudget(),
              startValue,
              lengthValue,
              typeValue,
              flipValue,
              state
            );

            const formData = {
              id: `${techValue}_${startValue}`,
              initialYear: Number(startValue),
              rolloverBudget: 0,
              optimizationStrategy: "tech-first",
              tech: techValue,
              yearlyBudgets:
                getSelectedAllocation() || allocator.getAllocations(),
            };
            manager.addIntervention(formData);
            runModel();
            closeQuickview({ stopPropagation: () => {} }); // Simulate event
          }}
        >
          Add New Intervention
        </button>
      </footer>
    </div>
  `;
}

// Dependencies: Requires Inputs, BudgetAllocator.js.
// State: Uses getSelectedAllocation, setSelectedAllocation, getTableFiltered.
// Events: Adds intervention and closes the form on submission.
