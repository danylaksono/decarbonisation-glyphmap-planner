import * as d3 from "npm:d3";
import _ from "npm:lodash";
import * as htl from "npm:htl";
import { html } from "npm:htl";
import * as Plot from "npm:@observablehq/plot";

// Highlight rows containing checked inputs.
// from: https://observablehq.com/@mootari/highlight-table-rows
export function highlightRows(form, { color = "yellow" }) {
  form.append(htl.html`<style>
      #${form.id} td.selected,
      #${form.id} td.selected ~ td { background: ${color} }
    `);
  const update = () => {
    for (const n of form.querySelectorAll(
      "input[type=checkbox],input[type=radio]"
    )) {
      const toggle =
        n.parentElement.classList.contains("selected") !== n.checked;
      if (toggle) n.parentElement.classList.toggle("selected");
    }
  };
  update();
  form.addEventListener("input", update);
  // Handle lazily loaded rows.
  const observer = new MutationObserver(update);
  observer.observe(form.querySelector("tbody"), { childList: true });

  return form;
}

// Sparkbar example
export function sparkbar(max) {
  return (x) => htl.html`<div style="
    background: lightblue;
    width: ${(100 * x) / max}%;
    float: right;
    padding-right: 3px;
    box-sizing: border-box;
    overflow: visible;
    display: flex;
    justify-content: end;">${x.toLocaleString("en")}`;
}

// sparkarea example
// from https://observablehq.com/@mbostock/covid-cases-by-state
export function sparkarea({
  x: X,
  y: Y,
  xdomain = d3.extent(X),
  ydomain = d3.extent(Y),
  width = 240,
  height = 20,
}) {
  const x = d3.scaleUtc(xdomain, [0, width]);
  const y = d3.scaleLinear(ydomain, [height, 0]);
  const area = d3
    .area()
    .x((d, i) => x(X[i]))
    .y1((d, i) => y(Y[i]))
    .y0(height)
    .defined((d, i) => !isNaN(X[i]) && !isNaN(Y[i]));
  return d3
    .create("svg")
    .attr("width", width)
    .attr("height", height)
    .style("vertical-align", "middle")
    .style("margin", "-3px 0")
    .call((g) => g.append("path").attr("fill", "#faa").attr("d", area(data)))
    .call((g) =>
      g
        .append("path")
        .attr("fill", "none")
        .attr("stroke", "red")
        .attr("d", area.lineY1()(data))
    )
    .node();
}

