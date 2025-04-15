import * as d3 from "npm:d3";
// import { DuckDBClient } from "npm:@observablehq/duckdb";

import { BinningService } from "./BinningService.js";

// Control debug output - set to true during development, false in production
const DEBUG = false;

// Custom logging functions that respect the DEBUG flag
const logDebug = (...args) => DEBUG && console.log(...args);
const warnDebug = (...args) => DEBUG && console.warn(...args);
const errorDebug = (...args) => console.error(...args); // Errors always show

export class sorterTable {
  constructor(data, columnNames, changed, options = {}) {
    // Initialize core properties first
    this.data = this.preprocessData(data, columnNames); // Add preprocessing

    // this.db = DuckDBClient.of({ dataset: data }); // Initialize DuckDBClient
    // logDebug("DuckDBClient initialized:", this.db);

    // logDebug("Duckdb query", this.duckFilter());

    this.columnTypes = {};
    this.columns = columnNames.map((col) => {
      if (typeof col === "string") {
        return { column: col, unique: false };
      } else {
        return {
          column: col.column,
          alias: col.alias,
          unique: col.unique || false,
          type: col.type || null, // Add support for manual type definition
        };
      }
    });

    // Add CSS styles for column selection and animation
    const style = document.createElement("style");
    style.textContent = `
      .sorter-table .selected-column {
        background-color: #e3f2fd !important; 
        box-shadow: 0 0 5px rgba(33, 150, 243, 0.5) !important;
        border-top: 2px solid #2196F3 !important;
        border-bottom: 2px solid #2196F3 !important;
      }
      .sorter-table th.selected-column span {
        color: #1976D2 !important;
      }
      @keyframes pulse {
        0% { background-color: #e3f2fd; }
        50% { background-color: #bbdefb; }
        100% { background-color: #e3f2fd; }
      }
    `;
    document.head.appendChild(style);

    // Pre-populate column types if manually specified
    this.columns.forEach((col) => {
      if (col.type) {
        this.columnTypes[col.column] = col.type;
      }
    });

    // Initialize the BinningService
    this.binningService = new BinningService({
      maxOrdinalBins: options.maxOrdinalBins || 12,
      continuousBinMethod: options.continuousBinMethod || "scott",
      dateInterval: options.dateInterval || "day",
      minBinSize: options.minBinSize || 5,
      customThresholds: options.customThresholds || null,
    });

    this.inferColumnTypesAndThresholds(data);

    // create table element
    this.table = document.createElement("table");
    this.table.classList.add("sorter-table");

    this.initialColumns = JSON.parse(JSON.stringify(this.columns));
    this.initialData = [...data]; // Store a copy of the original data

    logDebug("Initial columns:", this.columns);

    this.changed = changed;
    this._isUndoing = false;
    this.dataInd = d3.range(data.length);
    this.sortControllers = [];
    this.visControllers = [];
    this.table = document.createElement("table");
    this.table.style.userSelect = "none";
    this.compoundSorting = {};
    this.selected = [];
    this.selectedColumn = null;
    this.history = [];
    this.tBody = null;
    this.tHead = null;
    this.ctrlDown = false;
    this.shiftDown = false;
    this.lastRowSelected = 0;
    this.defaultLines = 1000;
    this.lastLineAdded = 0;
    this.additionalLines = 500;
    this.addingRows = false;
    this.rules = [];
    this.selectedRows = new Set();
    this.isAggregated = false; // Track if the table is currently showing aggregated data
    this.percentiles = [
      0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8,
      0.9, 0.95, 0.96, 0.97, 0.98, 0.99, 1,
    ];
    this.cellRenderers = {}; // Custom cell renderers
    if (options.cellRenderers) {
      for (const [columnName, renderer] of Object.entries(
        options.cellRenderers
      )) {
        // Find the column object that matches the renderer's column name
        const column = this.columns.find((col) => col.column === columnName);
        if (column) {
          this.cellRenderers[columnName] = renderer;
        } else {
          warnDebug(`No column found for cell renderer: ${columnName}`);
        }
      }
    }
    this.showDefaultControls =
      options.showDefaultControls !== undefined
        ? options.showDefaultControls
        : true;

    this.options = {
      containerHeight: options.height || "400px",
      containerWidth: options.width || "100%",
      rowsPerPage: options.rowsPerPage || 50,
      loadMoreThreshold: options.loadMoreThreshold || 100,
    };

    Object.assign(this.table.style, {
      width: "100%",
      borderCollapse: "collapse",
      // border: "1px solid #ddd",
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
    });

    this.createHeader();
    this.createTable();

    this.table.addEventListener("mousedown", (event) => {
      if (event.shiftKey) {
        this.shiftDown = true;
      } else {
        this.shiftDown = false;
      }
    });
  }

  /**
   * Set the width and/or height of the table container after instantiation.
   * @param {Object} options - Options object with optional width and height.
   * @param {string|number} [options.width] - New width (e.g., "100%", "800px", or a number for px).
   * @param {string|number} [options.height] - New height (e.g., "400px" or a number for px).
   */
  setContainerSize(options = {}) {
    if (options.width !== undefined) {
      this.options.containerWidth =
        typeof options.width === "number"
          ? `${options.width}px`
          : options.width;
    }
    if (options.height !== undefined) {
      this.options.containerHeight =
        typeof options.height === "number"
          ? `${options.height}px`
          : options.height;
    }
    // Update the DOM node if already rendered
    if (this.table && this.table.parentElement) {
      const container = this.table.parentElement.parentElement;
      if (container) {
        if (options.width !== undefined) {
          container.style.width =
            typeof options.width === "number"
              ? `${options.width}px`
              : options.width;
        }
        if (options.height !== undefined) {
          container.style.height =
            typeof options.height === "number"
              ? `${options.height}px`
              : options.height;
        }
      }
    }
  }

  preprocessData(data, columnNames) {
    return data.map((row) => {
      const processed = { ...row };
      columnNames.forEach((col) => {
        const colName = typeof col === "string" ? col : col.column;
        const colType = typeof col === "string" ? null : col.type;

        // Handle continuous columns
        if (colType === "continuous") {
          const value = row[colName];

          // Handle different value cases
          if (value === null || value === undefined || value === "") {
            // FALLBACK VALUE FOR NUMERICAL COLUMNS
            processed[colName] = 0;
          } else if (typeof value === "string") {
            // Clean string numbers
            const cleaned = value.replace(/[^0-9.-]/g, "");
            if (cleaned === "" || isNaN(Number(cleaned))) {
              processed[colName] = 0; // Fallback for invalid numbers
            } else {
              processed[colName] = Number(cleaned);
            }
          } else if (typeof value === "number") {
            if (isNaN(value)) {
              processed[colName] = 0; // Handle NaN
            } else {
              processed[colName] = value; // Keep valid numbers as-is
            }
          } else {
            // Handle any other unexpected types
            processed[colName] = 0;
          }

          // Log problematic values for debugging
          if (processed[colName] === 0 && value !== 0) {
            // DEBUG
            // warnDebug(`Converted invalid value in ${colName}:`, {
            //   original: value,
            //   converted: processed[colName],
            //   rowData: row,
            // });
          }
        }
      });
      return processed;
    });
  }

  setColumnType(columnName, type) {
    if (!columnName) {
      errorDebug("Invalid columnName:", columnName);
      return;
    }
    this.columnTypes[columnName] = type;
    // logDebug("Setting column type:", this.columnTypes);  // DEBUG
  }

