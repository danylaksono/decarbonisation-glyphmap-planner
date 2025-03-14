import { RadialGlyphOverall } from "./gridded-glyphmaps/glyph-designs/radialGlyphOverall.js";
import * as d3 from "npm:d3";

export function plotOverallPotential(
  data, // array of objects with keys as glyph variables
  colours, // array of colours for each glyph variable
  labels = {}, // object with labels for each glyph variable
  width = 1100,
  height = 800
) {
  const margin = { top: 80, right: 200, bottom: 200, left: 80 };

  const rgOptions = {
    showTooltips: true,
    showLegend: true,
    title: "Overall Decarbonisation Potentials",
    subtitle: "Aggregated building stock data in Oxford",
    labels: labels,
    tooltipFormatter: (value) => `${(value * 100).toFixed(1)}%`,
    width: width,
    height: height,
    backgroundColor: "#fafafa",
    titleColor: "#2c3e50",
    subtitleColor: "#7f8c8d",
    glyphOpacity: 0.85,
    glyphStrokeColor: "#ffffff",
    glyphStrokeWidth: 1.5,
    margin: margin,
    legendPosition: "right",
    titleAlignment: "middle",

    // Enhanced styling
    titleFont: "system-ui, sans-serif",
    subtitleFont: "system-ui, sans-serif",
    legendFont: "system-ui, sans-serif",
    titleFontSize: "24px",
    subtitleFontSize: "16px",
    legendFontSize: "14px",
    legendSpacing: 30,
    legendWidth: 180,
  };

  // Create Radial Glyph
  const rg = new RadialGlyphOverall(
    // glyphVariables.map((key) => glyphdata[key]),
    // glyphColours,
    data,
    colours,
    rgOptions
  );

  // Get the SVG element
  return rg.createSVG();
}

// Helper function to clean up tooltips when needed
function cleanupTooltips() {
  const tooltip = document.querySelector(".radial-glyph-tooltip");
  if (tooltip) {
    tooltip.remove();
  }
}