// A function to summarize a single column
// from https://observablehq.com/@observablehq/summary-table
export const SummarizeColumn = (data, col) => {
  let content,
    value,
    format,
    finiteFormat,
    el,
    chart,
    missing_label,
    pct_missing,
    min,
    max,
    median,
    mean,
    sd;
  const notFiniteFormat = d3.format(",.0f");

  // Construct content based on type
  const type = getType(data, col);

  const col1 = htl.html`<td style="white-space: nowrap;vertical-align:middle;padding-right:5px;padding-left:3px;">${icon_fns[
    type
  ]()}<strong style="vertical-align:middle;">${
    col === "" ? "unlabeled" : col
  }</strong></td>`;

  switch (type) {
    // Categorical columns
    case "ordinal":
      format = d3.format(",.0f");

      // Calculate category percent and count
      const categories = d3
        .rollups(
          data,
          (v) => ({ count: v.length, pct: v.length / data.length || 1 }),
          (d) => d[col]
        )
        .sort((a, b) => b[1].count - a[1].count)
        .map((d) => {
          let obj = {};
          obj[col] = d[0] === null || d[0] === "" ? "(missing)" : d[0];
          obj.count = d[1].count;
          obj.pct = d[1].pct;
          return obj;
        });

      // Calculate pct. missing
      pct_missing =
        data.filter((d) => d[col] === null || d[col] === "").length /
        data.length;

      // Create the chart
      const stack_chart = SmallStack(categories, col);

      // element to return
      el = htl.html`<tr style="font-family:sans-serif;font-size:13px;">
          <td><div style="position:relative;">${stack_chart}</div></td>
        </tr>`;
      //   el = htl.html`<tr style="font-family:sans-serif;font-size:13px;">
      //       ${col1}
      //       <td><div style="position:relative;">${stack_chart}</div></td>
      //       <td>${pct_format(pct_missing)}</td>
      //       <td>-</td>
      //       <td>-</td>
      //       <td>-</td>
      //     </tr>`;

      value = {
        column: col,
        type,
        min: null,
        max: null,
        mean: null,
        median: null,
        sd: null,
        missing: pct_missing,
        n_categories: categories.length,
      };
      break;

    // Date columns
    case "date":
      // Calculate and format start / end
      const start = d3.min(data, (d) => +d[col]);
      const end = d3.max(data, (d) => +d[col]);
      mean = d3.mean(data, (d) => +d[col]);
      median = d3.median(data, (d) => +d[col]);
      sd = d3.deviation(data, (d) => +d[col]);

      // Calculate pct. missing
      pct_missing =
        data.filter((d) => d[col] === null || d[col] === "").length /
        data.length;
      chart = Histogram(data, col, type);

      // Element to return
      el = htl.html`<tr style="font-family:sans-serif;font-size:13px;">
            <td><div style="position:relative;">${chart}</div></td>
          </tr>`;
      //   el = htl.html`<tr style="font-family:sans-serif;font-size:13px;">
      //         ${col1}
      //         <td><div style="position:relative;">${chart}</div></td>
      //         <td>${pct_format(pct_missing)}</td>
      //         <td>-</td>
      //         <td>-</td>
      //         <td>-</td>
      //       </tr>`;
      value = {
        column: col,
        type,
        min: start,
        max: end,
        mean: null,
        median: null,
        sd: null,
        missing: pct_missing,
        n_categories: null,
      };
      break;

    // Continuous columns
    default:
      // Compute values
      min = d3.min(data, (d) => +d[col]);
      max = d3.max(data, (d) => +d[col]);
      mean = d3.mean(data, (d) => +d[col]);
      median = d3.median(data, (d) => +d[col]);
      sd = d3.deviation(data, (d) => +d[col]);
      if (Number.isFinite(sd)) {
        finiteFormat = d3.format(",." + d3.precisionFixed(sd / 10) + "f");
        format = (x) =>
          Number.isFinite(x) ? finiteFormat(x) : notFiniteFormat(x);
      } else {
        format = notFiniteFormat;
      }
      pct_missing =
        data.filter((d) => d[col] === null || isNaN(d[col])).length /
        data.length;

      chart = Histogram(data, col, type);
      // Element to return
      //   el = htl.html`<tr style="font-family:sans-serif;font-size:13px;">
      //         ${col1}
      //         <td><div style="position:relative;top:3px;">${chart}</div></td>
      //         <td>${pct_format(pct_missing)}</td>
      //         <td>${format(mean)}</td>
      //         <td>${format(median)}</td>
      //         <td>${format(sd)}</td>
      //       </tr>`;
      //   console.log("chart", chart);
      el = htl.html`<tr style="font-family:sans-serif;font-size:13px;">
            <td><div style="position:relative;top:3px;">${chart}</div></td>
          </tr>`;

      value = {
        column: col,
        type,
        min,
        max,
        mean,
        median,
        sd,
        missing: pct_missing,
        n_categories: null,
      };
      break;
  }
  el.value = value;
  el.appendChild(
    html`<style>
      td {
        vertical-align: middle;
      }
    </style>`
  );
  return el;
  //   return chart;
};

export function inferColumnType(data, column) {
  if (data.every((d) => typeof d[column] === "number" && !isNaN(d[column]))) {
    return "numeric";
  } else if (data.every((d) => typeof d[column] === "string")) {
    return "text";
  } else {
    return "other";
  }
}

export function createTableFormat(data, options = {}) {
  const defaultColorInterpolator = d3.interpolatePlasma;

  return Object.fromEntries(
    Object.keys(data[0]).map((column) => {
      const columnType = inferColumnType(data, column);

      if (columnType === "numeric") {
        const max = d3.max(data, (d) => d[column]);
        const colorScale = d3
          .scaleSequential()
          .domain([0, max])
          .interpolator(
            options.colorInterpolators?.[column] || defaultColorInterpolator
          );

        return [column, sparkbar(max, colorScale)];
      } else if (columnType === "text") {
        return [column, (x) => x?.toString().toLowerCase()];
      } else {
        // Default for other types
        return [column, (x) => x?.toString()];
      }
    })
  );
}