  getColumnType(data, column) {
    // If already cached, return the cached type
    if (this.columnTypes[column]) {
      return this.columnTypes[column];
    }

    // Infer type from data
    for (const d of data) {
      const value = d[column];
      if (value === undefined || value === null) continue;

      // Check for date objects
      if (value instanceof Date) return "date";

      // Check for numbers
      if (typeof value === "number" || !isNaN(Number(value))) {
        // Check if it's really continuous or just a few discrete values
        const uniqueValues = new Set(data.map((d) => d[column])).size;
        if (uniqueValues > 10) {
          // Threshold for considering it continuous
          return "continuous";
        }
      }

      // Default to ordinal for strings and small number sets
      return "ordinal";
    }

    // Default to ordinal if no clear type is found
    return "ordinal";
  }

  inferColumnTypesAndThresholds(data) {
    if (!this.binningService) {
      errorDebug("BinningService not initialized");
      return;
    }

    this.columns.forEach((colDef) => {
      const colName = colDef.column;
      const type = this.getColumnType(data, colName);
      colDef.type = type;
      this.setColumnType(colName, type);

      // logDebug("Inferred type for column:", colDef, type);

      // threshold and binning for each type
      if (!colDef.unique) {
        try {
          // If the user has predefined thresholds, use them.
          if (
            colDef.thresholds &&
            Array.isArray(colDef.thresholds) &&
            colDef.thresholds.length
          ) {
            logDebug(`Using predefined thresholds for ${colName}`);
          } else {
            // Otherwise, calculate them via binning service
            const bins = this.binningService.getBins(data, colName, type);
            // logDebug("--------Calculated Bins from service", bins);

            if (!bins || bins.length === 0) {
              warnDebug(`No bins generated for column: ${colName}`);
              return;
            }

            // For continuous data, use computed bin boundaries
            if (type === "continuous") {
              // Avoid filtering out valid values (e.g., 0) by checking for undefined or null explicitly
              colDef.thresholds = bins.map((bin) =>
                bin.x0 !== undefined && bin.x0 !== null ? bin.x0 : null
              );
              colDef.bins = bins;
              logDebug(
                "Setting thresholds for continuous column:",
                colName,
                colDef
              );
            } else if (type === "ordinal") {
              colDef.bins = bins;
              colDef.nominals = bins
                .map((bin) => bin.key)
                .filter((key) => key !== undefined && key !== null);
            } else if (type === "date") {
              colDef.bins = bins;
              colDef.dateRange = d3.extent(bins, (bin) => bin.date);
            }
          }
        } catch (error) {
          errorDebug(`Error binning column ${colName}:`, error);
        }
      }
    });
  }

  // Shift column position using visController
  shiftCol(columnName, dir) {
    // logDebug("Shifting column:", columnName, "direction:", dir);

    let colIndex = this.columns.findIndex((c) => c.column === columnName);
    // logDebug("Found column at index:", colIndex);

    const targetIndex = dir === "left" ? colIndex - 1 : colIndex + 1;
    // logDebug("Target index:", targetIndex);

    if (targetIndex >= 0 && targetIndex < this.columns.length) {
      if (!this._isUndoing) {
        this.history.push({
          type: "shiftcol",
          columnName: columnName,
          dir: dir,
          fromIndex: colIndex,
          toIndex: targetIndex,
        });
      }

      // Store the elements to be moved
      const columnsToMove = {
        column: this.columns[colIndex],
        visController: this.visControllers[colIndex],
        sortController: this.sortControllers[colIndex],
      };

      // Remove elements from original positions
      this.columns.splice(colIndex, 1);
      this.visControllers.splice(colIndex, 1);
      this.sortControllers.splice(colIndex, 1);

      // Insert elements at new positions
      this.columns.splice(targetIndex, 0, columnsToMove.column);
      this.visControllers.splice(targetIndex, 0, columnsToMove.visController);
      this.sortControllers.splice(targetIndex, 0, columnsToMove.sortController);

      // Recreate the table and header
      // this.rebuildTable();
      this.createHeader();
      this.createTable();

      // Update data in visualization controllers
      this.visControllers.forEach((vc, idx) => {
        if (vc && vc.updateData && this.columns[idx]) {
          const columnData = this.dataInd.map(
            (i) => this.data[i][this.columns[idx].column]
          );
          vc.updateData(columnData);
        }
      });
    }
  }

  setSelectedData(selectedIndices) {
    if (!Array.isArray(selectedIndices)) {
      errorDebug("setSelectedData: selectedIndices must be an array.");
      return;
    }

    // Clear existing selection
    this.clearSelection();

    // Validate indices and select rows
    selectedIndices.forEach((index) => {
      if (index >= 0 && index < this.dataInd.length) {
        // Find the corresponding table row element
        const tr = this.tBody.querySelector(`tr:nth-child(${index + 1})`); // +1 because nth-child is 1-based
        if (tr) {
          this.selectRow(tr);
        } else {
          warnDebug(`setSelectedData: Could not find row with index ${index}`);
        }
      } else {
        warnDebug(`setSelectedData: Invalid index ${index}.  Out of bounds.`);
      }
    });

    this.selectionUpdated();
  }

  setSelectedDataByIds(ids, idPropertyName = "id") {
    if (!Array.isArray(ids)) {
      errorDebug("setSelectedDataByIds: ids must be an array.");
      return;
    }

    const idSet = new Set(ids);

    // Clear the current selection
    this.clearSelection();

    // Map from data index to table row index for visible rows
    const dataIndexToTableRowIndex = new Map();
    this.dataInd.forEach((dataIndex, tableRowIndex) => {
      dataIndexToTableRowIndex.set(dataIndex, tableRowIndex);
    });

    // For each data object in the full dataset, check if its ID is in the set
    this.data.forEach((dataObject, dataIndex) => {
      if (dataObject && dataObject.hasOwnProperty(idPropertyName)) {
        if (idSet.has(dataObject[idPropertyName])) {
          // Only select if this row is currently visible
          const tableRowIndex = dataIndexToTableRowIndex.get(dataIndex);
          if (tableRowIndex !== undefined) {
            const tr = this.tBody.querySelector(
              `tr:nth-child(${tableRowIndex + 1})`
            );
            if (tr) {
              this.selectRow(tr);
            } else {
              warnDebug(
                `setSelectedDataByIds: Could not find row for dataIndex ${dataIndex} (tableRowIndex: ${tableRowIndex})`
              );
            }
          }
        }
      } else {
        warnDebug(
          `setSelectedDataByIds: Data object at index ${dataIndex} does not have property '${idPropertyName}'`
        );
      }
    });

    this.selectionUpdated();
  }

