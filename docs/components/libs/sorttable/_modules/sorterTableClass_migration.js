import * as d3 from "npm:d3";
import Clusterize from "clusterize.js";
// import { DuckDBClient } from "npm:@observablehq/duckdb";

import { BinningService } from "./BinningService.js";
import { SmallMultiplesView } from "./small_multiples.js";

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

    // View state - table view by default
    this.currentView = "table"; // 'table' or 'smallMultiples'

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

    // this.table.addEventListener("mousedown", (event) => {
    //   if (event.shiftKey) {
    //     this.shiftDown = true;
    //   } else {
    //     this.shiftDown = false;
    //   }
    // });

    this._clusterizeContent = document.createElement("div");
    this._clusterizeContent.className = "clusterize-content";

    this._clusterize = null; // Clusterize instance
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
    // Ensure every row has a unique id property
    return data.map((row, index) => {
      const processed = { ...row };
      // Assign a unique id if not present
      if (!processed.hasOwnProperty("id")) {
        processed.id = `row_${index}`;
      }
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

  setSelectedDataByIds(ids, idPropertyName = "id") {
    if (!Array.isArray(ids)) {
      errorDebug("setSelectedDataByIds: ids must be an array.");
      return;
    }
    const idSet = new Set(ids);
    this.clearSelection();
    // Select rows by id using the new id-based row attribute
    this.tBody.querySelectorAll("tr").forEach((tr) => {
      const rowId = this.getRowId(tr);
      if (idSet.has(rowId)) {
        this.selectRow(tr);
      }
    });
    this.selectionUpdated();
  }

  setFilteredDataById(ids, idPropertyName = "id", options = {}) {
    if (!Array.isArray(ids)) {
      errorDebug("setFilteredDataById: ids must be an array.");
      return;
    }
    const { consecutive = true } = options;
    const idSet = new Set(ids);
    // Filter dataInd to only include rows whose id is in the idSet
    const baseIndices = consecutive ? this.dataInd : d3.range(this.data.length);
    const prevDataInd = [...this.dataInd];
    const matchingDataIndices = baseIndices.filter((dataIndex) => {
      const dataObject = this.data[dataIndex];
      return dataObject && idSet.has(dataObject[idPropertyName]);
    });
    this.dataInd = matchingDataIndices;
    this.history.push({ type: "filterById", data: prevDataInd });
    this.rebuildTable();
    this.visControllers.forEach((vc, vci) => {
      if (vc instanceof HistogramController) {
        const columnName = this.columns[vci].column;
        vc.setData(this.dataInd.map((i) => this.data[i][columnName]));
      }
    });
    this.setSelectedDataByIds(ids, idPropertyName);
    const filteredIds = this.dataInd.map((i) => ({
      id: this.data[i][idPropertyName] || i,
    }));
    this.changed({
      type: "filterById",
      indeces: this.dataInd,
      ids: filteredIds,
    });
  }

  // Update setSelectedData to use ids for backward compatibility
  setSelectedData(selectedIndices) {
    if (!Array.isArray(selectedIndices)) {
      errorDebug("setSelectedData: selectedIndices must be an array.");
      return;
    }
    // Convert indices to ids for selection
    const ids = selectedIndices
      .map((index) => {
        if (index >= 0 && index < this.dataInd.length) {
          return this.data[this.dataInd[index]].id;
        }
        return null;
      })
      .filter((id) => id !== null);
    this.setSelectedDataByIds(ids);
  }

  filter() {
    const prevDataInd = [...this.dataInd];
    this.rules.push(this.getSelectionRule());
    const selected = this.getSelection();
    this.dataInd = selected.map((s) => s.index);
    this.history.push({ type: "filter", data: prevDataInd });
    this.createTable();
    this.visControllers.forEach((vc, vci) => {
      if (vc instanceof HistogramController) {
        const columnName = this.columns[vci].column;
        vc.setData(this.dataInd.map((i) => this.data[i][columnName]));
      }
    });
    const idColumn = "id";
    const filteredIds = this.dataInd.map((i) => {
      const idValue =
        this.data[i]?.[idColumn] !== undefined ? this.data[i][idColumn] : i;
      return { id: idValue };
    });
    this.changed({
      type: "filter",
      indeces: this.dataInd,
      ids: filteredIds,
      rule: this.getSelectionRule(),
    });
  }

  applyCustomFilter(filterFunction, options = {}) {
    const { consecutive = true } = options;
    const baseIndices = consecutive ? this.dataInd : d3.range(this.data.length);
    const prevDataInd = [...this.dataInd];
    this.dataInd = baseIndices.filter((index) =>
      filterFunction(this.data[index])
    );
    this.history.push({ type: "filter", data: prevDataInd });
    this.rebuildTable();
    this.visControllers.forEach((vc) => {
      if (vc && vc.updateData) {
        vc.updateData(this.dataInd.map((i) => this.data[i][vc.columnName]));
      }
    });
    this.changed({ type: "customFilter", indices: this.dataInd });
  }

  getAllRules() {
    return this.rules;
  }

  undo() {
    if (this.history.length > 0) {
      let u = this.history.pop();
      if (u.type === "filter" || u.type === "filterById" || u.type === "sort") {
        this.dataInd = [...u.data];
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
    // Return selected rows using ids
    let ret = [];
    this.selectedRows.forEach((rowId) => {
      // Find the data object by id
      const dataObj = this.data.find((d) => d.id == rowId);
      if (dataObj) {
        ret.push({ id: rowId, data: dataObj });
      }
    });
    this.selected = ret;
    return ret;
  }

  getSelectionRule() {
    let sel = this.getSelection();
    let sortKeys = Object.keys(this.compoundSorting);

    // Check if there is no selection or no sorting applied
    if (sortKeys.length === 0 || sel.length === 0) {
      return null;
    } else {
      let col = sortKeys[0];
      // Safely get first and last index
      let firstIndex = sel.length > 0 ? sel[0].index : 0;
      let lastIndex = sel.length > 0 ? sel[sel.length - 1].index : 0;

      if (firstIndex === 0 && lastIndex === this.dataInd.length - 1) return [];
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
    this.selectedRows.clear(); // Clear the Set of selected row ids
    // Also, visually deselect all rows in the table
    if (this.tBody) {
      this.tBody.querySelectorAll("tr").forEach((tr) => {
        this.unselectRow(tr);
        tr.selected = false;
        tr.style.fontWeight = "normal";
        tr.style.color = "grey";
      });
    }
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
    // Use id for selection tracking
    this.selectedRows.add(this.getRowId(tr));
  }

  unselectRow(tr) {
    tr.selected = false;
    tr.style.fontWeight = "normal";
    tr.style.color = "grey";
    // Use id for selection tracking
    this.selectedRows.delete(this.getRowId(tr));
  }

  getRowId(tr) {
    return tr.getAttribute("data-data-id");
  }

  _attachRowEvents() {
    // Attach events using id-based selection
    const rows = this.tBody.querySelectorAll("tr");
    if (!rows.length) {
      return;
    }
    Array.from(rows).forEach((tr) => {
      tr.addEventListener("click", (event) => {
        const rowId = this.getRowId(tr);
        if (!rowId) return;
        if (event.shiftKey) {
          // Range selection using ids
          let selectedIds = Array.from(this.selectedRows);
          if (selectedIds.length === 0) selectedIds = [rowId];
          const allIds = Array.from(this.tBody.querySelectorAll("tr")).map(
            (t) => this.getRowId(t)
          );
          const startIdx = allIds.indexOf(selectedIds[0]);
          const endIdx = allIds.indexOf(rowId);
          if (startIdx !== -1 && endIdx !== -1) {
            const [start, end] = [
              Math.min(startIdx, endIdx),
              Math.max(startIdx, endIdx),
            ];
            for (let i = start; i <= end; i++) {
              const trToSelect = this.tBody.querySelectorAll("tr")[i];
              if (trToSelect) {
                this.selectRow(trToSelect);
              }
            }
          }
        } else if (event.ctrlKey) {
          if (tr.selected) {
            this.unselectRow(tr);
          } else {
            this.selectRow(tr);
          }
        } else {
          this.clearSelection();
          this.selectRow(tr);
        }
        this.selectionUpdated();
      });
      tr.addEventListener("mouseover", () => {
        tr.style.backgroundColor = "#f0f0f0";
      });
      tr.addEventListener("mouseout", () => {
        tr.style.backgroundColor = "";
      });
    });
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

  // showLoadingIndicator() {
  //   if (!this.loadingIndicator) {
  //     this.loadingIndicator = document.createElement("div");
  //     this.loadingIndicator.classList.add("loading-indicator");
  //     this.loadingIndicator.innerHTML = `<div class="spinner"></div>`;
  //     // Check that the scroll container exists before using it
  //     if (this._scrollContainer && this._scrollContainer.style) {
  //       this._scrollContainer.style.position = "relative";
  //       this._scrollContainer.appendChild(this.loadingIndicator);
  //     } else {
  //       console.error(
  //         "Scroll container not defined. Loading indicator not attached."
  //       );
  //     }
  //   }
  // }

  // hideLoadingIndicator() {
  //   if (this.loadingIndicator && this.loadingIndicator.parentNode) {
  //     this.loadingIndicator.parentNode.removeChild(this.loadingIndicator);
  //     this.loadingIndicator = null;
  //   }
  // }

  createTable() {
    // Generate row HTML for all rows
    const rows = this.dataInd.map((dataIndex, rowIdx) => {
      let cells = this.columns
        .map((c) => {
          if (typeof this.cellRenderers[c.column] === "function") {
            const temp = document.createElement("div");
            temp.appendChild(
              this.cellRenderers[c.column](
                this.data[dataIndex][c.column],
                this.data[dataIndex]
              )
            );
            return `<td>${temp.innerHTML}</td>`;
          } else {
            return `<td>${this.data[dataIndex][c.column]}</td>`;
          }
        })
        .join("");
      // Use data-data-id instead of data-data-index for row identification
      const dataId = this.data[dataIndex].id;
      return `<tr data-row-index="${rowIdx}" data-data-id="${dataId}">${cells}</tr>`;
    });

    // If no rows and we need to show a message
    if (rows.length === 0) {
      rows.push(
        `<tr><td colspan="${this.columns.length}" style="text-align: center; padding: 20px;">No data available</td></tr>`
      );
    }

    // Store the generated rows for potential reuse
    this._generatedRows = rows;

    // We'll update Clusterize if it exists, but we won't initialize it here
    // Instead, we'll do the initialization in getNode() to ensure container is ready
    if (this._clusterize) {
      // For existing clusterize instance, update the rows
      this._clusterize.update(rows);

      // Ensure scroll position is reset and render is forced
      setTimeout(() => {
        if (this._scrollContainer) {
          // Force a small scroll to trigger rendering
          this._scrollContainer.scrollTop = 1;
          // Then reset to top
          setTimeout(() => {
            this._scrollContainer.scrollTop = 0;
          }, 0);
        }
      }, 0);
    } else if (this.tBody) {
      // If Clusterize isn't initialized yet, render rows directly
      // This ensures content is visible even before Clusterize initialization
      const initialVisibleCount = Math.min(50, rows.length);
      this.tBody.innerHTML = rows.slice(0, initialVisibleCount).join("");

      // Attach event listeners to these directly rendered rows
      setTimeout(() => {
        this._attachRowEvents();
      }, 0);
    }
  }

  resetTable() {
    if (this.isAggregated && this.initialData) {
      this.data = [...this.initialData];
      this.isAggregated = false;
    }
    this.dataInd = d3.range(this.data.length);
    this.selectedRows.clear();
    this.compoundSorting = {};
    this.rules = [];
    this.history = [];
    this.selectedColumn = null;
    this.sortControllers.forEach((ctrl) => {
      if (ctrl.getDirection() !== "none") {
        ctrl.toggleDirection();
      }
    });
    this.columns = this.initialColumns.map((col) => ({ ...col }));
    this.createHeader();
    this.createTable();
    this.visControllers.forEach((vc, index) => {
      if (vc && vc.updateData) {
        const columnData = this.dataInd.map(
          (i) => this.data[i][this.columns[index].column]
        );
        vc.updateData(columnData);
      }
    });
    this.changed({ type: "reset" });
    if (this._containerNode) {
      const event = new CustomEvent("reset", { detail: { source: this } });
      this._containerNode.dispatchEvent(event);
    }
  }

  resetHistogramSelections() {
    this.visControllers.forEach((vc) => {
      if (vc instanceof HistogramController) {
        vc.resetSelection();
      }
    });
  }

  /**
   * Toggle between table view and small multiples view
   */
  toggleView() {
    // Toggle the view state
    this.currentView =
      this.currentView === "table" ? "smallMultiples" : "table";

    // Update the switch view icon
    if (this._containerNode) {
      const switchViewIcon =
        this._containerNode.querySelector("#switch-view-icon");
      if (switchViewIcon) {
        // Clear existing classes
        switchViewIcon.classList.remove("fa-th", "fa-table");

        // Add new icon class based on current view
        if (this.currentView === "table") {
          switchViewIcon.classList.add("fa-th");
          switchViewIcon.setAttribute(
            "title",
            "Switch to Small Multiples View"
          );
        } else {
          switchViewIcon.classList.add("fa-table");
          switchViewIcon.setAttribute("title", "Switch to Table View");
        }
      }
    }

    // Re-render the view
    if (this._containerNode) {
      // Instead of trying to replace the node, update the content inside the existing container
      const contentDiv = this._containerNode.querySelector("div:nth-child(2)"); // The content div is the second child

      if (contentDiv) {
        // Clear the current content
        contentDiv.innerHTML = "";

        // Create new content based on the current view
        if (this.currentView === "table") {
          // Table view
          this._scrollContainer = contentDiv;

          // Recreate the table
          if (!this.tBody) {
            this.tBody = document.createElement("tbody");
            this.tBody.className = "clusterize-content";
          }

          // Reset the table
          this.table.innerHTML = "";
          if (this.tHead) this.table.appendChild(this.tHead);
          this.table.appendChild(this.tBody);
          contentDiv.appendChild(this.table);

          // Reinitialize Clusterize
          this._clusterize = null;

          // Always ensure container has proper dimensions
          if (this._scrollContainer) {
            if (!this._scrollContainer.style.height) {
              this._scrollContainer.style.height =
                this.options.containerHeight || "400px";
            }
            if (!this._scrollContainer.style.width) {
              this._scrollContainer.style.width =
                this.options.containerWidth || "100%";
            }
          }

          // Get cached rows or regenerate them
          const rows = this.dataInd.map((dataIndex, rowIdx) => {
            let cells = this.columns
              .map((c) => {
                if (typeof this.cellRenderers[c.column] === "function") {
                  const temp = document.createElement("div");
                  temp.appendChild(
                    this.cellRenderers[c.column](
                      this.data[dataIndex][c.column],
                      this.data[dataIndex]
                    )
                  );
                  return `<td>${temp.innerHTML}</td>`;
                } else {
                  return `<td>${this.data[dataIndex][c.column]}</td>`;
                }
              })
              .join("");
            return `<tr data-row-index="${rowIdx}" data-data-id="${this.data[dataIndex].id}">${cells}</tr>`;
          });

          // Show initial content
          if (rows.length > 0) {
            const initialVisibleCount = Math.min(50, rows.length);
            this.tBody.innerHTML = rows.slice(0, initialVisibleCount).join("");
            this._attachRowEvents();
          }

          // Initialize Clusterize after a short delay
          setTimeout(() => {
            // Calculate optimal row settings based on data size
            const rowsInBlock = Math.min(
              200,
              Math.max(50, Math.floor(this.data.length / 20))
            );

            // Create the Clusterize instance
            this._clusterize = new Clusterize({
              rows: rows,
              scrollElem: this._scrollContainer,
              contentElem: this.tBody,
              callbacks: {
                clusterChanged: () => this._attachRowEvents(),
                clusterWillChange: () => {
                  // Preserve scroll position during updates
                  if (this._scrollContainer) {
                    this._lastScrollTop = this._scrollContainer.scrollTop;
                  }
                },
                scrollingProgress: (progress) => {
                  if (progress > 0.8 && this.options.onNearEnd) {
                    this.options.onNearEnd();
                  }
                },
              },
              // Optimize for large datasets
              rows_in_block: rowsInBlock,
              blocks_in_cluster: 4,
              show_no_data_row: false,
              tag: "tr",
            });

            // Force rendering
            this._clusterize.update(rows);

            setTimeout(() => {
              this._clusterize.refresh(true); // Force full refresh
            }, 50);
          }, 10);
        } else {
          // Small Multiples view
          if (!this._smallMultiplesView) {
            this._smallMultiplesView = new SmallMultiplesView(this, {
              histogramHeight: 120,
              histogramWidth: 160,
              maxColumns: 4,
            });
          }

          // Render the small multiples view
          contentDiv.appendChild(this._smallMultiplesView.render());
        }
      }
    }

    // Notify that view has changed
    this.changed({
      type: "viewChanged",
      view: this.currentView,
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
      // Sort by id instead of index
      let sortedIds = this.dataInd
        .map((i) => this.data[i].id)
        .sort((id1, id2) => {
          const v1 = this.data.find((d) => d.id == id1)[col];
          const v2 = this.data.find((d) => d.id == id2)[col];
          return sortDir * (v1 > v2 ? 1 : -1);
        });
      sorts[col] = sortedIds;
    });

    // Compose the new dataInd as an array of ids
    // For now, use the first sort key only for simplicity
    const sortKey = Object.keys(sorts)[0];
    if (sortKey) {
      this.dataInd = sorts[sortKey].map((id) =>
        this.data.findIndex((d) => d.id == id)
      );
    }

    this.visControllers.forEach((vc, index) => {
      const columnName = this.columns[index].column;
      const columnData = this.dataInd.map((i) => this.data[i][columnName]);
      vc.setData(columnData);
    });

    this.createTable();

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
    sidebar.className = "sidebar";

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

    // --- Custom Filter Icon ---
    let customFilterIcon = document.createElement("i");
    customFilterIcon.classList.add("fas", "fa-filter-circle-xmark");
    Object.assign(customFilterIcon.style, {
      cursor: "pointer",
      marginBottom: "15px",
      color: "gray",
    });
    customFilterIcon.setAttribute("title", "Custom Filter");
    customFilterIcon.addEventListener("click", (event) => {
      event.stopPropagation();
      this.showCustomFilterDialog();
    });
    sidebar.appendChild(customFilterIcon);

    // --- Aggregate Icon ---
    let aggregateIcon = document.createElement("i");
    aggregateIcon.classList.add("fas", "fa-chart-bar");
    Object.assign(aggregateIcon.style, {
      cursor: "pointer",
      marginBottom: "15px",
      color: "gray",
    });
    aggregateIcon.setAttribute("title", "Aggregate by selected column");
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
    undoIcon.setAttribute("title", "Undo Last Action");
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

    // Add a divider
    let divider = document.createElement("div");
    Object.assign(divider.style, {
      width: "20px",
      height: "1px",
      backgroundColor: "#ccc",
      margin: "5px 0 15px 0",
    });
    sidebar.appendChild(divider);

    // --- Switch View Icon ---
    let switchViewIcon = document.createElement("i");
    switchViewIcon.id = "switch-view-icon";

    // Set the icon based on current view
    if (this.currentView === "table") {
      switchViewIcon.classList.add("fas", "fa-th");
      switchViewIcon.setAttribute("title", "Switch to Small Multiples View");
    } else {
      switchViewIcon.classList.add("fas", "fa-table");
      switchViewIcon.setAttribute("title", "Switch to Table View");
    }

    Object.assign(switchViewIcon.style, {
      cursor: "pointer",
      marginBottom: "15px",
      color: "#1976D2", // Highlighting this button with a distinct color
      fontSize: "16px", // Slightly larger
    });

    switchViewIcon.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleView();
    });
    sidebar.appendChild(switchViewIcon);

    // Create content area - will hold either table or small multiples
    let contentDiv = document.createElement("div");
    Object.assign(contentDiv.style, {
      flex: "1",
      height: this.options.containerHeight,
      width: this.options.containerWidth,
      position: "relative",
      overflow: "auto",
    });

    // Handle different views
    if (this.currentView === "table") {
      // Table view
      this._scrollContainer = contentDiv;

      while (this.table.firstChild)
        this.table.removeChild(this.table.firstChild);
      if (this.tHead) this.table.appendChild(this.tHead);
      if (!this.tBody) {
        this.tBody = document.createElement("tbody");
        this.tBody.className = "clusterize-content";
      }
      this.table.appendChild(this.tBody);
      contentDiv.appendChild(this.table);

      // Always ensure container has proper dimensions
      if (this._scrollContainer) {
        if (!this._scrollContainer.style.height) {
          this._scrollContainer.style.height =
            this.options.containerHeight || "400px";
        }
        if (!this._scrollContainer.style.width) {
          this._scrollContainer.style.width =
            this.options.containerWidth || "100%";
        }
      }

      // Only initialize Clusterize once and when container is ready
      if (!this._clusterize) {
        // Get cached rows or regenerate them
        const rows =
          this._generatedRows ||
          this.dataInd.map((dataIndex, rowIdx) => {
            let cells = this.columns
              .map((c) => {
                if (typeof this.cellRenderers[c.column] === "function") {
                  const temp = document.createElement("div");
                  temp.appendChild(
                    this.cellRenderers[c.column](
                      this.data[dataIndex][c.column],
                      this.data[dataIndex]
                    )
                  );
                  return `<td>${temp.innerHTML}</td>`;
                } else {
                  return `<td>${this.data[dataIndex][c.column]}</td>`;
                }
              })
              .join("");
            return `<tr data-row-index="${rowIdx}" data-data-id="${this.data[dataIndex].id}">${cells}</tr>`;
          });

        // Show initial content immediately (this ensures rows are visible without waiting for Clusterize)
        if (rows.length > 0) {
          const initialVisibleCount = Math.min(50, rows.length);
          this.tBody.innerHTML = rows.slice(0, initialVisibleCount).join("");
          this._attachRowEvents();
        }

        // After DOM has settled, initialize Clusterize
        setTimeout(() => {
          // Calculate optimal row settings based on data size
          const rowsInBlock = Math.min(
            200,
            Math.max(50, Math.floor(this.data.length / 20))
          );

          // Create the Clusterize instance
          this._clusterize = new Clusterize({
            rows: rows,
            scrollElem: this._scrollContainer,
            contentElem: this.tBody,
            callbacks: {
              clusterChanged: () => this._attachRowEvents(),
              clusterWillChange: () => {
                // Preserve scroll position during updates
                if (this._scrollContainer) {
                  this._lastScrollTop = this._scrollContainer.scrollTop;
                }
              },
              scrollingProgress: (progress) => {
                if (progress > 0.8 && this.options.onNearEnd) {
                  this.options.onNearEnd();
                }
              },
            },
            // Optimize for large datasets
            rows_in_block: rowsInBlock,
            blocks_in_cluster: 4,
            show_no_data_row: false,
            tag: "tr",
          });

          // Multiple techniques to force rendering
          this._clusterize.update(rows);

          // Force a refresh again after short delay
          setTimeout(() => {
            this._clusterize.refresh(true); // true forces a full refresh
          }, 50);
        }, 10); // Small delay to let DOM stabilize
      }
    } else {
      // Small Multiples view
      if (!this._smallMultiplesView) {
        this._smallMultiplesView = new SmallMultiplesView(this, {
          histogramHeight: 120,
          histogramWidth: 160,
          maxColumns: 4,
        });
      }

      // Render the small multiples view
      contentDiv.appendChild(this._smallMultiplesView.render());
    }

    container.appendChild(sidebar);
    container.appendChild(contentDiv);

    this._containerNode = container;
    return container;
  }

  showCustomFilterDialog() {
    // Remove existing dialog if present
    let oldDialog = document.getElementById("custom-filter-dialog");
    if (oldDialog) oldDialog.remove();

    const dialog = document.createElement("div");
    dialog.id = "custom-filter-dialog";
    Object.assign(dialog.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      background: "#fff",
      border: "1px solid #ccc",
      borderRadius: "8px",
      padding: "20px",
      zIndex: 99999,
      minWidth: "350px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
    });

    const title = document.createElement("h3");
    title.innerText = "Custom Filter Builder";
    title.style.marginTop = "0";
    dialog.appendChild(title);

    const queriesContainer = document.createElement("div");
    dialog.appendChild(queriesContainer);

    // Helper to get column names
    const columnNames = this.columns.map((c) => c.column);

    // Operators
    const operators = [">", ">=", "<", "<=", "==", "!="];
    const boolOperators = ["AND", "OR"];

    // Store query rows
    let queryRows = [];

    function createQueryRow(isFirst = false) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.marginBottom = "8px";
      row.style.gap = "6px";

      // Boolean operator (not for first row)
      let boolOpSelect = null;
      if (!isFirst) {
        boolOpSelect = document.createElement("select");
        boolOperators.forEach((op) => {
          const opt = document.createElement("option");
          opt.value = op;
          opt.innerText = op;
          boolOpSelect.appendChild(opt);
        });
        row.appendChild(boolOpSelect);
      }

      // Column select
      const colSelect = document.createElement("select");
      columnNames.forEach((col) => {
        const opt = document.createElement("option");
        opt.value = col;
        opt.innerText = col;
        colSelect.appendChild(opt);
      });
      row.appendChild(colSelect);

      // Operator select
      const opSelect = document.createElement("select");
      operators.forEach((op) => {
        const opt = document.createElement("option");
        opt.value = op;
        opt.innerText = op;
        opSelect.appendChild(opt);
      });
      row.appendChild(opSelect);

      // Value input
      const valInput = document.createElement("input");
      valInput.type = "text";
      valInput.style.width = "80px";
      row.appendChild(valInput);

      // Remove button
      if (!isFirst) {
        const removeBtn = document.createElement("button");
        removeBtn.innerText = "✕";
        removeBtn.style.marginLeft = "4px";
        removeBtn.style.background = "none";
        removeBtn.style.border = "none";
        removeBtn.style.color = "#c00";
        removeBtn.style.cursor = "pointer";
        removeBtn.title = "Remove";
        removeBtn.onclick = () => {
          queriesContainer.removeChild(row);
          queryRows = queryRows.filter((qr) => qr !== row);
        };
        row.appendChild(removeBtn);
      }

      queriesContainer.appendChild(row);
      queryRows.push(row);
    }

    // Add first query row
    createQueryRow(true);

    // Add Query button
    const addBtn = document.createElement("button");
    addBtn.innerText = "+ Add Query";
    addBtn.style.margin = "8px 0";
    addBtn.onclick = () => createQueryRow(false);
    dialog.appendChild(addBtn);

    // Submit and Cancel buttons
    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.gap = "10px";
    btnRow.style.marginTop = "12px";

    const submitBtn = document.createElement("button");
    submitBtn.innerText = "Apply Filter";
    submitBtn.style.background = "#2196F3";
    submitBtn.style.color = "#fff";
    submitBtn.style.border = "none";
    submitBtn.style.padding = "6px 14px";
    submitBtn.style.borderRadius = "4px";
    submitBtn.style.cursor = "pointer";

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "Cancel";
    cancelBtn.style.background = "#eee";
    cancelBtn.style.border = "none";
    cancelBtn.style.padding = "6px 14px";
    cancelBtn.style.borderRadius = "4px";
    cancelBtn.style.cursor = "pointer";

    cancelBtn.onclick = () => dialog.remove();

    submitBtn.onclick = () => {
      // Build filter functions
      let filters = [];
      let boolOps = [];
      for (let i = 0; i < queryRows.length; ++i) {
        const row = queryRows[i];
        let idx = 0;
        let boolOp = null;
        if (i > 0) {
          boolOp = row.children[idx++].value;
          boolOps.push(boolOp);
        }
        const col = row.children[idx++].value;
        const op = row.children[idx++].value;
        const valRaw = row.children[idx++].value;
        let val;
        // Try to parse as number, fallback to string
        if (!isNaN(Number(valRaw)) && valRaw.trim() !== "") {
          val = Number(valRaw);
        } else {
          val = valRaw;
        }
        filters.push(createDynamicFilter(col, op, val));
      }

      // Compose filters with AND/OR
      let combinedFilter = (row) => {
        let result = filters[0](row);
        for (let i = 1; i < filters.length; ++i) {
          if (boolOps[i - 1] === "AND") {
            result = result && filters[i](row);
          } else {
            result = result || filters[i](row);
          }
        }
        return result;
      };

      this.applyCustomFilter(combinedFilter);
      dialog.remove();
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(submitBtn);
    dialog.appendChild(btnRow);

    document.body.appendChild(dialog);
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

  this.resetSelection = () => {
    this.bins.forEach((bin) => {
      bin.selected = false;
    });
    this.svg.selectAll(".bar rect:nth-child(1)").attr("fill", "#3388FF");
  };

  this.setData = function (dd) {
    div.innerHTML = "";

    // Annotate data with id for each row
    let data = dd.map((d, i) => ({ value: d, id: d && d.id ? d.id : i }));

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

    logDebug("------------------binrules in setData: ", binrules);

    if (binrules.unique) {
      this.bins = [
        {
          category: "Unique Values",
          count: data.length,
          ids: data.map((d) => d.id), // Store ids instead of indices
        },
      ];
    } else if ("thresholds" in binrules) {
      logDebug("------------------Continuous data----------------------");

      let contBins = d3
        .bin()
        .domain([d3.min(data, (d) => d.value), d3.max(data, (d) => d.value)])
        .thresholds(binrules.thresholds)
        .value((d) => d.value)(data);

      this.bins = contBins.map((b) => ({
        category: b.x0 + "-" + b.x1,
        count: b.length,
        ids: b.map((v) => v.id), // Store ids instead of indices
        x0: b.x0,
        x1: b.x1,
      }));

      this.xScale = d3
        .scaleLinear()
        .domain([d3.min(data, (d) => d.value), d3.max(data, (d) => d.value)])
        .range([0, width]);

      this.brush = d3
        .brushX()
        .extent([
          [0, 0],
          [svgWidth, svgHeight],
        ])
        .on("end", (event) => this.handleBrush(event));

      this.svg
        .append("g")
        .attr("class", "brush")
        .style("position", "absolute")
        .style("z-index", 90999)
        .call(this.brush);
    } else if ("ordinals" in binrules || "nominals" in binrules) {
      // Create a frequency map of values to their counts and ids
      const frequency = d3.rollup(
        data,
        (values) => ({
          count: values.length,
          ids: values.map((v) => v.id),
        }),
        (d) => d.value
      );

      const binType = "ordinals" in binrules ? "ordinals" : "nominals";

      // For sorted data, we need to preserve the order of appearance
      const valueOrder = new Map();
      data.forEach((d, i) => {
        if (!valueOrder.has(d.value)) {
          valueOrder.set(d.value, i);
        }
      });

      if (binType in binrules && Array.isArray(binrules[binType])) {
        const binsWithOrder = binrules[binType].map((v) => ({
          category: v,
          orderIndex: valueOrder.has(v) ? valueOrder.get(v) : Infinity,
          count: frequency.get(v) != null ? frequency.get(v).count : 0,
          ids: frequency.get(v) != null ? frequency.get(v).ids : [],
        }));
        binsWithOrder.sort((a, b) => a.orderIndex - b.orderIndex);
        this.bins = binsWithOrder;
      } else {
        this.bins = Array.from(frequency, ([key, value]) => ({
          category: key,
          orderIndex: valueOrder.get(key),
          count: value.count,
          ids: value.ids,
        })).sort((a, b) => a.orderIndex - b.orderIndex);
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

    barGroups
      .append("rect")
      .attr("x", 0)
      .attr("width", (d) => width / this.bins.length)
      .attr("y", (d) => y(d.count))
      .attr("height", (d) => height - y(d.count))
      .attr("fill", "#3388FF")
      .attr("rx", 1)
      .attr("ry", 1);

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
              "#3388FF"
            );
          }

          this.svg.selectAll(".histogram-label").remove();
        })
        .on("click", (event, d) => {
          d.selected = !d.selected;

          d3.select(event.currentTarget.previousSibling).attr(
            "fill",
            d.selected ? "orange" : "#3388FF"
          );

          if (controller.table) {
            // Use ids for selection instead of indices
            if (d.selected) {
              d.ids.forEach((id) => controller.table.selectedRows.add(id));
            } else {
              d.ids.forEach((id) => controller.table.selectedRows.delete(id));
            }
            controller.table.selectionUpdated();
          }
        });
    }

    this.handleBrush = (event) => {
      this.svg.selectAll(".histogram-label").remove();

      const selectedIds = new Set();
      let brushRangeText = "";

      if (event.selection) {
        const [x0, x1] = event.selection;
        const [bound1, bound2] = event.selection.map(this.xScale.invert);
        const binWidth = width / this.bins.length;
        brushRangeText = `Range: ${Math.round(bound1)} - ${Math.round(bound2)}`;

        this.bins.forEach((bin, i) => {
          let isSelected = false;
          if (bin.x0 !== undefined && bin.x1 !== undefined) {
            const binStart = this.xScale(bin.x0);
            const binEnd = this.xScale(bin.x1);
            isSelected = binEnd >= x0 && binStart <= x1;
          } else {
            const binStart = i * binWidth;
            const binEnd = (i + 1) * binWidth;
            isSelected = binStart <= x1 && binEnd >= x0;
          }

          bin.selected = isSelected;

          this.svg
            .select(`.bar:nth-child(${i + 1}) rect:nth-child(1)`)
            .attr("fill", bin.selected ? "orange" : "#3388FF");

          if (bin.selected && bin.ids) {
            bin.ids.forEach((id) => selectedIds.add(id));
          }
        });
      } else {
        this.resetSelection();
      }

      this.svg
        .append("text")
        .attr("class", "histogram-label")
        .attr("x", width / 2)
        .attr("y", height + 10)
        .attr("font-size", "10px")
        .attr("fill", "#444444")
        .attr("text-anchor", "middle")
        .text(brushRangeText);

      if (controller.table) {
        controller.table.selectedRows.clear();
        selectedIds.forEach((id) => {
          controller.table.selectedRows.add(id);
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
  if (typeof attribute !== "string" || attribute.trim() === "") {
    throw new Error("Invalid attribute: Attribute must be a non-empty string.");
  }

  const validOperators = [">", ">=", "<", "<=", "==", "!="];
  if (!validOperators.includes(operator)) {
    throw new Error(
      `Invalid operator: Supported operators are ${validOperators.join(", ")}.`
    );
  }

  if (typeof threshold !== "number" && typeof threshold !== "string") {
    throw new Error(
      "Invalid threshold: Threshold must be a number or a string."
    );
  }

  return (dataObj) => {
    const value = dataObj[attribute];

    if (value === undefined) {
      warnDebug(`Attribute "${attribute}" not found in data object.`);
      return false;
    }

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
          return value == threshold;
        case "!=":
          return value != threshold;
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