export const getType = (data, column) => {
  for (const d of data) {
    const value = d[column];
    if (value == null) continue;
    if (typeof value === "number") return "continuous";
    if (value instanceof Date) return "date";
    return "ordinal";
  }
  // if all are null, return ordinal
  return "ordinal";
};

const pct_format = d3.format(".1%");

const SmallStack = (categoryData, col, maxCategories = 100) => {
  // Get a horizontal stacked bar
  const label = categoryData.length === 1 ? " category" : " categories";
  let chartData = categoryData;
  let categories = 0;
  if (chartData.length > maxCategories) {
    chartData = categoryData.filter((d, i) => i < maxCategories);
    const total = d3.sum(categoryData, (d) => d.count);
    const otherCount = total - d3.sum(chartData, (d) => d.count);
    let other = {};
    other[col] = "Other categories...";
    other.count = otherCount;
    other.pct = other.count / total;
    chartData.push(other);
  }

  return addTooltips(
    Plot.barX(chartData, {
      x: "count",
      fill: col,
      y: 0,
      title: (d) => d[col] + "\n" + pct_format(d.pct),
    }).plot({
      color: { scheme: "blues" },
      marks: [
        Plot.text([0, 0], {
          x: 0,
          frameAnchor: "bottom",
          dy: 10,
          text: (d) => d3.format(",.0f")(categoryData.length) + `${label}`,
        }),
      ],
      style: {
        paddingTop: "0px",
        paddingBottom: "15px",
        textAnchor: "start",
        overflow: "visible",
      },
      x: { axis: null },
      color: {
        domain: chartData.map((d) => d[col]),
        scheme: "blues",
        reverse: true,
      },
      height: 30,
      width: 205,
      y: {
        axis: null,
        range: [30, 3],
      },
    }),
    { fill: "darkblue" }
  );
};

export const Histogram = (data, col, type = "continuous") => {
  // Compute color + mean
  const barColor = colorMap.get(type).brighter;
  const mean = d3.mean(data, (d) => d[col]);

  // Formatter for the mean
  const extent = d3.extent(data, (d) => d[col]);
  const format =
    type === "date"
      ? getDateFormat(extent)
      : Math.floor(extent[0]) === Math.floor(extent[1])
      ? d3.format(",.2f")
      : d3.format(",.0f");
  const rules = [{ label: "mean", value: mean }];
  return addTooltips(
    Plot.plot({
      height: 55,
      width: 240,
      style: {
        display: "inline-block",
      },
      x: {
        label: "",
        ticks: extent,
        tickFormat: format,
      },
      y: {
        axis: null,
      },
      marks: [
        Plot.rectY(
          data,
          Plot.binX(
            {
              y: "count",
              title: (elems) => {
                // compute range for the elements
                const [start, end] = d3.extent(elems, (d) => d[col]);
                let barFormat;
                if (type === "date") {
                  barFormat = getDateFormat([start, end]);
                } else {
                  barFormat = d3.format(
                    Math.floor(start) === Math.floor(end) ? ",.2f" : ",.0f"
                  );
                }
                return `${elems.length} rows\n[${barFormat(
                  start
                )} to ${barFormat(end)}]`;
              },
            },
            { x: col, fill: barColor }
          )
        ),
        Plot.ruleY([0]),
        Plot.ruleX(rules, {
          x: "value",
          strokeWidth: 2,
          title: (d) => `${d.label} ${col}: ${format(d.value)}`,
        }),
      ],
      style: {
        marginLeft: -17,
        background: "none",
        overflow: "visible",
      },
    }),
    { opacity: 1, fill: colorMap.get(type).color }
  );
};