  setFilteredDataById(ids, idPropertyName = "id") {
    if (!Array.isArray(ids)) {
      errorDebug("setFilteredDataById: ids must be an array.");
      return;
    }

    const idSet = new Set(ids);
    // Search the full dataset, not just current dataInd, to find matching indices
    const matchingDataIndices = this.data
      .map((dataObject, dataIndex) => {
        if (
          dataObject &&
          dataObject.hasOwnProperty(idPropertyName) &&
          idSet.has(dataObject[idPropertyName])
        ) {
          return dataIndex; // original index in this.data (test)
        }
        return null;
      })
      .filter((index) => index !== null);

    console.log(
      `Found ${matchingDataIndices.length} matching rows out of ${ids.length} IDs`
    );

    if (matchingDataIndices.length === 0) {
      console.warn("No matching IDs found in the dataset");
      return;
    }

    // Update dataInd directly with the matching original indices
    this.dataInd = matchingDataIndices;
    this.history.push({ type: "filterById", data: this.dataInd });

    // Rebuild the table
    this.rebuildTable();

    // Update visualizations
    this.visControllers.forEach((vc, vci) => {
      if (vc instanceof HistogramController) {
        const columnName = this.columns[vci].column;
        vc.setData(this.dataInd.map((i) => this.data[i][columnName]));
      }
    });

    // Call selection before filtering to visually highlight rows
    this.setSelectedDataByIds(ids, idPropertyName);

    // Notify listeners
    const filteredIds = this.dataInd.map((i) => ({
      id: this.data[i][idPropertyName] || i,
    }));
    this.changed({
      type: "filterById",
      indeces: this.dataInd,
      ids: filteredIds,
    });
  }

  filter() {
    this.rules.push(this.getSelectionRule());
    this.dataInd = this.getSelection().map((s) => this.dataInd[s.index]);
    this.history.push({ type: "filter", data: this.dataInd });
    this.createTable();

    this.visControllers.forEach((vc, vci) => {
      // logDebug("Updating visualization controller:", vci);
      if (vc instanceof HistogramController) {
        // Get the correct column name associated with this histogram
        const columnName = this.columns[vci].column;
        // logDebug("By Column:", vci, columnName);

        // Filter data for the specific column and maintain original index
        const columnData = this.dataInd.map((i) => ({
          value: this.data[i][columnName],
          index: i, // Keep track of the original index
        }));

        // Update the histogram data
        vc.setData(this.dataInd.map((i) => this.data[i][columnName]));
      }
    });

    // Collect ids from the filtered data (use 'id' property by default, or specify a different one)
    const idColumn = "id"; // Default id column name
    // const filteredIds = this.dataInd.map((i) => {
    //   // Check if the row has an id property, otherwise return the index as fallback
    //   return this.data[i]?.[idColumn] !== undefined
    //     ? this.data[i]?.[idColumn]
    //     : i;
    // });

    const filteredIds = this.dataInd.map((i) => {
      // Check if the row has an id property, otherwise use the index as fallback
      const idValue =
        this.data[i]?.[idColumn] !== undefined ? this.data[i][idColumn] : i;

      // Return as an object with id property
      return { id: idValue };
    });

    this.changed({
      type: "filter",
      indeces: this.dataInd,
      ids: filteredIds, // Include the ids in the response
      rule: this.getSelectionRule(),
    });
  }

  applyCustomFilter(filterFunction) {
    console.log(">> Applying custom filter function:", filterFunction);

    // Apply the custom filter function to the data
    this.dataInd = this.dataInd.filter((index) => {
      return filterFunction(this.data[index]); // Pass the data object to the filter function
    });

    // Re-render the table and update visualizations
    this.rebuildTable();
    this.visControllers.forEach((vc) => {
      if (vc && vc.updateData) {
        vc.updateData(this.dataInd.map((i) => this.data[i][vc.columnName]));
      }
    });

    // Notify about the filter change
    this.changed({ type: "customFilter", indices: this.dataInd });
  }

  getAllRules() {
    return this.rules;
  }

  undo() {
    if (this.history.length > 0) {
      let u = this.history.pop();
      if (u.type === "filter" || u.type === "sort") {
        this.dataInd = u.data;
        this.createTable();
        this.visControllers.forEach((vc, vci) =>
          vc.updateData(
            this.dataInd.map((i) => this.data[i][this.columns[vci].column])
          )
        );
        this.changed({
          type: "undo",
          indeces: this.dataInd,
          sort: this.compoundSorting,
        });
      } else if (u.type === "shiftcol") {
        this._isUndoing = true;
        const reverseDir = u.dir === "left" ? "right" : "left";
        this.shiftCol(u.columnName, reverseDir);
        this._isUndoing = false;
      } else if (u.type === "aggregate") {
        this.data = u.data;
        this.dataInd = u.dataInd;
        this.isAggregated = false;
        this.rebuildTable();
        this.changed({
          type: "undo",
          indeces: this.dataInd,
          sort: this.compoundSorting,
        });
      }
    }
  }

  rebuildTable() {
    console.log(">>> Rebuilding table...");
    this.createHeader();
    this.createTable();
  }

  getSelection() {
    let ret = [];
    this.selectedRows.forEach((index) => {
      if (index >= 0 && index < this.dataInd.length) {
        ret.push({
          index: index,
          data: this.data[this.dataInd[index]],
        });
      }
    });
    // logDebug("Selection result:", ret);
    this.selected = ret;
    return ret;
  }

  getSelectionRule() {
    let sel = this.getSelection();
    let sortKeys = Object.keys(this.compoundSorting);

    if (sortKeys.length === 0) {
      return null;
    } else {
      let col = sortKeys[0];
      let firstIndex = sel[sel.length - 1].index;
      let lastIndex = sel[sel.length - 1].index;

      if ((firstIndex = 0 && lastIndex == this.dataInd.length - 1)) return [];
      else {
        let rule = [];
        let r = "";
        if (
          firstIndex > 0 &&
          this.data[this.dataInd[firstIndex - 1]][col] !=
            this.data[this.dataInd[firstIndex]][col]
        ) {
          r =
            col +
            (this.compoundSorting[col].how === "up"
              ? " lower than "
              : " higher than ") +
            this.data[this.dataInd[firstIndex]][col];
        }
        if (
          lastIndex < this.dataInd.length - 1 &&
          this.data[this.dataInd[lastIndex + 1]][col] !=
            this.data[this.dataInd[lastIndex]][col]
        ) {
          if (r.length == 0)
            r =
              col +
              (this.compoundSorting[col].how === "up"
                ? " lower than "
                : " higher than ") +
              this.data[this.dataInd[lastIndex]][col];
          else
            r =
              r +
              (this.compoundSorting[col].how === "up"
                ? " and lower than"
                : "  and higher than ") +
              this.data[this.dataInd[lastIndex]][col];
        }
        if (r.length > 0) rule.push(r);

        if (this.compoundSorting[col].how === "up")
          r =
            col +
            " in bottom " +
            this.percentalize(lastIndex / this.data.length, "top") +
            " percentile";
        else
          r =
            col +
            " in top " +
            this.percentalize(1 - lastIndex / this.data.length, "bottom") +
            " percentile";
        rule.push(r);

        return rule;
      }
    }
  }

  selectionUpdated() {
    this.changed({
      type: "selection",
      indeces: this.dataInd,
      selection: this.getSelection(),
      rule: this.getSelectionRule(),
    });
  }

  clearSelection() {
    this.selectedRows.clear(); // Clear the Set of selected rows
    // Also, visually deselect all rows in the table
    if (this.tBody) {
      this.tBody.querySelectorAll("tr").forEach((tr) => {
        this.unselectRow(tr);
        tr.selected = false;
        tr.style.fontWeight = "normal";
        tr.style.color = "grey";
      });
    }
    // if (this.tBody != null)
    //   this.tBody.querySelectorAll("tr").forEach((tr) => this.unselectRow(tr));
  }

