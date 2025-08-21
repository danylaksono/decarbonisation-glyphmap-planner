import * as d3 from "../../../../_npm/d3@7.9.0/_esm.js";

// Control debug output - set to true during development, false in production
const DEBUG = false;

// Custom logging functions that respect the DEBUG flag
const logDebug = (...args) => DEBUG && console.log(...args);
const warnDebug = (...args) => DEBUG && console.warn(...args);
const errorDebug = (...args) => console.error(...args); // Errors always show

/**
 * Small Multiples View for displaying histograms in a grid layout
 */
export class SmallMultiplesView {
  /**
   * Create a new small multiples view
   * @param {Object} sorterTable - The sorterTable instance
   * @param {Object} options - Configuration options
   */
  constructor(sorterTable, options = {}) {
    this.sorterTable = sorterTable;
    this.container = null;
    this.histograms = [];
    this.options = {
      margin: { top: 5, right: 2, bottom: 8, left: 3 },
      histogramHeight: options.histogramHeight || 30,
      histogramWidth: options.histogramWidth || 40,
      spacing: options.spacing || 2,
      maxColumns: options.maxColumns || 0, // 0 means auto-calculate
      ...options,
    };

    // Create the container for the small multiples view
    this.container = document.createElement("div");
    this.container.className = "small-multiples-container";
    Object.assign(this.container.style, {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      overflow: "auto",
      padding: "2x",
    });

    // Add custom stylesheet for small multiples
    this.addStylesheet();
  }

  /**
   * Add custom CSS styles for the small multiples view
   */
  addStylesheet() {
    const styleId = "small-multiples-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .small-multiples-container {
          background-color: #f9f9f9;
        }
        
        .histogram-cell {
          background-color: white;
          border-radius: 0px;
          /* box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24); */
          margin: 2px;
          padding: 1px;
          transition: all 0.3s cubic-bezier(.25,.8,.25,1);
          display: flex;
          flex-direction: column;
        }
        
        .histogram-cell:hover {
          box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
        }
        
        .histogram-title {
          font-family: Arial, sans-serif;
          font-size: 10px;
          font-weight: bold;
          text-align: center;
          color: #444;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          order: -1;
          height: 12px;
        }
        
        .histogram-label {
          font-size: 9px !important;
          pointer-events: none;
        }
        