// Using an offet to calculate the format
const getDateFormat = (extent) => {
  const formatMillisecond = d3.utcFormat(".%L"),
    formatSecond = d3.utcFormat(":%S"),
    formatMinute = d3.utcFormat("%I:%M"),
    formatHour = d3.utcFormat("%I %p"),
    formatDay = d3.utcFormat("%a %d"),
    formatWeek = d3.utcFormat("%b %d"),
    formatMonth = d3.utcFormat("%B"),
    formatYear = d3.utcFormat("%Y");

  // Test on the difference between the extent, offset by 1

  return extent[1] > d3.utcYear.offset(extent[0], 1)
    ? formatYear
    : extent[1] > d3.utcMonth.offset(extent[0], 1)
    ? formatMonth
    : extent[1] > d3.utcWeek.offset(extent[0], 1)
    ? formatWeek
    : extent[1] > d3.utcDay.offset(extent[0], 1)
    ? formatDay
    : extent[1] > d3.utcHour.offset(extent[0], 1)
    ? formatHour
    : extent[1] > d3.utcMinute.offset(extent[0], 1)
    ? formatMinute
    : extent[1] > d3.utcSecond.offset(extent[0], 1)
    ? formatSecond
    : extent[1] > d3.utcMillisecond.offset(extent[0], 1)
    ? formatMillisecond
    : formatDay;
};

function dateFormat(date) {
  var formatMillisecond = d3.timeFormat(".%L"),
    formatSecond = d3.timeFormat(":%S"),
    formatMinute = d3.timeFormat("%I:%M"),
    formatHour = d3.timeFormat("%I %p"),
    formatDay = d3.timeFormat("%a %d"),
    formatWeek = d3.timeFormat("%b %d"),
    formatMonth = d3.timeFormat("%B"),
    formatYear = d3.timeFormat("%Y");

  return (
    d3.timeSecond(date) < date
      ? formatMillisecond
      : d3.timeMinute(date) < date
      ? formatSecond
      : d3.timeHour(date) < date
      ? formatMinute
      : d3.timeDay(date) < date
      ? formatHour
      : d3.timeMonth(date) < date
      ? d3.timeWeek(date) < date
        ? formatDay
        : formatWeek
      : d3.timeYear(date) < date
      ? formatMonth
      : formatYear
  )(date);
}

const colorMap = new Map(
  [
    ["ordinal", "rgba(78, 121, 167, 1)"],
    ["continuous", "rgba(242, 142, 44, 1)"],
    ["date", "rgba(225,87,89, 1)"],
  ].map((d) => {
    const col = d3.color(d[1]);
    const color_copy = _.clone(col);
    color_copy.opacity = 0.6;
    return [d[0], { color: col.formatRgb(), brighter: color_copy.formatRgb() }];
  })
);

const icon_fns = {
  ordinal: () => html`<div
    style="display:inline-block; border-radius:100%; width: 16px; height: 16px; background-color: ${colorMap.get(
      "ordinal"
    )
      .color}; transform: scale(1.3); vertical-align: middle; align-items: center;margin-right:8px;}"
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="4" width="2" height="2" fill="white" />
      <rect x="7" y="4" width="6" height="2" fill="white" />
      <rect x="4" y="7" width="2" height="2" fill="white" />
      <rect x="7" y="7" width="6" height="2" fill="white" />
      <rect x="4" y="10" width="2" height="2" fill="white" />
      <rect x="7" y="10" width="6" height="2" fill="white" />
    </svg>
  </div>`,
  date: () => html`<div
    style="display:inline-block; border-radius:100%; width: 16px; height: 16px; background-color: ${colorMap.get(
      "date"
    )
      .color}; transform: scale(1.3); vertical-align: middle; align-items: center;margin-right:8px;}"
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="5" width="8" height="1" fill="white" />
      <rect x="5" y="4" width="2" height="1" fill="white" />
      <rect x="9" y="4" width="2" height="1" fill="white" />
      <rect x="4" y="7" width="8" height="5" fill="white" />
    </svg>
  </div>`,
  continuous: () => html`<div
    style="display:inline-block; border-radius:100%; width: 16px; height: 16px; background-color: ${colorMap.get(
      "continuous"
    )
      .color}; transform: scale(1.3); vertical-align: middle; align-items: center;margin-right:8px;}"
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="4"
        y="12"
        width="4"
        height="2"
        transform="rotate(-90 4 12)"
        fill="white"
      />
      <rect
        x="7"
        y="12"
        width="6"
        height="2"
        transform="rotate(-90 7 12)"
        fill="white"
      />
      <rect
        x="10"
        y="12"
        width="8"
        height="2"
        transform="rotate(-90 10 12)"
        fill="white"
      />
    </svg>
  </div>`,
};

