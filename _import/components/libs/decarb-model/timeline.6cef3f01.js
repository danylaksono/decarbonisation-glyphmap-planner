import * as d3 from "../../../../_npm/d3@7.9.0/_esm.js";
import _ from "../../../../_npm/lodash@4.17.21/_esm.js";

export function createTimelineInterface(
  interventions,
  onChange,
  onClick,
  width = 800,
  height = 400,
  tooltipsEnabled = false
) {
  // validate interventions
  // Remove duplicate interventions based on deep equality
  // interventions = _.uniqWith(interventions, _.isEqual);

  // Make sure that there are no duplicates by modelId
  interventions = _.uniqBy(interventions, (d) => d.modelId);

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
    if (typeof intervention.duration !== "number" || intervention.duration <= 0) {
      throw new Error(
        `Intervention '${
          intervention.tech || intervention.technologies.join(", ")
        }' must have a positive 'duration' number`
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
      // Allow yearlyBudgets to be shorter than duration (will be extended during resize)
      // or longer than duration (will be truncated during resize)
      if (intervention.yearlyBudgets.length === 0) {
        throw new Error(
          `Intervention '${
            intervention.tech || intervention.technologies.join(", ")
          }' has an empty 'yearlyBudgets' array`
        );
      }
      // If yearlyBudgets exists but doesn't match duration, we'll handle it during resize
      // For now, just ensure it's not empty
    }
  });

  // Helper function to synchronize yearlyBudgets with duration
  function synchronizeYearlyBudgets(intervention) {
    if (intervention.yearlyBudgets) {
      if (intervention.yearlyBudgets.length > intervention.duration) {
        // Truncate if longer
        intervention.yearlyBudgets = intervention.yearlyBudgets.slice(0, intervention.duration);
      } else if (intervention.yearlyBudgets.length < intervention.duration) {
        // Extend if shorter
        const lastValue = intervention.yearlyBudgets[intervention.yearlyBudgets.length - 1] || 0;
        while (intervention.yearlyBudgets.length < intervention.duration) {
          intervention.yearlyBudgets.push(lastValue);
        }
      }
    }
  }

  // Synchronize all interventions after validation
  interventions.forEach(synchronizeYearlyBudgets);

  // Set up dimensions and margins for the SVG
  const margin = { top: 20, right: 30, bottom: 30, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Calculate the year range from our data
  const minYear = interventions.length > 0 
    ? Math.min(...interventions.map((d) => d.initialYear))
    : new Date().getFullYear();
  const maxYear = interventions.length > 0
    ? Math.max(...interventions.map((d) => d.initialYear + d.duration))
    : new Date().getFullYear() + 10;

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
    .style("pointer-events", "none")
    .style("z-index", "1000");

  const tooltipSvg = tooltip
    .append("svg")
    .attr("width", 200)
    .attr("height", 150);

  // Track tooltip state
  let areTooltipsEnabled = tooltipsEnabled;
  let currentTooltipData = null; // Track current tooltip data to prevent unnecessary updates
  let tooltipHideTimeout = null; // Track hide timeout

  // Create main group element with margins
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Remove any existing x-axis
  g.selectAll(".x-axis").remove();

  // Add x-axis with year labels (make labels clickable)
  const xAxisG = g
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(xScale)
        .tickValues(
          d3.range(Math.ceil(minYear - 1), Math.floor(maxYear + 1) + 1)
        )
        .tickFormat(d3.format("d"))
    );

  // Add click interaction to x-axis labels
  let selectedYear = null;
  function highlightYearLabel(year) {
    xAxisG.selectAll(".tick text").classed("year-glow", (d) => +d === year);
    
    // Highlight interventions that are active in the selected year
    g.selectAll(".block").classed("year-active", (d) => {
      if (year === null) return false;
      return d.initialYear <= year && year < d.initialYear + d.duration;
    });
  }

  xAxisG
    .selectAll(".tick text")
    .style("cursor", "pointer")
    .on("click", function (event, d) {
      // Hide tooltip in case it is still visible from a previous hover
      hideTooltip();

      selectedYear = +d;
      highlightYearLabel(selectedYear);
      if (onClick) onClick(selectedYear);
      event.stopPropagation();
    });

  // Remove highlight if background is clicked
  g.select(".background").on("click", function () {
    // Clear selections and highlighted year
    selectedYear = null;
    highlightYearLabel(null);
    selectedIndexes = [];
    g.selectAll(".block").classed("highlight", false);

    // Hide any visible tooltip when clicking on empty space
    hideTooltip();

    if (onClick) onClick(null);
  });

  g.append("rect")
    .attr("class", "background")
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("fill", "transparent");

  // Ensure style element exists before trying to modify it
  if (svg.select("style").empty()) {
    svg.append("style").text("");
  }

  // Add drag-to-select functionality

  // Multi-select state
  let selectedIndexes = [];
  let selectedModelIds = []; // Store modelIds for persistence

  // Block click handler for multi-select
  function blockClickHandler(event, d) {
    // Ensure any visible tooltip is hidden once the user makes a selection
    hideTooltip();

    const index = interventions.indexOf(d);
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      // Toggle selection
      if (selectedIndexes.includes(index)) {
        selectedIndexes = selectedIndexes.filter((i) => i !== index);
        selectedModelIds = selectedModelIds.filter((id) => id !== d.modelId);
        d3.select(this).classed("highlight", false);
      } else {
        selectedIndexes.push(index);
        selectedModelIds.push(d.modelId);
        d3.select(this).classed("highlight", true);
      }
    } else {
      // Single select
      selectedIndexes = [index];
      selectedModelIds = [d.modelId];
      g.selectAll(".block").classed("highlight", false);
      d3.select(this).classed("highlight", true);
    }
    // Call the onClick callback
    if (onClick) {
      if (selectedIndexes.length === 1) {
        onClick(selectedIndexes[0]);
      } else if (selectedIndexes.length > 1) {
        onClick([...selectedIndexes]);
      } else {
        onClick(null);
      }
    }
    event.stopPropagation();
  }

  // Function to restore selections after data changes
  function restoreSelections() {
    selectedIndexes = [];
    g.selectAll(".block").classed("highlight", false);

    // Restore selections based on modelIds (safer than nth-child which can be offset by other groups)
    g.selectAll(".intervention-group").each(function (di, i) {
      if (selectedModelIds.includes(di.modelId)) {
        selectedIndexes.push(i);
        d3.select(this).select(".block").classed("highlight", true);
      }
    });
  }

  // Debounced onChange callback
  let onChangeTimeout;
  function debouncedOnChange() {
    clearTimeout(onChangeTimeout);
    onChangeTimeout = setTimeout(() => {
      if (onChange) {
        onChange([...interventions]);
      }
    }, 100); // 100ms debounce
  }

  // Clicking the background clears selection
  g.select(".background").on("click", function () {
    selectedIndexes = [];
    g.selectAll(".block").classed("highlight", false);
    if (onClick) onClick(null);
  });

  // Helper function to compute the intervention label
  function computeTechLabel(d) {
    return (
      d.tech ||
      (Array.isArray(d.technologies) ? d.technologies.join(", ") : "Unknown")
    );
  }

  // Helper function to get color based on technology
  function getTechnologyColor(d) {
    const techLabel = (computeTechLabel(d) || "").toLowerCase();
    if (techLabel.includes(",")) {
      return "#808080"; // Grey for combinations
    }
    if (techLabel.includes("ashp")) {
      return "#4682B4"; // Navy blue for Air Source Heat Pump
    }
    if (techLabel.includes("gshp")) {
      return "#9B59B6"; // Purple for Ground Source Heat Pump
    }
    if (techLabel.includes("pv")) {
      return "#27AE60"; // Green for Photovoltaic
    }
    return "#7A93D1"; // Default color
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
    .attr("width", (d) => xScale(d.initialYear + d.duration) - xScale(d.initialYear))
    .attr("height", (d, i) => Math.min(yScale.bandwidth(), maxBlockHeight))
    .attr("fill", (d) => getTechnologyColor(d))
    .on("click", blockClickHandler);

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
      let textContent = text.text();
      
      // More efficient text truncation
      const maxChars = Math.floor((blockWidth - 10) / 8); // Approximate char width
      if (textContent.length > maxChars) {
        text.text(textContent.substring(0, maxChars - 3) + "...");
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
    .attr("fill", "rgba(255, 255, 255, 0.3)")
    .attr("stroke", "rgba(0, 0, 0, 0.2)")
    .attr("stroke-width", 1)
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

      // Ensure yearlyBudgets is synchronized after any changes
      synchronizeYearlyBudgets(d);

      debouncedOnChange();
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

    // Handle yearlyBudgets array when duration changes
    if (d.yearlyBudgets && d.yearlyBudgets.length !== constrainedDuration) {
      if (constrainedDuration > d.yearlyBudgets.length) {
        // Extend the array with the last value or zero
        const lastValue = d.yearlyBudgets[d.yearlyBudgets.length - 1] || 0;
        while (d.yearlyBudgets.length < constrainedDuration) {
          d.yearlyBudgets.push(lastValue);
        }
      } else {
        // Truncate the array
        d.yearlyBudgets = d.yearlyBudgets.slice(0, constrainedDuration);
      }
    }

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

    debouncedOnChange();
  });

  // Apply drag behaviors
  blocks.selectAll(".block").call(blockDrag);
  blocks.selectAll(".resize-handle").call(resizeDrag);

  // ---------------------- TOOLTIP ---------------------- //
  function updateTooltip(d) {
    // Only update if data has changed
    if (currentTooltipData === d) {
      return;
    }
    
    currentTooltipData = d;
    
    // Clear existing content
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
        .attr("stroke", "#7A93D1")
        .attr("stroke-width", 1.5)
        .attr("d", line);

      // Add x-axis with year labels
      const tickCount = Math.min(d.duration, 5); // Max 5 ticks
      const tickYears = d3.range(d.initialYear, d.initialYear + d.duration);
      if (tickYears[tickYears.length - 1] !== d.initialYear + d.duration - 1) {
        tickYears.push(d.initialYear + d.duration - 1);
      }

      graphG
        .append("g")
        .attr("transform", `translate(0,${graphHeight})`)
        .call(
          d3
            .axisBottom(xScale)
            .ticks(tickCount)
            .tickValues(tickYears)
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

  function hideTooltip() {
    // Clear any existing timeout
    if (tooltipHideTimeout) {
      clearTimeout(tooltipHideTimeout);
    }
    
    tooltipHideTimeout = setTimeout(() => {
      tooltip.style("opacity", 0);
      currentTooltipData = null;
      tooltipHideTimeout = null;
    }, 100); // Small delay to prevent flickering
  }

  function showTooltip() {
    // Clear any hide timeout
    if (tooltipHideTimeout) {
      clearTimeout(tooltipHideTimeout);
      tooltipHideTimeout = null;
    }
  }

  // Apply tooltip behavior if enabled
  function applyTooltipBehavior() {
    if (areTooltipsEnabled) {
      blocks
        .selectAll(".block")
        .on("mouseover", function (event, d) {
          showTooltip();
          tooltip.style("opacity", 1);
          updateTooltip(d);
        })
        .on("mousemove", function (event) {
          const tooltipWidth = 200;
          const tooltipHeight = 150;
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          let left = event.pageX + 10;
          let top = event.pageY - 10;
          
          // Prevent tooltip from going off-screen
          if (left + tooltipWidth > viewportWidth) {
            left = event.pageX - tooltipWidth - 10;
          }
          if (top + tooltipHeight > viewportHeight) {
            top = event.pageY - tooltipHeight - 10;
          }
          
          tooltip
            .style("left", left + "px")
            .style("top", top + "px");
        })
        .on("mouseout", function () {
          hideTooltip();
        });
    } else {
      blocks
        .selectAll(".block")
        .on("mouseover", null)
        .on("mousemove", null)
        .on("mouseout", null);
      hideTooltip(); // Ensure tooltip is hidden when disabled
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

  // Method to update timeline with new data while preserving selections
  function updateData(newInterventions) {
    // Store current selections
    const currentSelectedModelIds = [...selectedModelIds];
    
    // Update the interventions array
    interventions.length = 0;
    interventions.push(...newInterventions);
    
    // Re-render the timeline
    // This would require a more complex update pattern, but for now we'll just restore selections
    restoreSelections();
    
    return svg.node();
  }

  // Method to refresh the timeline (useful when data changes externally)
  function refreshTimeline() {
    // Hide any active tooltip
    hideTooltip();
    
    // Recalculate scales
    const newMinYear = interventions.length > 0 
      ? Math.min(...interventions.map((d) => d.initialYear))
      : new Date().getFullYear();
    const newMaxYear = interventions.length > 0
      ? Math.max(...interventions.map((d) => d.initialYear + d.duration))
      : new Date().getFullYear() + 10;
    
    // Update scales
    xScale.domain([newMinYear - 1, newMaxYear + 1]);
    yScale.domain(interventions.map((_, i) => i));
    
    // Update x-axis
    xAxisG.call(
      d3
        .axisBottom(xScale)
        .tickValues(
          d3.range(Math.ceil(newMinYear - 1), Math.floor(newMaxYear + 1) + 1)
        )
        .tickFormat(d3.format("d"))
    );
    
    // Restore selections
    restoreSelections();
    
    return svg.node();
  }

  // Method to cleanup tooltip and remove from DOM
  function cleanupTooltip() {
    hideTooltip();
    if (tooltip && !tooltip.empty()) {
      tooltip.remove();
    }
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
    .resize-handle.active {
      pointer-events: all;
    }
    .resize-handle:hover {
      stroke: #666 !important;
      stroke-width: 2px !important;
      fill: rgba(255, 255, 255, 0.6) !important;
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
    .block.year-active {
      stroke: #4CAF50 !important;
      stroke-width: 2px !important;
      filter: brightness(1.1);
    }
    .block.highlight.year-active {
      stroke: #FF9800 !important;
      stroke-width: 3px !important;
    }
    .year-glow {
      filter: url(#glow-filter);
      fill: #ff9800 !important;
      font-weight: bold;
      text-shadow: 0 0 8px #ff9800, 0 0 4px #fff;
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

  // Add SVG filter for glow effect
  svg.append("defs").html(`
    <filter id="glow-filter" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  `);

  // Return the SVG node with added methods
  const svgNode = svg.node();
  svgNode.toggleTooltips = toggleTooltips;
  svgNode.updateData = updateData;
  svgNode.refreshTimeline = refreshTimeline;
  svgNode.cleanupTooltip = cleanupTooltip;
  return svgNode;
}