  selectColumn(columnName) {
    logDebug("Selected column:", columnName);
    this.selectedColumn = columnName;

    // Remove styling from all headers first
    this.tHead.querySelectorAll("th").forEach((th) => {
      th.style.backgroundColor = "";
      th.style.boxShadow = "";
      th.style.borderTop = "";
      th.style.borderBottom = "";

      if (th.querySelector("span")) {
        th.querySelector("span").style.color = "";
      }

      // Log that styling has been removed
      logDebug(
        "Removed styling from header:",
        th.querySelector("span")?.innerText
      );
    });

    // Find the column index and apply styling directly
    const columnIndex = this.columns.findIndex((c) => c.column === columnName);
    if (columnIndex !== -1) {
      const headerCell = this.tHead.querySelectorAll("th")[columnIndex];

      // Apply direct inline styling
      headerCell.style.backgroundColor = "#e3f2fd";
      headerCell.style.boxShadow = "0 0 5px rgba(33, 150, 243, 0.5)";
      headerCell.style.borderTop = "2px solid #2196F3";
      headerCell.style.borderBottom = "2px solid #2196F3";

      // Style the span element within the th for better visibility
      if (headerCell.querySelector("span")) {
        headerCell.querySelector("span").style.color = "#1976D2";
      }

      // Log that styling has been applied
      logDebug(
        "Applied styling to header:",
        headerCell.querySelector("span")?.innerText
      );
      logDebug("Current headerCell styles:", {
        backgroundColor: headerCell.style.backgroundColor,
        boxShadow: headerCell.style.boxShadow,
        borderTop: headerCell.style.borderTop,
        borderBottom: headerCell.style.borderBottom,
        textColor: headerCell.querySelector("span")?.style.color,
      });

      // Scroll the header into view if needed
      headerCell.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    } else {
      errorDebug("Column not found:", columnName);
    }

    this.changed({
      type: "columnSelection",
      selectedColumn: this.selectedColumn,
    });
  }

  selectRow(tr) {
    tr.selected = true;
    tr.style.fontWeight = "bold";
    tr.style.color = "black";
    this.selectedRows.add(this.getRowIndex(tr));
  }

  unselectRow(tr) {
    tr.selected = false;
    tr.style.fontWeight = "normal";
    tr.style.color = "grey";
    this.selectedRows.delete(this.getRowIndex(tr));
  }

  getRowIndex(tr) {
    let index = -1;
    this.tBody.querySelectorAll("tr").forEach((t, i) => {
      if (t == tr) index = i;
    });
    return index;
  }

  createHeader() {
    if (this.tHead != null) {
      this.table.removeChild(this.tHead);
    }

    this.sortControllers = [];
    this.visControllers = [];

    this.tHead = document.createElement("thead");
    this.table.appendChild(this.tHead);

    // --- Column Header Row ---
    let headerRow = document.createElement("tr");
    this.tHead.append(headerRow);

    this.columns.forEach((c) => {
      let th = document.createElement("th");
      headerRow.appendChild(th);
      th.style.textAlign = "center";

      // --- Column Name ---
      let nameSpan = document.createElement("span");
      nameSpan.innerText = c.alias || c.column;
      // nameSpan.style.fontWeight = "bold";
      // nameSpan.style.fontFamily = "Arial, sans-serif"; // Set font (optional)
      // nameSpan.style.fontSize = "1em";
      // nameSpan.style.cursor = "pointer";
      Object.assign(nameSpan.style, {
        fontWeight: "bold",
        fontFamily: "Arial, sans-serif",
        fontSize: "1em",
        cursor: "pointer",
        userSelect: "none",
        padding: "8px",
      });
      th.appendChild(nameSpan);

      // Add long press event listener
      let longPressTimer;
      let isLongPress = false;
      nameSpan.addEventListener("mousedown", (event) => {
        // Check if the left mouse button was pressed
        if (event.button === 0) {
          isLongPress = false; // Reset long press flag
          longPressTimer = setTimeout(() => {
            isLongPress = true;
            this.selectColumn(c.column); // Select the column
          }, 500); // Adjust the timeout (in milliseconds) as needed
        }
      });

      nameSpan.addEventListener("mouseup", () => {
        clearTimeout(longPressTimer);
      });

      // Prevent context menu on long press
      nameSpan.addEventListener("contextmenu", (event) => {
        event.preventDefault();
      });

      nameSpan.addEventListener("click", () => {
        if (!isLongPress) {
          const sortCtrl = this.sortControllers.find(
            (ctrl) => ctrl.getColumn() === c.column
          );
          if (sortCtrl) {
            sortCtrl.toggleDirection();
            this.sortChanged(sortCtrl);
          }
        }
      });

      // nameSpan.addEventListener("mouseover", () => {
      //   th.style.backgroundColor = "#e8e8e8"; // Light hover effect
      // });

      // nameSpan.addEventListener("mouseout", () => {
      //   th.style.backgroundColor = ""; // Reset background color
      // });

      // --- Controls Row ---
      let controlsRow = document.createElement("tr");
      th.appendChild(controlsRow); // Append controls row to the header cell (th)

      let controlsTd = document.createElement("td");
      controlsRow.appendChild(controlsTd);

      // Create a container for controls
      let controlsContainer = document.createElement("div");
      controlsContainer.style.display = "flex";
      controlsContainer.style.alignItems = "center"; // Vertically center
      controlsContainer.style.justifyContent = "space-around"; // Space out the controls
      controlsContainer.style.width = "100%";
      controlsContainer.style.padding = "2px 0"; // Add some padding
      controlsTd.appendChild(controlsContainer);

      // Shift controller cell
      const shiftCtrl = new ColShiftController(
        c.column,
        (columnName, direction) => this.shiftCol(columnName, direction)
      );
      controlsContainer.appendChild(shiftCtrl.getNode());

      // Sort controller cell
      let sortCtrl = new SortController(c.column, (controller) =>
        this.sortChanged(controller)
      );
      this.sortControllers.push(sortCtrl);
      controlsContainer.appendChild(sortCtrl.getNode());

      // --- Visualization Row ---
      let visRow = document.createElement("tr");
      th.appendChild(visRow); // Append visualization row to the header cell (th)

      let visTd = document.createElement("td");
      visRow.appendChild(visTd);

      if (c.unique) {
        // For unique columns, create a histogram with a single bin
        let uniqueData = this.dataInd.map((i) => this.data[i][c.column]);
        const uniqueBinning = [
          { x0: "Unique", x1: "Unique", values: uniqueData },
        ];
        // let visCtrl = new HistogramController(uniqueData, uniqueBinning); // { unique: true });
        let visCtrl = new HistogramController(uniqueData, { unique: true });
        visCtrl.table = this;
        visCtrl.columnName = c.column;
        this.visControllers.push(visCtrl);
        visTd.appendChild(visCtrl.getNode());
      } else {
        // Create and add visualization controller (histogram) for non-unique columns
        logDebug(" >>>> Creating histogram for column:", c);
        let visCtrl = new HistogramController(
          this.dataInd.map((i) => this.data[i][c.column]),
          c.type === "continuous"
            ? { thresholds: c.thresholds, binInfo: c.bins }
            : { nominals: c.nominals }
          // this.getColumnType(c.column) === "continuous"
          //   ? { thresholds: c.thresholds }
          //   : { nominals: c.nominals }
        );
        visCtrl.table = this;
        visCtrl.columnName = c.column;
        this.visControllers.push(visCtrl);
        visTd.appendChild(visCtrl.getNode());
      }
    });

    // Add sticky positioning to thead
    this.tHead.style.position = "sticky";
    this.tHead.style.top = "0";
    this.tHead.style.backgroundColor = "#ffffff"; // Ensure header is opaque
    this.tHead.style.zIndex = "1"; // Keep header above table content
    this.tHead.style.boxShadow = "0 2px 2px rgba(0,0,0,0.1)";
  }

