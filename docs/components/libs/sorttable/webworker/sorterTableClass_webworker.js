import * as d3 from "npm:d3";
import Clusterize from "clusterize.js";
// import { DuckDBClient } from "npm:@observablehq/duckdb";

import { BinningService } from "./BinningService.js";
import { SmallMultiplesView } from "./small_multiples.js";
import { WorkerManager } from "./WorkerManager.js";

// Control debug output - set to true during development, false in production
const DEBUG = false;

// Path to the worker script
const WORKER_SCRIPT_PATH = new URL("./tableWorker.js", import.meta.url).href;

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
    // Initialize worker manager
    this.workerManager = new WorkerManager();
    this._workerInitPromise = this.workerManager.initialize(WORKER_SCRIPT_PATH);

    // Performance flags and optimization settings
    this._performanceFlags = {
      deferHistograms: options.deferHistograms !== false, // Default to true
      useCanvasHistograms: options.useCanvasHistograms || false,
      lowResHistograms: options.lowResHistograms || false,
      dynamicTypeDetection: options.dynamicTypeDetection !== false, // Default to true
      optimizeMemory: options.optimizeMemory !== false, // Default to true
      memoryBudget: options.memoryBudget || 100 * 1024 * 1024, // 100MB default
      chunkSize: options.chunkSize || 1000, // Rows per chunk for incremental loading
      incrementalLoading: options.incrementalLoading || false,
      batchProcessing: options.batchProcessing !== false, // Default to true
      preComputeAggregations: options.preComputeAggregations || false,
    };

    // Memory tracking
    this._memoryStats = {
      histogramMemory: 0,
      dataMemory: 0,
      cachedBinningMemory: 0,
      lastGarbageCollection: Date.now(),
    };

    // Task queues for deferred operations
    this._taskQueue = [];
    this._processingTasks = false;
    this._visibleColumns = new Set(); // Tracks columns currently in viewport
    this._priorityColumns = new Set(); // Columns that need priority processing

    // Initialize core properties first
    const startTime = performance.now();
    this.data = this.preprocessData(data, columnNames); // Add preprocessing
    logDebug(
      `Data preprocessing completed in ${performance.now() - startTime}ms`
    );

    // View state - table view by default
    this.currentView = "table"; // 'table' or 'smallMultiples'

    // Loading state tracking
    this._isLoading = false;
    this.loadingIndicator = null;

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
      .histogram-placeholder {
        background-color: #f5f5f5;
        border-radius: 2px;
        height: 40px;
        position: relative;
        overflow: hidden;
      }
      .histogram-placeholder::after {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
        animation: histogram-loading 1.5s infinite;
      }
      @keyframes histogram-loading {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
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

    // Setup viewport monitoring
    this._setupViewportMonitoring();
  }

  /**
   * Creates the table header (thead) with column names
   */
  createHeader() {
    // Remove existing thead if present
    if (this.tHead && this.tHead.parentNode) {
      this.tHead.parentNode.removeChild(this.tHead);
    }
    this.tHead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    this.columns.forEach((col, colIdx) => {
      const th = document.createElement("th");
      th.textContent = col.alias || col.column;
      th.dataset.column = col.column;
      // Optionally add sort/vis controls here
      // ...
      headerRow.appendChild(th);
    });

    this.tHead.appendChild(headerRow);
    this.table.appendChild(this.tHead);
  }

  /**
   * Shows a loading indicator overlay on the table
   * @param {string} message - Optional message to display during loading
   */
  showLoadingIndicator(message = "Loading data...") {
    if (this._isLoading) return; // Already showing loading indicator

    this._isLoading = true;

    // Create loading indicator if it doesn't exist
    if (!this.loadingIndicator) {
      this.loadingIndicator = document.createElement("div");
      this.loadingIndicator.className = "sorter-table-loading-overlay";

      // Add CSS styles for the loading indicator if not already added
      if (!document.querySelector("style[data-sorter-table-loading]")) {
        const style = document.createElement("style");
        style.setAttribute("data-sorter-table-loading", "true");
        style.textContent = `
          .sorter-table-loading-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(255, 255, 255, 0.7);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
          }
          .sorter-table-spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: sorter-table-spin 1s linear infinite;
          }
          .sorter-table-loading-message {
            margin-top: 10px;
            font-size: 14px;
            color: #333;
          }
          @keyframes sorter-table-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .sorter-table-progress-container {
            width: 200px;
            height: 6px;
            background-color: #e0e0e0;
            border-radius: 3px;
            margin-top: 10px;
            overflow: hidden;
          }
          .sorter-table-progress-bar {
            height: 100%;
            background-color: #3498db;
            width: 0%;
            transition: width 0.3s ease;
          }
        `;
        document.head.appendChild(style);
      }

      // Create spinner animation
      const spinner = document.createElement("div");
      spinner.className = "sorter-table-spinner";
      this.loadingIndicator.appendChild(spinner);

      // Create message element
      this.loadingMessage = document.createElement("div");
      this.loadingMessage.className = "sorter-table-loading-message";
      this.loadingIndicator.appendChild(this.loadingMessage);

      // Create progress bar container
      const progressContainer = document.createElement("div");
      progressContainer.className = "sorter-table-progress-container";
      this.loadingIndicator.appendChild(progressContainer);

      // Create progress bar
      this.loadingProgressBar = document.createElement("div");
      this.loadingProgressBar.className = "sorter-table-progress-bar";
      progressContainer.appendChild(this.loadingProgressBar);
    }

    // Update message
    this.loadingMessage.textContent = message;

    // Reset progress bar
    if (this.loadingProgressBar) {
      this.loadingProgressBar.style.width = "0%";
    }

    // Find container to append to
    let container = this._scrollContainer || this._containerNode;
    if (container && container.parentNode) {
      // Ensure the container has position relative
      if (
        container.style.position !== "relative" &&
        container.style.position !== "absolute"
      ) {
        container.style.position = "relative";
      }
      container.appendChild(this.loadingIndicator);
    } else {
      // If container not ready, try to attach to table if it exists
      if (this.table) {
        this.table.style.position = "relative";
        this.table.appendChild(this.loadingIndicator);
      } else {
        // Defer showing loading indicator until table is available
        this._deferredLoading = {
          indicator: this.loadingIndicator,
          message,
        };
        // Reset loading state since we couldn't show the indicator
        this._isLoading = false;
      }
    }
  }

  /**
   * Updates the loading progress indicator
   * @param {number} percent - Progress percentage (0-100)
   */
  updateLoadingProgress(percent) {
    if (!this._isLoading || !this.loadingProgressBar) return;

    // Clamp percentage between 0-100
    const clampedPercent = Math.max(0, Math.min(100, percent));
    this.loadingProgressBar.style.width = `${clampedPercent}%`;
  }

  /**
   * Hides the loading indicator
   */
  hideLoadingIndicator() {
    if (!this._isLoading) return; // Not showing loading indicator

    this._isLoading = false;

    if (this.loadingIndicator && this.loadingIndicator.parentNode) {
      this.loadingIndicator.parentNode.removeChild(this.loadingIndicator);
    }
  }

  /**
   * Update loading indicator message
   * @param {string} message - New message to display
   */
  updateLoadingMessage(message) {
    if (this.loadingMessage) {
      this.loadingMessage.textContent = message;
    }
  }

  /**
   * Process incoming data in chunks to avoid UI freezing
   * @param {Array} data - Full data array
   * @param {Array} columnNames - Column names
   * @returns {Array} Processed data array
   */
  preprocessData(data, columnNames) {
    // Defensive programming - handle edge cases
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn("No data provided to sorterTable");
      return [];
    }

    if (
      !columnNames ||
      !Array.isArray(columnNames) ||
      columnNames.length === 0
    ) {
      console.warn("No column names provided to sorterTable");
      // Try to extract column names from the first data object
      if (data[0] && typeof data[0] === "object") {
        columnNames = Object.keys(data[0]);
      } else {
        return [];
      }
    }

    // For small datasets, process immediately and return
    if (data.length < 1000 || !this._performanceFlags.incrementalLoading) {
      // Estimate memory usage
      const sampleSize = Math.min(data.length, 100);
      const sampleMemory = JSON.stringify(data.slice(0, sampleSize)).length;
      const estimatedMemory = (sampleMemory / sampleSize) * data.length;
      this._trackMemoryUsage("dataMemory", estimatedMemory);

      return data;
    }

    // For large datasets, process in chunks
    this.showLoadingIndicator("Preprocessing data...");

    // Initialize results array with placeholder objects
    let processedChunks = 0;
    const totalChunks = Math.ceil(
      data.length / this._performanceFlags.chunkSize
    );
    const processedData = new Array(data.length);

    // Process first chunk immediately for fast initial display
    const firstChunkEnd = Math.min(
      this._performanceFlags.chunkSize,
      data.length
    );
    for (let i = 0; i < firstChunkEnd; i++) {
      processedData[i] = data[i];
    }

    // Process remaining chunks in the background
    if (data.length > this._performanceFlags.chunkSize) {
      this._processDataChunks(
        data,
        processedData,
        this._performanceFlags.chunkSize,
        columnNames
      );
    }

    return processedData;
  }

  /**
   * Process data chunks in the background using setTimeout
   * @param {Array} sourceData - Source data array
   * @param {Array} targetData - Target array to populate
   * @param {number} startIndex - Index to start processing from
   * @param {Array} columnNames - Column names for validation
   */
  _processDataChunks(sourceData, targetData, startIndex, columnNames) {
    const chunkSize = this._performanceFlags.chunkSize;
    const totalChunks = Math.ceil((sourceData.length - startIndex) / chunkSize);
    let processedChunks = 0;

    const processNextChunk = () => {
      const chunkStart = startIndex + processedChunks * chunkSize;
      const chunkEnd = Math.min(chunkStart + chunkSize, sourceData.length);

      // Process this chunk
      for (let i = chunkStart; i < chunkEnd; i++) {
        // Validate and ensure each row has all required columns
        const row = sourceData[i];

        if (!row) {
          // Create empty row if source data is sparse
          targetData[i] = this._createEmptyRow(columnNames);
          continue;
        }

        // Copy the row - this allows the original data to be garbage collected if needed
        targetData[i] = { ...row };

        // Ensure all columns exist
        columnNames.forEach((col) => {
          const colName = typeof col === "string" ? col : col.column;
          if (targetData[i][colName] === undefined) {
            targetData[i][colName] = null;
          }
        });
      }

      // Update progress
      processedChunks++;
      const progressPercent = Math.min(
        100,
        Math.round((processedChunks / totalChunks) * 100)
      );
      this.updateLoadingProgress(progressPercent);

      if (processedChunks === 1) {
        // After first background chunk, update the message
        this.updateLoadingMessage(`Loading data: ${progressPercent}%`);
      } else if (progressPercent % 20 === 0) {
        // Update message periodically
        this.updateLoadingMessage(`Loading data: ${progressPercent}%`);
      }

      // Continue or finish
      if (chunkStart + chunkSize < sourceData.length) {
        // Schedule next chunk
        setTimeout(processNextChunk, 0);
      } else {
        // Done processing
        this.hideLoadingIndicator();

        // Notify that data is fully loaded
        this.changed({
          type: "dataFullyLoaded",
          dataSize: sourceData.length,
        });
      }
    };

    // Start processing chunks
    setTimeout(processNextChunk, 0);
  }

  /**
   * Creates an empty row with null values for all columns
   * @param {Array} columnNames - Column names
   * @returns {Object} Empty row
   */
  _createEmptyRow(columnNames) {
    const row = {};
    columnNames.forEach((col) => {
      const colName = typeof col === "string" ? col : col.column;
      row[colName] = null;
    });
    return row;
  }

  /**
   * Process the deferred task queue for background operations
   * Runs the tasks in order of priority without blocking the UI
   */
  _processDeferredTasks() {
    if (this._processingTasks || this._taskQueue.length === 0) {
      return;
    }

    this._processingTasks = true;

    // Sort tasks by priority
    this._taskQueue.sort((a, b) => b.priority - a.priority);

    // Get the highest priority task
    const task = this._taskQueue.shift();

    // Process the task
    setTimeout(() => {
      try {
        task.execute();
      } catch (error) {
        errorDebug("Error executing deferred task:", error);
      }

      // Allow time for UI to respond
      setTimeout(() => {
        this._processingTasks = false;

        // Continue processing if there are more tasks
        if (this._taskQueue.length > 0) {
          this._processDeferredTasks();
        }
      }, 0);
    }, 0);
  }

  /**
   * Add a task to the deferred task queue
   * @param {Function} taskFn - Function to execute
   * @param {number} priority - Task priority (higher value = higher priority)
   * @param {string} taskName - Name of the task for debugging
   */
  _addDeferredTask(taskFn, priority = 1, taskName = "unknown") {
    this._taskQueue.push({
      execute: taskFn,
      priority,
      name: taskName,
    });

    // Start processing if not already doing so
    if (!this._processingTasks) {
      this._processDeferredTasks();
    }
  }

  /**
   * Track memory usage of different components
   * @param {string} component - Component name
   * @param {number} bytes - Bytes used
   * @param {boolean} increment - Whether to increment or set the value
   */
  _trackMemoryUsage(component, bytes, increment = false) {
    if (!this._memoryStats[component]) {
      this._memoryStats[component] = 0;
    }

    if (increment) {
      this._memoryStats[component] += bytes;
    } else {
      this._memoryStats[component] = bytes;
    }

    // Check if we've exceeded the memory budget
    const totalMemory = Object.values(this._memoryStats).reduce(
      (sum, val) => (typeof val === "number" ? sum + val : sum),
      0
    );

    if (totalMemory > this._performanceFlags.memoryBudget) {
      logDebug("Memory budget exceeded, running garbage collection");
      this._collectGarbage();
    }
  }

  /**
   * Collect garbage to free memory
   * Releases memory from unused histograms and cached data
   */
  _collectGarbage() {
    const now = Date.now();

    // Don't run garbage collection too frequently
    if (now - this._memoryStats.lastGarbageCollection < 10000) {
      return;
    }

    this._memoryStats.lastGarbageCollection = now;

    // Clear binning cache for columns that aren't visible
    if (this._cache.binning) {
      Object.keys(this._cache.binning).forEach((key) => {
        // Skip cache entries for visible columns
        const colName = key.split("_")[1]; // Extract column name from cache key
        if (colName && !this._visibleColumns.has(colName)) {
          delete this._cache.binning[key];
        }
      });
    }

    // Reset histogram data for non-visible columns
    this.visControllers.forEach((vc, i) => {
      if (vc instanceof HistogramController) {
        const columnName = this.columns[i].column;

        if (
          !this._visibleColumns.has(columnName) &&
          !this._priorityColumns.has(columnName)
        ) {
          // Reset to empty or low-resolution state
          vc.setOptions({ precision: "low" });

          // Don't delete entirely, but free memory
          if (vc.freeMemory) {
            vc.freeMemory();
          }
        }
      }
    });

    // Force JavaScript garbage collection (if supported by browser)
    if (window.gc) {
      window.gc();
    }
  }

  /**
   * Creates histogram placeholder elements
   * @param {HTMLElement} container - Container element
   * @param {string} columnName - Column name
   * @returns {HTMLElement} Placeholder element
   */
  _createHistogramPlaceholder(container, columnName) {
    // Create placeholder
    const placeholder = document.createElement("div");
    placeholder.className = "histogram-placeholder";
    placeholder.dataset.column = columnName;

    // Add to container
    if (container) {
      container.appendChild(placeholder);
    }

    return placeholder;
  }

  /**
   * Track which columns are currently visible in the viewport
   * @param {Array} visibleColumnNames - Names of currently visible columns
   */
  _updateVisibleColumns(visibleColumnNames) {
    // Clear current set
    this._visibleColumns.clear();

    // Add new values
    visibleColumnNames.forEach((name) => {
      this._visibleColumns.add(name);
    });

    // Schedule histogram updates for newly visible columns
    this._scheduleVisibleHistogramUpdates();
  }

  /**
   * Schedule updates for histograms that are now visible
   */
  _scheduleVisibleHistogramUpdates() {
    if (!this._performanceFlags.deferHistograms) {
      return; // Skip if deferred histograms are disabled
    }

    // Find histogram placeholders for visible columns
    const placeholders = document.querySelectorAll(".histogram-placeholder");

    placeholders.forEach((placeholder) => {
      const columnName = placeholder.dataset.column;

      if (columnName && this._visibleColumns.has(columnName)) {
        // Find the column index
        const columnIndex = this.columns.findIndex(
          (c) => c.column === columnName
        );

        if (columnIndex !== -1) {
          // Schedule this histogram to be generated with high priority
          this._addDeferredTask(
            () => {
              this._generateHistogramForColumn(columnIndex, placeholder);
            },
            10,
            `generate_histogram_${columnName}`
          );
        }
      }
    });
  }

  /**
   * Generate histogram for a specific column
   * @param {number} columnIndex - Column index
   * @param {HTMLElement} placeholder - Placeholder element to replace
   */
  _generateHistogramForColumn(columnIndex, placeholder) {
    if (columnIndex < 0 || columnIndex >= this.columns.length) {
      return;
    }

    const columnName = this.columns[columnIndex].column;
    const columnData = this.dataInd.map((i) => this.data[i][columnName]);

    // Create histogram
    let visCtrl;

    if (this.columns[columnIndex].unique) {
      // For unique columns, simple histogram
      visCtrl = new HistogramController(columnData, { unique: true });
    } else {
      // For normal columns, proper histogram
      visCtrl = new HistogramController(
        columnData,
        this.columnTypes[columnName] === "continuous"
          ? {
              thresholds: this.columns[columnIndex].thresholds,
              binInfo: this.columns[columnIndex].bins,
            }
          : { nominals: this.columns[columnIndex].nominals }
      );
    }

    // Set column reference
    visCtrl.table = this;
    visCtrl.columnName = columnName;

    // Apply memory optimizations if needed
    if (this._performanceFlags.optimizeMemory && this.data.length > 5000) {
      visCtrl.setOptions({
        precision: "low",
        useCanvas: this._performanceFlags.useCanvasHistograms,
      });
    }

    // Replace placeholder with actual histogram
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.replaceChild(visCtrl.getNode(), placeholder);

      // Update the controllers array
      if (this.visControllers[columnIndex]) {
        this.visControllers[columnIndex] = visCtrl;
      }
    }
  }

  /**
   * Infer column types using the Web Worker when possible
   * @param {Array} data - Data array
   */
  inferColumnTypesAndThresholds(data) {
    // Skip if data is empty
    if (!data || !data.length) {
      return;
    }

    // Show loading indicator for large datasets
    const isLargeDataset = data.length > 5000;
    if (isLargeDataset) {
      this.showLoadingIndicator("Analyzing data types...");
    }

    // Initialize columnTypes with defaults if not already set
    this.columns.forEach((col) => {
      // Skip if type is already manually defined
      if (col.type) {
        this.columnTypes[col.column] = col.type;
      } else if (!this.columnTypes[col.column]) {
        // Default to ordinal until we determine otherwise
        this.columnTypes[col.column] = "ordinal";
      }
    });

    // For dynamic type detection, only infer types for visible columns initially
    const columnsToProcess = this._performanceFlags.dynamicTypeDetection
      ? this.columns.filter(
          (col) =>
            this._visibleColumns.has(col.column) ||
            this._priorityColumns.has(col.column)
        )
      : this.columns;

    // If no visible columns defined yet, process all columns
    const effectiveColumns = columnsToProcess.length
      ? columnsToProcess
      : this.columns;

    // Use worker for type detection if available
    this._workerInitPromise.then((workerAvailable) => {
      if (workerAvailable && this.workerManager.isAvailable()) {
        // Use worker for type inference
        this.workerManager
          .executeTask("infer_column_types", {
            dataArray: data.slice(0, Math.min(5000, data.length)), // Sample data for performance
            columns: effectiveColumns,
          })
          .then((types) => {
            // Update column types
            Object.assign(this.columnTypes, types);

            // Calculate thresholds for continuous columns
            this._calculateColumnThresholds(data);

            if (isLargeDataset) {
              this.hideLoadingIndicator();
            }
          })
          .catch((error) => {
            console.error("Worker type inference failed:", error);
            // Fall back to main thread inference
            this._inferTypesOnMainThread(data, effectiveColumns);

            if (isLargeDataset) {
              this.hideLoadingIndicator();
            }
          });
      } else {
        // Worker not available, use main thread
        this._inferTypesOnMainThread(data, effectiveColumns);

        if (isLargeDataset) {
          this.hideLoadingIndicator();
        }
      }
    });
  }

  /**
   * Fall back method to infer column types on the main thread
   * @param {Array} data - Data array
   * @param {Array} columns - Columns to process
   */
  _inferTypesOnMainThread(data, columns) {
    try {
      // Use a subset of data for performance reasons
      const sampleSize = Math.min(data.length, 1000);
      const sampleData = data.slice(0, sampleSize);

      columns.forEach((col) => {
        const colName = col.column;

        // Skip if type is already manually defined
        if (col.type) {
          this.columnTypes[colName] = col.type;
          return;
        }

        // Try to determine the column type
        let numberCount = 0;
        let dateCount = 0;
        let uniqueValues = new Set();

        for (let i = 0; i < sampleData.length; i++) {
          const value = sampleData[i][colName];

          // Skip null values
          if (value === null || value === undefined) continue;

          uniqueValues.add(value);

          if (typeof value === "number") {
            numberCount++;
          } else if (value instanceof Date) {
            dateCount++;
          } else if (typeof value === "string") {
            // Check if string could be a number
            if (!isNaN(Number(value)) && value.trim() !== "") {
              numberCount++;
            }

            // Check if string could be a date
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              dateCount++;
            }
          }
        }

        // Determine column type based on value patterns
        if (dateCount > sampleData.length * 0.5) {
          this.columnTypes[colName] = "date";
        } else if (numberCount > sampleData.length * 0.5) {
          // For number columns, check if continuous or ordinal
          if (
            uniqueValues.size > 10 &&
            uniqueValues.size > sampleData.length * 0.1
          ) {
            this.columnTypes[colName] = "continuous";
          } else {
            this.columnTypes[colName] = "ordinal";
          }
        } else {
          this.columnTypes[colName] = "ordinal";
        }
      });

      // Calculate column thresholds
      this._calculateColumnThresholds(data);
    } catch (error) {
      console.error("Error during type inference:", error);
      // Default all columns to ordinal on error
      columns.forEach((col) => {
        this.columnTypes[col.column] = "ordinal";
      });
    }
  }

  /**
   * Calculate thresholds for continuous columns
   * @param {Array} data - Data array
   */
  _calculateColumnThresholds(data) {
    // Find continuous columns
    const continuousColumns = this.columns.filter(
      (col) => this.columnTypes[col.column] === "continuous"
    );

    // Skip if no continuous columns
    if (!continuousColumns.length) return;

    // Use the binning service to calculate thresholds
    continuousColumns.forEach((col) => {
      try {
        const columnName = col.column;

        // Extract column values
        const values = data
          .map((d) => d[columnName])
          .filter((v) => v !== null && v !== undefined && !isNaN(v));

        // Skip if no valid values
        if (!values.length) return;

        // Calculate thresholds using binning service
        const bins = this.binningService.computeBins(values, "continuous");

        // Store thresholds and binning info for later
        col.thresholds = bins.thresholds;
        col.bins = bins;
      } catch (error) {
        console.error(
          `Error calculating thresholds for column ${col.column}:`,
          error
        );
      }
    });
  }

  /**
   * Creates the table with rows from the current dataInd
   * Optimized to handle large datasets with batch processing
   */
  createTable() {
    // Show loading indicator for large datasets
    const isLargeDataset = this.data.length > 3000;
    if (isLargeDataset && !this._isLoading) {
      this.showLoadingIndicator("Building table...");
    }

    // Create a new tbody if none exists
    if (!this.tBody) {
      this.tBody = document.createElement("tbody");
      this.table.appendChild(this.tBody);
    } else {
      this.tBody.innerHTML = "";
    }

    try {
      // Generate row HTML in chunks for large datasets
      if (isLargeDataset && this._performanceFlags.batchProcessing) {
        // Start with small batch of rows for immediate display
        this._generateRowsInBatches();
        return; // Early return, batch processing will handle the rest
      }

      // For smaller datasets, generate all rows at once
      const rows = this._generateAllRows();

      // If no rows and we need to show a message
      if (rows.length === 0) {
        rows.push(
          `<tr><td colspan="${this.columns.length}" style="text-align: center; padding: 20px;">No data available</td></tr>`
        );
      }

      // Store the generated rows for potential reuse
      this._generatedRows = rows;

      // We'll update Clusterize if it exists, but we won't initialize it here
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

      // Hide loading indicator if it was shown
      if (isLargeDataset) {
        this.updateLoadingMessage("Rendering visualization...");

        // Schedule to hide loading indicator after a short delay
        // This gives time for the UI to render
        setTimeout(() => {
          this.hideLoadingIndicator();
        }, 100);
      }
    } catch (error) {
      console.error("Error creating table:", error);

      // Show error message in table
      this.tBody.innerHTML = `
        <tr>
          <td colspan="${
            this.columns.length
          }" style="text-align: center; padding: 20px; color: #d32f2f;">
            Error creating table: ${error.message || "Unknown error"}
          </td>
        </tr>
      `;

      // Hide loading indicator
      this.hideLoadingIndicator();
    }
  }

  /**
   * Generate all rows at once (for smaller datasets)
   * @returns {Array} Array of HTML strings for rows
   * @private
   */
  _generateAllRows() {
    return this.dataInd.map((dataIndex, rowIdx) => {
      let cells = this.columns
        .map((c) => {
          try {
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
              // Safely convert cell value to string
              const value = this.data[dataIndex][c.column];
              const safeValue =
                value === null || value === undefined ? "" : String(value);
              return `<td>${safeValue}</td>`;
            }
          } catch (error) {
            console.error(
              `Error rendering cell for column ${c.column}:`,
              error
            );
            return `<td class="cell-error">Error</td>`;
          }
        })
        .join("");
      return `<tr data-row-index="${rowIdx}" data-data-index="${dataIndex}">${cells}</tr>`;
    });
  }

  /**
   * Generate rows in batches for large datasets
   * Shows initial rows immediately and progressively adds more
   * @private
   */
  _generateRowsInBatches() {
    // Create empty array to hold all rows
    this._generatedRows = new Array(this.dataInd.length);

    // Track which batch we're processing
    let currentBatch = 0;
    const batchSize = 500; // Number of rows per batch
    const totalBatches = Math.ceil(this.dataInd.length / batchSize);

    // Generate and display the first batch immediately
    const firstBatchSize = Math.min(50, this.dataInd.length);
    const firstBatchRows = [];

    for (let i = 0; i < firstBatchSize; i++) {
      const dataIndex = this.dataInd[i];
      const rowIdx = i;

      try {
        let cells = this.columns
          .map((c) => {
            try {
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
                // Safely convert cell value to string
                const value = this.data[dataIndex][c.column];
                const safeValue =
                  value === null || value === undefined ? "" : String(value);
                return `<td>${safeValue}</td>`;
              }
            } catch (error) {
              console.error(
                `Error rendering cell for column ${c.column}:`,
                error
              );
              return `<td class="cell-error">Error</td>`;
            }
          })
          .join("");

        const rowHtml = `<tr data-row-index="${rowIdx}" data-data-index="${dataIndex}">${cells}</tr>`;
        this._generatedRows[i] = rowHtml;
        firstBatchRows.push(rowHtml);
      } catch (error) {
        console.error(`Error generating row ${i}:`, error);
        firstBatchRows.push(
          `<tr><td colspan="${this.columns.length}" class="row-error">Error generating row</td></tr>`
        );
      }
    }

    // Display first batch immediately
    if (this.tBody) {
      this.tBody.innerHTML = firstBatchRows.join("");

      // Attach event listeners
      setTimeout(() => {
        this._attachRowEvents();
      }, 0);
    }

    // Initialize clusterize if it exists
    if (this._clusterize) {
      // Need to add placeholder rows for proper scrollbar sizing
      const placeholderRows = new Array(
        this.dataInd.length - firstBatchSize
      ).fill(
        `<tr style="height: 30px;"><td colspan="${this.columns.length}"></td></tr>`
      );

      this._clusterize.update([...firstBatchRows, ...placeholderRows]);
    }

    // Function to process the next batch
    const processNextBatch = () => {
      if (currentBatch >= totalBatches) {
        // All batches processed
        if (this._clusterize) {
          // Update clusterize with complete rows
          this._clusterize.update(this._generatedRows.filter((row) => !!row));
        }

        // Hide loading indicator
        this.hideLoadingIndicator();
        return;
      }

      // Calculate the range for this batch
      const startIdx = currentBatch * batchSize;
      const endIdx = Math.min(startIdx + batchSize, this.dataInd.length);

      // Skip first batch which was already processed
      const effectiveStartIdx = Math.max(startIdx, firstBatchSize);

      // Update progress indicator
      this.updateLoadingProgress((currentBatch / totalBatches) * 100);
      this.updateLoadingMessage(
        `Rendering rows ${startIdx + 1}-${endIdx} of ${this.dataInd.length}...`
      );

      // Process this batch
      for (let i = effectiveStartIdx; i < endIdx; i++) {
        const dataIndex = this.dataInd[i];
        const rowIdx = i;

        try {
          let cells = this.columns
            .map((c) => {
              try {
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
                  // Safely convert cell value to string
                  const value = this.data[dataIndex][c.column];
                  const safeValue =
                    value === null || value === undefined ? "" : String(value);
                  return `<td>${safeValue}</td>`;
                }
              } catch (error) {
                return `<td class="cell-error">Error</td>`;
              }
            })
            .join("");

          this._generatedRows[
            i
          ] = `<tr data-row-index="${rowIdx}" data-data-index="${dataIndex}">${cells}</tr>`;
        } catch (error) {
          console.error(`Error generating row ${i}:`, error);
          this._generatedRows[
            i
          ] = `<tr><td colspan="${this.columns.length}" class="row-error">Error generating row</td></tr>`;
        }
      }

      // Move to next batch
      currentBatch++;

      // Schedule updates periodically to keep UI responsive
      if (currentBatch % 2 === 0 && this._clusterize) {
        // Update clusterize with the rows we have so far
        const nonEmptyRows = this._generatedRows.filter((row) => !!row);
        const remaining = this.dataInd.length - nonEmptyRows.length;

        if (remaining > 0) {
          // Add placeholders for remaining rows
          const placeholders = new Array(remaining).fill(
            `<tr style="height: 30px;"><td colspan="${this.columns.length}"></td></tr>`
          );

          this._clusterize.update([...nonEmptyRows, ...placeholders]);
        } else {
          this._clusterize.update(nonEmptyRows);
        }
      }

      // Continue with next batch after a short delay
      setTimeout(processNextBatch, 0);
    };

    // Schedule processing of remaining batches
    setTimeout(() => {
      currentBatch = Math.ceil(firstBatchSize / batchSize);
      processNextBatch();
    }, 50);
  }

  /**
   * Updates the table with new data
   * @param {Array} newData - New data array
   * @param {Object} options - Update options
   * @returns {Promise} Promise that resolves when the update is complete
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

    // Show loading indicator before starting the update
    this.showLoadingIndicator("Updating data...");

    return new Promise((resolve) => {
      // Schedule update for next frame for better UI responsiveness
      this._pendingUpdate = requestAnimationFrame(() => {
        try {
          // Start with initial data if newData not provided
          if (!newData) {
            if (!this.initialData) {
              console.warn("No initialData available to reset to.");
              this.hideLoadingIndicator();
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

          // Update loading message to show progress
          this.updateLoadingMessage("Building table structure...");

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

          // Update loading message for histogram updates
          this.updateLoadingMessage("Updating visualizations...");

          // Use requestAnimationFrame to update histograms after table is visible
          requestAnimationFrame(() => {
            // Update histograms efficiently in the background
            this.updateHistograms();

            // Hide loading indicator after a slight delay to let histograms render
            setTimeout(() => {
              this.hideLoadingIndicator();

              // Notify listeners about the data update
              this.changed({
                type: "dataUpdate",
                dataSize: this.data.length,
                resetState: settings.resetState,
              });
            }, 100);
          });

          this._pendingUpdate = null;
          resolve(true);
        } catch (error) {
          console.error("Error updating table data:", error);
          this.hideLoadingIndicator();
          this._pendingUpdate = null;
          resolve(false);
        }
      });
    });
  }

  /**
   * Optimizes memory usage for histograms
   * Reduces memory footprint for large datasets
   */
  optimizeHistogramMemory() {
    if (!this._performanceFlags.optimizeMemory) return;

    // Track memory before optimization
    const beforeSize = this._memoryStats.histogramMemory;

    try {
      // Use low-resolution histograms for non-visible columns
      this.visControllers.forEach((visCtrl, i) => {
        // Skip non-histogram controllers
        if (!visCtrl || typeof visCtrl.setOptions !== "function") return;

        const columnName = this.columns[i]?.column;
        if (!columnName) return;

        // Check if column is visible
        const isVisible = this._visibleColumns.has(columnName);
        const isPriority = this._priorityColumns.has(columnName);

        if (!isVisible && !isPriority) {
          // Use lower resolution for non-visible histograms
          visCtrl.setOptions({
            precision: "low",
            useCanvas: this._performanceFlags.useCanvasHistograms,
          });

          // Free extra memory if supported
          if (typeof visCtrl.freeMemory === "function") {
            visCtrl.freeMemory();
          }
        }
      });

      // Force garbage collection if available
      if (window.gc) {
        window.gc();
      }

      // Update memory tracking
      const currentMemory = this._estimateHistogramMemory();
      this._trackMemoryUsage("histogramMemory", currentMemory);

      logDebug(
        `Histogram memory optimized: ${beforeSize / 1024 / 1024}MB -> ${
          currentMemory / 1024 / 1024
        }MB`
      );
    } catch (error) {
      console.error("Error optimizing histogram memory:", error);
    }
  }

  /**
   * Estimate memory used by histograms
   * @returns {number} Estimated memory usage in bytes
   * @private
   */
  _estimateHistogramMemory() {
    let totalSize = 0;

    this.visControllers.forEach((visCtrl) => {
      if (!visCtrl) return;

      // Check if controller has a getMemoryUsage method
      if (typeof visCtrl.getMemoryUsage === "function") {
        totalSize += visCtrl.getMemoryUsage();
      } else {
        // Rough estimate based on histogram type and data size
        if (visCtrl.bins && Array.isArray(visCtrl.bins)) {
          // Estimate 100 bytes per bin entry
          totalSize += visCtrl.bins.length * 100;
        }
      }
    });

    return totalSize;
  }

  /**
   * Updates histograms efficiently using progressive rendering
   * @param {boolean} forceUpdate - Whether to force update all histograms
   */
  updateHistograms(forceUpdate = false) {
    if (!this.visControllers || !this.visControllers.length) return;

    // For optimized rendering, identify which histograms to update
    const histogramsToUpdate = [];

    this.visControllers.forEach((visCtrl, index) => {
      if (!visCtrl) return;

      const columnName = this.columns[index]?.column;
      if (!columnName) return;

      // Always update if forced or if column is visible/priority
      if (
        forceUpdate ||
        this._visibleColumns.has(columnName) ||
        this._priorityColumns.has(columnName)
      ) {
        histogramsToUpdate.push({ controller: visCtrl, index, columnName });
      }
    });

    // First, create placeholders for all histograms that will be updated
    histogramsToUpdate.forEach(({ controller, columnName }) => {
      // Only create placeholder if the controller has a node method
      if (typeof controller.getNode !== "function") return;

      const currentNode = controller.getNode();
      if (!currentNode || !currentNode.parentNode) return;

      // Create placeholder and replace the current node
      const placeholder = this._createHistogramPlaceholder(
        currentNode.parentNode,
        columnName
      );
      currentNode.parentNode.replaceChild(placeholder, currentNode);

      // Store placeholder reference in the controller for later updates
      controller._placeholder = placeholder;
    });

    // Now update histograms progressively
    const updateNextHistogram = (index = 0) => {
      if (index >= histogramsToUpdate.length) {
        // All histograms updated
        return;
      }

      const { controller, columnName } = histogramsToUpdate[index];

      try {
        // Generate histogram data
        if (typeof controller.update === "function") {
          controller.update(this.dataInd.map((i) => this.data[i][columnName]));
        }

        // Replace placeholder with the real histogram if one exists
        if (controller._placeholder && controller._placeholder.parentNode) {
          const node = controller.getNode();
          controller._placeholder.parentNode.replaceChild(
            node,
            controller._placeholder
          );
          delete controller._placeholder;
        }
      } catch (error) {
        console.error(
          `Error updating histogram for column ${columnName}:`,
          error
        );
      }

      // Schedule next histogram update
      setTimeout(() => {
        updateNextHistogram(index + 1);
      }, 0);
    };

    // Start updating histograms
    if (histogramsToUpdate.length > 0) {
      updateNextHistogram();
    }
  }

  /**
   * Creates a histogram visualization using canvas instead of SVG for better performance
   * @param {HTMLElement} container - Container element
   * @param {Array} data - Data array
   * @param {Object} options - Canvas histogram options
   * @returns {HTMLElement} Canvas element
   */
  _createCanvasHistogram(container, data, options = {}) {
    // Default options
    const defaults = {
      width: options.width || 200,
      height: options.height || 40,
      barColor: options.barColor || "#4285f4",
      selectedBarColor: options.selectedBarColor || "#ff5722",
      barGap: options.barGap || 1,
      lowRes: options.lowRes || false,
      binCount: options.binCount || 20,
    };

    const settings = { ...defaults, ...options };

    try {
      // Create canvas element
      const canvas = document.createElement("canvas");
      canvas.width = settings.width;
      canvas.height = settings.height;
      canvas.style.width = "100%";
      canvas.style.height = settings.height + "px";

      // Get 2D context
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.error("Could not get canvas context");
        return null;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // No data or empty array
      if (!data || !data.length) {
        // Draw "No data" text
        ctx.fillStyle = "#999";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("No data", canvas.width / 2, canvas.height / 2);

        if (container) {
          container.appendChild(canvas);
        }
        return canvas;
      }

      // For continuous data (numbers), create bins
      const isNumeric = data.every((d) => !isNaN(Number(d)));

      if (isNumeric) {
        // Convert to numbers
        const numericData = data.map((d) => Number(d));

        // Get min/max
        const min = Math.min(...numericData);
        const max = Math.max(...numericData);

        // Create bins
        const binWidth = (max - min) / settings.binCount;
        const bins = new Array(settings.binCount).fill(0);

        // Count values in each bin
        numericData.forEach((val) => {
          const binIndex = Math.min(
            settings.binCount - 1,
            Math.floor((val - min) / binWidth)
          );
          bins[binIndex]++;
        });

        // Get max bin count for scaling
        const maxBinCount = Math.max(...bins);

        // Calculate bar width
        const barWidth = canvas.width / bins.length - settings.barGap;

        // Draw bars
        bins.forEach((count, i) => {
          const barHeight = maxBinCount
            ? (count / maxBinCount) * canvas.height
            : 0;
          const x = i * (barWidth + settings.barGap);
          const y = canvas.height - barHeight;

          ctx.fillStyle = settings.barColor;
          ctx.fillRect(x, y, barWidth, barHeight);
        });
      } else {
        // For categorical data, count occurrences
        const counts = {};

        data.forEach((val) => {
          // Convert to string to ensure it can be used as an object key
          const key = String(val);
          counts[key] = (counts[key] || 0) + 1;
        });

        // Convert to array of {key, count} objects
        const entries = Object.entries(counts).map(([key, count]) => ({
          key,
          count,
        }));

        // Sort by count (descending)
        entries.sort((a, b) => b.count - a.count);

        // Limit to max categories to display
        const maxCategories = settings.lowRes ? 8 : 12;
        const visibleEntries = entries.slice(0, maxCategories);

        // If we have more categories than we can display, add an "Other" category
        if (entries.length > maxCategories) {
          const otherCount = entries
            .slice(maxCategories)
            .reduce((sum, entry) => sum + entry.count, 0);
          visibleEntries.push({ key: "Other", count: otherCount });
        }

        // Get max count for scaling
        const maxCount = Math.max(...visibleEntries.map((e) => e.count));

        // Calculate bar width
        const barWidth = canvas.width / visibleEntries.length - settings.barGap;

        // Draw bars
        visibleEntries.forEach((entry, i) => {
          const barHeight = maxCount
            ? (entry.count / maxCount) * canvas.height
            : 0;
          const x = i * (barWidth + settings.barGap);
          const y = canvas.height - barHeight;

          ctx.fillStyle = settings.barColor;
          ctx.fillRect(x, y, barWidth, barHeight);
        });
      }

      // Add to container if provided
      if (container) {
        container.appendChild(canvas);
      }

      return canvas;
    } catch (error) {
      console.error("Error creating canvas histogram:", error);
      return null;
    }
  }

  /**
   * Monitors which columns are currently visible in the viewport
   * This allows us to optimize rendering by only updating visible content
   */
  _setupViewportMonitoring() {
    // Skip if already initialized
    if (this._viewportObserver) return;

    try {
      // Check if IntersectionObserver is available
      if (!("IntersectionObserver" in window)) {
        // Fall back to assuming all columns are visible
        const allColumns = this.columns.map((col) => col.column);
        this._updateVisibleColumns(allColumns);
        return;
      }

      // Create observer for monitoring visible columns
      this._viewportObserver = new IntersectionObserver(
        (entries) => {
          const nowVisible = [];
          const nowHidden = [];

          entries.forEach((entry) => {
            const columnName = entry.target.dataset.column;
            if (!columnName) return;

            if (entry.isIntersecting) {
              nowVisible.push(columnName);
            } else {
              nowHidden.push(columnName);
            }
          });

          // Update visible columns if any changes detected
          if (nowVisible.length > 0) {
            // Add newly visible columns to the set
            nowVisible.forEach((col) => {
              this._visibleColumns.add(col);
            });

            // Schedule updates for newly visible columns
            this._scheduleVisibleHistogramUpdates();
          }

          if (nowHidden.length > 0) {
            // Remove newly hidden columns from the set
            nowHidden.forEach((col) => {
              this._visibleColumns.delete(col);
            });

            // Check if we need to free up memory
            if (
              this._performanceFlags.optimizeMemory &&
              this._memoryStats.lastGarbageCollection < Date.now() - 30000
            ) {
              this._collectGarbage();
            }
          }
        },
        {
          root: this._containerNode,
          threshold: 0.1, // Consider column visible when at least 10% is in view
        }
      );

      // Start observing histograms and header cells
      setTimeout(() => {
        // Observe header cells for visibility
        const headerCells = this.tHead?.querySelectorAll("th");
        if (headerCells) {
          headerCells.forEach((cell) => {
            const columnName = cell.dataset.column;
            if (columnName) {
              // Add column name as data attribute if not already present
              if (!cell.dataset.column) {
                cell.dataset.column = columnName;
              }
              this._viewportObserver.observe(cell);
            }
          });
        }

        // Observe histogram containers for visibility
        const histogramElements = document.querySelectorAll(
          ".histogram-container"
        );
        histogramElements.forEach((elem) => {
          const columnName = elem.dataset.column;
          if (columnName) {
            this._viewportObserver.observe(elem);
          }
        });
      }, 100);
    } catch (error) {
      console.error("Error setting up viewport monitoring:", error);

      // Fall back to assuming all columns are visible
      const allColumns = this.columns.map((col) => col.column);
      this._updateVisibleColumns(allColumns);
    }
  }

  /**
   * Pre-computes aggregations for commonly used operations
   * This improves performance by caching results of expensive operations
   * @param {Object} options - Aggregation options
   */
  preComputeAggregations(options = {}) {
    if (!this._performanceFlags.preComputeAggregations) return;

    try {
      // Initialize aggregation cache if it doesn't exist
      if (!this._cache.aggregations) {
        this._cache.aggregations = {};
      }

      // Show loading indicator for large datasets
      const isLargeDataset = this.data.length > 5000;
      if (isLargeDataset) {
        this.showLoadingIndicator("Pre-computing aggregations...");
      }

      // Find columns that can be used for grouping (categorical/ordinal columns)
      const groupByColumns = this.columns
        .filter(
          (col) =>
            this.columnTypes[col.column] === "ordinal" ||
            this.columnTypes[col.column] === "date"
        )
        .map((col) => col.column);

      // Find columns that can be aggregated (continuous columns)
      const aggregateColumns = this.columns
        .filter((col) => this.columnTypes[col.column] === "continuous")
        .map((col) => col.column);

      // Skip if no suitable columns
      if (!groupByColumns.length || !aggregateColumns.length) {
        if (isLargeDataset) {
          this.hideLoadingIndicator();
        }
        return;
      }

      // Precompute aggregations for each group-by column
      // Uses a Web Worker for large datasets
      if (this.workerManager.isAvailable() && this.data.length > 1000) {
        // Process in Web Worker
        this._preComputeAggregationsInWorker(groupByColumns, aggregateColumns)
          .then(() => {
            if (isLargeDataset) {
              this.hideLoadingIndicator();
            }
          })
          .catch((error) => {
            console.error("Error in worker aggregation:", error);
            if (isLargeDataset) {
              this.hideLoadingIndicator();
            }
          });
      } else {
        // Process on main thread
        this._preComputeAggregationsOnMainThread(
          groupByColumns,
          aggregateColumns
        );

        if (isLargeDataset) {
          this.hideLoadingIndicator();
        }
      }
    } catch (error) {
      console.error("Error pre-computing aggregations:", error);
      this.hideLoadingIndicator();
    }
  }

  /**
   * Pre-compute aggregations using a Web Worker
   * @param {Array} groupByColumns - Columns to group by
   * @param {Array} aggregateColumns - Columns to aggregate
   * @returns {Promise} Promise that resolves when computations are complete
   * @private
   */
  _preComputeAggregationsInWorker(groupByColumns, aggregateColumns) {
    return new Promise((resolve, reject) => {
      // Process one group-by column at a time
      const processNextColumn = (index = 0) => {
        if (index >= groupByColumns.length) {
          // All columns processed
          resolve();
          return;
        }

        const groupByColumn = groupByColumns[index];

        // Update progress
        this.updateLoadingProgress((index / groupByColumns.length) * 100);
        this.updateLoadingMessage(
          `Pre-computing aggregations: ${index + 1}/${groupByColumns.length}`
        );

        // Use worker to compute aggregation
        this.workerManager
          .executeTask("aggregate_data", {
            dataArray: this.data,
            dataInd: this.dataInd,
            groupByColumn: groupByColumn,
            columnTypes: this.columnTypes,
          })
          .then((result) => {
            // Store result in cache
            this._cache.aggregations[groupByColumn] = result;

            // Continue with next column
            processNextColumn(index + 1);
          })
          .catch((error) => {
            console.error(
              `Error pre-computing aggregation for ${groupByColumn}:`,
              error
            );
            // Continue with next column despite error
            processNextColumn(index + 1);
          });
      };

      // Start processing
      processNextColumn();
    });
  }

  /**
   * Pre-compute aggregations on the main thread
   * @param {Array} groupByColumns - Columns to group by
   * @param {Array} aggregateColumns - Columns to aggregate
   * @private
   */
  _preComputeAggregationsOnMainThread(groupByColumns, aggregateColumns) {
    // For smaller datasets, we can compute on the main thread
    groupByColumns.forEach((groupByColumn, index) => {
      try {
        // Update progress
        this.updateLoadingProgress((index / groupByColumns.length) * 100);
        this.updateLoadingMessage(
          `Pre-computing aggregations: ${index + 1}/${groupByColumns.length}`
        );

        // Group data by values in the group-by column
        const groups = new Map();

        this.dataInd.forEach((dataIndex) => {
          const groupValue = this.data[dataIndex][groupByColumn];
          // Use a string key to handle all value types
          const key = String(groupValue);

          if (!groups.has(key)) {
            groups.set(key, []);
          }

          groups.get(key).push(dataIndex);
        });

        // Create aggregated rows
        const aggregatedData = [];

        groups.forEach((indices, key) => {
          // Create a row with the group value
          const row = { [groupByColumn]: key };

          // Aggregate each column
          aggregateColumns.forEach((column) => {
            // Extract values for this group
            const values = indices
              .map((i) => this.data[i][column])
              .filter((v) => v !== null && v !== undefined);

            // Calculate average
            if (values.length) {
              const sum = values.reduce((a, b) => a + Number(b), 0);
              row[column] = Number((sum / values.length).toFixed(2));
            } else {
              row[column] = 0;
            }
          });

          aggregatedData.push(row);
        });

        // Store in cache
        this._cache.aggregations[groupByColumn] = {
          data: aggregatedData,
          dataInd: d3.range(aggregatedData.length),
        };
      } catch (error) {
        console.error(
          `Error pre-computing aggregation for ${groupByColumn}:`,
          error
        );
      }
    });
  }
}
