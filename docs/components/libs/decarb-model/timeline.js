import * as d3 from "npm:d3";

export function createTimelineInterface(
  interventions,
  onChange,
  onClick,
  width = 800,
  height = 400,
  tooltipsEnabled = false
) {
  // validate interventions
  console.log("Received interventions for timeline: ", interventions);

  if (!Array.isArray(interventions)) {
    throw new Error("Interventions must be an array");
  }
  // validate intervention contents
  interventions.forEach((intervention, i) => {
    if (typeof intervention !== "object") {
      throw new Error(`Intervention at index ${i} is not an object`);
    }
    if (!intervention.tech && !Array.isArray(intervention.technologies)) {
      throw new Error(
        `Intervention at index ${i} must have a 'tech' property or a 'technologies' array`
      );
    }
    if (intervention.tech && typeof intervention.tech !== "string") {
      intervention.tech = String(intervention.tech);
    }
    if (Array.isArray(intervention.technologies)) {
      intervention.technologies = intervention.technologies.map((t, j) => {
        return typeof t !== "string" ? String(t) : t;
      });
    }
    if (typeof intervention.initialYear !== "number") {
      throw new Error(
        `Intervention '${
          intervention.tech || intervention.technologies.join(", ")
        }' is missing an 'initialYear' number`
      );
    }
    if (typeof intervention.duration !== "number") {
      throw new Error(
        `Intervention '${
          intervention.tech || intervention.technologies.join(", ")
        }' is missing a 'duration' number`
      );
    }
    if (intervention.yearlyBudgets) {
      if (!Array.isArray(intervention.yearlyBudgets)) {
        throw new Error(
          `Intervention '${
            intervention.tech || intervention.technologies.join(", ")
          }' has a 'yearlyBudgets' property that is not an array`
        );
      }
      if (intervention.yearlyBudgets.length !== intervention.duration) {
        throw new Error(
          `Intervention '${
            intervention.tech || intervention.technologies.join(", ")
          }' has a 'yearlyBudgets' array with the wrong length`
        );
      }
    }
  });

  // Set up dimensions and margins for the SVG
  const margin = { top: 20, right: 30, bottom: 30, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Calculate the year range from our data
  const minYear = Math.min(...interventions.map((d) => d.initialYear));
  const maxYear = Math.max(
    ...interventions.map((d) => d.initialYear + d.duration)
  );

  // Set up maximum block height
  const maxBlockHeight = 40;

  // Create scales for x-axis (years) and y-axis (intervention rows)
  const xScale = d3
    .scaleLinear()
    .domain([minYear - 1, maxYear + 1]) // Add buffer year on each side
    .range([0, innerWidth]);

  const yScale = d3
    .scaleBand()
    .domain(interventions.map((_, i) => i))
    .range([0, innerHeight])
    .padding(0.01);

  // Create SVG container
  const svg = d3.create("svg").attr("width", width).attr("height", height);

  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("pointer-events", "none");

  const tooltipSvg = tooltip
    .append("svg")
    .attr("width", 200)
    .attr("height", 150);

  // Track tooltip state
  let areTooltipsEnabled = tooltipsEnabled;

  // Create main group element with margins
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Remove any existing x-axis
  g.selectAll(".x-axis").remove();

  // Add x-axis with year labels
  g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(xScale)
        .tickValues(
          d3.range(Math.ceil(minYear - 1), Math.floor(maxYear + 1) + 1)
        ) // Added +1 to include last year
        .tickFormat(d3.format("d"))
    );

  g.append("rect")
    .attr("class", "background")
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("fill", "transparent")
    .on("click", function () {
      g.selectAll(".block").classed("highlight", false);
      if (onClick) {
        onClick(null); // Pass null to indicate deselection
      }
    });

  // Ensure style element exists before trying to modify it
  if (svg.select("style").empty()) {
    svg.append("style").text("");
  }

  // Add drag-to-select functionality
  let selectionRect = null;
  let selectionStart = null;

  g.on("mousedown", function (event) {
    // Only initiate on background, not on blocks
    if (event.target.classList.contains("block")) return;

    // Remove existing selection rectangle if any
    if (selectionRect) selectionRect.remove();

    // Store starting position
    selectionStart = d3.pointer(event);

    // Create new selection rectangle
    selectionRect = g
      .append("rect")
      .attr("class", "selection-area")
      .attr("x", selectionStart[0])
      .attr("y", selectionStart[1])
      .attr("width", 0)
      .attr("height", 0)
      .attr("fill", "rgba(158, 202, 225, 0.3)")
      .attr("stroke", "rgb(107, 174, 214)")
      .attr("stroke-width", 1);
  })
    .on("mousemove", function (event) {
      // Only proceed if we have a selection rectangle
      if (!selectionRect || !selectionStart) return;

      const currentPos = d3.pointer(event);

      // Calculate rectangle dimensions
      const x = Math.min(selectionStart[0], currentPos[0]);
      const y = Math.min(selectionStart[1], currentPos[1]);
      const width = Math.abs(currentPos[0] - selectionStart[0]);
      const height = Math.abs(currentPos[1] - selectionStart[1]);

      // Update rectangle position and size
      selectionRect
        .attr("x", x)
        .attr("y", y)
        .attr("width", width)
        .attr("height", height);
    })
    .on("mouseup", function () {
      // Only proceed if we have a selection rectangle
      if (!selectionRect || !selectionStart) return;

      // Get the selection rectangle's bounds
      const selectX = parseFloat(selectionRect.attr("x"));
      const selectY = parseFloat(selectionRect.attr("y"));
      const selectWidth = parseFloat(selectionRect.attr("width"));
      const selectHeight = parseFloat(selectionRect.attr("height"));

      // Clear any previous selection
      g.selectAll(".block").classed("highlight", false);

      // Find all blocks that intersect with the selection rectangle
      const selectedIndexes = [];
      g.selectAll(".block").each(function (d, i) {
        const block = d3.select(this);
        const blockX = parseFloat(block.attr("x"));
        const blockY = parseFloat(block.attr("y"));
        const blockWidth = parseFloat(block.attr("width"));
        const blockHeight = parseFloat(block.attr("height"));

        // Check for rectangle intersection
        if (
          blockX < selectX + selectWidth &&
          blockX + blockWidth > selectX &&
          blockY < selectY + selectHeight &&
          blockY + blockHeight > selectY
        ) {
          // Highlight selected block
          block.classed("highlight", true);
          selectedIndexes.push(interventions.indexOf(d));
        }
      });

      // Call the onClick callback with the array of selected indexes
      if (onClick && selectedIndexes.length > 0) {
        onClick(
          selectedIndexes.length === 1 ? selectedIndexes[0] : selectedIndexes
        );
      } else if (onClick && selectedIndexes.length === 0) {
        // If nothing was selected, pass null
        onClick(null);
      }

      // Remove the selection rectangle
      selectionRect.remove();
      selectionRect = null;
      selectionStart = null;
    });

  // Update CSS styles for selection interaction
  svg.select("style").text(
    svg.select("style").text() +
      `
    .selection-area {
      pointer-events: none;
    }
  `
  );

  // Helper function to compute the intervention label
  function computeTechLabel(d) {
    return (
      d.tech ||
      (Array.isArray(d.technologies) ? d.technologies.join(", ") : "Unknown")
    );
  }

  // Intervention blocks
  const blocks = g
    .selectAll(".block")
    .data(interventions)
    .enter()
    .append("g")
    .attr("class", "intervention-group");

  // Add the main rectangles for interventions
  blocks
    .append("rect")
    .attr("class", "block")
    .attr("x", (d) => xScale(d.initialYear))
    .attr("y", (d, i) => {
      if (interventions.length === 1) {
        return innerHeight / 2 - maxBlockHeight / 2; // Center vertically
      } else {
        return yScale(i);
      }
    })
    .attr(
      "width",
      (d) => xScale(d.initialYear + d.duration) - xScale(d.initialYear)
    )
    .attr("height", (d, i) => Math.min(yScale.bandwidth(), maxBlockHeight))
    .attr("fill", "#3388FF")
    .on("click", function (event, d) {
      // Clear any existing selection
      g.selectAll(".block").classed("highlight", false);

      // Highlight the clicked block
      d3.select(this).classed("highlight", true);

      // Trigger the click callback
      if (onClick) {
        const index = interventions.indexOf(d);
        onClick(index);
      }

      // Stop event propagation to prevent background click
      event.stopPropagation();
    });

  // Add text labels to the intervention blocks
  blocks
    .append("text")
    .attr("class", "block-label")
    .attr(
      "x",
      (d) =>
        xScale(d.initialYear) +
        (xScale(d.initialYear + d.duration) - xScale(d.initialYear)) / 2
    ) // Center horizontally
    .attr("y", (d, i) => {
      if (interventions.length === 1) {
        return innerHeight / 2; // Center vertically for single intervention
      } else {
        return yScale(i) + Math.min(yScale.bandwidth(), maxBlockHeight) / 2; // Center in block
      }
    })
    .attr("text-anchor", "middle") // Center text horizontally
    .attr("dominant-baseline", "middle") // Center text vertically
    .attr("fill", "white")
    .attr("pointer-events", "none")
    .text((d) => computeTechLabel(d))
    .style("font-size", "12px")
    .each(function (d) {
      // Truncate text if too long for block width
      const blockWidth =
        xScale(d.initialYear + d.duration) - xScale(d.initialYear);
      const text = d3.select(this);
      let textLength = this.getComputedTextLength();
      let textContent = text.text();
      while (textLength > blockWidth - 10 && textContent.length > 0) {
        textContent = textContent.slice(0, -1);
        text.text(textContent + "...");
        textLength = this.getComputedTextLength();
      }
    });

  // Resize handles
  blocks
    .append("rect")
    .attr("class", "resize-handle")
    .attr("x", (d) => xScale(d.initialYear + d.duration) - 4)
    .attr("y", (d, i) => {
      if (interventions.length === 1) {
        return innerHeight / 2 - maxBlockHeight / 2; // Same as the block's y position
      } else {
        return yScale(i);
      }
    })
    .attr("width", 8)
    .attr("height", (d, i) => Math.min(yScale.bandwidth(), maxBlockHeight))
    .attr("fill", "transparent")
    .attr("cursor", "ew-resize");

  // Define drag behavior
  const blockDrag = d3
    .drag()
    .on("start", function (event, d) {
      const blockX = xScale(d.initialYear);
      d.dragOffset = event.x - blockX;
    })
    .on("drag", function (event, d) {
      // Calculate new position with constraints
      const adjustedX = event.x - d.dragOffset;
      const newYear = Math.round(xScale.invert(adjustedX));
      const [minAllowedYear, maxAllowedYear] = xScale.domain();

      const constrainedYear = Math.max(
        minAllowedYear,
        Math.min(maxAllowedYear - d.duration, newYear)
      );

      d.initialYear = constrainedYear;
      const group = d3.select(this.parentNode);

      // Update block position
      group.select(".block").attr("x", xScale(d.initialYear));

      // Update text position - centered
      group
        .select(".block-label")
        .attr(
          "x",
          xScale(d.initialYear) +
            (xScale(d.initialYear + d.duration) - xScale(d.initialYear)) / 2
        );

      group
        .select(".resize-handle")
        .attr("x", xScale(d.initialYear + d.duration) - 4);

      if (onChange) {
        onChange([...interventions]);
      }
    });

  // Define resize behavior for handles
  const resizeDrag = d3.drag().on("drag", function (event, d) {
    const newX = event.x;
    const [minAllowedYear, maxAllowedYear] = xScale.domain();

    const newDuration = Math.max(
      1,
      Math.round(xScale.invert(newX) - d.initialYear)
    );
    const constrainedDuration = Math.min(
      maxAllowedYear - d.initialYear,
      newDuration
    );

    d.duration = constrainedDuration;
    const group = d3.select(this.parentNode);

    // Update block width
    group
      .select(".block")
      .attr(
        "width",
        xScale(d.initialYear + d.duration) - xScale(d.initialYear)
      );

    // Update text position - centered
    group
      .select(".block-label")
      .attr(
        "x",
        xScale(d.initialYear) +
          (xScale(d.initialYear + d.duration) - xScale(d.initialYear)) / 2
      );

    d3.select(this).attr("x", xScale(d.initialYear + d.duration) - 4);

    if (onChange) {
      onChange([...interventions]);
    }
  });

  // Apply drag behaviors
  blocks.selectAll(".block").call(blockDrag);
  blocks.selectAll(".resize-handle").call(resizeDrag);

  // ---------------------- TOOLTIP ---------------------- //
  function updateTooltip(d) {
    tooltipSvg.selectAll("*").remove();

    // Add title
    tooltipSvg
      .append("text")
      .attr("x", 10)
      .attr("y", 20)
      .text(computeTechLabel(d))
      .style("font-weight", "bold");

    // Add details
    tooltipSvg
      .append("text")
      .attr("x", 10)
      .attr("y", 40)
      .text(`Start: ${d.initialYear}`);

    tooltipSvg
      .append("text")
      .attr("x", 10)
      .attr("y", 60)
      .text(`Duration: ${d.duration} years`);

    // Add mini budget graph if budget data exists
    if (d.yearlyBudgets) {
      // Format function for large numbers
      const formatBudget = (value) => {
        if (value >= 1e9) return (value / 1e9).toFixed(1) + "B";
        if (value >= 1e6) return (value / 1e6).toFixed(1) + "M";
        if (value >= 1e3) return (value / 1e3).toFixed(1) + "k";
        return value.toString();
      };

      const graphMargin = { top: 70, right: 10, bottom: 20, left: 40 };
      const graphWidth = 180 - graphMargin.left - graphMargin.right;
      const graphHeight = 40;

      const graphG = tooltipSvg
        .append("g")
        .attr("transform", `translate(${graphMargin.left},${graphMargin.top})`);

      const xScale = d3
        .scaleLinear()
        .domain([d.initialYear, d.initialYear + d.duration - 1])
        .range([0, graphWidth]);

      const yScale = d3
        .scaleLinear()
        .domain([0, d3.max(d.yearlyBudgets)])
        .range([graphHeight, 0]);

      // Add budget line
      const line = d3
        .line()
        .x((_, i) => xScale(d.initialYear + i))
        .y((d) => yScale(d));

      graphG
        .append("path")
        .datum(d.yearlyBudgets)
        .attr("fill", "none")
        .attr("stroke", "#3388FF")
        .attr("stroke-width", 1.5)
        .attr("d", line);

      // Add x-axis with year labels
      const tickCount = Math.min(d.duration, 5); // Max 5 ticks
      const tickStep = Math.ceil(d.duration / tickCount);

      graphG
        .append("g")
        .attr("transform", `translate(0,${graphHeight})`)
        .call(
          d3
            .axisBottom(xScale)
            .ticks(tickCount)
            .tickValues(
              d3.range(d.initialYear, d.initialYear + d.duration, tickStep)
            )
            .tickFormat(d3.format("d"))
        )
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");

      graphG
        .append("g")
        .call(d3.axisLeft(yScale).ticks(3).tickFormat(formatBudget));
    }
  }

  // Apply tooltip behavior if enabled
  function applyTooltipBehavior() {
    if (areTooltipsEnabled) {
      blocks
        .selectAll(".block")
        .on("mouseover", function (event, d) {
          tooltip.style("opacity", 1);
          updateTooltip(d);
        })
        .on("mousemove", function (event) {
          tooltip
            .style("left", event.pageX + 10 + "px")
            .style("top", event.pageY - 10 + "px");
        })
        .on("mouseout", function () {
          tooltip.style("opacity", 0);
        });
    } else {
      blocks
        .selectAll(".block")
        .on("mouseover", null)
        .on("mousemove", null)
        .on("mouseout", null);
    }
  }

  // Initial application of tooltip behavior based on initial state
  applyTooltipBehavior();

  // Method to toggle tooltips on/off
  function toggleTooltips(enabled) {
    areTooltipsEnabled = enabled;
    applyTooltipBehavior();
    return svg.node(); // Return the SVG node for chaining
  }

  // Check if data is empty
  if (interventions.length === 0) {
    svg
      .append("text")
      .attr("class", "no-data-message")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .text("Add new intervention to start");
  }

  // ---------------------- STYLES ---------------------- //

  // Add CSS styles
  svg.append("style").text(`
    .resize-handle {
      pointer-events: none;
    }
    .resize-handle.active {
      pointer-events: all;
    }
    .resize-handle:hover {
      stroke: #666;
      stroke-width: 1px;
    }
    .block {
      stroke: none;
    }
    .block-label {
      font-family: sans-serif;
      user-select: none;
    }
    .block.highlight {
      stroke: orange !important;
      stroke-width: 3px !important;
    }
    }
    .tooltip {
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .no-data-message {
      font-family: sans-serif;
      font-size: 16px;
      fill: #999;
    }
    .selection-area {
      pointer-events: none;
    }
  `);

  // Return the SVG node with added methods
  const svgNode = svg.node();
  svgNode.toggleTooltips = toggleTooltips;
  return svgNode;
}
