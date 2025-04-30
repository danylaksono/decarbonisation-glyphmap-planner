import * as d3 from "../../../../_npm/d3@7.9.0/_esm.js";
import Clusterize from "../../../../_node/clusterize.js@1.0.0/index.js";
// import { DuckDBClient } from "npm:@observablehq/duckdb";

import { BinningService } from "./BinningService.4b441d41.js";
import { SmallMultiplesView } from "./small_multiples.e706b098.js";

// Control debug output - set to true during development, false in production
const DEBUG = false;

// Custom logging functions that respect the DEBUG flag
const logDebug = (...args) => DEBUG && console.log(...args);
const warnDebug = (...args) => DEBUG && console.warn(...args);
const errorDebug = (...args) => console.error(...args); // Errors always show

// Utility to deep clone objects/arrays
function deepClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    warnDebug("deepClone failed, returning original object:", e);
    return obj;
  }
}

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

    // Initialize cache for expensive calculations
    this._cache = {
      binning: {}, // Cache for results from BinningService
    };

    this.inferColumnTypesAndThresholds(data);

    // create table element
    this.table = document.createElement("table");
    this.table.classList.add("sorter-table");

    this.initialColumns = JSON.parse(JSON.stringify(this.columns));
    this.initialData = [...data]; // Store a copy of the original data

    // Initialize caches for resetTable
    this._initialDataCache = deepClone(this.initialData);
    this._initialColumnsCache = deepClone(this.initialColumns);
    this._initialDataIndCache = d3.range(this.initialData.length);

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
      // fontFamily: "Arial, sans-serif",
      fontFamily: "'Inter', 'Roboto', 'Open Sans', system-ui, sans-serif",
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

  /**
   * Efficiently update the table with new data or reset to initial data
   * @param {Array} newData - New data array to use (optional, uses initialData if not provided)
   * @param {Object} options - Configuration options
   * @param {boolean} [options.replaceInitial=false] - Whether to replace the initialData reference
   * @param {boolean} [options.updateTypes=false] - Whether to reinfer column types and thresholds
   * @param {boolean} [options.resetState=true] - Whether to reset table state (sorting, selection, etc.)
   * @param {boolean} [options.optimizeMemory=true] - Whether to apply memory optimization for large datasets
   * @returns {Promise} A promise that resolves when the update is complete
   */
  updateData(newData, options = {}) {
    // Cancel any pending updates
    if (this._pendingUpdate) {
      cancelAnimationFrame(this._pendingUpdate);
    }

    // Default options
    const defaults = {
      replaceInitial: false,
      updateTypes: false,
      resetState: true,
      optimizeMemory: true,
    };

    const settings = { ...defaults, ...options };

    return new Promise((resolve) => {
      // Schedule update for next frame for better UI responsiveness
      this._pendingUpdate = requestAnimationFrame(() => {
        try {
          // Start with initial data if newData not provided
          if (!newData) {
            if (!this.initialData) {
              console.warn("No initialData available to reset to.");
              resolve(false);
              return;
            }
            newData = [...this.initialData];
            settings.resetState = true; // Force reset when using initialData
          }

          // Update data reference
          this.data = this.preprocessData(
            newData,
            this.columns.map((c) => c.column)
          );

          // Update initial data reference if specified
          if (settings.replaceInitial) {
            this.initialData = [...newData];
          } else if (!this.initialData) {
            // Initialize if not already set
            this.initialData = [...newData];
          }

          // Reset indices to show all rows
          this.dataInd = d3.range(newData.length);

          // Reset state if requested
          if (settings.resetState) {
            // Clear selection state
            this.selectedRows.clear();
            this.compoundSorting = {};
            this.rules = [];
            this.history = [];
            this.selectedColumn = null;
            this.isAggregated = false;

            // Reset sort controllers
            this.sortControllers.forEach((ctrl) => {
              if (ctrl.getDirection() !== "none") {
                ctrl.toggleDirection();
              }
            });
          }

          // Reinfer types if requested
          if (settings.updateTypes) {
            this.inferColumnTypesAndThresholds(this.data);
          }

          // Rebuild the table with new data
          this.rebuildTable();

          // Apply memory optimizations if requested
          if (settings.optimizeMemory && this.data.length > 1000) {
            this.optimizeHistogramMemory();
          }

          // Clear cache if types need updating
          if (settings.updateTypes) {
            logDebug("Clearing binning cache due to updateTypes=true");
            this._cache.binning = {};
          }

          // Notify listeners about the data update
          this.changed({
            type: "dataUpdate",
            dataSize: this.data.length,
            resetState: settings.resetState,
          });

          this._pendingUpdate = null;
          resolve(true);
        } catch (error) {
          console.error("Error updating table data:", error);
          this._pendingUpdate = null;
          resolve(false);
        }
      });
    });
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
      const cacheKey = colName; // Use column name as cache key

      // --- Check Cache First ---
      if (this._cache.binning[cacheKey]) {
        logDebug(`Using cached binning info for ${colName}`);
        const cachedInfo = this._cache.binning[cacheKey];
        colDef.type = cachedInfo.type;
        this.setColumnType(colName, cachedInfo.type); // Ensure columnTypes cache is also updated

        // Assign cached binning results directly
        colDef.thresholds = cachedInfo.thresholds;
        colDef.bins = cachedInfo.bins;
        colDef.nominals = cachedInfo.nominals;
        colDef.dateRange = cachedInfo.dateRange;

        // Skip further calculation for this column
        return;
      }

      // --- If Not Cached: Calculate and Store ---
      logDebug(`Calculating binning info for ${colName} (not cached)`);
      const type = this.getColumnType(data, colName);
      colDef.type = type;
      this.setColumnType(colName, type);

      // Initialize storage for caching
      const cacheEntry = {
        type: type,
        thresholds: undefined,
        bins: undefined,
        nominals: undefined,
        dateRange: undefined,
      };

      // threshold and binning for each type
      if (!colDef.unique) {
        try {
          // If the user has predefined thresholds, use them (don't cache these, they are static)
          if (
            colDef.thresholds &&
            Array.isArray(colDef.thresholds) &&
            colDef.thresholds.length
          ) {
            logDebug(`Using predefined thresholds for ${colName}`);
            // Note: Predefined thresholds are not cached via this mechanism
            // as they are part of the initial column definition.
          } else {
            // Otherwise, calculate them via binning service
            const bins = this.binningService.getBins(data, colName, type);
            // logDebug("--------Calculated Bins from service", bins);

            if (!bins || bins.length === 0) {
              warnDebug(`No bins generated for column: ${colName}`);
              // Still cache the type even if bins failed
              this._cache.binning[cacheKey] = cacheEntry;
              return; // Skip further processing for this column
            }

            // Store calculated bins in the cache entry and colDef
            cacheEntry.bins = bins;
            colDef.bins = bins; // Assign to colDef as well

            // For continuous data, use computed bin boundaries
            if (type === "continuous") {
              // Avoid filtering out valid values (e.g., 0) by checking for undefined or null explicitly
              const thresholds = bins.map((bin) =>
                bin.x0 !== undefined && bin.x0 !== null ? bin.x0 : null
              );
              cacheEntry.thresholds = thresholds;
              colDef.thresholds = thresholds; // Assign to colDef
              logDebug(
                "Setting thresholds for continuous column:",
                colName,
                colDef
              );
            } else if (type === "ordinal") {
              const nominals = bins
                .map((bin) => bin.key)
                .filter((key) => key !== undefined && key !== null);
              cacheEntry.nominals = nominals;
              colDef.nominals = nominals; // Assign to colDef
            } else if (type === "date") {
              const dateRange = d3.extent(bins, (bin) => bin.date);
              cacheEntry.dateRange = dateRange;
              colDef.dateRange = dateRange; // Assign to colDef
            }

            // Store the calculated results in the cache
            this._cache.binning[cacheKey] = cacheEntry;
          }
        } catch (error) {
          errorDebug(`Error binning column ${colName}:`, error);
          // Cache the type even if binning failed
          this._cache.binning[cacheKey] = { type: type };
        }
      } else {
        // For unique columns, just cache the type
        this._cache.binning[cacheKey] = { type: type };
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
    this.clearSelection();
    // Map from data index to table row index for visible rows
    const dataIndexToTableRowIndex = new Map();
    this.dataInd.forEach((dataIndex, tableRowIndex) => {
      dataIndexToTableRowIndex.set(dataIndex, tableRowIndex);
    });
    this.data.forEach((dataObject, dataIndex) => {
      if (dataObject && dataObject.hasOwnProperty(idPropertyName)) {
        if (idSet.has(dataObject[idPropertyName])) {
          const tableRowIndex = dataIndexToTableRowIndex.get(dataIndex);
          if (tableRowIndex !== undefined) {
            const tr = this.tBody.querySelector(
              `tr:nth-child(${tableRowIndex + 1})`
            );
            if (tr) {
              this.selectRow(tr);
            }
          }
        }
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
    const baseIndices = consecutive ? this.dataInd : d3.range(this.data.length);
    const prevDataInd = [...this.dataInd];
    const matchingDataIndices = baseIndices.filter((dataIndex) => {
      const dataObject = this.data[dataIndex];
      return (
        dataObject &&
        dataObject.hasOwnProperty(idPropertyName) &&
        idSet.has(dataObject[idPropertyName])
      );
    });
    this.dataInd = matchingDataIndices;

    logDebug("Filtering table using:", ids);
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

  filter() {
    const prevDataInd = [...this.dataInd];
    // this.rules.push(this.getSelectionRule());
    const selectionRule = this.getSelectionRule();

    // Only add valid rules
    if (selectionRule) {
      this.rules.push(selectionRule);
    }

    const selected = this.getSelection();
    this.dataInd = selected.map((s) => s.index);

    // this.history.push({ type: "filter", data: prevDataInd });
    this.history.push({
      type: "filter",
      data: prevDataInd,
      rule: selectionRule,
    });

    // Rebuild the table and update visualizations
    this.createTable();
    this.visControllers.forEach((vc, vci) => {
      if (vc instanceof HistogramController) {
        const columnName = this.columns[vci].column;
        vc.setData(this.dataInd.map((i) => this.data[i][columnName]));
      }
    });

    // recording the filtered IDs
    const idColumn = "id";
    const filteredIds = this.dataInd.map((i) => {
      const idValue =
        this.data[i]?.[idColumn] !== undefined ? this.data[i][idColumn] : i;
      return { id: idValue };
    });

    // record the filter change
    this.changed({
      type: "filter",
      indeces: this.dataInd,
      ids: filteredIds,
      // rule: this.getSelectionRule(),
      rule: selectionRule,
    });
  }

  applyCustomFilter(filterFunction, options = {}) {
    const { consecutive = true } = options;
    const baseIndices = consecutive ? this.dataInd : d3.range(this.data.length);
    const prevDataInd = [...this.dataInd];

    // Apply the filter function to the data
    this.dataInd = baseIndices.filter((index) =>
      filterFunction(this.data[index])
    );

    // Custom filter rules can be passed in the options
    const customRule = options.customRule || [
      `Custom filter applied (${this.dataInd.length} rows)`,
    ];

    // Add to rules list if filtering was effective
    if (this.dataInd.length !== prevDataInd.length) {
      this.rules.push(customRule);
    }

    // track history
    this.history.push({ type: "filter", data: prevDataInd });

    // Rebuild the table and update visualizations
    this.rebuildTable();
    this.visControllers.forEach((vc) => {
      if (vc && vc.updateData) {
        vc.updateData(this.dataInd.map((i) => this.data[i][vc.columnName]));
      }
    });

    // recording the filtered IDs
    const idColumn = "id";
    const filteredIds = this.dataInd.map((i) => {
      const idValue =
        this.data[i]?.[idColumn] !== undefined ? this.data[i][idColumn] : i;
      return { id: idValue };
    });

    // this.changed({ type: "customFilter", indices: this.dataInd });
    this.changed({
      type: "filter",
      indeces: this.dataInd,
      ids: filteredIds,
      rule: customRule,
    });
  }

  // helper method for setting selection rule from external mechanisms
  setSelectionRuleFromExternal(rule) {
    if (!Array.isArray(rule)) {
      rule = [rule];
    }
    // Store the rule for later retrieval
    this._externalSelectionRule = rule;
    return this;
  }

  getAllRules() {
    return this.rules;
  }

  // undo() {
  //   if (this.history.length > 0) {
  //     let u = this.history.pop();
  //     if (u.type === "filter" || u.type === "filterById" || u.type === "sort") {
  //       this.dataInd = [...u.data];
  //       this.createTable();
  //       this.visControllers.forEach((vc, vci) =>
  //         vc.updateData(
  //           this.dataInd.map((i) => this.data[i][this.columns[vci].column])
  //         )
  //       );
  //       this.changed({
  //         type: "undo",
  //         indeces: this.dataInd,
  //         sort: this.compoundSorting,
  //       });
  //     } else if (u.type === "shiftcol") {
  //       this._isUndoing = true;
  //       const reverseDir = u.dir === "left" ? "right" : "left";
  //       this.shiftCol(u.columnName, reverseDir);
  //       this._isUndoing = false;
  //     } else if (u.type === "aggregate") {
  //       this.data = u.data;
  //       this.dataInd = u.dataInd;
  //       this.isAggregated = false;
  //       this.rebuildTable();
  //       this.changed({
  //         type: "undo",
  //         indeces: this.dataInd,
  //         sort: this.compoundSorting,
  //       });
  //     }
  //   }
  // }

  undo() {
    if (this.history.length > 0) {
      let u = this.history.pop();
      if (u.type === "filter" || u.type === "filterById" || u.type === "sort") {
        this.dataInd = [...u.data];

        // If we're undoing a filter, also remove the corresponding rule
        if (
          (u.type === "filter" || u.type === "filterById") &&
          this.rules.length > 0
        ) {
          this.rules.pop();
        }

        this.createTable();
        this.visControllers.forEach((vc, vci) => {
          if (vc && vc.updateData && this.columns[vci]) {
            vc.updateData(
              this.dataInd.map((i) => this.data[i][this.columns[vci].column])
            );
          }
        });

        this.changed({
          type: "undo",
          indeces: this.dataInd,
          sort: this.compoundSorting,
          rules: this.rules,
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
          rules: this.rules,
        });
      }
    }
  }

  rebuildTable() {
    logDebug(">>> Rebuilding table...");
    this.createHeader();
    this.createTable();
  }

  getSelection() {
    let ret = [];
    this.selectedRows.forEach((dataIndex) => {
      const pos = this.dataInd.indexOf(dataIndex);
      if (pos !== -1) {
        ret.push({ index: dataIndex, data: this.data[dataIndex] });
      }
    });
    this.selected = ret;
    return ret;
  }

  getSelectionRule() {
    let sel = this.getSelection();
    let sortKeys = Object.keys(this.compoundSorting);

    // Handle case where no rows are selected or no sorting is applied
    if (sel.length === 0) {
      // Return null when no selection exists
      return null;
    }

    // If we have selection but no sorting, create a rule based on set membership
    if (sortKeys.length === 0) {
      // Create a rule based on the values of the first visible column
      const firstVisibleCol = this.columns[0].column;
      const uniqueValues = new Set(sel.map((s) => s.data[firstVisibleCol]));

      if (uniqueValues.size <= 5) {
        // For small sets, list all values
        return [
          `${firstVisibleCol} is one of: ${Array.from(uniqueValues).join(
            ", "
          )}`,
        ];
      } else {
        // For larger sets, summarize the selection
        return [
          `Selection includes ${sel.length} rows (${Math.round(
            (sel.length / this.dataInd.length) * 100
          )}% of visible data)`,
        ];
      }
    }

    // If we reach here, we have both selection and sorting
    let col = sortKeys[0];

    // Create a map of data indices to their positions in dataInd for efficient lookup
    const dataIndPositions = new Map();
    this.dataInd.forEach((dataIndex, position) => {
      dataIndPositions.set(dataIndex, position);
    });

    // Find the positions of the selected items in the sorted dataInd array
    const selectedPositions = sel
      .map((s) => dataIndPositions.get(s.index))
      .filter((pos) => pos !== undefined)
      .sort((a, b) => a - b);

    // If no valid positions, return null
    if (selectedPositions.length === 0) {
      return null;
    }

    const minPosition = selectedPositions[0];
    const maxPosition = selectedPositions[selectedPositions.length - 1];

    // If selection spans the entire dataset, return empty array
    if (minPosition === 0 && maxPosition === this.dataInd.length - 1) return [];

    // Check if selection is contiguous
    const isContiguous =
      maxPosition - minPosition + 1 === selectedPositions.length;

    let rule = [];
    let r = "";

    if (isContiguous) {
      // Lower boundary check
      if (minPosition > 0) {
        const minValue = this.data[this.dataInd[minPosition]][col];
        const prevValue = this.data[this.dataInd[minPosition - 1]][col];

        if (minValue != prevValue) {
          r =
            col +
            (this.compoundSorting[col].how === "up" ? " >= " : " <= ") +
            minValue;
        }
      }

      // Upper boundary check
      if (maxPosition < this.dataInd.length - 1) {
        const maxValue = this.data[this.dataInd[maxPosition]][col];
        const nextValue = this.data[this.dataInd[maxPosition + 1]][col];

        if (maxValue != nextValue) {
          if (r.length === 0) {
            r =
              col +
              (this.compoundSorting[col].how === "up" ? " <= " : " >= ") +
              maxValue;
          } else {
            r =
              r +
              (this.compoundSorting[col].how === "up"
                ? " AND <= "
                : " AND >= ") +
              maxValue;
          }
        }
      }
    } else {
      // For non-contiguous selection, provide a more descriptive rule
      const selectedValues = new Set(
        selectedPositions.map((pos) => this.data[this.dataInd[pos]][col])
      );

      if (selectedValues.size <= 5) {
        r = `${col} is one of: ${Array.from(selectedValues).join(", ")}`;
      } else {
        // For many values, provide range
        const values = Array.from(selectedValues).sort((a, b) => {
          // Handle various data types
          if (typeof a === "number" && typeof b === "number") {
            return a - b;
          }
          return String(a).localeCompare(String(b));
        });

        r = `${col} ranges from ${values[0]} to ${values[values.length - 1]} (${
          selectedValues.size
        } distinct values)`;
      }
    }

    if (r.length > 0) rule.push(r);

    // Add percentile information when sorting is applied
    if (this.compoundSorting[col]) {
      if (this.compoundSorting[col].how === "up") {
        r = `${col} in bottom ${Math.round(
          ((maxPosition + 1) / this.dataInd.length) * 100
        )}% percentile`;
      } else {
        r = `${col} in top ${Math.round(
          ((this.dataInd.length - minPosition) / this.dataInd.length) * 100
        )}% percentile`;
      }
      rule.push(r);
    }

    return rule;
  }

  selectionUpdated() {
    // use external rule if set
    const calculatedRule = this.getSelectionRule();
    const rule = this._externalSelectionRule || calculatedRule;

    // Clear external rule after use
    this._externalSelectionRule = null;

    this.changed({
      type: "selection",
      indeces: this.dataInd,
      selection: this.getSelection(),
      // rule: this.getSelectionRule(),
      rule: rule,
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
    const dataIndexAttr = tr.getAttribute("data-data-index");
    if (dataIndexAttr !== null) {
      return parseInt(dataIndexAttr, 10);
    }
    // Fallback to old method
    let index = -1;
    this.tBody.querySelectorAll("tr").forEach((t, i) => {
      if (t == tr) index = i;
    });
    return index;
  }

  /**
   * Updates the visual display of all rows to match the current selection state
   * Particularly useful when selection is made programmatically through histograms
   */
  updateRowSelectionDisplay() {
    // Only proceed if the table body exists
    if (!this.tBody) return;

    // For efficient lookup
    const selectedSet = this.selectedRows;

    // Update all visible rows
    this.tBody.querySelectorAll("tr").forEach((tr) => {
      const dataIndex = parseInt(tr.getAttribute("data-data-index"), 10);

      if (selectedSet.has(dataIndex)) {
        // Apply selection styling
        tr.selected = true;
        tr.style.fontWeight = "bold";
        tr.style.color = "black";
      } else {
        // Apply unselected styling
        tr.selected = false;
        tr.style.fontWeight = "normal";
        tr.style.color = "grey";
      }
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
      return `<tr data-row-index="${rowIdx}" data-data-index="${dataIndex}">${cells}</tr>`;
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

  _attachRowEvents() {
    // Check if there are any rows to attach events to
    const rows = this.tBody.querySelectorAll("tr");
    if (!rows.length) {
      return; // No rows to process, exit early
    }

    // Create a Map of data indices to positions in dataInd array for efficient lookup
    const dataIndPositionMap = new Map();
    this.dataInd.forEach((dataIndex, position) => {
      dataIndPositionMap.set(dataIndex, position);
    });

    // For each row in the current view, attach event listeners
    Array.from(rows).forEach((tr) => {
      // Clone the row to remove any existing event listeners
      const newTr = tr.cloneNode(true);

      // Get the actual data index (not the row position)
      const dataIndex = parseInt(tr.getAttribute("data-data-index"), 10);
      if (isNaN(dataIndex)) {
        // If data-data-index is missing, copy the existing attributes and move on
        tr.parentNode.replaceChild(newTr, tr);
        return;
      }

      // Add click event with improved selection logic
      newTr.addEventListener("click", (event) => {
        if (isNaN(dataIndex)) return;

        if (event.shiftKey) {
          // Use dataInd positions for range calculation, not DOM positions
          let selectedIndices = Array.from(this.selectedRows);

          if (selectedIndices.length === 0) {
            // If nothing selected, just select this row
            this.selectedRows.add(dataIndex);
            this.selectRow(newTr);
          } else {
            // Find positions in dataInd for start/end of range
            const positions = selectedIndices
              .map((index) => dataIndPositionMap.get(index))
              .filter((pos) => pos !== undefined);

            // Add current position
            const currentPosition = dataIndPositionMap.get(dataIndex);

            // Calculate range in terms of positions in dataInd
            const startPos = Math.min(...positions, currentPosition);
            const endPos = Math.max(...positions, currentPosition);

            // Select all rows in this range
            for (let pos = startPos; pos <= endPos; pos++) {
              const indexToSelect = this.dataInd[pos];
              this.selectedRows.add(indexToSelect);

              // Update visible selection if the row is rendered
              const trToSelect = this.tBody.querySelector(
                `tr[data-data-index="${indexToSelect}"]`
              );
              if (trToSelect) {
                this.selectRow(trToSelect);
              }
            }
          }
        } else if (event.ctrlKey || event.metaKey) {
          // Toggle selection state of this row
          if (this.selectedRows.has(dataIndex)) {
            this.selectedRows.delete(dataIndex);
            this.unselectRow(newTr);
          } else {
            this.selectedRows.add(dataIndex);
            this.selectRow(newTr);
          }
        } else {
          // Regular click - clear selection and select only this row
          this.clearSelection();
          this.selectedRows.add(dataIndex);
          this.selectRow(newTr);
        }

        this.selectionUpdated();
      });

      // Add hover events
      newTr.addEventListener("mouseover", () => {
        newTr.style.backgroundColor = "#f0f0f0";
      });

      newTr.addEventListener("mouseout", () => {
        newTr.style.backgroundColor = "";
      });

      // Replace old row with new one that has proper listeners
      tr.parentNode.replaceChild(newTr, tr);

      // Reflect current selection state
      if (this.selectedRows.has(dataIndex)) {
        this.selectRow(newTr);
      }
    });
  }

  resetTable(useInitialData = true, options = {}) {
    // Delegate to updateData to reset to initialData via history mechanism
    const startTime = performance.now();
    this._isUndoing = true;
    while (this.history.length > 0) {
      // fast undo without side-effects
      const last = this.history.pop();
      if (
        last.type === "filter" ||
        last.type === "filterById" ||
        last.type === "sort"
      ) {
        this.dataInd = last.data;
      } else if (last.type === "shiftcol") {
        // reverse column shift
        const revDir = last.dir === "left" ? "right" : "left";
        this.shiftCol(last.columnName, revDir);
      } else if (last.type === "aggregate") {
        this.data = last.data;
        this.dataInd = last.dataInd;
        this.isAggregated = false;
      }
    }
    this._isUndoing = false;
    // Restore initial column order
    this.columns = deepClone(this.initialColumns);
    // Rebuild table view
    this.createHeader();
    this.createTable();

    // additional steaps
    // Reset indices to show all rows
    this.dataInd = d3.range(this.data.length);

    // Clear selection state
    this.clearSelection();
    // this.selectedRows.clear();
    this.compoundSorting = {};
    this.rules = [];
    this.history = [];
    this.selectedColumn = null;

    // Reset sort controllers
    this.sortControllers.forEach((ctrl) => {
      if (ctrl.getDirection() !== "none") {
        ctrl.toggleDirection();
      }
    });

    // Update histograms efficiently
    this.updateHistograms();

    // Apply memory optimizations for large datasets
    if (this.data.length > 10000) {
      this.optimizeHistogramMemory();
    }

    // Notify listeners
    this.changed({
      type: "reset",
      performanceMs: performance.now() - startTime,
    });

    if (this._containerNode) {
      const event = new CustomEvent("reset", {
        detail: {
          source: this,
          performanceMs: performance.now() - startTime,
        },
      });
      this._containerNode.dispatchEvent(event);
    }

    return this; // Enable method chaining
  }

  // resetTable(useInitialData = true, options = {}) {
  //   // Reset table with cached data
  //   // Default options
  //   const defaults = {
  //     reInferTypes: false, // By default, reuse cached types/bins for speed
  //   };
  //   const settings = { ...defaults, ...options };

  //   // Measure performance
  //   const startTime = performance.now();

  //   // Clear cache if requested
  //   if (settings.reInferTypes) {
  //     logDebug("Clearing binning cache due to resetTable option");
  //     this._cache.binning = {};
  //   } else {
  //     logDebug("Retaining binning cache during resetTable for performance");
  //     // Note: If data characteristics changed significantly,
  //     // cached bins might become inaccurate. Use reInferTypes: true if needed.
  //   }

  //   // Reset aggregation state
  //   if (this.isAggregated && this.initialData) {
  //     this.data = useInitialData ? [...this.initialData] : this.data;
  //     this.isAggregated = false;
  //   } else if (useInitialData && this.initialData) {
  //     // Reset to initial data even if not aggregated
  //     this.data = [...this.initialData];
  //   }

  //   // Reset indices to show all rows
  //   this.dataInd = d3.range(this.data.length);

  //   // Clear selection state (implemented as a batch operation for better performance)
  //   this.selectedRows.clear();
  //   this.compoundSorting = {};
  //   this.rules = [];
  //   this.history = [];
  //   this.selectedColumn = null;

  //   // Reset sort controllers
  //   this.sortControllers.forEach((ctrl) => {
  //     if (ctrl.getDirection() !== "none") {
  //       ctrl.toggleDirection();
  //     }
  //   });

  //   // Reset columns to initial state (deep copy to avoid reference issues)
  //   this.columns = this.initialColumns.map((col) => ({ ...col }));

  //   // Rebuild the table in one efficient operation
  //   this.rebuildTable();

  //   // Update histograms efficiently
  //   this.updateHistograms();

  //   // Apply memory optimizations for large datasets
  //   if (this.data.length > 10000) {
  //     this.optimizeHistogramMemory();
  //   }

  //   // Notify listeners
  //   this.changed({
  //     type: "reset",
  //     performanceMs: performance.now() - startTime,
  //   });

  //   if (this._containerNode) {
  //     const event = new CustomEvent("reset", {
  //       detail: {
  //         source: this,
  //         performanceMs: performance.now() - startTime,
  //       },
  //     });
  //     this._containerNode.dispatchEvent(event);
  //   }

  //   return this; // Enable method chaining
  // }

  updateHistograms() {
    // Use requestAnimationFrame to schedule histogram updates for better UI responsiveness
    if (this._pendingHistogramUpdate) {
      cancelAnimationFrame(this._pendingHistogramUpdate);
    }

    this._pendingHistogramUpdate = requestAnimationFrame(() => {
      const startTime = performance.now();

      // Update histograms in batches to prevent UI freezing
      const batchSize = Math.max(1, Math.ceil(this.visControllers.length / 3));
      const updateBatch = (startIdx) => {
        const endIdx = Math.min(
          startIdx + batchSize,
          this.visControllers.length
        );

        for (let i = startIdx; i < endIdx; i++) {
          const vc = this.visControllers[i];
          if (vc && vc.updateData) {
            const columnName = this.columns[i].column;
            // Extract only the data needed for this histogram
            const columnData = this.dataInd.map(
              (i) => this.data[i][columnName]
            );
            vc.updateData(columnData);
          }
        }

        // Continue with next batch if needed
        if (endIdx < this.visControllers.length) {
          setTimeout(() => updateBatch(endIdx), 0);
        } else {
          // All batches complete
          logDebug(
            `Histogram updates completed in ${performance.now() - startTime}ms`
          );
          this._pendingHistogramUpdate = null;
        }
      };

      // Start first batch
      updateBatch(0);
    });
  }

  resetHistogramSelections() {
    this.visControllers.forEach((vc) => {
      if (vc instanceof HistogramController) {
        vc.resetSelection();
      }
    });
  }

  optimizeHistogramMemory() {
    // Limit number of bins for large datasets
    const maxBins = Math.min(50, Math.ceil(Math.sqrt(this.data.length)));

    this.visControllers.forEach((vc) => {
      if (vc instanceof HistogramController) {
        // Reduce precision for large datasets
        if (this.data.length > 10000) {
          vc.setOptions({ precision: "low", maxBins });
        }
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
            return `<tr data-row-index="${rowIdx}" data-data-index="${dataIndex}">${cells}</tr>`;
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
    container.id = "sorter-table-container";
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
            return `<tr data-row-index="${rowIdx}" data-data-index="${dataIndex}">${cells}</tr>`;
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
      minWidth: "400px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
    });

    const title = document.createElement("h3");
    title.innerText = "Custom Filter Builder";
    title.style.marginTop = "0";
    dialog.appendChild(title);

    const queriesContainer = document.createElement("div");
    dialog.appendChild(queriesContainer);

    // Define type-specific operators
    const operatorsByType = {
      continuous: [">", ">=", "<", "<=", "==", "!=", "between"],
      ordinal: ["==", "!=", "contains", "starts with", "ends with"],
      date: ["before", "after", "on", "between"],
      boolean: ["is true", "is false"],
      default: [">", ">=", "<", "<=", "==", "!="],
    };

    // Boolean operators for combining filters
    const boolOperators = ["AND", "OR"];

    // Store query rows
    let queryRows = [];

    // Helper function to get column type
    const getColumnType = (columnName) => {
      const column = this.columns.find((c) => c.column === columnName);
      // Return the column type if it exists, otherwise fall back to the one in columnTypes
      return column?.type || this.columnTypes[columnName] || "ordinal";
    };

    // Helper function to create the appropriate input field based on column type
    const createInputField = (columnName, container, existingValue = "") => {
      const columnType = getColumnType(columnName);

      // Remove any existing input field
      const existingInput = container.querySelector(".value-input-container");
      if (existingInput) {
        container.removeChild(existingInput);
      }

      // Create a container for the input field(s)
      const inputContainer = document.createElement("div");
      inputContainer.className = "value-input-container";
      inputContainer.style.display = "flex";
      inputContainer.style.gap = "5px";
      inputContainer.style.alignItems = "center";

      let input;

      switch (columnType) {
        case "continuous":
          // For numerical fields
          input = document.createElement("input");
          input.type = "number";
          input.className = "value-input";
          input.step = "any"; // Allow decimal values
          input.style.width = "80px";
          input.value = existingValue;

          // Add a second input field for "between" operator
          const secondInputContainer = document.createElement("div");
          secondInputContainer.className = "second-input-container";
          secondInputContainer.style.display = "none";

          const andLabel = document.createElement("span");
          andLabel.innerText = "and";
          andLabel.style.margin = "0 5px";

          const secondInput = document.createElement("input");
          secondInput.type = "number";
          secondInput.className = "second-value-input";
          secondInput.step = "any";
          secondInput.style.width = "80px";

          secondInputContainer.appendChild(andLabel);
          secondInputContainer.appendChild(secondInput);

          inputContainer.appendChild(input);
          inputContainer.appendChild(secondInputContainer);
          break;

        case "date":
          // For date fields
          input = document.createElement("input");
          input.type = "date";
          input.className = "value-input";
          input.style.width = "140px";
          input.value = existingValue;

          // Add a second date input for "between" operator
          const secondDateContainer = document.createElement("div");
          secondDateContainer.className = "second-input-container";
          secondDateContainer.style.display = "none";

          const dateAndLabel = document.createElement("span");
          dateAndLabel.innerText = "and";
          dateAndLabel.style.margin = "0 5px";

          const secondDateInput = document.createElement("input");
          secondDateInput.type = "date";
          secondDateInput.className = "second-value-input";
          secondDateInput.style.width = "140px";

          secondDateContainer.appendChild(dateAndLabel);
          secondDateContainer.appendChild(secondDateInput);

          inputContainer.appendChild(input);
          inputContainer.appendChild(secondDateContainer);
          break;

        case "boolean":
          // For boolean fields
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "value-input";
          checkbox.checked = existingValue === "true";
          input = checkbox;
          inputContainer.appendChild(input);
          break;

        default:
          // Default to text input for ordinal or unknown types
          input = document.createElement("input");
          input.type = "text";
          input.className = "value-input";
          input.style.width = "140px";
          input.value = existingValue;
          inputContainer.appendChild(input);
      }

      container.appendChild(inputContainer);
      return input;
    };

    // Helper function to update operators based on column type
    const updateOperators = (columnName, opSelect, row) => {
      const columnType = getColumnType(columnName);
      const operators = operatorsByType[columnType] || operatorsByType.default;

      // Store current operator if possible
      const currentOp = opSelect.value;

      // Clear existing options
      opSelect.innerHTML = "";

      // Add new options based on column type
      operators.forEach((op) => {
        const opt = document.createElement("option");
        opt.value = op;
        opt.innerText = op;
        opSelect.appendChild(opt);
      });

      // Try to restore previous selection if it's valid for the new type
      if (operators.includes(currentOp)) {
        opSelect.value = currentOp;
      }

      // Handle showing/hiding the second input for "between" operator
      const handleBetweenOperator = () => {
        const secondInputContainer = row.querySelector(
          ".second-input-container"
        );
        if (secondInputContainer) {
          secondInputContainer.style.display =
            opSelect.value === "between" ? "flex" : "none";
        }
      };

      // Set up the change event for operator selection
      opSelect.onchange = handleBetweenOperator;

      // Initialize visibility of second input
      handleBetweenOperator();

      return opSelect;
    };

    function createQueryRow(isFirst = false) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.marginBottom = "12px";
      row.style.gap = "8px";

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

      // Column select with labels showing column type
      const colSelect = document.createElement("select");
      colSelect.style.minWidth = "120px";

      // Helper method to create column options with type indicators
      const createColumnOption = (columnName) => {
        const opt = document.createElement("option");
        opt.value = columnName;

        const columnType = getColumnType(columnName);
        const typeIndicator = columnType ? ` (${columnType})` : "";

        opt.innerText = `${columnName}${typeIndicator}`;
        return opt;
      };

      // Add all column options
      this.columns.forEach((c) => {
        colSelect.appendChild(createColumnOption(c.column));
      });

      row.appendChild(colSelect);

      // Operator select (will be populated based on column type)
      const opSelect = document.createElement("select");
      opSelect.style.minWidth = "100px";
      row.appendChild(opSelect);

      // Update operators when column changes
      colSelect.onchange = () => {
        updateOperators(colSelect.value, opSelect, row);
        createInputField(colSelect.value, row);
      };

      // Create initial value input field
      createInputField(colSelect.value, row);

      // Initialize operators based on the selected column
      updateOperators(colSelect.value, opSelect, row);

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
    createQueryRow.call(this, true);

    // Add Query button
    const addBtn = document.createElement("button");
    addBtn.innerText = "+ Add Query";
    addBtn.style.margin = "12px 0";
    addBtn.style.padding = "6px 12px";
    addBtn.style.backgroundColor = "#f0f0f0";
    addBtn.style.border = "1px solid #ccc";
    addBtn.style.borderRadius = "4px";
    addBtn.style.cursor = "pointer";
    addBtn.onclick = () => createQueryRow.call(this, false);
    dialog.appendChild(addBtn);

    // Submit and Cancel buttons
    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.gap = "10px";
    btnRow.style.marginTop = "20px";

    const submitBtn = document.createElement("button");
    submitBtn.innerText = "Apply Filter";
    submitBtn.style.background = "#2196F3";
    submitBtn.style.color = "#fff";
    submitBtn.style.border = "none";
    submitBtn.style.padding = "8px 16px";
    submitBtn.style.borderRadius = "4px";
    submitBtn.style.cursor = "pointer";

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "Cancel";
    cancelBtn.style.background = "#eee";
    cancelBtn.style.border = "none";
    cancelBtn.style.padding = "8px 16px";
    cancelBtn.style.borderRadius = "4px";
    cancelBtn.style.cursor = "pointer";

    cancelBtn.onclick = () => dialog.remove();

    submitBtn.onclick = () => {
      // Build filter functions
      let filters = [];
      let boolOps = [];

      for (let i = 0; i < queryRows.length; ++i) {
        const row = queryRows[i];

        // Extract values from the row
        let idx = 0;
        let boolOp = null;

        if (i > 0) {
          boolOp = row.children[idx++].value;
          boolOps.push(boolOp);
        }

        const columnName = row.children[idx++].value;
        const operator = row.children[idx++].value;

        // Get column type
        const columnType = getColumnType(columnName);

        // Get input container which has the value input(s)
        const inputContainer = row.querySelector(".value-input-container");
        const valueInput = inputContainer.querySelector(".value-input");
        const secondValueInput = inputContainer.querySelector(
          ".second-value-input"
        );

        // Process the input based on column type and operator
        let filterFunction;

        switch (columnType) {
          case "continuous":
            if (operator === "between" && secondValueInput) {
              const val1 = parseFloat(valueInput.value);
              const val2 = parseFloat(secondValueInput.value);

              filterFunction = (dataObj) => {
                const value = dataObj[columnName];
                return value >= val1 && value <= val2;
              };
            } else {
              let val = parseFloat(valueInput.value);

              // Use the standard filter for other operators
              filterFunction = createDynamicFilter(columnName, operator, val);
            }
            break;

          case "date":
            if (operator === "between" && secondValueInput) {
              const date1 = new Date(valueInput.value);
              const date2 = new Date(secondValueInput.value);

              filterFunction = (dataObj) => {
                const value = new Date(dataObj[columnName]);
                return value >= date1 && value <= date2;
              };
            } else {
              const dateValue = new Date(valueInput.value);

              filterFunction = (dataObj) => {
                const value = new Date(dataObj[columnName]);

                switch (operator) {
                  case "before":
                    return value < dateValue;
                  case "after":
                    return value > dateValue;
                  case "on":
                    return value.toDateString() === dateValue.toDateString();
                  default:
                    return false;
                }
              };
            }
            break;

          case "boolean":
            const boolValue = operator === "is true";

            filterFunction = (dataObj) => {
              const value = dataObj[columnName];
              return Boolean(value) === boolValue;
            };
            break;

          default: // ordinal or text fields
            const textValue = valueInput.value;

            filterFunction = (dataObj) => {
              const value = String(dataObj[columnName] || "");

              switch (operator) {
                case "==":
                  return value === textValue;
                case "!=":
                  return value !== textValue;
                case "contains":
                  return value.includes(textValue);
                case "starts with":
                  return value.startsWith(textValue);
                case "ends with":
                  return value.endsWith(textValue);
                default:
                  // Fall back to standard filter for numeric comparisons
                  return createDynamicFilter(
                    columnName,
                    operator,
                    textValue
                  )(dataObj);
              }
            };
        }

        filters.push(filterFunction);
      }

      // Compose filters with AND/OR
      let combinedFilter = (row) => {
        // Handle edge case of no filters
        if (filters.length === 0) return true;

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

    logDebug("------------------binrules in setData: ", binrules);

    if (binrules.unique) {
      this.bins = [
        {
          category: "Unique Values",
          count: data.length,
          indeces: data.map((d) => d.index),
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
        indeces: b.map((v) => v.index),
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
      // Create a frequency map of values to their counts and indices
      const frequency = d3.rollup(
        data,
        (values) => ({
          count: values.length,
          indeces: values.map((v) => v.index),
        }),
        (d) => d.value
      );

      const binType = "ordinals" in binrules ? "ordinals" : "nominals";

      // For sorted data, we need to preserve the order of appearance
      // Create a map to track first appearance of each value in sorted data
      const valueOrder = new Map();
      data.forEach((d, i) => {
        if (!valueOrder.has(d.value)) {
          valueOrder.set(d.value, i);
        }
      });

      if (binType in binrules && Array.isArray(binrules[binType])) {
        // If we have predefined bin categories, use them but sort by data order
        const binsWithOrder = binrules[binType].map((v) => ({
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
      .attr("rx", 1) // Add horizontal corner radius
      .attr("ry", 1); // Add vertical corner radius

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

          // Update visual state of the clicked bar
          d3.select(event.currentTarget.previousSibling).attr(
            "fill",
            d.selected ? "orange" : "#3388FF"
          );

          if (controller.table) {
            // First, clear previous selection if not using ctrl/shift for multi-select
            if (!event.ctrlKey && !event.shiftKey) {
              controller.table.clearSelection();
            }

            // Get the original data indices for the items in this bin
            // Need to validate the indices are correct to prevent incorrect selections
            const validBinIndices = d.indeces.filter(
              (idx) => idx >= 0 && idx < controller.table.dataInd.length
            );
            const originalDataIndices = validBinIndices.map(
              (rowIndex) => controller.table.dataInd[rowIndex]
            );

            // Update the main table's selection set
            if (d.selected) {
              // Update the internal selection set
              originalDataIndices.forEach((dataIndex) => {
                controller.table.selectedRows.add(dataIndex);
              });

              // Also update the visual display of the rows
              controller.table.updateRowSelectionDisplay();
            } else {
              originalDataIndices.forEach((dataIndex) => {
                controller.table.selectedRows.delete(dataIndex);
              });
              controller.table.updateRowSelectionDisplay();
            }

            // Notify the table that the selection has changed
            controller.table.selectionUpdated();
          }
        });
    }

    this.handleBrush = (event) => {
      this.svg.selectAll(".histogram-label").remove();

      const selectedOriginalDataIndices = new Set();
      let brushRangeText = "";

      if (event.selection) {
        const [x0, x1] = event.selection;
        const [bound1, bound2] = event.selection.map(this.xScale.invert);
        const binWidth = width / this.bins.length;
        brushRangeText = `Range: ${Math.round(bound1)} - ${Math.round(bound2)}`;

        this.bins.forEach((bin, i) => {
          let isSelected = false;
          if (bin.x0 !== undefined && bin.x1 !== undefined) {
            // Continuous bins
            const binStart = this.xScale(bin.x0);
            const binEnd = this.xScale(bin.x1);
            isSelected = binEnd >= x0 && binStart <= x1;
          } else {
            // Ordinal/Unique bins (shouldn't normally be brushed, but handle defensively)
            const binStart = i * binWidth;
            const binEnd = (i + 1) * binWidth;
            isSelected = binStart <= x1 && binEnd >= x0;
          }

          bin.selected = isSelected;

          // Update bar color
          this.svg
            .select(`.bar:nth-child(${i + 1}) rect:nth-child(1)`)
            .attr("fill", bin.selected ? "orange" : "#3388FF");

          // Collect original data indices if selected
          if (bin.selected && bin.indeces) {
            bin.indeces.forEach((rowIndex) => {
              const originalIndex = controller.table.dataInd[rowIndex];
              if (originalIndex !== undefined) {
                // Ensure index exists
                selectedOriginalDataIndices.add(originalIndex);
              }
            });
          }
        });
      } else {
        // No selection, reset all bins
        this.resetSelection();
      }

      // Update label
      this.svg
        .append("text")
        .attr("class", "histogram-label")
        .attr("x", width / 2)
        .attr("y", height + 10)
        .attr("font-size", "10px")
        .attr("fill", "#444444")
        .attr("text-anchor", "middle")
        .text(brushRangeText);

      // Update the main table's selection
      if (controller.table) {
        controller.table.selectedRows.clear();
        selectedOriginalDataIndices.forEach((dataIndex) => {
          controller.table.selectedRows.add(dataIndex);
        });
        controller.table.selectionUpdated();
      }
    };
  };

  this.setOptions = function (options = {}) {
    this.options = { ...(this.options || {}), ...options };

    // Apply precision settings
    if (options.precision === "low") {
      // Reduce SVG dimensions for lower memory usage
      if (this.svg) {
        const currentWidth = this.svg.attr("width");
        const currentHeight = this.svg.attr("height");

        if (currentWidth > 60) {
          this.svg.attr("width", 60);
        }

        if (currentHeight > 30) {
          this.svg.attr("height", 30);
        }
      }
    }

    // Apply max bins limitation if data needs to be redrawn
    if (options.maxBins && this.bins && this.bins.length > options.maxBins) {
      // We'll need to rebuild bins with fewer buckets on next data update
      this._maxBins = options.maxBins;
    }

    return this;
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