  createTable() {
    if (this.tBody != null) this.table.removeChild(this.tBody);

    this.tBody = document.createElement("tbody");
    this.table.appendChild(this.tBody);

    this.lastLineAdded = -1;
    this.addTableRows(this.defaultLines);
  }

  addTableRows(howMany) {
    if (this.addingRows) {
      return; // Prevent overlapping calls
    }
    this.addingRows = true;

    let min = this.lastLineAdded + 1; // Corrected: Start from the next line
    let max = Math.min(min + howMany - 1, this.dataInd.length - 1); // Corrected: Use Math.min to avoid exceeding dataInd.length

    for (let row = min; row <= max; row++) {
      let dataIndex = this.dataInd[row]; // Adjust index for dataInd
      if (dataIndex === undefined) continue;

      let tr = document.createElement("tr");
      tr.selected = false;
      Object.assign(tr.style, {
        color: "grey",
        borderBottom: "1px solid #ddd",
      });
      this.tBody.appendChild(tr);

      this.columns.forEach((c) => {
        let td = document.createElement("td");

        // Use custom renderer if available for this column
        if (typeof this.cellRenderers[c.column] === "function") {
          td.innerHTML = "";
          td.appendChild(
            this.cellRenderers[c.column](
              this.data[dataIndex][c.column],
              this.data[dataIndex]
            )
          );
        } else {
          td.innerText = this.data[dataIndex][c.column]; // Default: Set text content
        }

        tr.appendChild(td);
        td.style.color = "inherit";
        td.style.fontWidth = "inherit";
      });

      // Add event listeners for row selection
      tr.addEventListener("click", (event) => {
        let rowIndex = this.getRowIndex(tr);

        if (this.shiftDown) {
          // SHIFT-CLICK (select range)
          let s = this.getSelection().map((s) => s.index);
          if (s.length == 0) s = [rowIndex]; // If nothing selected, use current row index
          let minSelIndex = Math.min(...s);
          let maxSelIndex = Math.max(...s);

          if (rowIndex <= minSelIndex) {
            for (let i = rowIndex; i < minSelIndex; i++) {
              const trToSelect = this.tBody.querySelectorAll("tr")[i];
              if (trToSelect) this.selectRow(trToSelect);
            }
          } else if (rowIndex >= maxSelIndex) {
            for (let i = maxSelIndex + 1; i <= rowIndex; i++) {
              const trToSelect = this.tBody.querySelectorAll("tr")[i];
              if (trToSelect) this.selectRow(trToSelect);
            }
          }
        } else if (this.ctrlDown) {
          // CTRL-CLICK (toggle individual row selection)
          if (tr.selected) {
            this.unselectRow(tr);
          } else {
            this.selectRow(tr);
          }
        } else {
          // NORMAL CLICK (clear selection and select clicked row)
          this.clearSelection();
          this.selectRow(tr);
        }

        this.selectionUpdated();
      });

      // Add hover effect for rows
      tr.addEventListener("mouseover", () => {
        tr.style.backgroundColor = "#f0f0f0"; // Highlight on hover
      });

      tr.addEventListener("mouseout", () => {
        tr.style.backgroundColor = ""; // Reset background color
      });

      // this.lastLineAdded++;
      this.lastLineAdded = row; // Update the last line added
    }

    this.addingRows = false;
  }

  resetTable() {
    // If we're in an aggregated state, restore the original data
    if (this.isAggregated && this.initialData) {
      this.data = [...this.initialData];
      this.isAggregated = false;
    }

    // Reset data indices to initial state
    this.dataInd = d3.range(this.data.length);
    this.selectedRows.clear();
    this.compoundSorting = {};
    this.rules = [];
    this.history = [];
    this.selectedColumn = null; // Clear any column selection

    // Reset sort controllers
    this.sortControllers.forEach((ctrl) => {
      // Reset to default state - used to avoid potential toggle issues
      if (ctrl.getDirection() !== "none") {
        ctrl.toggleDirection();
      }
    });

    // Update column order to the initial state
    this.columns = this.initialColumns.map((col) => ({ ...col }));

    // Re-render the table
    this.createHeader();
    this.createTable();

    // Update visualisation controllers with the restored data
    this.visControllers.forEach((vc, index) => {
      if (vc && vc.updateData) {
        const columnData = this.dataInd.map(
          (i) => this.data[i][this.columns[index].column]
        );
        vc.updateData(columnData);
      }
    });

    // Notify about the reset
    this.changed({ type: "reset" });
  }

  resetHistogramSelections() {
    this.visControllers.forEach((vc) => {
      if (vc instanceof HistogramController) {
        vc.resetSelection();
      }
    });
  }

  sortChanged(controller) {
    this.history.push({ type: "sort", data: [...this.dataInd] });
    this.compoundSorting = {};

    let col = controller.getColumn();
    let how = controller.getDirection();

    if (how == "none") {
      let w = this.compoundSorting[col].weight;
      delete this.compoundSorting[col];
      let sorts = Object.keys(this.compoundSorting);
      let sum = 0;
      sorts.map((sk) => (sum = sum + this.compoundSorting[sk].weight));
      sorts.map((sk) => (this.compoundSorting[sk].weight /= sum));
    } else {
      if (col in this.compoundSorting) this.compoundSorting[col].how = how;
      else {
        let sorts = Object.values(this.compoundSorting);
        let w = 1 / (sorts.length + 1);
        sorts.map((s) => (s.weight *= 1 - w));
        this.compoundSorting[col] = { weight: w, how: how };
      }
    }

    let sorts = {};
    Object.keys(this.compoundSorting).map((col) => {
      let sortDir = this.compoundSorting[col].how === "up" ? 1 : -1;
      if (typeof this.data[0][col] === "string") sortDir *= -1;
      let sortedCol = d3
        .range(this.dataInd.length)
        .sort(
          (i1, i2) =>
            sortDir *
            (this.data[this.dataInd[i1]][col] > this.data[this.dataInd[i2]][col]
              ? 1
              : -1)
        );

      sorts[col] = new Array(this.data.length);
      let rank = 0;
      sorts[col][sortedCol[0]] = rank;
      for (let i = 1; i < sortedCol.length; i++) {
        if (
          this.data[this.dataInd[sortedCol[i]]][col] !=
          this.data[this.dataInd[sortedCol[i - 1]]][col]
        )
          rank = i;
        sorts[col][sortedCol[i]] = rank;
      }
    });

    // this.dataInd.map((v, i) => delete this.data[v].tabindex);

    // DEBUG: Create a separate Map to store tab indices
    const tabIndices = new Map();
    this.dataInd.forEach((v, i) => {
      tabIndices.set(v, i); // Associate data index 'v' with tab index 'i'
    });

    //  use tabIndices to access the tab index for each row during sorting
    this.dataInd.sort((a, b) => {
      let scoreA = 0;
      Object.keys(sorts).forEach((col) => {
        scoreA +=
          this.compoundSorting[col].weight * sorts[col][tabIndices.get(a)];
      });

      let scoreB = 0;
      Object.keys(sorts).forEach((col) => {
        scoreB +=
          this.compoundSorting[col].weight * sorts[col][tabIndices.get(b)];
      });

      return scoreA - scoreB;
    });

    this.visControllers.forEach((vc, index) => {
      const columnName = this.columns[index].column;
      const columnData = this.dataInd.map((i) => this.data[i][columnName]);
      vc.setData(columnData);
    });

    this.createTable();
    // this.createHeader();

    this.changed({
      type: "sort",
      sort: this.compoundSorting,
      indeces: this.dataInd,
    });
  }

