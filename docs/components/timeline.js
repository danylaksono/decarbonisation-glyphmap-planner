import * as d3 from "npm:d3";

export function createTimelineInterface(
  interventions,
  onChange,
  onClick,
  width = 800,
  height = 400
) {
  // Set up dimensions and margins for the SVG
  const margin = { top: 20, right: 30, bottom: 30, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Calculate the year range from our data
  const minYear = Math.min(...interventions.map((d) => d.initial_year));
  const maxYear = Math.max(
    ...interventions.map((d) => d.initial_year + d.duration)
  );

  // Create scales for x-axis (years) and y-axis (intervention rows)
  const xScale = d3
    .scaleLinear()
    .domain([minYear - 1, maxYear + 1]) // Add buffer year on each side
    .range([0, innerWidth]);

  const yScale = d3
    .scaleBand()
    .domain(interventions.map((_, i) => i))
    .range([0, innerHeight])
    .padding(0.1);

  // Create SVG container
  const svg = d3.create("svg").attr("width", width).attr("height", height);

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
    .call(d3.axisBottom(xScale).tickFormat(d3.format("d")));

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
    .attr("x", (d) => xScale(d.initial_year))
    .attr("y", (d, i) => yScale(i))
    .attr(
      "width",
      (d) => xScale(d.initial_year + d.duration) - xScale(d.initial_year)
    )
    .attr("height", yScale.bandwidth())
    .attr("fill", "steelblue")
    .on("click", function (event, d) {
      g.selectAll(".block").classed("highlight", false);
      // Highlight the clicked block
      d3.select(this).classed("highlight", true);
      // Trigger the click callback with the full object
      if (onClick) {
        onClick(d);
      }
    });

  // Add text labels to the intervention blocks
  blocks
    .append("text")
    .attr("class", "block-label")
    .attr("x", (d) => xScale(d.initial_year) + 5)
    .attr("y", (d, i) => yScale(i) + yScale.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("fill", "white")
    .attr("pointer-events", "none")
    .text((d) => d.tech.name)
    .style("font-size", "12px");

  // Resize handles
  blocks
    .append("rect")
    .attr("class", "resize-handle")
    .attr("x", (d) => xScale(d.initial_year + d.duration) - 4)
    .attr("y", (d, i) => yScale(i))
    .attr("width", 8)
    .attr("height", yScale.bandwidth())
    .attr("fill", "transparent")
    .attr("cursor", "ew-resize");

  // Define drag behavior
  const blockDrag = d3
    .drag()
    .on("start", function (event, d) {
      const blockX = xScale(d.initial_year);
      d.dragOffset = event.x - blockX;
    })
    .on("drag", function (event, d) {
      // Calculate new position with constraints
      // const mouseX = event.x;
      // const newYear = Math.round(xScale.invert(mouseX));
      const adjustedX = event.x - d.dragOffset;
      const newYear = Math.round(xScale.invert(adjustedX));
      const [minAllowedYear, maxAllowedYear] = xScale.domain();

      const constrainedYear = Math.max(
        minAllowedYear,
        Math.min(maxAllowedYear - d.duration, newYear)
      );

      // Update intervention year
      d.initial_year = constrainedYear;
      const group = d3.select(this.parentNode);

      // Update visual elements
      group.select(".block").attr("x", xScale(d.initial_year));
      group.select(".block-label").attr("x", xScale(d.initial_year) + 5);
      group
        .select(".resize-handle")
        .attr("x", xScale(d.initial_year + d.duration) - 4);

      // Trigger onChange with updated intervention
      if (onChange) {
        onChange([...interventions]); // Create a new array reference with current values
      }
    });

  // Define resize behavior for handles
  const resizeDrag = d3.drag().on("drag", function (event, d) {
    const newX = event.x;
    const [minAllowedYear, maxAllowedYear] = xScale.domain();

    // Calculate and constrain new duration
    const newDuration = Math.max(
      1,
      Math.round(xScale.invert(newX) - d.initial_year)
    );
    const constrainedDuration = Math.min(
      maxAllowedYear - d.initial_year,
      newDuration
    );

    // Update duration
    d.duration = constrainedDuration;

    // Update block width and handle position
    d3.select(this.parentNode)
      .select(".block")
      .attr(
        "width",
        xScale(d.initial_year + d.duration) - xScale(d.initial_year)
      );

    d3.select(this).attr("x", xScale(d.initial_year + d.duration) - 4);

    // Trigger onChange with updated intervention
    if (onChange) {
      onChange([...interventions]); // Create a new array reference with current values
    }
  });

  // Apply drag behaviors
  blocks.selectAll(".block").call(blockDrag);
  blocks.selectAll(".resize-handle").call(resizeDrag);

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
  `);

  // Return
  return svg.node();
}

// import * as Plot from "npm:@observablehq/plot";

// export function timeline(events, {width, height} = {}) {
//   return Plot.plot({
//     width,
//     height,
//     marginTop: 30,
//     x: {nice: true, label: null, tickFormat: ""},
//     y: {axis: null},
//     marks: [
//       Plot.ruleX(events, {x: "year", y: "y", markerEnd: "dot", strokeWidth: 2.5}),
//       Plot.ruleY([0]),
//       Plot.text(events, {x: "year", y: "y", text: "name", lineAnchor: "bottom", dy: -10, lineWidth: 10, fontSize: 12})
//     ]
//   });
// }