export function plotOverallTimeline(data, width = 900, height = 600) {
  const margin = { top: 30, right: 150, bottom: 120, left: 80 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Create container with message styling
  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.justifyContent = "center";
  container.style.fontFamily = "Arial, sans-serif";
  container.style.fontSize = "16px";
  container.style.color = "#666";

  // Comprehensive data validation
  if (!data) {
    container.textContent = "Please provide intervention data";
    return container;
  }

  if (!Array.isArray(data)) {
    container.textContent = "Data must be an array";
    return container;
  }

  if (data.length === 0) {
    container.textContent = "Please add intervention data to start";
    return container;
  }

  // Check if data has required properties
  const requiredFields = [
    "year",
    "budgetSpent",
    "buildingsIntervened",
    "totalCarbonSaved",
  ];
  const invalidItems = data.filter(
    (item) =>
      !item ||
      typeof item !== "object" ||
      !requiredFields.every((field) => {
        if (field === "year") {
          return Number.isInteger(item[field]);
        }
        return typeof item[field] === "number" && !isNaN(item[field]);
      })
  );

  if (invalidItems.length > 0) {
    container.textContent =
      "Invalid data format. Each data point must include: year (integer), budgetSpent (number), buildingsIntervened (number), and totalCarbonSaved (number)";
    return container;
  }

  // Clear container styles used for error messages
  container.style.display = "block";
  container.style.alignItems = "";
  container.style.justifyContent = "";
  container.style.fontFamily = "";
  container.style.fontSize = "";
  container.style.color = "";

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const chart = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const years = [...new Set(data.map((d) => d.year))].sort((a, b) => a - b);

  const longData = data.flatMap((d) => [
    { year: d.year, value: d.budgetSpent, category: "Budget Spent" },
    {
      year: d.year,
      value: d.buildingsIntervened,
      category: "Buildings Intervened",
    },
    { year: d.year, value: d.totalCarbonSaved, category: "Total Carbon Saved" },
  ]);

  const stackedMaxValue = data.reduce(
    (max, d) => Math.max(max, d.budgetSpent + d.totalCarbonSaved),
    0
  );

  const maxBuildingsIntervened = d3.max(data, (d) => d.buildingsIntervened);

  const xScale = d3
    .scaleBand()
    .domain(years)
    .range([0, innerWidth])
    .padding(0.1);

  const yScale = d3
    .scaleLinear()
    .domain([0, stackedMaxValue * 1.1])
    .range([innerHeight, 0]);

  const yScaleRight = d3
    .scaleLinear()
    .domain([0, maxBuildingsIntervened * 1.1])
    .range([innerHeight, 0]);

  const colorScale = d3
    .scaleOrdinal()
    .domain(["Budget Spent", "Buildings Intervened", "Total Carbon Saved"])
    .range([
      "#2C699A", // Darker blue for budget
      "#E63946", // Bright red for buildings line
      "#2D936C", // Forest green for carbon savings
    ]);

  const stack = d3
    .stack()
    .keys(["Budget Spent", "Total Carbon Saved"])
    .value((group, key) => group.find((d) => d.category === key)?.value || 0);

  // Group data safely
  const groupedData = Array.from(
    d3.group(longData, (d) => d.year),
    ([key, value]) => value
  );
  const stackedData = stack(groupedData);

  const area = d3
    .area()
    .x((d, i) => xScale(years[i]) + xScale.bandwidth() / 2)
    .y0((d) => yScale(d[0]))
    .y1((d) => yScale(d[1]))
    .curve(d3.curveMonotoneX);

  // Add areas
  chart
    .selectAll(".area")
    .data(stackedData)
    .join("path")
    .attr("class", "area")
    .attr("fill", (d) => colorScale(d.key))
    .attr("d", area)
    .attr("opacity", 0.8);

  // Add line
  const line = d3
    .line()
    .x((d) => xScale(d.year) + xScale.bandwidth() / 2)
    .y((d) => yScaleRight(d.buildingsIntervened))
    .curve(d3.curveMonotoneX);

  chart
    .append("path")
    .datum(data)
    .attr("class", "line")
    .attr("fill", "none")
    .attr("stroke", colorScale("Buildings Intervened"))
    .attr("stroke-width", 3.5)
    .attr("opacity", 0.9)
    .attr("d", line)
    .raise();

  // Add axes
  chart
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format("d")))
    .selectAll("text")
    .style("text-anchor", "middle");

  chart
    .append("g")
    .call(d3.axisLeft(yScale))
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -60)
    .attr("x", -innerHeight / 2)
    .attr("fill", "black")
    .attr("text-anchor", "middle")
    .text("Budget & Carbon Saved");

  chart
    .append("g")
    .attr("transform", `translate(${innerWidth}, 0)`)
    .call(d3.axisRight(yScaleRight))
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 50)
    .attr("x", -innerHeight / 2)
    .attr("fill", "black")
    .attr("text-anchor", "middle")
    .text("Buildings Intervened");

  // Add tooltip
  const tooltip = d3
    .select(container)
    .append("div")
    .style("position", "absolute")
    .style("visibility", "hidden")
    .style("background", "rgba(255, 255, 255, 0.9)")
    .style("border", "1px solid #ddd")
    .style("color", "#333")
    .style("padding", "8px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("box-shadow", "2px 2px 6px rgba(0, 0, 0, 0.1)");

  // Add invisible overlay for tooltip
  const overlay = chart.append("g").attr("class", "overlay");

  overlay
    .selectAll("rect")
    .data(years)
    .join("rect")
    .attr("x", (d) => xScale(d))
    .attr("y", 0)
    .attr("width", xScale.bandwidth())
    .attr("height", innerHeight)
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .on("mousemove", function (event, year) {
      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const yearData = data.find((d) => d.year === year);

      if (yearData) {
        tooltip
          .style("visibility", "visible")
          .style("left", `${mouseX + margin.left - 100}px`)
          .style("top", `${mouseY - 80}px`).html(`
              <strong>Year:</strong> ${year}<br>
              <span style="color: ${colorScale(
                "Budget Spent"
              )}"><strong>Budget Spent:</strong> ${yearData.budgetSpent.toFixed(
          2
        )}</span><br>
              <span style="color: ${colorScale(
                "Total Carbon Saved"
              )}"><strong>Carbon Saved:</strong> ${yearData.totalCarbonSaved.toFixed(
          2
        )}</span><br>
              <span style="color: ${colorScale(
                "Buildings Intervened"
              )}"><strong>Buildings:</strong> ${
          yearData.buildingsIntervened
        }</span>
            `);
      }
    })
    .on("mouseout", function () {
      tooltip.style("visibility", "hidden");
    });

  // Add legend
  const legend = svg
    .append("g")
    .attr(
      "transform",
      `translate(${margin.left}, ${height - margin.bottom + 50})`
    );

  const legendSpacing = innerWidth / 3;

  legend
    .selectAll("rect")
    .data(colorScale.domain())
    .join("rect")
    .attr("x", (d, i) => i * legendSpacing)
    .attr("y", 0)
    .attr("width", 15)
    .attr("height", 15)
    .attr("fill", (d) => colorScale(d));

  legend
    .selectAll("text")
    .data(colorScale.domain())
    .join("text")
    .attr("x", (d, i) => i * legendSpacing + 20)
    .attr("y", 12)
    .text((d) => d)
    .style("font-size", "12px");

  return container;
}
