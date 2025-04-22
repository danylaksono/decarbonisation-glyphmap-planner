import * as d3 from "npm:d3";
// import * as duckdb from "npm:@duckdb/duckdb-wasm"; // No longer directly importing duckdb
import { BinningService } from "./BinningService.js";
import { DuckDBClient } from "npm:@observablehq/duckdb";
// import { DuckDBClient } from "/components/duckdb.js"; // Import DuckDBClient

export class sorterTable {
  constructor(parquetURL, columnNames, changed, options = {}) {
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

    // Initialize DuckDB and load data using DuckDBClient
    this.initDuckDB(parquetURL).then(() => {
      // After DuckDB is initialized and data is loaded
      this.inferColumnTypesAndThresholds();
      this.createHeader();
      this.createTable();
    });

    this.binningService = new BinningService({
      maxOrdinalBins: options.maxOrdinalBins || 12,
      continuousBinMethod: options.continuousBinMethod || "scott",
      dateInterval: options.dateInterval || "day",
      minBinSize: options.minBinSize || 5,
      customThresholds: options.customThresholds || null,
    });

    this.initialColumns = JSON.parse(JSON.stringify(this.columns));

    this.changed = changed;
    this._isUndoing = false;
    this.dataInd = []; // d3.range(data.length); // No longer needed
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
          console.warn(`No column found for cell renderer: ${columnName}`);
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

    this.table.addEventListener("mousedown", (event) => {
      if (event.shiftKey) {
        this.shiftDown = true;
      } else {
        this.shiftDown = false;
      }
    });
  }

  async initDuckDB(parquetURL) {
    this.db = await DuckDBClient.of();

    // Register the Parquet file
    // Assuming DuckDBClient can directly handle URLs
    // If not, you might need to fetch the file and load it differently
    await this.db
      .sql`CREATE TABLE data AS SELECT * FROM read_parquet(${parquetURL})`;

    // Create a DuckDB view
    await this.db.sql`CREATE VIEW data_view AS SELECT * FROM data`;

    // Fetch initial data indices
    const result = await this.db.sql`SELECT ROWID FROM data_view`;
    this.dataInd = Array.from(result).map((d) => d.row.ROWID);
  }

  async executeSQL(sql) {
    try {
      const result = await this.db.sql(sql);
      return result;
    } catch (error) {
      console.error("DuckDB query error:", error);
      throw error;
    }
  }

  preprocessData(data, columnNames) {
    return data;
  }

  setColumnType(columnName, type) {
    if (!columnName) {
      console.error("Invalid columnName:", columnName);
      return;
    }
    this.columnTypes[columnName] = type;
  }

  async getColumnType(column) {
    // If already cached, return the cached type
    if (this.columnTypes[column]) {
      return this.columnTypes[column];
    }

    const result = await this.executeSQL(`
      SELECT typeof("${column}") FROM data_view LIMIT 1
    `);
    const type = Array.from(result)[0].row['typeof("' + column + '")'];

    switch (type) {
      case "BIGINT":
      case "DOUBLE":
        return "continuous";
      case "VARCHAR":
        return "ordinal";
      case "DATE":
        return "date";
      default:
        return "ordinal";
    }
  }

