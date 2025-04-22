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
    if (typeof intervention.tech !== "string") {
      throw new Error(`Intervention at index ${i} is missing a 'tech' string`);
    }
    if (typeof intervention.initialYear !== "number") {
      throw new Error(
        `Intervention '${intervention.tech}' is missing an 'initialYear' number`
      );
    }
    if (typeof intervention.duration !== "number") {
      throw new Error(
        `Intervention '${intervention.tech}' is missing a 'duration' number`
      );
    }
    if (intervention.yearlyBudgets) {
      if (!Array.isArray(intervention.yearlyBudgets)) {
        throw new Error(
          `Intervention '${intervention.tech}' has a 'yearlyBudgets' property that is not an array`
        );
      }
      if (intervention.yearlyBudgets.length !== intervention.duration) {
        throw new Error(
          `Intervention '${intervention.tech}' has a 'yearlyBudgets' array with the wrong length`
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

  // Fixed row height for interventions
  const rowHeight = maxBlockHeight + 5; // 5px padding

  // Calculate total content height based on number of interventions
  const contentHeight = interventions.length * rowHeight;

  // Flag to determine if scrolling is needed
  const needsScrolling = contentHeight > innerHeight;

  // Visible range for scrolling
  let scrollPosition = 0;
  const visibleRows = Math.floor(innerHeight / rowHeight);

  // Create scales for x-axis (years) and y-axis (intervention rows)
  const xScale = d3
    .scaleLinear()
    .domain([minYear - 1, maxYear + 1]) // Add buffer year on each side
    .range([0, innerWidth]);

  // Modified yScale to handle potentially larger range of interventions
  const yScale = d3
    .scalePoint()
    .domain(interventions.map((_, i) => i))
    .range([0, needsScrolling ? contentHeight : innerHeight])
    .padding(0.1);

  // Create container elements - main SVG and the scrollable area
  const container = d3
    .create("div")
    .style("position", "relative")
    .style("width", width + "px")
    .style("height", height + "px")
    .style("overflow", "hidden");

  const svg = container
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Create a clip path to ensure content doesn't render outside the visible area
  svg
    .append("defs")
    .append("clipPath")
    .attr("id", "timeline-clip")
    .append("rect")
    .attr("width", innerWidth)
    .attr("height", innerHeight);

  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("pointer-events", "none");

  // Track tooltip state
  let areTooltipsEnabled = tooltipsEnabled;
  // add variables to track multi-selection
  let selectedIndices = [];
  let lastClickedIndex = null;

  // Create main group element with margins
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Create a clipped content group for the scrollable content
  const contentGroup = g
    .append("g")
    .attr("clip-path", "url(#timeline-clip)")
    .attr("class", "scrollable-content");

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
      selectedIndices = [];
      lastClickedIndex = null;
      contentGroup.selectAll(".block").classed("highlight", false);
      if (onClick) {
        onClick(null); // Pass null to indicate deselection
      }
    });

  // Create a scroll function to update visible elements
  function updateScroll() {
    // Update the transform of the content group based on scroll position
    contentGroup.attr("transform", `translate(0, ${-scrollPosition})`);

    // Update which blocks are visible
    contentGroup.selectAll(".intervention-group").style("display", (d, i) => {
      const yPos = yScale(i);
      return yPos >= scrollPosition - rowHeight &&
        yPos <= scrollPosition + innerHeight
        ? "block"
        : "none";
    });
  }

  // Add scrollbar if needed
  if (needsScrolling) {
    const scrollbar = container
      .append("div")
      .style("position", "absolute")
      .style("right", "0")
      .style("top", margin.top + "px")
      .style("width", "10px")
      .style("height", innerHeight + "px")
      .style("background", "#f0f0f0")
      .style("border-radius", "5px");

    const scrollThumb = scrollbar
      .append("div")
      .style("position", "absolute")
      .style("width", "8px")
      .style("left", "1px")
      .style("background", "#aaa")
      .style("border-radius", "4px")
      .style("cursor", "pointer");

    // Calculate scrollbar thumb height and position
    const thumbHeight = Math.max(
      30,
      (innerHeight / contentHeight) * innerHeight
    );
    scrollThumb.style("height", thumbHeight + "px").style("top", "0px");

    // Add scrolling with mouse wheel
    container.on("wheel", function (event) {
      event.preventDefault();
      const delta = event.deltaY;
      scrollPosition = Math.max(
        0,
        Math.min(contentHeight - innerHeight, scrollPosition + delta)
      );
      const thumbPos =
        (scrollPosition / (contentHeight - innerHeight)) *
        (innerHeight - thumbHeight);
      scrollThumb.style("top", thumbPos + "px");
      updateScroll();
    });

    // Add drag behavior for the scrollbar thumb
    const thumbDrag = d3.drag().on("drag", function (event) {
      const thumbPos = Math.max(
        0,
        Math.min(
          innerHeight - thumbHeight,
          parseFloat(scrollThumb.style("top")) + event.dy
        )
      );
      scrollThumb.style("top", thumbPos + "px");
      scrollPosition =
        (thumbPos / (innerHeight - thumbHeight)) *
        (contentHeight - innerHeight);
      updateScroll();
    });

    scrollThumb.call(thumbDrag);
  }

  // Intervention blocks - now added to the contentGroup
  const blocks = contentGroup
    .selectAll(".intervention-group")
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
        return yScale(i) - maxBlockHeight / 2; // Center around the scale point
      }
    })
    .attr(
      "width",
      (d) => xScale(d.initialYear + d.duration) - xScale(d.initialYear)
    )
    .attr("height", maxBlockHeight)
    .attr("fill", "#3388FF")
    .on("click", function (event, d) {
      const index = interventions.indexOf(d);
      if (event.shiftKey && lastClickedIndex !== null) {
        const [start, end] = [lastClickedIndex, index].sort((a, b) => a - b);
        selectedIndices = [];
        for (let i = start; i <= end; i++) selectedIndices.push(i);
      } else if (event.shiftKey) {
        if (selectedIndices.includes(index)) {
          selectedIndices = selectedIndices.filter((i) => i !== index);
        } else {
          selectedIndices.push(index);
        }
        lastClickedIndex = index;
      } else {
        selectedIndices = [index];
        lastClickedIndex = index;
      }
      contentGroup
        .selectAll(".block")
        .classed("highlight", (_, i) => selectedIndices.includes(i));
      if (onClick) {
        onClick(
          selectedIndices.length === 1
            ? selectedIndices[0]
            : [...selectedIndices]
        );
      }
      event.stopPropagation();
    });

  // Update text labels positioning for the intervention blocks
  blocks
    .append("text")
    .attr("class", "block-label")
    .attr(
      "x",
      (d) =>
        xScale(d.initialYear) +
        (xScale(d.initialYear + d.duration) - xScale(d.initialYear)) / 2
    )
    .attr("y", (d, i) => {
      if (interventions.length === 1) {
        return innerHeight / 2;
      } else {
        return yScale(i); // Center on the point
      }
    })
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("fill", "white")
    .attr("pointer-events", "none")
    .text((d) => d.tech)
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

  // Update resize handles positioning
  blocks
    .append("rect")
    .attr("class", "resize-handle")
    .attr("x", (d) => xScale(d.initialYear + d.duration) - 4)
    .attr("y", (d, i) => {
      if (interventions.length === 1) {
        return innerHeight / 2 - maxBlockHeight / 2;
      } else {
        return yScale(i) - maxBlockHeight / 2;
      }
    })
    .attr("width", 8)
    .attr("height", maxBlockHeight)
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
    tooltip.selectAll("*").remove();

    // Add title
    tooltip.append("div").style("font-weight", "bold").text(d.tech);

    // Add details
    tooltip.append("div").text(`Start: ${d.initialYear}`);
    tooltip.append("div").text(`Duration: ${d.duration} years`);

    // Add mini budget graph if budget data exists
    if (d.yearlyBudgets) {
      // Format function for large numbers
      const formatBudget = (value) => {
        if (value >= 1e9) return (value / 1e9).toFixed(1) + "B";
        if (value >= 1e6) return (value / 1e6).toFixed(1) + "M";
        if (value >= 1e3) return (value / 1e3).toFixed(1) + "k";
        return value.toString();
      };

      const graphMargin = { top: 10, right: 10, bottom: 20, left: 40 };
      const graphWidth = 180 - graphMargin.left - graphMargin.right;
      const graphHeight = 40;

      const graphSvg = tooltip
        .append("svg")
        .attr("width", graphWidth + graphMargin.left + graphMargin.right)
        .attr("height", graphHeight + graphMargin.top + graphMargin.bottom);

      const graphG = graphSvg
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
    .resize-handle:hover {
      stroke: #666;
      stroke-width: 1px;
    }
    .block-label {
      font-family: sans-serif;
      user-select: none;
    }
    .highlight {
      stroke: orange;
      stroke-width: 3px;
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

  // Return the container node with added methods
  const containerNode = container.node();
  containerNode.toggleTooltips = toggleTooltips;

  // Add a method to programmatically scroll
  containerNode.scrollTo = function (position) {
    if (!needsScrolling) return this;
    scrollPosition = Math.max(
      0,
      Math.min(contentHeight - innerHeight, position)
    );
    const thumbHeight = Math.max(
      30,
      (innerHeight / contentHeight) * innerHeight
    );
    const thumbPos =
      (scrollPosition / (contentHeight - innerHeight)) *
      (innerHeight - thumbHeight);
    container.select("div > div").style("top", thumbPos + "px");
    updateScroll();
    return this;
  };

  return containerNode;
}
