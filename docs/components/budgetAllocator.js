import * as d3 from "npm:d3";

export class BudgetAllocator {
  /**
   * constructor to initialize budget allocator
   * @param {number} totalBudget - total budget for the project
   * @param {number} startYear - starting year of the project
   * @param {number} projectLength - duration of the project in years
   */
  constructor(totalBudget, startYear, projectLength) {
    this.totalBudget = totalBudget;
    this.startYear = startYear;
    this.projectLength = projectLength;
    this.years = Array.from({ length: projectLength }, (_, i) => startYear + i);
  }

  allocateBudget(method = "linear", invert = false) {
    const allocations = [];
    let totalAllocated = 0;

    for (let i = 0; i < this.projectLength; i++) {
      let budgetForYear;

      // Calculate allocation based on chosen method
      switch (method) {
        case "linear":
          budgetForYear = this.totalBudget / this.projectLength;
          break;
        case "exponential":
          budgetForYear =
            (this.totalBudget * Math.pow(1.1, i)) /
            Math.pow(1.1, this.projectLength - 1);
          break;
        case "sigmoid":
          const x = (i - this.projectLength / 2) / (this.projectLength / 8);
          budgetForYear =
            this.totalBudget / (1 + Math.exp(-x)) - this.totalBudget / 2;
          break;
        default:
          throw new Error("Unknown allocation method");
      }

      if (invert) {
        budgetForYear = this.totalBudget - budgetForYear;
      }

      allocations.push(budgetForYear);
      totalAllocated += budgetForYear;
    }

    // Normalize allocations to ensure the total allocated budget matches the total budget
    const normalizationFactor = this.totalBudget / totalAllocated;
    return allocations.map((allocation) => allocation * normalizationFactor);
  }

  /**
   * allocate the budget linearly over the project length
   * @returns {Array} array of annual allocations
   */
  allocateLinear() {
    const yearlyBudget = this.totalBudget / this.projectLength;
    return this.years.map((year) => ({ year, budget: yearlyBudget }));
  }

  /**
   * allocate the budget using a custom curve function
   * @param {string} curveType - type of curve function ('linear', 'log', 'sqrt', 'exp', 'quad', etc.)
   * @param {object} options - parameters for the curve function (e.g., exponent for 'pow')
   * @returns {Array} array of annual allocations
   */
  allocateCustom(curveType, options = {}) {
    let curveFunction;
    const { exponent = 2 } = options; // default exponent for 'pow' curves

    // create a scale based on the selected curveType
    switch (curveType) {
      case "linear":
        curveFunction = d3.scaleLinear().domain([0, 1]).range([1, 10]);
        break;
      case "log":
        curveFunction = d3
          .scaleLog()
          .domain([1, this.projectLength])
          .range([1, 10])
          .clamp(true);
        break;
      case "sqrt":
        curveFunction = d3.scaleSqrt().domain([0, 1]).range([1, 10]);
        break;
      case "exp":
        curveFunction = d3
          .scalePow()
          .exponent(exponent)
          .domain([0, 1])
          .range([1, 10]);
        break;
      case "quad":
        curveFunction = d3.scalePow().exponent(2).domain([0, 1]).range([1, 10]);
        break;
      case "cubic":
        curveFunction = d3.scalePow().exponent(3).domain([0, 1]).range([1, 10]);
        break;
      default:
        throw new Error(`Unsupported curve type: ${curveType}`);
    }

    // calculate relative weight for each year
    const weights = this.years.map((_, i) =>
      curveFunction(i / (this.projectLength - 1))
    );
    const weightSum = d3.sum(weights);

    // ensure total budget allocation matches initial budget
    let allocatedBudget = 0;
    const allocations = this.years.map((year, i) => {
      if (allocatedBudget >= this.totalBudget) return { year, budget: 0 };

      let budget = (weights[i] / weightSum) * this.totalBudget;
      if (allocatedBudget + budget > this.totalBudget) {
        budget = this.totalBudget - allocatedBudget; // adjust final allocation
      }
      allocatedBudget += budget;
      return { year, budget };
    });

    return allocations;
  }

  /**
   * recap of the allocation, including input parameters and annual budget allocation
   * ensures that the total allocation equals the initial budget
   * @param {Array} allocations - array of annual budget allocations
   * @returns {Object} summary of the allocation process
   */
  recap(allocations) {
    const totalAllocated = d3.sum(allocations, (d) => d.budget);
    const budgetMatches = Math.abs(totalAllocated - this.totalBudget) < 1e-2;

    return {
      totalBudget: this.totalBudget,
      startYear: this.startYear,
      projectLength: this.projectLength,
      allocations,
      totalAllocated,
      budgetMatches,
      message: budgetMatches
        ? "Budget allocated successfully with no remaining funds."
        : "Warning: Allocated budget does not match the total budget.",
    };
  }

  /**
   * visualize budget allocation for each year using d3
   * @param {Array} allocations - array of annual allocations
   * @returns {HTMLElement} - SVG element containing the visualization
   */
  visualize(allocations) {
    const width = 640; // Define desired chart width
    const height = 400; // Define desired chart height
    const margin = { top: 20, right: 30, bottom: 40, left: 50 };

    // Create SVG element using d3.create, with responsive viewBox
    const svg = d3
      .create("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto;"); // Responsive

    // Define x and y scales based on years and budget allocation values
    const xScale = d3
      .scaleLinear()
      .domain([this.startYear, this.startYear + this.projectLength - 1])
      .range([margin.left, width - margin.right]);

    const yMax = d3.max(allocations, (d) => d.budget);
    const yScale = d3
      .scaleLinear()
      .domain([0, yMax])
      .range([height - margin.bottom, margin.top]);

    // Create line generator for budget allocations
    const line = d3
      .line()
      .x((d) => xScale(d.year))
      .y((d) => yScale(d.budget));

    // Append x-axis to the SVG
    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).tickFormat(d3.format("d")));

    // Append y-axis to the SVG
    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale));

    // Draw the line representing the budget allocation curve
    svg
      .append("path")
      .datum(allocations)
      .attr("fill", "none")
      .attr("stroke", "#007acc")
      .attr("stroke-width", 2)
      .attr("d", line);

    // Draw circles at each allocation point
    svg
      .selectAll("circle")
      .data(allocations)
      .join("circle")
      .attr("cx", (d) => xScale(d.year))
      .attr("cy", (d) => yScale(d.budget))
      .attr("r", 4)
      .attr("fill", "#ff5722");

    // Axis labels
    svg
      .append("text")
      .attr("transform", `translate(${width / 2},${height - 5})`)
      .attr("text-anchor", "middle")
      .text("Year");

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", margin.left - 35)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .text("Budget Allocation");

    // Return the SVG node, which Observable automatically renders
    return svg.node();
  }
}