  async inferColumnTypesAndThresholds() {
    if (!this.binningService) {
      console.error("BinningService not initialized");
      return;
    }

    for (const colDef of this.columns) {
      const colName = colDef.column;
      const type = await this.getColumnType(colName);
      colDef.type = type;
      this.setColumnType(colName, type);

      if (!colDef.unique) {
        try {
          if (
            colDef.thresholds &&
            Array.isArray(colDef.thresholds) &&
            colDef.thresholds.length
          ) {
            console.log(`Using predefined thresholds for ${colName}`);
          } else {
            // Fetch column data from DuckDB
            const columnDataResult = await this.executeSQL(
              `SELECT "${colName}" FROM data_view`
            );
            const columnData = Array.from(columnDataResult).map(
              (d) => d.row[colName]
            );

            const bins = this.binningService.getBins(columnData, colName, type);

            if (!bins || bins.length === 0) {
              console.warn(`No bins generated for column: ${colName}`);
              continue;
            }

            if (type === "continuous") {
              colDef.thresholds = bins.map((bin) =>
                bin.x0 !== undefined && bin.x0 !== null ? bin.x0 : null
              );
              colDef.bins = bins;
              console.log(
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
          console.error(`Error binning column ${colName}:`, error);
        }
      }
    }
  }

  shiftCol(columnName, dir) {
    let colIndex = this.columns.findIndex((c) => c.column === columnName);
    const targetIndex = dir === "left" ? colIndex - 1 : colIndex + 1;

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

      const columnsToMove = {
        column: this.columns[colIndex],
        visController: this.visControllers[colIndex],
        sortController: this.sortControllers[colIndex],
      };

      this.columns.splice(colIndex, 1);
      this.visControllers.splice(colIndex, 1);
      this.sortControllers.splice(colIndex, 1);

      this.columns.splice(targetIndex, 0, columnsToMove.column);
      this.visControllers.splice(targetIndex, 0, columnsToMove.visController);
      this.sortControllers.splice(targetIndex, 0, columnsToMove.sortController);

      this.createHeader();
      this.createTable();

      this.visControllers.forEach((vc, idx) => {
        if (vc && vc.updateData && this.columns[idx]) {
          this.getColumnData(this.columns[idx].column).then((columnData) => {
            vc.updateData(columnData);
          });
        }
      });
    }
  }

  async filter() {
    this.rules.push(this.getSelectionRule());
    const selection = this.getSelection();
    const rowIds = selection.map((s) => s.data.ROWID).join(",");

    if (rowIds.length > 0) {
      const filterSQL = `SELECT ROWID FROM data_view WHERE ROWID IN (${rowIds})`;
      const result = await this.executeSQL(filterSQL);
      this.dataInd = Array.from(result).map((d) => d.row.ROWID);
    } else {
      this.dataInd = [];
    }

    this.history.push({ type: "filter", data: [...this.dataInd] });
    this.createTable();

    this.visControllers.forEach((vc, vci) => {
      if (vc instanceof HistogramController) {
        const columnName = this.columns[vci].column;
        this.getColumnData(columnName).then((columnData) => {
          vc.setData(columnData);
        });
      }
    });

    this.changed({
      type: "filter",
      indeces: this.dataInd,
      rule: this.getSelectionRule(),
    });
  }

  async applyCustomFilter(filterFunction) {
    // Not feasible with DuckDB without significant overhead.
    // Recommend implementing custom filters directly in SQL.
    console.warn(
      "Custom filter functions are not efficiently supported with DuckDB."
    );
  }

  getAllRules() {
    return this.rules;
  }

  async undo() {
    if (this.history.length > 0) {
      let u = this.history.pop();
      if (u.type === "filter" || u.type === "sort") {
        this.dataInd = u.data;
        this.createTable();
        this.visControllers.forEach((vc, vci) => {
          this.getColumnData(this.columns[vci].column).then((columnData) => {
            vc.setData(columnData);
          });
        });
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
      }
    }
  }

  rebuildTable() {
    this.createHeader();
    this.createTable();
  }

  async getSelection() {
    let ret = [];
    for (const index of this.selectedRows) {
      if (index >= 0 && index < this.dataInd.length) {
        const rowId = this.dataInd[index];
        const result = await this.executeSQL(
          `SELECT * FROM data_view WHERE ROWID = ${rowId}`
        );
        const data = Array.from(result)[0].row;
        ret.push({
          index: index,
          data: data,
        });
      }
    }
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

      return [];
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
    this.selectedRows.clear();
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
    console.log("Selected column:", columnName);
    this.selectedColumn = columnName;

    this.tHead.querySelectorAll("th").forEach((th) => {
      th.classList.remove("selected-column");
    });

    const columnIndex = this.columns.findIndex((c) => c.column === columnName);
    if (columnIndex !== -1) {
      this.tHead
        .querySelectorAll("th")
        [columnIndex].classList.add("selected-column");
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

    let headerRow = document.createElement("tr");
    this.tHead.append(headerRow);

    this.columns.forEach((c) => {
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
        this.getColumnData(c.column).then((uniqueData) => {
          const uniqueBinning = [
            { x0: "Unique", x1: "Unique", values: uniqueData },
          ];
          let visCtrl = new HistogramController(uniqueData, { unique: true });
          visCtrl.table = this;
          visCtrl.columnName = c.column;
          this.visControllers.push(visCtrl);
          visTd.appendChild(visCtrl.getNode());
        });
      } else {
        this.getColumnData(c.column).then((columnData) => {
          let visCtrl = new HistogramController(
            columnData,
            c.type === "continuous"
              ? { thresholds: c.thresholds, binInfo: c.bins }
              : { nominals: c.nominals }
          );
          visCtrl.table = this;
          visCtrl.columnName = c.column;
          this.visControllers.push(visCtrl);
          visTd.appendChild(visCtrl.getNode());
        });
      }
    });

    this.tHead.style.position = "sticky";
    this.tHead.style.top = "0";
    this.tHead.style.backgroundColor = "#ffffff";
    this.tHead.style.zIndex = "1";
    this.tHead.style.boxShadow = "0 2px 2px rgba(0,0,0,0.1)";
  }

  createTable() {
    if (this.tBody != null) this.table.removeChild(this.tBody);

    this.tBody = document.createElement("tbody");
    this.table.appendChild(this.tBody);

    this.lastLineAdded = -1;
    this.addTableRows(this.defaultLines);
  }

  async addTableRows(howMany) {
    if (this.addingRows) {
      return;
    }
    this.addingRows = true;

    let min = this.lastLineAdded + 1;
    let max = Math.min(min + howMany - 1, this.dataInd.length - 1);

    for (let row = min; row <= max; row++) {
      let dataIndex = this.dataInd[row];
      if (dataIndex === undefined) continue;

      let tr = document.createElement("tr");
      tr.selected = false;
      Object.assign(tr.style, {
        color: "grey",
        borderBottom: "1px solid #ddd",
      });
      this.tBody.appendChild(tr);

      // Fetch row data from DuckDB
      const rowDataResult = await this.executeSQL(
        `SELECT * FROM data_view WHERE ROWID = ${dataIndex}`
      );
      const rowData = Array.from(rowDataResult)[0].row;

      this.columns.forEach((c) => {
        let td = document.createElement("td");

        if (typeof this.cellRenderers[c.column] === "function") {
          td.innerHTML = "";
          td.appendChild(
            this.cellRenderers[c.column](rowData[c.column], rowData)
          );
        } else {
          td.innerText = rowData[c.column];
        }

        tr.appendChild(td);
        td.style.color = "inherit";
        td.style.fontWidth = "inherit";
      });

      tr.addEventListener("click", (event) => {
        let rowIndex = this.getRowIndex(tr);

        if (this.shiftDown) {
          let s = this.getSelection().map((s) => s.index);
          if (s.length == 0) s = [rowIndex];
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

      this.lastLineAdded = row;
    }

    this.addingRows = false;
  }

  async resetTable() {
    const result = await this.executeSQL("SELECT ROWID FROM data_view");
    this.dataInd = Array.from(result).map((d) => d.row.ROWID);
    this.selectedRows.clear();
    this.compoundSorting = {};
    this.rules = [];
    this.history = [];

    this.sortControllers.forEach((ctrl) => ctrl.toggleDirection());

    this.columns = this.initialColumns.map((col) => ({ ...col }));

    this.visControllers.forEach((vc, index) => {
      this.getColumnData(this.columns[index].column).then((columnData) => {
        vc.updateData(columnData);
      });
    });

    this.createHeader();
    this.createTable();

    this.changed({ type: "reset" });
  }

  resetHistogramSelections() {
    this.visControllers.forEach((vc) => {
      if (vc instanceof HistogramController) {
        vc.resetSelection();
      }
    });
  }

  async sortChanged(controller) {
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

    // Construct ORDER BY clause
    const orderByClauses = Object.entries(this.compoundSorting)
      .map(
        ([column, { how }]) => `"${column}" ${how === "up" ? "ASC" : "DESC"}`
      )
      .join(", ");

    const sql = `SELECT ROWID FROM data_view ORDER BY ${orderByClauses}`;
    const result = await this.executeSQL(sql);
    this.dataInd = Array.from(result).map((d) => d.row.ROWID);

    this.visControllers.forEach((vc, index) => {
      this.getColumnData(this.columns[index].column).then((columnData) => {
        vc.setData(columnData);
      });
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

    let tableContainer = document.createElement("div");
    Object.assign(tableContainer.style, {
      flex: "1",
      overflowX: "auto",
    });
    if (this.tableWidth) {
      this.table.style.width = this.tableWidth;
    } else {
      this.table.style.width = "100%";
    }
    tableContainer.appendChild(this.table);

    container.appendChild(sidebar);
    container.appendChild(tableContainer);

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

    container.setAttribute("tabindex", "0");

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

    container.addEventListener("click", (event) => {
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

  async getColumnData(columnName) {
    const result = await this.executeSQL(
      `SELECT "${columnName}" FROM data_view WHERE ROWID IN (${this.dataInd.join(
        ","
      )})`
    );
    return Array.from(result).map((d) => d.row[columnName]);
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

  const icon = document.createElement("i");
  icon.classList.add("fas", "fa-sort");
  icon.style.color = "gray";
  icon.style.fontSize = "12px";
  div.appendChild(icon);

  let sorting = "none";

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

  div.addEventListener("click", (event) => {
    event.stopPropagation();
    active = !active;
    controller.toggleDirection();
    update(controller);

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

    this.svg.selectAll(".bar rect:nth-child(1)").attr("fill", "steelblue");
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

    if (binrules.unique) {
      this.bins = [
        {
          category: "Unique Values",
          count: data.length,
          indeces: data.map((d) => d.index),
        },
      ];
    } else if ("thresholds" in binrules) {
      let contBins = d3
        .bin()
        .domain([d3.min(data, (d) => d.value), d3.max(data, (d) => d.value)])
        .thresholds(binrules.thresholds)
        .value((d) => d.value)(data);

      this.bins = contBins.map((b) => ({
        category: b.x0 + "-" + b.x1,
        count: b.length,
        indeces: b.map((v) => v.index),
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
        .on("end", this.handleBrush);

      this.svg
        .append("g")
        .attr("class", "brush")
        .style("position", "absolute")
        .style("z-index", 90999)
        .call(this.brush);
    } else if ("ordinals" in binrules || "nominals" in binrules) {
      const frequency = d3.rollup(
        data,
        (values) => ({
          count: values.length,
          indeces: values.map((v) => v.index),
        }),
        (d) => d.value
      );

      const binType = "ordinals" in binrules ? "ordinals" : "nominals";

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

    barGroups
      .append("rect")
      .attr("x", 0)
      .attr("width", (d) => width / this.bins.length)
      .attr("y", (d) => y(d.count))
      .attr("height", (d) => height - y(d.count))
      .attr("fill", "steelblue");

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

    this.handleBrush = (event) => {
      this.svg.selectAll(".histogram-label").remove();

      if (!event.selection) {
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

      this.bins.forEach((bin, i) => {
        const binStart = i * binWidth;
        const binEnd = (i + 1) * binWidth;
        bin.selected = binStart <= x1 && binEnd >= x0;
        this.svg
          .select(`.bar:nth-child(${i + 1}) rect:nth-child(1)`)
          .attr("fill", bin.selected ? "orange" : "steelblue");
      });

      this.svg
        .append("text")
        .attr("class", "histogram-label")
        .join("text")
        .attr("class", "histogram-label")
        .attr("x", width / 2)
        .attr("y", height + 10)
        .attr("font-size", "10px")
        .attr("fill", "#444444")
        .attr("text-anchor", "middle")
        .text(`Range: ${Math.round(bound1)} - ${Math.round(bound2)}`);

      if (controller.table) {
        controller.table.clearSelection();
        this.bins.forEach((bin) => {
          if (bin.selected) {
            bin.indeces.forEach((rowIndex) => {
              const tr = controller.table.tBody.querySelector(
                `tr:nth-child(${rowIndex + 1})`
              );
              if (tr) {
                controller.table.selectRow(tr);
              }
            });
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