  percentalize(v, dir = "top") {
    if (dir === "bottom") {
      for (let i = 1; i < this.percentiles.length; i++) {
        if (v >= this.percentiles[i - 1] && v <= this.percentiles[i]) {
          return 100 * this.percentiles[i - 1];
        }
      }
    } else if (dir === "top") {
      for (let i = 1; i < this.percentiles.length; i++) {
        if (v >= this.percentiles[i - 1] && v <= this.percentiles[i])
          return 100 * this.percentiles[i];
      }
    } else return -1;
  }

  getNode() {
    let container = document.createElement("div");
    container.style.width = "100%";
    container.style.display = "flex";
    container.style.flexDirection = "row";
    Object.assign(container.style, {
      height: this.options.containerHeight,
      width: this.options.containerWidth,
      overflow: "auto",
      position: "relative",
    });

    // --- Sidebar ---
    let sidebar = document.createElement("div");
    Object.assign(sidebar.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: "35px",
      padding: "5px",
      borderRight: "1px solid #ccc",
      marginRight: "2px",
    });

    // --- Filter Icon ---
    let filterIcon = document.createElement("i");
    filterIcon.classList.add("fas", "fa-filter");
    Object.assign(filterIcon.style, {
      cursor: "pointer",
      marginBottom: "15px",
      color: "gray",
    });
    filterIcon.setAttribute("title", "Apply Filter");
    filterIcon.addEventListener("click", (event) => {
      event.stopPropagation();
      this.filter();
    });
    sidebar.appendChild(filterIcon);

    // --- Aggregate Icon ---
    let aggregateIcon = document.createElement("i");
    aggregateIcon.classList.add("fas", "fa-chart-bar");
    Object.assign(aggregateIcon.style, {
      cursor: "pointer",
      marginBottom: "15px",
      color: "gray",
    });
    aggregateIcon.setAttribute("title", "Aggregate by Selected Column");
    aggregateIcon.addEventListener("click", (event) => {
      event.stopPropagation();
      this.aggregate();
    });
    sidebar.appendChild(aggregateIcon);

    // --- Undo Icon ---
    let undoIcon = document.createElement("i");
    undoIcon.classList.add("fas", "fa-undo");
    Object.assign(undoIcon.style, {
      cursor: "pointer",
      marginBottom: "15px",
      color: "gray",
    });
    undoIcon.setAttribute("title", "Undo");
    undoIcon.addEventListener("click", (event) => {
      event.stopPropagation();
      this.undo();
    });
    sidebar.appendChild(undoIcon);

    // --- Reset Icon ---
    let resetIcon = document.createElement("i");
    resetIcon.classList.add("fas", "fa-sync-alt");
    Object.assign(resetIcon.style, {
      cursor: "pointer",
      marginBottom: "15px",
      color: "gray",
    });
    resetIcon.setAttribute("title", "Reset Table");
    resetIcon.addEventListener("click", (event) => {
      event.stopPropagation();
      this.resetTable();
    });
    sidebar.appendChild(resetIcon);

    // --- Table Container ---
    let tableContainer = document.createElement("div");
    Object.assign(tableContainer.style, {
      flex: "1",
      overflowX: "auto",
    });
    if (this.tableWidth) {
      this.table.style.width = this.tableWidth;
    } else {
      this.table.style.width = "100%"; // Default to 100%
    }
    tableContainer.appendChild(this.table);

    // --- Add sidebar and table container to main container ---
    container.appendChild(sidebar);
    container.appendChild(tableContainer);

    // Event listeners for shift and ctrl keys
    container.addEventListener("keydown", (event) => {
      if (event.shiftKey) {
        this.shiftDown = true;
      }
      if (event.ctrlKey) {
        this.ctrlDown = true;
      }
      event.preventDefault();
    });

    container.addEventListener("keyup", (event) => {
      this.shiftDown = false;
      this.ctrlDown = false;
      event.preventDefault();
    });

    container.setAttribute("tabindex", "0"); // Make the container focusable

    // Lazy loading listener
    container.addEventListener("scroll", () => {
      const threshold = 100;
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      if (scrollTop + clientHeight >= scrollHeight - threshold) {
        if (!this.addingRows) {
          this.addTableRows(this.additionalLines);
        }
      }
    });

    //deselection
    // Add click listener to the container
    container.addEventListener("click", (event) => {
      // Check if the click target is outside any table row
      let isOutsideRow = true;
      let element = event.target;
      while (element != null) {
        if (element == this.tBody || element == this.tHead) {
          isOutsideRow = false;
          break;
        }
        element = element.parentNode;
      }

      if (isOutsideRow) {
        this.clearSelection();
        this.resetHistogramSelections();
        this.selectionUpdated();
      }
    });

