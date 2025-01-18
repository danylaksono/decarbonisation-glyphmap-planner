// ================ NUMERICAL RENDERERS ================

function bulletChart(data, rowData, options = {}) {
  // Bullet Chart:
  // Purpose: Compare a primary measure to one or more related measures (e.g., target, good, bad ranges) and display them in the context of a qualitative range.
  // Data: Requires multiple numerical values per row (e.g., actual value, target, range values).
  // Implementation: Use rectangles of different lengths and colors to represent the primary measure, target, and ranges.
  // Example usage in cellRenderers:
  // const cellRenderers = {
  //     performance: (data, rowData) => bulletChart(data, rowData, { goodRangeColor: "lightgreen" }),
  // };

  const {
    width = 150,
    height = 20,
    goodRangeColor = "lightgreen",
    badRangeColor = "lightcoral",
  } = options;

  const actual = data.actual;
  const target = data.target;
  const goodRange = data.goodRange; // Example: [min, max]
  const badRange = data.badRange; // Example: [min, max]

  const maxVal = Math.max(actual, target, goodRange[1], badRange[1]);

  const scale = d3.scaleLinear().domain([0, maxVal]).range([0, width]);

  const svg = d3
    .create("svg")
    .attr("width", width)
    .attr("height", height)
    .style("overflow", "visible"); // Allow elements to overflow for labels

  // Add ranges (bad range first, so it's on the bottom)
  if (badRange) {
    svg
      .append("rect")
      .attr("width", scale(badRange[1]))
      .attr("height", height)
      .attr("fill", badRangeColor);
  }

  if (goodRange) {
    svg
      .append("rect")
      .attr("width", scale(goodRange[1]))
      .attr("height", height)
      .attr("fill", goodRangeColor);
  }

  // Add actual value bar
  svg
    .append("rect")
    .attr("width", scale(actual))
    .attr("height", height / 2)
    .attr("y", height / 4)
    .attr("fill", "black");

  // Add target marker
  svg
    .append("line")
    .attr("x1", scale(target))
    .attr("x2", scale(target))
    .attr("y1", 0)
    .attr("y2", height)
    .attr("stroke", "red")
    .attr("stroke-width", 2);

  const container = document.createElement("div");
  container.appendChild(svg);

  // Add a label (optional)
  const label = document.createElement("span");
  label.style.fontSize = "10px";
  label.innerText = `Actual: ${actual}, Target: ${target}`;
  container.appendChild(label);

  return container;
}

function progressBar(value, rowData, options = {}) {
  // Progress Bar:
  // Purpose: Display the percentage completion of a task or a value relative to a whole.
  // Data: A numerical value (or a percentage) per row.
  // Implementation: Similar to sparkbar, but typically without a color scale, and you might add a text label showing the percentage.
  const { width = "100%", height = "10px", color = "blue" } = options;

  const div = document.createElement("div");
  div.style.width = width;
  div.style.height = height;
  div.style.backgroundColor = "lightgray";

  const bar = document.createElement("div");
  bar.style.width = `${value}%`; // Assuming value is a percentage
  bar.style.height = "100%";
  bar.style.backgroundColor = color;
  div.appendChild(bar);

  return div;
}

function heatmapCell(value, rowData, colorScale) {
  // Heatmap Cell:
  // Purpose: Highlight the magnitude of a value using color intensity.
  // Data: A numerical value per row.
  // Implementation: Similar to sparkbar, but use a color scale without the bar, filling the entire cell with the color.
  // Example usage:
  // const colorScale = d3.scaleSequential(d3.interpolateInferno)
  // .domain([0, d3.max(data, d => d.someValue)]); // Assuming 'someValue' is your numerical column

  // const cellRenderers = {
  // someValue: (value, rowData) => heatmapCell(value, rowData, colorScale),
  // };

  const color = colorScale(value);
  const div = document.createElement("div");
  div.style.backgroundColor = color;
  div.style.width = "100%";
  div.style.height = "100%";
  div.style.textAlign = "center";
  div.style.color = "white"; // For contrast
  div.innerText = value.toFixed(2); // Display value with 2 decimal places
  return div;
}

// ================ Renderers for Categorical/Ordinal Data ================