        .small-multiple-controls {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 5px;
          padding: 3px;
          background-color: white;
          border-bottom: 1px solid #eee;
          position: sticky;
          top: 0;
          z-index: 100;
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Calculate the optimal grid layout based on container size
   * @returns {Object} The calculated grid dimensions
   */
  calculateGridDimensions() {
    if (!this.container || !this.container.parentElement) {
      return { columns: 3, rows: 3 };
    }

    const containerWidth = this.container.parentElement.clientWidth - 40; // Subtract padding
    const containerHeight = this.container.parentElement.clientHeight - 40;

    const histWidth = this.options.histogramWidth + this.options.spacing;
    const histHeight = this.options.histogramHeight + this.options.spacing + 30; // Add space for title

    let columns = Math.max(1, Math.floor(containerWidth / histWidth));

    // If maxColumns is specified and > 0, use it as a cap
    if (this.options.maxColumns > 0) {
      columns = Math.min(columns, this.options.maxColumns);
    }

    const columnsNeeded = Math.min(columns, this.sorterTable.columns.length);
    const rowsNeeded = Math.ceil(
      this.sorterTable.columns.length / columnsNeeded
    );

    // Adjust for extra space if fewer columns than calculated
    if (columnsNeeded < columns) {
      this.options.histogramWidth += Math.floor(
        (containerWidth - columnsNeeded * histWidth) / columnsNeeded
      );
    }

    return { columns: columnsNeeded, rows: rowsNeeded };
  }

  /**
   * Create a histogram for a specific column
   * @param {Object} column - Column definition
   * @param {number} index - Column index
   * @returns {HTMLElement} - The histogram container element
   */
  createHistogram(column, index) {
    const columnName = column.column;
    const columnAlias = column.alias || columnName;
    const columnType = this.sorterTable.columnTypes[columnName];

    // Create the cell container
    const cell = document.createElement("div");
    cell.className = "histogram-cell";
    Object.assign(cell.style, {
      width: `${this.options.histogramWidth}px`,
      height: `${this.options.histogramHeight + 15}px`, // Add height for title (reduced from 30px)
    });

    // Create title - place before histogram container for top positioning
    const title = document.createElement("div");
    title.className = "histogram-title";
    title.textContent = columnAlias;
    title.title = columnAlias; // Add tooltip

    // Create histogram container
    const histContainer = document.createElement("div");
    histContainer.className = "histogram-container";
    Object.assign(histContainer.style, {
      width: "100%",
      height: `${this.options.histogramHeight - 10}px`, // Reduce height to make room for title (changed from -20px)
    });

    // Extract data for this column
    const data = this.sorterTable.dataInd.map((i) => {
      return {
        value: this.sorterTable.data[i][columnName],
        index: i,
      };
    });

    // Set up histogram based on column type
    let binrules = {};
    if (column.unique) {
      binrules = { unique: true };
    } else if (columnType === "continuous") {
      binrules = {
        thresholds: column.thresholds,
        binInfo: column.bins,
      };
    } else {
      binrules = {
        nominals: column.nominals,
      };
    }

    // Create histogram controller
    const histCtrl = new SmallMultipleHistogram(data, binrules, {
      width: this.options.histogramWidth - 10, // Reduced padding adjustment
      height: this.options.histogramHeight - 15, // Reduced height adjustment
    });
    histCtrl.table = this.sorterTable;
    histCtrl.columnName = columnName;

    histContainer.appendChild(histCtrl.getNode());
    cell.appendChild(title); // Add title first
    cell.appendChild(histContainer); // Then add histogram container

    // Store the controller for later reference
    this.histograms.push(histCtrl);

    return cell;
  }

  /**
   * Render the small multiples view with all histograms
   */
  render() {
    // Clear existing histograms
    this.container.innerHTML = "";
    this.histograms = [];

    // Calculate optimal grid layout
    const grid = this.calculateGridDimensions();
    logDebug("Small Multiples Grid:", grid);

    // Add control bar
    const controlBar = document.createElement("div");
    controlBar.className = "small-multiple-controls";

    const resetBtn = document.createElement("button");
    resetBtn.textContent = "Reset Selections";
    resetBtn.className = "sm-reset-btn";
    resetBtn.style.margin = "0 10px";
    resetBtn.addEventListener("click", () => {
      this.resetAllSelections();
    });
    controlBar.appendChild(resetBtn);

    this.container.appendChild(controlBar);

    // Create a wrapper for the histograms
    const histogramsWrapper = document.createElement("div");
    histogramsWrapper.style.display = "flex";
    histogramsWrapper.style.flexWrap = "wrap";
    histogramsWrapper.style.justifyContent = "center";

    // Create histograms for each column
    this.sorterTable.columns.forEach((column, i) => {
      const cell = this.createHistogram(column, i);
      histogramsWrapper.appendChild(cell);
    });

    this.container.appendChild(histogramsWrapper);

    return this.container;
  }

  /**
   * Update all histograms with current data
   */
  updateHistograms() {
    this.histograms.forEach((hist, i) => {
      const columnName = this.sorterTable.columns[i].column;
      const data = this.sorterTable.dataInd.map((i) => {
        return {
          value: this.sorterTable.data[i][columnName],
          index: i,
        };
      });
      hist.updateData(data);
    });
  }

  /**
   * Reset all histogram selections
   */
  resetAllSelections() {
    this.histograms.forEach((hist) => {
      if (hist.resetSelection) {
        hist.resetSelection();
      }
    });
    this.sorterTable.clearSelection();
    this.sorterTable.selectionUpdated();
  }

  /**
   * Get the container node for the small multiples view
   * @returns {HTMLElement}
   */
  getNode() {
    return this.container;
  }
}

/**
 * Enhanced version of HistogramController for small multiples view
 */
class SmallMultipleHistogram {
  /**
   * Create a histogram for the small multiples view
   * @param {Array} data - Data for the histogram
   * @param {Object} binrules - Rules for binning the data
   * @param {Object} options - Size and rendering options
   */
  constructor(data, binrules, options = {}) {
    this.options = {
      width: 140,
      height: 100,
      margin: { top: 5, right: 5, bottom: 5, left: 5 },
      ...options,
    };

    this.data = data;
    this.binrules = binrules;
    this.bins = [];
    this.brush = null;
    this.isBrushing = false;

    // Create container
    this.container = document.createElement("div");

    // Set up the visualization
    this.setData(data);
  }

  updateData(data) {
    // Reset any existing selections when data updates
    this.resetSelection();
    // Update the data and regenerate the visualization
    this.setData(
      data.map((d, i) => ({
        value: d.value,
        index: i, // Keep the original index mapping
      }))
    );
  }

  resetSelection() {
    this.bins.forEach((bin) => {
      bin.selected = false;
    });

    if (this.svg) {
      //   this.svg.selectAll(".bar rect:nth-child(1)").attr("fill", "#7A93D1");
      this.svg.selectAll(".bar rect:nth-child(1)").attr("fill", "#7A93D1");
      // Clear brush selection if present
      if (this.brush) {
        this.svg.select(".brush").call(this.brush.move, null);
      }
    }
  }

