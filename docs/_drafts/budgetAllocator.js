import * as d3 from "npm:d3";

export class BudgetAllocator {
  /**
   * constructor to initialize budget allocator
   * @param {number} totalBudget - total budget for the project
   * @param {number} startYear - starting year of the project
   * @param {number} projectLength - duration of the project in years
   */
  constructor(totalBudget, startYear, projectLength) {
    if (totalBudget <= 0 || projectLength <= 0) {
      throw new Error(
        "Total budget and project length must be positive numbers."
      );
    }
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
    // return this.years.map((year) => ({ year, budget: yearlyBudget }));
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
    if (
      !["linear", "log", "sqrt", "exp", "quad", "cubic"].includes(curveType)
    ) {
      throw new Error(`Unsupported curve type: ${curveType}`);
    }
    const { exponent = 2 } = options;
    const curveFunctions = {
      linear: () => d3.scaleLinear().domain([0, 1]).range([1, 10]),
      log: () =>
        d3
          .scaleLog()
          .domain([1, this.projectLength])
          .range([1, 10])
          .clamp(true),
      sqrt: () => d3.scaleSqrt().domain([0, 1]).range([1, 10]),
      exp: () => d3.scalePow().exponent(exponent).domain([0, 1]).range([1, 10]),
      quad: () => d3.scalePow().exponent(2).domain([0, 1]).range([1, 10]),
      cubic: () => d3.scalePow().exponent(3).domain([0, 1]).range([1, 10]),
    };

    const curveFunction = curveFunctions[curveType];
    if (!curveFunction) {
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

    // return allocations;
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
    console.log("<< Visualising budget allocations");
    const margin = { top: 20, right: 30, bottom: 40, left: 80 };

    let currentAllocations = allocations.map((d) => ({ ...d }));

    const totalBudget = this.totalBudget;
    const numYears = this.projectLength;

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

    const maxBudget = d3.max(allocations, (d) => d.budget) * 1.2;
    const yScale = d3
      .scaleLinear()
      .domain([0, maxBudget])
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

    const formatYAxis = (value) => {
      if (value >= 1e9) return d3.format(".1f")(value / 1e9) + "B";
      if (value >= 1e6) return d3.format(".1f")(value / 1e6) + "M";
      if (value >= 1e3) return d3.format(".1f")(value / 1e3) + "k";
      return d3.format(".0f")(value);
    };

    // Append y-axis to the SVG
    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      // .call(d3.axisLeft(yScale));
      .call(d3.axisLeft(yScale).tickFormat(formatYAxis));

    // Draw the line representing the budget allocation curve
    svg
      .append("path")
      .datum(allocations)
      .attr("fill", "none")
      .attr("stroke", "#007acc")
      .attr("stroke-width", 2)
      .attr("d", line);

    const linePath = svg
      .append("path")
      .datum(allocations)
      .attr("fill", "none")
      .attr("stroke", "#007acc")
      .attr("stroke-width", 2)
      .attr("d", line);

    // Draw circles at each allocation point
    const circles = svg
      .selectAll("circle")
      .data(allocations)
      .join("circle")
      .attr("cx", (d) => xScale(d.year))
      .attr("cy", (d) => yScale(d.budget))
      .attr("r", 4)
      .attr("fill", "#ff5722")
      .attr("cursor", "ns-resize");

    // Total budget label
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

    console.log("circle created", circles);

    const drag = d3
      .drag()
      .on("drag", (event, d) => {
        console.log("Drag event triggered");
        console.log("Current d:", d);
        console.log("Current workingAllocations:", currentAllocations);
        const newY = Math.max(
          margin.top,
          Math.min(height - margin.bottom, event.y)
        );
        const newBudget = yScale.invert(newY);

        // Find and update the allocation for this year
        const index = allocations.findIndex((a) => a.year === d.year);
        if (index !== -1) {
          allocations[index].budget = newBudget;
          this.allocations[index].budget = newBudget;
        }

        // Update circles and line
        circles.data(allocations).attr("cy", (d) => yScale(d.budget));
        linePath.datum(allocations).attr("d", line);

        // Update total display
        const totalAllocated = d3.sum(allocations, (d) => d.budget);
        totalDisplay.text(
          `Total: ${totalAllocated.toFixed(2)} / ${this.totalBudget}`
        );

        this.allocations = allocations.map((d) => ({ ...d }));
        console.log("Updated allocations:", this.allocations);

        // Call the onUpdate callback with current allocations
        if (onUpdate) {
          console.log("onUpdate triggered");
          onUpdate([...allocations]); // Pass a copy of current allocations
        }
      })
      .on("end", () => {
        console.log("Drag end event triggered");
        this.allocations = allocations.map((d) => ({ ...d }));
        if (onUpdate) {
          onUpdate([...this.allocations]);
        }
      });

    // Apply drag behavior to circles
    console.log("attach drag behavior to circles");
    circles.call(drag);

    // Axis labels
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

    // return svg.node();
    return {
      svg: svg.node(),
      // getAllocations: () => currentAllocations,
    };
  }
}