function iconRenderer(category, rowData, iconMap) {
  // Icon/Symbol:
  // Purpose: Represent different categories with icons or symbols.
  // Data: A categorical value (string or number) per row.
  // Implementation: Use a lookup table (object or Map) to map categories to corresponding icons (e.g., SVG paths, images, or Unicode characters).

  // Example usage:
  //   const weatherIcons = {
  //     sunny: "icons/sun.svg",
  //     rainy: "icons/rain.svg",
  //     cloudy: "icons/cloud.svg",
  //   };

  //   const cellRenderers = {
  //     weather: (category, rowData) =>
  //       iconRenderer(category, rowData, weatherIcons),
  //   };
  const iconPath = iconMap[category];
  if (!iconPath) {
    return document.createTextNode("Unknown"); // Or a default icon
  }

  const img = document.createElement("img");
  img.src = iconPath;
  img.style.width = "16px";
  img.style.height = "16px";
  img.alt = category; // Accessibility

  return img;
}

function colorCodeRenderer(category, rowData, colorMap) {
  // Dot/Color Coding:
  // Purpose: Similar to icons, but use colored dots or squares to represent categories.
  // Data: A categorical value per row.
  // Implementation: Use a lookup table to map categories to colors. Create a div with the appropriate background color.

  // Example usage:
  // const riskColors = {
  //     high: "red",
  //     medium: "orange",
  //     low: "green",
  //   };

  //   const cellRenderers = {
  //     riskLevel: (category, rowData) => colorCodeRenderer(category, rowData, riskColors),
  //   };

  const color = colorMap[category];
  const div = document.createElement("div");
  div.style.width = "10px";
  div.style.height = "10px";
  div.style.backgroundColor = color;
  div.style.margin = "0 auto"; // Center the dot
  return div;
}

function tagRenderer(category, rowData, tagStyles = {}) {
  //     Tag/Label:
  // Purpose: Display the categorical value as a visually distinct tag or label.
  // Data: A categorical value per row.
  // Implementation: Create a span or div element with appropriate CSS classes or inline styles to create the tag-like appearance.

  // Example usage (customize tagStyles as needed):
  // const cellRenderers = {
  //     status: (category, rowData) => tagRenderer(category, rowData, { backgroundColor: "lightgreen" }),
  // };

  const {
    backgroundColor = "lightblue",
    color = "black",
    borderRadius = "5px",
  } = tagStyles;
  const span = document.createElement("span");
  span.innerText = category;
  span.style.backgroundColor = backgroundColor;
  span.style.color = color;
  span.style.borderRadius = borderRadius;
  span.style.padding = "2px 5px";
  span.style.margin = "2px";
  span.style.fontSize = "12px";
  return span;
}

// ================ Renderers for Temporal Data (Dates/Times):

function dateBarRenderer(date, rowData, minDate, maxDate) {
  // Timeline/Date Bar:
  // Purpose: Visualize a time span or a specific date within a range.
  // Data: Start and/or end dates per row, or a single date value.
  // Implementation: Similar to `sparkbar` or `progressBar`, but use a date scale for the x-axis.
  // Example usage:
  // const minDate = d3.min(data, d => d.startDate);
  // const maxDate = d3.max(data, d => d.endDate);

  // const cellRenderers = {
  //     startDate: (date, rowData) => dateBarRenderer(date, rowData, minDate, maxDate),
  // };
  const width = 150;
  const height = 10;
  const x = d3.scaleTime().domain([minDate, maxDate]).range([0, width]);

  const svg = d3
    .create("svg")
    .attr("width", width)
    .attr("height", height)
    .style("overflow", "visible");

  // Add a bar representing the date
  svg
    .append("rect")
    .attr("x", x(date))
    .attr("width", 2)
    .attr("height", height)
    .attr("fill", "blue");

  const container = document.createElement("div");
  container.appendChild(svg);

  return container;
}

// ================ Other Renderers ================
function ratingRenderer(rating, rowData, maxRating = 5) {
  // Rating Stars:
  // Purpose: Display a rating using a star-based system.
  // Data: A numerical value (e.g., rating out of 5) per row.
  // Implementation: Use Unicode star characters (★, ☆) or create star icons using SVG, and display them based on the rating value.

  // Example usage:
  //   const cellRenderers = {
  //     rating: (rating, rowData) => ratingRenderer(rating, rowData, 5), // Assuming a 5-star rating system
  //   };

  const fullStar = "★";
  const emptyStar = "☆";
  const container = document.createElement("div");

  for (let i = 0; i < maxRating; i++) {
    const star = document.createElement("span");
    star.innerText = i < rating ? fullStar : emptyStar;
    star.style.color = "gold"; // Set the color of the stars
    star.style.fontSize = "16px";
    container.appendChild(star);
  }

  return container;
}