const addTooltips = (chart, styles) => {
  const stroke_styles = { stroke: "blue", "stroke-width": 3 };
  const fill_styles = { fill: "blue", opacity: 0.5 };

  // Workaround if it's in a figure
  const type = d3.select(chart).node().tagName;
  let wrapper =
    type === "FIGURE" ? d3.select(chart).select("svg") : d3.select(chart);

  // Workaround if there's a legend....
  const svgs = d3.select(chart).selectAll("svg");
  if (svgs.size() > 1) wrapper = d3.select([...svgs].pop());
  wrapper.style("overflow", "visible"); // to avoid clipping at the edges

  // Set pointer events to visibleStroke if the fill is none (e.g., if its a line)
  wrapper.selectAll("path").each(function (data, index, nodes) {
    // For line charts, set the pointer events to be visible stroke
    if (
      d3.select(this).attr("fill") === null ||
      d3.select(this).attr("fill") === "none"
    ) {
      d3.select(this).style("pointer-events", "visibleStroke");
      if (styles === undefined) styles = stroke_styles;
    }
  });

  if (styles === undefined) styles = fill_styles;

  const tip = wrapper
    .selectAll(".hover")
    .data([1])
    .join("g")
    .attr("class", "hover")
    .style("pointer-events", "none")
    .style("text-anchor", "middle");

  // Add a unique id to the chart for styling
  const id = id_generator();

  // Add the event listeners
  d3.select(chart).classed(id, true); // using a class selector so that it doesn't overwrite the ID
  wrapper.selectAll("title").each(function () {
    // Get the text out of the title, set it as an attribute on the parent, and remove it
    const title = d3.select(this); // title element that we want to remove
    const parent = d3.select(this.parentNode); // visual mark on the screen
    const t = title.text();
    if (t) {
      parent.attr("__title", t).classed("has-title", true);
      title.remove();
    }
    // Mouse events
    parent
      .on("pointerenter pointermove", function (event) {
        const text = d3.select(this).attr("__title");
        const pointer = d3.pointer(event, wrapper.node());
        if (text) tip.call(hover, pointer, text.split("\n"));
        else tip.selectAll("*").remove();

        // Raise it
        d3.select(this).raise();
        // Keep within the parent horizontally
        const tipSize = tip.node().getBBox();
        if (pointer[0] + tipSize.x < 0)
          tip.attr(
            "transform",
            `translate(${tipSize.width / 2}, ${pointer[1] + 7})`
          );
        else if (pointer[0] + tipSize.width / 2 > wrapper.attr("width"))
          tip.attr(
            "transform",
            `translate(${wrapper.attr("width") - tipSize.width / 2}, ${
              pointer[1] + 7
            })`
          );
      })
      .on("pointerout", function (event) {
        tip.selectAll("*").remove();
        // Lower it!
        d3.select(this).lower();
      });
  });

  // Remove the tip if you tap on the wrapper (for mobile)
  wrapper.on("touchstart", () => tip.selectAll("*").remove());

  // Define the styles
  chart.appendChild(html`<style>
    .${id} .has-title { cursor: pointer;  pointer-events: all; }
    .${id} .has-title:hover { ${Object.entries(styles)
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ")} }`);

  return chart;
};

// To generate a unique ID for each chart so that they styles only apply to that chart
const id_generator = () => {
  var S4 = function () {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  };
  return "a" + S4() + S4();
};

const hover = (tip, pos, text) => {
  const side_padding = 10;
  const vertical_padding = 5;
  const vertical_offset = 15;

  // Empty it out
  tip.selectAll("*").remove();

  // Append the text
  tip
    .style("text-anchor", "middle")
    .style("pointer-events", "none")
    .attr("transform", `translate(${pos[0]}, ${pos[1] + 7})`)
    .selectAll("text")
    .data(text)
    .join("text")
    .style("dominant-baseline", "ideographic")
    .text((d) => d)
    .attr("y", (d, i) => (i - (text.length - 1)) * 15 - vertical_offset)
    .style("font-weight", (d, i) => (i === 0 ? "bold" : "normal"));

  const bbox = tip.node().getBBox();

  // Add a rectangle (as background)
  tip
    .append("rect")
    .attr("y", bbox.y - vertical_padding)
    .attr("x", bbox.x - side_padding)
    .attr("width", bbox.width + side_padding * 2)
    .attr("height", bbox.height + vertical_padding * 2)
    .style("fill", "white")
    .style("stroke", "#d3d3d3")
    .lower();
};