  setData(dd) {
    this.container.innerHTML = "";

    // Create a clean copy of data with proper indices
    let data = dd.map((d, i) => ({
      value: d.value,
      // Store the original data index for proper selection mapping
      index: i,
    }));

    const svgWidth = this.options.width;
    const svgHeight = this.options.height;
    const margin = this.options.margin;
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;

    this.svg = d3
      .select(this.container)
      .append("svg")
      .attr("width", svgWidth)
      .attr("height", svgHeight);

    const g = this.svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    if (this.binrules.unique) {
      this.bins = [
        {
          category: "Unique Values",
          count: data.length,
          indeces: data.map((d) => d.index),
        },
      ];
    } else if ("thresholds" in this.binrules) {
      // Handle continuous data
      let contBins = d3
        .bin()
        .domain([d3.min(data, (d) => d.value), d3.max(data, (d) => d.value)])
        .thresholds(this.binrules.thresholds)
        .value((d) => d.value)(data);

      this.bins = contBins.map((b) => ({
        category: b.x0 + "-" + b.x1,
        count: b.length,
        indeces: b.map((v) => v.index),
        x0: b.x0,
        x1: b.x1,
      }));

      this.xScale = d3
        .scaleLinear()
        .domain([d3.min(data, (d) => d.value), d3.max(data, (d) => d.value)])
        .range([0, width]);

      // Add X axis
      g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(this.xScale).ticks(5).tickSize(3));

      this.brush = d3
        .brushX()
        .extent([
          [0, 0],
          [width, height],
        ])
        .on("end", (event) => this.handleBrush(event));

      this.svg
        .append("g")
        .attr("class", "brush")
        .attr("transform", `translate(${margin.left},${margin.top})`)
        .style("position", "absolute")
        .style("z-index", 100)
        .call(this.brush);
    } else if ("ordinals" in this.binrules || "nominals" in this.binrules) {
      // Create a frequency map of values to their counts and indices
      const frequency = d3.rollup(
        data,
        (values) => ({
          count: values.length,
          indeces: values.map((v) => v.index),
        }),
        (d) => d.value
      );

      const binType = "ordinals" in this.binrules ? "ordinals" : "nominals";

      // For sorted data, we need to preserve the order of appearance
      // Create a map to track first appearance of each value in sorted data
      const valueOrder = new Map();
      data.forEach((d, i) => {
        if (!valueOrder.has(d.value)) {
          valueOrder.set(d.value, i);
        }
      });

      if (binType in this.binrules && Array.isArray(this.binrules[binType])) {
        // If we have predefined bin categories, use them but sort by data order
        const binsWithOrder = this.binrules[binType].map((v) => ({
          category: v,
          orderIndex: valueOrder.has(v) ? valueOrder.get(v) : Infinity,
          count: frequency.get(v) != null ? frequency.get(v).count : 0,
          indeces: frequency.get(v) != null ? frequency.get(v).indeces : [],
        }));

        // Sort bins according to their first appearance in the data
        binsWithOrder.sort((a, b) => a.orderIndex - b.orderIndex);
        this.bins = binsWithOrder;
      } else {
        // Create bins directly from frequency map, but sort them by data order
        this.bins = Array.from(frequency, ([key, value]) => ({
          category: key,
          orderIndex: valueOrder.get(key),
          count: value.count,
          indeces: value.indeces,
        })).sort((a, b) => a.orderIndex - b.orderIndex);
      }
    }

