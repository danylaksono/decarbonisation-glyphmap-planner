import * as d3 from "../../../../_npm/d3@7.9.0/_esm.js";

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
    this.allocations = [];
  }

  /**
   * allocate the budget linearly over the project length
   * @returns {Array} array of annual allocations
   */
  allocateLinear() {
    const yearlyBudget = this.totalBudget / this.projectLength;
    this.allocations = this.years.map((year) => ({
      year,
      budget: yearlyBudget,
    }));
    return this.allocations;
  }

  /**
   * allocate the budget using a custom curve function
   * @param {string} curveType - type of curve function ('linear', 'log', 'sqrt', 'exp', 'quad', etc.)
   * @param {object} options - parameters for the curve function (e.g., exponent for 'pow')
   * @param {boolean} invert - whether to invert the allocation curve
   * @returns {Array} array of annual allocations
   */
  allocateCustom(curveType, options = {}, invert = false) {
    let curveFunction;
    const { exponent = 2 } = options;

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

    // weights
    const weights = this.years.map((_, i) => {
      // Use reversed index when inverted
      const index = invert ? this.projectLength - 1 - i : i;
      return curveFunction(index / (this.projectLength - 1));
    });
    const weightSum = d3.sum(weights);

    let allocatedBudget = 0;
    this.allocations = this.years.map((year, i) => {
      if (allocatedBudget >= this.totalBudget) return { year, budget: 0 };

      let budget = (weights[i] / weightSum) * this.totalBudget;
      if (allocatedBudget + budget > this.totalBudget) {
        budget = this.totalBudget - allocatedBudget;
      }
      allocatedBudget += budget;
      return { year, budget };
    });

    return this.allocations;
  }

  getAllocations() {
    return this.allocations;
  }

  /**
   * recap of the allocation, including input parameters and annual budget allocation
   * ensures that the total allocation equals the initial budget
   * @param {Array} allocations - array of annual budget allocations
   * @returns {Object} summary of the allocation process
   */
  recap() {
    const totalAllocated = d3.sum(this.allocations, (d) => d.budget);
    const budgetMatches = Math.abs(totalAllocated - this.totalBudget) < 1e-2;

    return {
      totalBudget: this.totalBudget,
      startYear: this.startYear,
      projectLength: this.projectLength,
      allocations: this.allocations,
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
  visualise(allocations, onUpdate, width = 600, height = 200) {
    const margin = { top: 20, right: 30, bottom: 40, left: 80 };

    // let currentAllocations = allocations.map((d) => ({ ...d }));
    const initialAllocations = allocations.map((d) => ({ ...d }));

    const totalBudget = this.totalBudget;
    const numYears = this.projectLength;

    const svg = d3
      .create("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto;");

    const xScale = d3
      .scaleBand()
      .domain(this.years)
      .range([margin.left, width - margin.right])
      .padding(0.1);

    const maxBudget = d3.max(allocations, (d) => d.budget) * 1.2;
    const yScale = d3
      .scaleLinear()
      .domain([0, maxBudget])
      .range([height - margin.bottom, margin.top]);

    const line = d3
      .line()
      .x((d) => xScale(d.year) + xScale.bandwidth() / 2)
      .y((d) => yScale(d.budget));

    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).tickFormat(d3.format("d")));

    const formatYAxis = (value) => {
      if (value >= 1e9) return d3.format(".1f")(value / 1e9) + "B";
      if (value >= 1e6) return d3.format(".1f")(value / 1e6) + "M";
      if (value >= 1e3) return d3.format(".1f")(value / 1e3) + "k";
      return d3.format(".0f")(value);
    };

    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).tickFormat(formatYAxis));

    // Draw initial allocations line (thin grey dashed line)
    svg
      .append("path")
      .datum(initialAllocations)
      .attr("fill", "none")
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4 2")
      .attr("d", line);

    const linePath = svg
      .append("path")
      .datum(allocations)
      .attr("fill", "none")
      .attr("stroke", "#007acc")
      .attr("stroke-width", 2)
      .attr("d", line);

    const circles = svg
      .selectAll("circle")
      .data(allocations)
      .join("circle")
      .attr("cx", (d) => xScale(d.year) + xScale.bandwidth() / 2)
      .attr("cy", (d) => yScale(d.budget))
      .attr("r", 4)
      .attr("fill", "#ff5722")
      .attr("cursor", "ns-resize");

    const totalDisplay = svg
      .append("text")
      .attr("x", width - margin.right)
      .attr("y", margin.top)
      .attr("text-anchor", "end")
      .attr("font-size", "12px");

    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background-color", "white")
      .style("border", "1px solid #ddd")
      .style("padding", "5px")
      .style("border-radius", "3px");

    circles
      .on("mouseover", function (event, d) {
        tooltip
          .style("visibility", "visible")
          .html(`Year: ${d.year}<br>Budget: ${d3.format(",.0f")(d.budget)}`);
      })
      .on("mousemove", function (event) {
        tooltip
          .style("top", event.pageY - 10 + "px")
          .style("left", event.pageX + 10 + "px");
      })
      .on("mouseout", function () {
        tooltip.style("visibility", "hidden");
      });

    const drag = d3
      .drag()
      .on("drag", (event, d) => {
        const newY = Math.max(
          margin.top,
          Math.min(height - margin.bottom, event.y)
        );
        // const newBudget = yScale.invert(newY);
        // d.budget = newBudget;
        let newBudget = yScale.invert(newY);

        // Snap to nearest 10
        newBudget = Math.round(newBudget / 10) * 10;
        d.budget = newBudget;

        circles.data(allocations).attr("cy", (d) => yScale(d.budget));
        linePath.datum(allocations).attr("d", line); //.attr("stroke", "#e91e63");

        const totalAllocated = d3.sum(allocations, (d) => d.budget);
        totalDisplay.text(
          `Total: ${totalAllocated.toFixed(0)} / ${this.totalBudget}`
        );

        this.allocations = allocations.map((d) => ({ ...d }));
      })
      .on("end", () => {
        this.allocations = allocations.map((d) => ({ ...d }));
        if (onUpdate) onUpdate(this.allocations);
      });

    circles.call(drag);

    svg
      .append("text")
      .attr("transform", `translate(${width / 2},${height - 5})`)
      .attr("text-anchor", "middle")
      .text("Year");

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", margin.left - 60)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .text("Budget Allocation");

    return svg.node();
    // return {
    //   svg: svg.node(),
    // };
  }
}
