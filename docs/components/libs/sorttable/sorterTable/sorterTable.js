import * as d3 from "npm:d3";
import Clusterize from "clusterize.js";
import { BinningService } from "../BinningService.js";
import { SmallMultiplesView } from "../small_multiples.js";
import { logDebug, warnDebug, errorDebug, deepClone } from "./utils.js";
import { ColShiftController } from "./ui/ColShiftController.js";
import { SortController } from "./ui/SortController.js";
import { HistogramController } from "../_modules/histogram.js";
import { TableStateManager } from "./state/TableStateManager.js";
import { Toolbar } from "./ui/Toolbar.js";

export class sorterTable {
  constructor(data, columnNames, changed, options = {}) {
    this.state = new TableStateManager(data, columnNames, changed);
    this.changed = changed;
    this.options = {
      containerHeight: options.height || "400px",
      containerWidth: options.width || "100%",
      rowsPerPage: options.rowsPerPage || 50,
      loadMoreThreshold: options.loadMoreThreshold || 100,
      ...options,
    };

    this.binningService = new BinningService({
      maxOrdinalBins: options.maxOrdinalBins || 12,
      continuousBinMethod: options.continuousBinMethod || "scott",
      dateInterval: options.dateInterval || "day",
      minBinSize: options.minBinSize || 5,
      customThresholds: options.customThresholds || null,
    });

    this._cache = {
      binning: {},
    };

    this.inferColumnTypesAndThresholds(this.state.data);

    this.table = document.createElement("table");
    this.table.classList.add("sorter-table");
    Object.assign(this.table.style, {
      width: "100%",
      borderCollapse: "collapse",
      fontFamily: "'Inter', 'Roboto', 'Open Sans', system-ui, sans-serif",
      fontSize: "14px",
    });

    this.tHead = document.createElement("thead");
    this.tBody = document.createElement("tbody");
    this.table.append(this.tHead, this.tBody);

    this.toolbar = new Toolbar(this);
    this.createHeader();
    this.createTable();

    this._clusterize = null;
  }

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
            if (!this.state.initialData) {
              console.warn("No initialData available to reset to.");
              resolve(false);
              return;
            }
            newData = [...this.state.initialData];
            settings.resetState = true; // Force reset when using initialData
          }

          // Update data reference
          this.state.data = this.preprocessData(
            newData,
            this.state.columns.map((c) => c.column)
          );

          // Update initial data reference if specified
          if (settings.replaceInitial) {
            this.state.initialData = [...newData];
          } else if (!this.state.initialData) {
            // Initialize if not already set
            this.state.initialData = [...newData];
          }

          // Reset indices to show all rows
          this.state.dataInd = d3.range(newData.length);

          // Reset state if requested
          if (settings.resetState) {
            this.state.reset();
          }

          // Reinfer types if requested
          if (settings.updateTypes) {
            this.inferColumnTypesAndThresholds(this.state.data);
          }

          // Rebuild the table with new data
          this.rebuildTable();

          // Apply memory optimizations if requested
          if (settings.optimizeMemory && this.state.data.length > 1000) {
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
            dataSize: this.state.data.length,
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
    this.state.columnTypes[columnName] = type;
  }

  getColumnType(data, column) {
    // If already cached, return the cached type
    if (this.state.columnTypes[column]) {
      return this.state.columnTypes[column];
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

    this.state.columns.forEach((colDef) => {
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

  setSelectedData(selectedIndices) {
    if (!Array.isArray(selectedIndices)) {
      errorDebug("setSelectedData: selectedIndices must be an array.");
      return;
    }

    // Clear existing selection
    this.clearSelection();

    // Validate indices and select rows
    selectedIndices.forEach((index) => {
      if (index >= 0 && index < this.state.dataInd.length) {
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
    this.state.dataInd.forEach((dataIndex, tableRowIndex) => {
      dataIndexToTableRowIndex.set(dataIndex, tableRowIndex);
    });
    this.state.data.forEach((dataObject, dataIndex) => {
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
    const baseIndices = consecutive
      ? this.state.dataInd
      : d3.range(this.state.data.length);
    const prevDataInd = [...this.state.dataInd];
    const matchingDataIndices = baseIndices.filter((dataIndex) => {
      const dataObject = this.state.data[dataIndex];
      return (
        dataObject &&
        dataObject.hasOwnProperty(idPropertyName) &&
        idSet.has(dataObject[idPropertyName])
      );
    });
    this.state.dataInd = matchingDataIndices;

    logDebug("Filtering table using:", ids);
    this.state.history.push({ type: "filterById", data: prevDataInd });
    this.rebuildTable();
    this.visControllers.forEach((vc, vci) => {
      if (vc instanceof HistogramController) {
        const columnName = this.state.columns[vci].column;
        vc.setData(
          this.state.dataInd.map((i) => this.state.data[i][columnName])
        );
      }
    });
    this.setSelectedDataByIds(ids, idPropertyName);
    const filteredIds = this.state.dataInd.map((i) => ({
      id: this.state.data[i][idPropertyName] || i,
    }));
    this.changed({
      type: "filterById",
      indeces: this.state.dataInd,
      ids: filteredIds,
    });
  }

  filter() {
    const prevDataInd = [...this.state.dataInd];
    const selectionRule = this.getSelectionRule();

    if (selectionRule) {
      this.state.rules.push(selectionRule);
    }

    const selected = this.getSelection();
    this.state.dataInd = selected.map((s) => s.index);

    this.state.history.push({
      type: "filter",
      data: prevDataInd,
      rule: selectionRule,
    });

    this.createTable();
    this.visControllers.forEach((vc, vci) => {
      if (vc instanceof HistogramController) {
        const columnName = this.state.columns[vci].column;
        vc.setData(
          this.state.dataInd.map((i) => this.state.data[i][columnName])
        );
      }
    });

    const idColumn = "id";
    const filteredIds = this.state.dataInd.map((i) => {
      const idValue =
        this.state.data[i]?.[idColumn] !== undefined
          ? this.state.data[i][idColumn]
          : i;
      return { id: idValue };
    });

    this.changed({
      type: "filter",
      indeces: this.state.dataInd,
      ids: filteredIds,
      rule: selectionRule,
    });
  }

  applyCustomFilter(filterFunction, options = {}) {
    const { consecutive = true } = options;
    const baseIndices = consecutive
      ? this.state.dataInd
      : d3.range(this.state.data.length);
    const prevDataInd = [...this.state.dataInd];

    this.state.dataInd = baseIndices.filter((index) =>
      filterFunction(this.state.data[index])
    );

    const customRule = options.customRule || [
      `Custom filter applied (${this.state.dataInd.length} rows)`,
    ];

    if (this.state.dataInd.length !== prevDataInd.length) {
      this.state.rules.push(customRule);
    }

    this.state.history.push({ type: "filter", data: prevDataInd });

    this.rebuildTable();
    this.visControllers.forEach((vc) => {
      if (vc && vc.updateData) {
        vc.updateData(
          this.state.dataInd.map((i) => this.state.data[i][vc.columnName])
        );
      }
    });

    const idColumn = "id";
    const filteredIds = this.state.dataInd.map((i) => {
      const idValue =
        this.state.data[i]?.[idColumn] !== undefined
          ? this.state.data[i][idColumn]
          : i;
      return { id: idValue };
    });

    this.changed({
      type: "filter",
      indeces: this.state.dataInd,
      ids: filteredIds,
      rule: customRule,
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

    let headerRow = document.createElement("tr");
    this.tHead.append(headerRow);

    this.state.columns.forEach((c) => {
      let th = document.createElement("th");
      headerRow.appendChild(th);
      th.style.textAlign = "center";

      let nameSpan = document.createElement("span");
      nameSpan.innerText = c.alias || c.column;
      Object.assign(nameSpan.style, {
        fontWeight: "bold",
        fontFamily: "Arial, sans-serif",
        fontSize: "1em",
        cursor: "pointer",
        userSelect: "none",
        padding: "8px",
      });
      th.appendChild(nameSpan);

      let longPressTimer;
      let isLongPress = false;
      nameSpan.addEventListener("mousedown", (event) => {
        if (event.button === 0) {
          isLongPress = false;
          longPressTimer = setTimeout(() => {
            isLongPress = true;
            this.selectColumn(c.column);
          }, 500);
        }
      });

      nameSpan.addEventListener("mouseup", () => {
        clearTimeout(longPressTimer);
      });

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

      let controlsRow = document.createElement("tr");
      th.appendChild(controlsRow);

      let controlsTd = document.createElement("td");
      controlsRow.appendChild(controlsTd);

      let controlsContainer = document.createElement("div");
      controlsContainer.style.display = "flex";
      controlsContainer.style.alignItems = "center";
      controlsContainer.style.justifyContent = "space-around";
      controlsContainer.style.width = "100%";
      controlsContainer.style.padding = "2px 0";
      controlsTd.appendChild(controlsContainer);

      const shiftCtrl = new ColShiftController(
        c.column,
        (columnName, direction) => this.shiftCol(columnName, direction)
      );
      controlsContainer.appendChild(shiftCtrl.getNode());

      let sortCtrl = new SortController(c.column, (controller) =>
        this.sortChanged(controller)
      );
      this.sortControllers.push(sortCtrl);
      controlsContainer.appendChild(sortCtrl.getNode());

      let visRow = document.createElement("tr");
      th.appendChild(visRow);

      let visTd = document.createElement("td");
      visRow.appendChild(visTd);

      if (c.unique) {
        let uniqueData = this.state.dataInd.map(
          (i) => this.state.data[i][c.column]
        );
        let visCtrl = new HistogramController(uniqueData, { unique: true });
        visCtrl.table = this;
        visCtrl.columnName = c.column;
        this.visControllers.push(visCtrl);
        visTd.appendChild(visCtrl.getNode());
      } else {
        logDebug(" >>>> Creating histogram for column:", c);
        let visCtrl = new HistogramController(
          this.state.dataInd.map((i) => this.state.data[i][c.column]),
          c.type === "continuous"
            ? { thresholds: c.thresholds, binInfo: c.bins }
            : { nominals: c.nominals }
        );
        visCtrl.table = this;
        visCtrl.columnName = c.column;
        this.visControllers.push(visCtrl);
        visTd.appendChild(visCtrl.getNode());
      }
    });

    this.tHead.style.position = "sticky";
    this.tHead.style.top = "0";
    this.tHead.style.backgroundColor = "#ffffff";
    this.tHead.style.zIndex = "1";
    this.tHead.style.boxShadow = "0 2px 2px rgba(0,0,0,0.1)";
  }

  createTable() {
    const rows = this.state.dataInd.map((dataIndex, rowIdx) => {
      let cells = this.state.columns
        .map((c) => {
          if (typeof this.cellRenderers[c.column] === "function") {
            const temp = document.createElement("div");
            temp.appendChild(
              this.cellRenderers[c.column](
                this.state.data[dataIndex][c.column],
                this.state.data[dataIndex]
              )
            );
            return `<td>${temp.innerHTML}</td>`;
          } else {
            return `<td>${this.state.data[dataIndex][c.column]}</td>`;
          }
        })
        .join("");
      return `<tr data-row-index="${rowIdx}" data-data-index="${dataIndex}">${cells}</tr>`;
    });

    if (rows.length === 0) {
      rows.push(
        `<tr><td colspan="${this.state.columns.length}" style="text-align: center; padding: 20px;">No data available</td></tr>`
      );
    }

    this._generatedRows = rows;

    if (this._clusterize) {
      this._clusterize.update(rows);

      setTimeout(() => {
        if (this._scrollContainer) {
          this._scrollContainer.scrollTop = 1;
          setTimeout(() => {
            this._scrollContainer.scrollTop = 0;
          }, 0);
        }
      }, 0);
    } else if (this.tBody) {
      const initialVisibleCount = Math.min(50, rows.length);
      this.tBody.innerHTML = rows.slice(0, initialVisibleCount).join("");

      setTimeout(() => {
        this._attachRowEvents();
      }, 0);
    }
  }

  _attachRowEvents() {
    const rows = this.tBody.querySelectorAll("tr");
    if (!rows.length) {
      return;
    }

    const dataIndPositionMap = new Map();
    this.state.dataInd.forEach((dataIndex, position) => {
      dataIndPositionMap.set(dataIndex, position);
    });

    Array.from(rows).forEach((tr) => {
      const newTr = tr.cloneNode(true);

      const dataIndex = parseInt(tr.getAttribute("data-data-index"), 10);
      if (isNaN(dataIndex)) {
        tr.parentNode.replaceChild(newTr, tr);
        return;
      }

      newTr.addEventListener("click", (event) => {
        if (isNaN(dataIndex)) return;

        if (event.shiftKey) {
          let selectedIndices = Array.from(this.state.selectedRows);

          if (selectedIndices.length === 0) {
            this.state.selectedRows.add(dataIndex);
            this.selectRow(newTr);
          } else {
            const positions = selectedIndices
              .map((index) => dataIndPositionMap.get(index))
              .filter((pos) => pos !== undefined);

            const currentPosition = dataIndPositionMap.get(dataIndex);

            const startPos = Math.min(...positions, currentPosition);
            const endPos = Math.max(...positions, currentPosition);

            for (let pos = startPos; pos <= endPos; pos++) {
              const indexToSelect = this.state.dataInd[pos];
              this.state.selectedRows.add(indexToSelect);

              const trToSelect = this.tBody.querySelector(
                `tr[data-data-index="${indexToSelect}"]`
              );
              if (trToSelect) {
                this.selectRow(trToSelect);
              }
            }
          }
        } else if (event.ctrlKey || event.metaKey) {
          if (this.state.selectedRows.has(dataIndex)) {
            this.state.selectedRows.delete(dataIndex);
            this.unselectRow(newTr);
          } else {
            this.state.selectedRows.add(dataIndex);
            this.selectRow(newTr);
          }
        } else {
          this.clearSelection();
          this.state.selectedRows.add(dataIndex);
          this.selectRow(newTr);
        }

        this.selectionUpdated();
      });

      newTr.addEventListener("mouseover", () => {
        newTr.style.backgroundColor = "#f0f0f0";
      });

      newTr.addEventListener("mouseout", () => {
        newTr.style.backgroundColor = "";
      });

      tr.parentNode.replaceChild(newTr, tr);

      if (this.state.selectedRows.has(dataIndex)) {
        this.selectRow(newTr);
      }
    });
  }

  resetTable(useInitialData = true, options = {}) {
    const startTime = performance.now();
    this.state.reset();
    this.rebuildTable();
    this.updateHistograms();
    if (this.state.data.length > 10000) {
      this.optimizeHistogramMemory();
    }
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
    return this;
  }

  toggleView() {
    this.currentView =
      this.currentView === "table" ? "smallMultiples" : "table";

    if (this._containerNode) {
      const switchViewIcon =
        this._containerNode.querySelector("#switch-view-icon");
      if (switchViewIcon) {
        switchViewIcon.classList.remove("fa-th", "fa-table");

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

    if (this._containerNode) {
      const contentDiv = this._containerNode.querySelector("div:nth-child(2)");

      if (contentDiv) {
        contentDiv.innerHTML = "";

        if (this.currentView === "table") {
          this._scrollContainer = contentDiv;

          if (!this.tBody) {
            this.tBody = document.createElement("tbody");
            this.tBody.className = "clusterize-content";
          }

          this.table.innerHTML = "";
          if (this.tHead) this.table.appendChild(this.tHead);
          this.table.appendChild(this.tBody);
          contentDiv.appendChild(this.table);

          this._clusterize = null;

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

          const rows = this.state.dataInd.map((dataIndex, rowIdx) => {
            let cells = this.state.columns
              .map((c) => {
                if (typeof this.cellRenderers[c.column] === "function") {
                  const temp = document.createElement("div");
                  temp.appendChild(
                    this.cellRenderers[c.column](
                      this.state.data[dataIndex][c.column],
                      this.state.data[dataIndex]
                    )
                  );
                  return `<td>${temp.innerHTML}</td>`;
                } else {
                  return `<td>${this.state.data[dataIndex][c.column]}</td>`;
                }
              })
              .join("");
            return `<tr data-row-index="${rowIdx}" data-data-index="${dataIndex}">${cells}</tr>`;
          });

          if (rows.length > 0) {
            const initialVisibleCount = Math.min(50, rows.length);
            this.tBody.innerHTML = rows.slice(0, initialVisibleCount).join("");
            this._attachRowEvents();
          }

          setTimeout(() => {
            const rowsInBlock = Math.min(
              200,
              Math.max(50, Math.floor(this.state.data.length / 20))
            );

            this._clusterize = new Clusterize({
              rows: rows,
              scrollElem: this._scrollContainer,
              contentElem: this.tBody,
              callbacks: {
                clusterChanged: () => this._attachRowEvents(),
                clusterWillChange: () => {
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
              rows_in_block: rowsInBlock,
              blocks_in_cluster: 4,
              show_no_data_row: false,
              tag: "tr",
            });

            this._clusterize.update(rows);

            setTimeout(() => {
              this._clusterize.refresh(true);
            }, 50);
          }, 10);
        } else {
          if (!this._smallMultiplesView) {
            this._smallMultiplesView = new SmallMultiplesView(this, {
              histogramHeight: 120,
              histogramWidth: 160,
              maxColumns: 4,
            });
          }

          contentDiv.appendChild(this._smallMultiplesView.render());
        }
      }
    }

    this.changed({
      type: "viewChanged",
      view: this.currentView,
    });
  }

  sortChanged(controller) {
    this.state.history.push({ type: "sort", data: [...this.state.dataInd] });
    this.state.compoundSorting = {};

    let col = controller.getColumn();
    let how = controller.getDirection();

    if (how == "none") {
      let w = this.state.compoundSorting[col].weight;
      delete this.state.compoundSorting[col];
      let sorts = Object.keys(this.state.compoundSorting);
      let sum = 0;
      sorts.map((sk) => (sum = sum + this.state.compoundSorting[sk].weight));
      sorts.map((sk) => (this.state.compoundSorting[sk].weight /= sum));
    } else {
      if (col in this.state.compoundSorting)
        this.state.compoundSorting[col].how = how;
      else {
        let sorts = Object.values(this.state.compoundSorting);
        let w = 1 / (sorts.length + 1);
        sorts.map((s) => (s.weight *= 1 - w));
        this.state.compoundSorting[col] = { weight: w, how: how };
      }

      this.sortControllers.forEach((sc) => {
        if (sc.getColumn() != col) sc.setDirection("none");
      });
    }

    let sorts = Object.keys(this.state.compoundSorting);
    if (sorts.length > 0) {
      this.state.dataInd.sort((a, b) => {
        let s = 0;
        sorts.forEach((sk) => {
          let v = 0;
          if (this.state.data[a][sk] > this.state.data[b][sk]) v = 1;
          else if (this.state.data[a][sk] < this.state.data[b][sk]) v = -1;
          if (this.state.compoundSorting[sk].how == "down") v *= -1;
          s += v * this.state.compoundSorting[sk].weight;
        });
        return s;
      });
    } else {
      this.state.dataInd.sort((a, b) => a - b);
    }

    this.createTable();
    this.changed({
      type: "sort",
      indeces: this.state.dataInd,
      sort: this.state.compoundSorting,
    });
  }

  getNode() {
    if (!this._containerNode) {
      this._containerNode = document.createElement("div");
      this._containerNode.className = "sorter-table-container";
      this._containerNode.style.display = "flex";
      this._containerNode.style.flexDirection = "column";
      this._containerNode.style.height = this.options.containerHeight;
      this._containerNode.style.width = this.options.containerWidth;
      this._containerNode.style.border = "1px solid #ccc";
      this._containerNode.style.borderRadius = "4px";
      this._containerNode.style.overflow = "hidden";

      this._containerNode.appendChild(this.toolbar.getNode());

      this._scrollContainer = document.createElement("div");
      this._scrollContainer.className = "clusterize-scroll";
      this._scrollContainer.style.height = `calc(${this.options.containerHeight} - 30px)`;
      this._scrollContainer.style.overflowY = "auto";
      this._scrollContainer.style.overflowX = "auto";
      this._containerNode.appendChild(this._scrollContainer);

      this.tBody = document.createElement("tbody");
      this.tBody.className = "clusterize-content";

      this.table.appendChild(this.tHead);
      this.table.appendChild(this.tBody);
      this._scrollContainer.appendChild(this.table);

      setTimeout(() => {
        const rowsInBlock = Math.min(
          200,
          Math.max(50, Math.floor(this.state.data.length / 20))
        );

        this._clusterize = new Clusterize({
          rows: this._generatedRows || [],
          scrollElem: this._scrollContainer,
          contentElem: this.tBody,
          callbacks: {
            clusterChanged: () => this._attachRowEvents(),
            clusterWillChange: () => {
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
          rows_in_block: rowsInBlock,
          blocks_in_cluster: 4,
          show_no_data_row: false,
          tag: "tr",
        });

        this._clusterize.update(this._generatedRows || []);

        setTimeout(() => {
          this._clusterize.refresh(true);
        }, 50);
      }, 10);
    }

    return this._containerNode;
  }
}