    this.bins.map((bin, i) => (bin.index = i));

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(this.bins, (d) => d.count) || 1])
      .range([height, 0]);

    const barGroups = g
      .selectAll(".bar")
      .data(this.bins)
      .join("g")
      .attr("class", "bar")
      .attr(
        "transform",
        (d, i) => `translate(${(i * width) / this.bins.length}, 0)`
      );

    barGroups
      .append("rect")
      .attr("x", 0)
      .attr("width", (d) => Math.max(1, width / this.bins.length - 1))
      .attr("y", (d) => y(d.count))
      .attr("height", (d) => height - y(d.count))
      .attr("fill", "#7A93D1")
      .attr("rx", 4) // Add horizontal corner radius
      .attr("ry", 4); // Add vertical corner radius

    if (!("thresholds" in this.binrules)) {
      barGroups
        .append("rect")
        .attr("width", (d) => Math.max(1, width / this.bins.length - 1))
        .attr("height", height)
        .attr("fill", "transparent")
        .on("mouseover", (event, d) => {
          if (!d.selected) {
            d3.select(event.currentTarget.previousSibling).attr(
              "fill",
              "purple"
            );
          }

          // Remove any previous label/mask group
          this.svg.selectAll(".histogram-label-group").remove();

          // Add a group for label and mask
          const group = this.svg
            .append("g")
            .attr("class", "histogram-label-group");

          //   Add a mask rectangle
          //   group
          //     .append("rect")
          //     .attr("x", width / 2 - 30)
          //     .attr("y", height - 14)
          //     .attr("width", 60)
          //     .attr("height", 12)
          //     .attr("fill", "white")
          //     .attr("rx", 2)
          //     .attr("ry", 2);

          group
            .append("text")
            .attr("x", width / 2)
            .attr("y", height - 2)
            .attr("fill", "#444444")
            .attr("text-anchor", "middle")
            .attr("class", "histogram-label")
            .text(d.category + ": " + d.count);
        })
        .on("mouseout", (event, d) => {
          if (!d.selected) {
            d3.select(event.currentTarget.previousSibling).attr(
              "fill",
              "#7A93D1"
            );
          }
          // Remove the label/mask group
          this.svg.selectAll(".histogram-label-group").remove();
        })
        .on("click", (event, d) => {
          d.selected = !d.selected;

          if (d.selected) {
            d3.select(event.currentTarget.previousSibling).attr(
              "fill",
              "orange"
            );
          } else {
            d3.select(event.currentTarget.previousSibling).attr(
              "fill",
              "#7A93D1"
            );
          }

          if (this.table) {
            if (!d.selected) {
              this.table.clearSelection();
            }

            // Get the rows that correspond to the bin's indices
            if (
              d.selected &&
              this.bins[d.index].indeces &&
              this.bins[d.index].indeces.length > 0
            ) {
              // Map the indices from the bin to table row elements
              const dataIndices = this.bins[d.index].indeces;

              // First get all rows from the table body for faster processing
              const allRows = Array.from(
                this.table.tBody.querySelectorAll("tr")
              );

              // Find rows at positions determined by the bin indices
              dataIndices.forEach((dataIndex) => {
                const rowPosition = this.table.dataInd.indexOf(dataIndex);
                if (rowPosition >= 0 && rowPosition < allRows.length) {
                  const tr = allRows[rowPosition];
                  if (tr) {
                    this.table.selectRow(tr);
                  }
                }
              });
            }

            this.table.selectionUpdated();
          }
        });
    }

    this.handleBrush = (event) => {
      this.svg.selectAll(".histogram-label").remove();

      if (!event.selection) {
        this.resetSelection();
        if (this.table) {
          this.table.clearSelection();
          this.table.selectionUpdated();
        }
        return;
      }

      const [x0, x1] = event.selection;
      const [bound1, bound2] = event.selection.map(this.xScale.invert);
      const binWidth = width / this.bins.length;

      const selectedIndices = new Set();

      this.bins.forEach((bin, i) => {
        if (bin.x0 !== undefined && bin.x1 !== undefined) {
          const binStart = this.xScale(bin.x0);
          const binEnd = this.xScale(bin.x1);

          bin.selected = binEnd >= x0 && binStart <= x1;

          g.select(`.bar:nth-child(${i + 1}) rect:nth-child(1)`).attr(
            "fill",
            bin.selected ? "orange" : "#7A93D1"
          );

          if (bin.selected && bin.indeces) {
            bin.indeces.forEach((idx) => selectedIndices.add(idx));
          }
        } else {
          const binStart = i * binWidth;
          const binEnd = (i + 1) * binWidth;
          bin.selected = binStart <= x1 && binEnd >= x0;

          g.select(`.bar:nth-child(${i + 1}) rect:nth-child(1)`).attr(
            "fill",
            bin.selected ? "orange" : "#7A93D1"
          );

          if (bin.selected && bin.indeces) {
            bin.indeces.forEach((idx) => selectedIndices.add(idx));
          }
        }
      });

      // Add a label showing the selected range
      g.append("text")
        .attr("class", "histogram-label")
        .attr("x", width / 2)
        .attr("y", height + 15)
        .attr("font-size", "10px")
        .attr("fill", "#444444")
        .attr("text-anchor", "middle")
        .text(`Range: ${Math.round(bound1)} - ${Math.round(bound2)}`);

      if (this.table) {
        this.table.clearSelection();

        // Convert the Set to an Array for easier processing
        const selectedIndicesArray = Array.from(selectedIndices);

        if (selectedIndicesArray.length > 0) {
          // Get all table rows at once for better performance
          const allRows = Array.from(this.table.tBody.querySelectorAll("tr"));

          // Find and select rows at positions determined by the indices
          selectedIndicesArray.forEach((dataIndex) => {
            // Find the position of this index in the current table view
            const rowPosition = this.table.dataInd.indexOf(dataIndex);
            if (rowPosition >= 0 && rowPosition < allRows.length) {
              const tr = allRows[rowPosition];
              if (tr) {
                this.table.selectRow(tr);
              }
            }
          });
        }

        this.table.selectionUpdated();
      }
    };
  }

  getNode() {
    return this.container;
  }
}