    return container;
  }

  aggregate() {
    // Check if a column is selected
    if (!this.selectedColumn) {
      alert(
        "Please select a column to aggregate by (long press on a column header)"
      );
      return;
    }

    // Check if the selected column is ordinal type
    const columnObj = this.columns.find(
      (c) => c.column === this.selectedColumn
    );
    const columnType = this.columnTypes[this.selectedColumn];

    if (columnType !== "ordinal") {
      alert(
        "Aggregation is only available for ordinal columns. The selected column is " +
          columnType
      );
      return;
    }

    // Save the current state for potential undo
    this.history.push({
      type: "aggregate",
      data: [...this.data],
      dataInd: [...this.dataInd],
    });

    // Visual feedback - pulse the column header
    const columnIndex = this.columns.findIndex(
      (c) => c.column === this.selectedColumn
    );
    if (columnIndex !== -1) {
      const headerCell = this.tHead.querySelectorAll("th")[columnIndex];
      headerCell.style.animation = "pulse 0.5s";
      headerCell.style.backgroundColor = "#e3f2fd";

      // Reset animation after it completes
      setTimeout(() => {
        headerCell.style.animation = "";
      }, 500);
    }

    // Perform aggregation with appropriate functions for each column type
    const aggregatedData = [];
    const ordinalValues = new Set();

    // First pass: collect all unique values of the ordinal column
    this.dataInd.forEach((index) => {
      ordinalValues.add(this.data[index][this.selectedColumn]);
    });

    // Second pass: aggregate each group
    Array.from(ordinalValues).forEach((value) => {
      // Find all rows with this ordinal value
      const rowsWithValue = this.dataInd.filter(
        (index) => this.data[index][this.selectedColumn] === value
      );

      // Skip if no rows found (shouldn't happen)
      if (rowsWithValue.length === 0) return;

      // Create a new aggregated row
      const aggregatedRow = { [this.selectedColumn]: value };

      // For each column, apply the appropriate aggregation
      this.columns.forEach((col) => {
        const colName = col.column;

        // Skip the column we're aggregating by
        if (colName === this.selectedColumn) return;

        const colType = this.columnTypes[colName];
        const values = rowsWithValue.map((i) => this.data[i][colName]);

        // Apply different aggregation based on column type
        if (colType === "continuous" || colType === "number") {
          // For numerical columns: calculate mean
          const validValues = values.filter((v) => v !== null && !isNaN(v));
          if (validValues.length > 0) {
            aggregatedRow[colName] = d3.mean(validValues);

            // Format to 2 decimal places if it's a calculated mean
            if (
              typeof aggregatedRow[colName] === "number" &&
              !Number.isInteger(aggregatedRow[colName])
            ) {
              aggregatedRow[colName] = parseFloat(
                aggregatedRow[colName].toFixed(2)
              );
            }
          } else {
            aggregatedRow[colName] = 0;
          }
        } else if (colType === "date") {
          // For date columns: count
          aggregatedRow[colName] = values.filter(
            (v) => v !== null && v !== undefined
          ).length;
        } else {
          // For ordinal columns: count
          aggregatedRow[colName] = values.filter(
            (v) => v !== null && v !== undefined
          ).length;
        }
      });

      aggregatedData.push(aggregatedRow);
    });

    // Replace data with aggregated data
    this.originalData = this.data;
    this.data = aggregatedData;
    this.dataInd = d3.range(aggregatedData.length);
    this.isAggregated = true;

    // Rebuild the table with the new aggregated data
    this.rebuildTable();

    // Inform listeners that data has been aggregated
    this.changed({
      type: "aggregate",
      selectedColumn: this.selectedColumn,
      aggregatedData: this.data,
    });
  }

  aggregateData(ordinalColumn, aggregationFunction) {
    if (!ordinalColumn || typeof ordinalColumn !== "string") {
      errorDebug("Invalid ordinalColumn:", ordinalColumn);
      return;
    }

    if (typeof aggregationFunction !== "function") {
      errorDebug("Invalid aggregationFunction:", aggregationFunction);
      return;
    }

    const ordinalValues = new Set(this.data.map((d) => d[ordinalColumn]));

    const aggregatedData = Array.from(ordinalValues).map((value) => {
      const filteredData = this.data.filter((d) => d[ordinalColumn] === value);
      const aggregatedRow = { [ordinalColumn]: value };

      this.columns.forEach((col) => {
        if (col.column !== ordinalColumn) {
          aggregatedRow[col.column] = aggregationFunction(
            filteredData.map((d) => d[col.column])
          );
        }
      });

      return aggregatedRow;
    });

    this.data = aggregatedData;
    this.dataInd = d3.range(this.data.length);
    this.isAggregated = true;

    this.createTable();
    this.visControllers.forEach((vc, index) => {
      const columnName = this.columns[index].column;
      const columnData = this.dataInd.map((i) => this.data[i][columnName]);
      vc.updateData(columnData);
    });

    this.changed({ type: "aggregate", data: this.data });
  }
}

function SortController(colName, update) {
  let active = false;

  let controller = this;
  let div = document.createElement("div");
  div.style.width = "24px";
  div.style.height = "24px";
  div.style.margin = "0 auto";
  div.style.cursor = "pointer";

  // Use Font Awesome icon
  const icon = document.createElement("i");
  icon.classList.add("fas", "fa-sort"); // Initial sort icon
  icon.style.color = "gray";
  icon.style.fontSize = "12px"; // Adjust icon size if needed
  div.appendChild(icon);

  let sorting = "none";

  // Toggle function
  this.toggleDirection = () => {
    if (sorting === "none" || sorting === "down") {
      sorting = "up";
      icon.classList.remove("fa-sort-down", "fa-sort");
      icon.classList.add("fa-sort-up");
    } else {
      sorting = "down";
      icon.classList.remove("fa-sort-up", "fa-sort");
      icon.classList.add("fa-sort-down");
    }
  };

  this.getDirection = () => sorting;

  this.getColumn = () => colName;

  this.getNode = () => div;

  // Prevent click propagation from the icon
  div.addEventListener("click", (event) => {
    event.stopPropagation();
    active = !active;
    controller.toggleDirection();
    update(controller);

    // Visual feedback
    icon.style.color = active ? "#2196F3" : "gray";
  });

  return this;
}

function ColShiftController(columnName, update) {
  let controller = this;
  let div = document.createElement("div");
  div.style.display = "flex";
  div.style.justifyContent = "space-around";
  div.style.width = "100%";

  const createIcon = (iconClass, direction) => {
    const icon = document.createElement("i");
    icon.classList.add("fas", iconClass);
    icon.style.color = "gray";
    icon.style.cursor = "pointer";
    icon.style.fontSize = "12px";
    icon.style.margin = "0 5px";

    icon.addEventListener("click", (event) => {
      event.stopPropagation();
      update(columnName, direction);
    });

    return icon;
  };

  const leftIcon = createIcon("fa-arrow-left", "left");
  const rightIcon = createIcon("fa-arrow-right", "right");

  div.appendChild(leftIcon);
  div.appendChild(rightIcon);

  this.getNode = () => div;
  return this;
}

function HistogramController(data, binrules) {
  let controller = this;
  let div = document.createElement("div");

  this.bins = [];
  this.brush = null;
  this.isBrushing = false;

  this.updateData = (d) => this.setData(d);

  // Reset the selection state of the histogram
  this.resetSelection = () => {
    this.bins.forEach((bin) => {
      bin.selected = false;
    });

    this.svg.selectAll(".bar rect:nth-child(1)").attr("fill", "steelblue");
  };

  // logDebug("------------------binrules outside setData: ", binrules);

  this.setData = function (dd) {
    div.innerHTML = "";

    let data = dd.map((d, i) => ({ value: d, index: i }));

    const svgWidth = 100;
    const svgHeight = 50;
    const margin = { top: 5, right: 5, bottom: 8, left: 5 };
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;

    this.svg = d3
      .select(div)
      .append("svg")
      .attr("width", svgWidth)
      .attr("height", svgHeight);
    // .append("g")
    // .attr("transform", `translate(${margin.left},${margin.top})`);

    logDebug("------------------binrules in setData: ", binrules);

    if (binrules.unique) {
      // Handle unique columns: create a single bin
      this.bins = [
        {
          category: "Unique Values",
          count: data.length,
          indeces: data.map((d) => d.index),
        },
      ];
    } else if ("thresholds" in binrules) {
      logDebug("------------------Continuous data----------------------");
      // Continuous data
      // logDebug("Domain: ", [
      //   d3.min(data, (d) => d.value),
      //   d3.max(data, (d) => d.value),
      // ]);

      // logDebug("Thresholds: ", binrules.thresholds);
      let contBins = d3
        .bin()
        .domain([d3.min(data, (d) => d.value), d3.max(data, (d) => d.value)])
        .thresholds(binrules.thresholds)
        .value((d) => d.value)(data);

      this.bins = contBins.map((b) => ({
        category: b.x0 + "-" + b.x1,
        count: b.length,
        indeces: b.map((v) => v.index),
        x0: b.x0,
        x1: b.x1,
      }));

      // logDebug("Brush Bins: ", this.bins);

      this.xScale = d3
        .scaleLinear()
        .domain([d3.min(data, (d) => d.value), d3.max(data, (d) => d.value)])
        .range([0, width]);

      // Initialize brush for continuous data
      this.brush = d3
        .brushX()
        .extent([
          [0, 0],
          [svgWidth, svgHeight],
        ])
        .on("end", (event) => this.handleBrush(event));

      // Add brush to svg
      this.svg
        .append("g")
        .attr("class", "brush")
        .style("position", "absolute")
        .style("z-index", 90999) // Attempt to force the brush on top
        .call(this.brush);
    } else if ("ordinals" in binrules || "nominals" in binrules) {
      // Handle ordinal or nominal data
      const frequency = d3.rollup(
        data,
        (values) => ({
          count: values.length,
          indeces: values.map((v) => v.index),
        }),
        (d) => d.value
      );

      const binType = "ordinals" in binrules ? "ordinals" : "nominals";

      // use predefined bin order if available
      if (binType in binrules && Array.isArray(binrules[binType])) {
        this.bins = binrules[binType].map((v) => ({
          category: v,
          count: frequency.get(v) != null ? frequency.get(v).count : 0,
          indeces: frequency.get(v) != null ? frequency.get(v).indeces : [],
        }));
      } else {
        this.bins = Array.from(frequency, ([key, value]) => ({
          category: key,
          count: value.count,
          indeces: value.indeces,
        }));
      }
    }

    this.bins.map((bin, i) => (bin.index = i));

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(this.bins, (d) => d.count)])
      .range([height, 0]);

    const barGroups = this.svg
      .selectAll(".bar")
      .data(this.bins)
      .join("g")
      .attr("class", "bar")
      .attr(
        "transform",
        (d, i) => `translate(${(i * width) / this.bins.length}, 0)`
      );

    // Visible bars
    barGroups
      .append("rect")
      .attr("x", 0)
      .attr("width", (d) => width / this.bins.length)
      .attr("y", (d) => y(d.count))
      .attr("height", (d) => height - y(d.count))
      .attr("fill", "steelblue");

    // For continuous data, we don't need the invisible interaction bars
    // Only add them for ordinal/nominal data
    if (!("thresholds" in binrules)) {
      barGroups
        .append("rect")
        .attr("width", (d) => width / this.bins.length)
        .attr("height", height)
        .attr("fill", "transparent")
        .on("mouseover", (event, d) => {
          if (!d.selected) {
            d3.select(event.currentTarget.previousSibling).attr(
              "fill",
              "purple"
            );
          }

          this.svg
            .selectAll(".histogram-label")
            .data([d])
            .join("text")
            .attr("class", "histogram-label")
            .attr("x", width / 2)
            .attr("y", height + 10)
            .attr("font-size", "10px")
            .attr("fill", "#444444")
            .attr("text-anchor", "middle")
            .text(d.category + ": " + d.count);
        })
        .on("mouseout", (event, d) => {
          if (!d.selected) {
            d3.select(event.currentTarget.previousSibling).attr(
              "fill",
              "steelblue"
            );
          }

          this.svg.selectAll(".histogram-label").remove();
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
              "steelblue"
            );
          }

          if (controller.table) {
            if (!d.selected) {
              controller.table.clearSelection();
            }

            this.bins[d.index].indeces.forEach((rowIndex) => {
              const tr = controller.table.tBody.querySelector(
                `tr:nth-child(${rowIndex + 1})`
              );
              if (tr) {
                if (d.selected) {
                  controller.table.selectRow(tr);
                } else {
                  controller.table.unselectRow(tr);
                }
              }
            });
            controller.table.selectionUpdated();
          }
        });
    }

    // Handle brush end event
    this.handleBrush = (event) => {
      // Remove any existing histogram label(s)
      this.svg.selectAll(".histogram-label").remove();

      if (!event.selection) {
        // If no selection from brushing, reset everything
        this.resetSelection();
        if (controller.table) {
          controller.table.clearSelection();
          controller.table.selectionUpdated();
        }
        return;
      }

      const [x0, x1] = event.selection;
      const [bound1, bound2] = event.selection.map(this.xScale.invert);
      const binWidth = width / this.bins.length;

      // Find which bins fall within the selected range
      const selectedIndices = new Set();

      // Mark bins as selected if they overlap with the brush
      this.bins.forEach((bin, i) => {
        // For continuous data, use actual data values to check selection
        if (bin.x0 !== undefined && bin.x1 !== undefined) {
          // Check if bin overlaps with selection
          const binStart = this.xScale(bin.x0);
          const binEnd = this.xScale(bin.x1);

          bin.selected = binEnd >= x0 && binStart <= x1;

          // Update visual representation
          this.svg
            .select(`.bar:nth-child(${i + 1}) rect:nth-child(1)`)
            .attr("fill", bin.selected ? "orange" : "steelblue");

          // Collect all row indices from selected bins
          if (bin.selected && bin.indeces) {
            bin.indeces.forEach((idx) => selectedIndices.add(idx));
          }
        } else {
          // Fallback to position-based selection for other data types
          const binStart = i * binWidth;
          const binEnd = (i + 1) * binWidth;
          bin.selected = binStart <= x1 && binEnd >= x0;

          this.svg
            .select(`.bar:nth-child(${i + 1}) rect:nth-child(1)`)
            .attr("fill", bin.selected ? "orange" : "steelblue");

          if (bin.selected && bin.indeces) {
            bin.indeces.forEach((idx) => selectedIndices.add(idx));
          }
        }
      });

      // Add histogram label showing the selection range
      this.svg
        .append("text")
        .attr("class", "histogram-label")
        .attr("x", width / 2)
        .attr("y", height + 10)
        .attr("font-size", "10px")
        .attr("fill", "#444444")
        .attr("text-anchor", "middle")
        .text(`Range: ${Math.round(bound1)} - ${Math.round(bound2)}`);

      // Update table selection
      if (controller.table) {
        controller.table.clearSelection();

        // Convert the Set to an Array for easier processing
        const rowIndices = Array.from(selectedIndices);

        rowIndices.forEach((rowIndex) => {
          const tr = controller.table.tBody.querySelector(
            `tr:nth-child(${rowIndex + 1})`
          );
          if (tr) {
            controller.table.selectRow(tr);
          }
        });

        controller.table.selectionUpdated();
      }
    };
  };

  this.table = null;
  this.setData(data);

  this.getNode = () => div;
  return this;
}

function createDynamicFilter(attribute, operator, threshold) {
  // Validate attribute
  if (typeof attribute !== "string" || attribute.trim() === "") {
    throw new Error("Invalid attribute: Attribute must be a non-empty string.");
  }

  // Validate operator
  const validOperators = [">", ">=", "<", "<=", "==", "!="];
  if (!validOperators.includes(operator)) {
    throw new Error(
      `Invalid operator: Supported operators are ${validOperators.join(", ")}.`
    );
  }

  // Validate threshold
  if (typeof threshold !== "number" && typeof threshold !== "string") {
    throw new Error(
      "Invalid threshold: Threshold must be a number or a string."
    );
  }

  // Return the filter function
  return (dataObj) => {
    // Use the passed data object directly
    const value = dataObj[attribute];

    if (value === undefined) {
      warnDebug(`Attribute "${attribute}" not found in data object.`);
      return false; // Exclude data objects missing the attribute
    }

    // Perform comparison
    try {
      switch (operator) {
        case ">":
          return value > threshold;
        case ">=":
          return value >= threshold;
        case "<":
          return value < threshold;
        case "<=":
          return value <= threshold;
        case "==":
          return value == threshold; // Consider using === for strict equality
        case "!=":
          return value != threshold; // Consider using !== for strict inequality
        default:
          throw new Error(`Unexpected operator: ${operator}`);
      }
    } catch (error) {
      errorDebug(
        `Error evaluating filter: ${attribute} ${operator} ${threshold} - ${error.message}`
      );
      return false;
    }
  };
}
