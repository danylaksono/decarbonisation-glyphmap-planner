import * as d3 from "npm:d3";

export class sorterTable {
  constructor(data, columnNames, changed, options = {}) {
    this.data = data;

    // create table element
    this.table = document.createElement("table");
    this.table.classList.add("sorter-table");

    // Automatically create column definitions with type inference
    // this.columns = columnNames.map((colName) => ({ column: colName }));
    // this.initialColumns = columnNames.map((colName) => ({ column: colName }));

    // use alias if provided
    this.columns = columnNames.map((col) => {
      if (typeof col === "string") {
        return { column: col }; // Default: no alias
      } else {
        return { column: col.column, alias: col.alias }; // Use alias if provided
      }
    });
    this.initialColumns = JSON.parse(JSON.stringify(this.columns));

    console.log("Initial columns:", this.columns);
    this.inferColumnTypesAndThresholds(data);

    this.changed = changed;
    this._isUndoing = false;
    this.dataInd = d3.range(data.length);
    this.sortControllers = [];
    this.visControllers = [];
    this.table = document.createElement("table");
    this.table.style.userSelect = "none";
    this.compoundSorting = {};
    this.selected = [];
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
    this.columnTypes = {};
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
      loadMoreThreshold: options.loadMoreThreshold || 200,
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

  setColumnType(columnName, type) {
    if (!columnName) {
      console.error("Invalid columnName:", columnName);
      return;
    }
    this.columnTypes[columnName] = type;
    console.log("Setting column type:", this.columnTypes);
  }

  getColumnType(columnName) {
    if (columnName in this.columnTypes) return this.columnTypes[columnName];
    return null;
  }

  inferColumnTypesAndThresholds(data) {
    const getType = (data, column) => {
      for (const d of data) {
        const value = d[column];
        if (value === undefined) {
          // Check for undefined
          console.warn(`Value undefined for column: ${column}`);
          continue;
        }
        if (value == null) continue;
        if (typeof value === "number") return "continuous";
        if (value instanceof Date) return "date";
        return "ordinal";
      }
      // if all are null, return ordinal
      return "ordinal";
    };

    const calculateThresholds = (data, column, numBins = 10) => {
      // const values = data.map((d) => d[column]).filter((v) => v != null);
      const values = data
        .map((d) => d[column])
        .filter((v) => v != null && v !== undefined);
      const min = d3.min(values);
      const max = d3.max(values);

      // Simple equal-width binning (you can use more sophisticated methods)
      const binWidth = (max - min) / numBins;
      const thresholds = d3.range(1, numBins).map((i) => min + i * binWidth);
      return thresholds;
    };

    console.log("Columns before type inference:", this.columns);

    if (!this.columnTypes) {
      this.columnTypes = {}; // Ensure it's initialized
    }

    this.columns.forEach((colDef) => {
      // console.log("Column Definition:", colDef);
      const colName = colDef.column;
      const type = getType(data, colName);
      console.log("Column Type:", type);

      if (type === "continuous") {
        colDef.thresholds = calculateThresholds(data, colName);
      } else if (type === "ordinal") {
        colDef.nominals = [...new Set(data.map((d) => d[colName]))]; // Get unique values
      } else if (type === "date") {
        //you can define specific logic for date type later.
      }

      console.log("setting column type:", colName, type);
      this.setColumnType(colName, type); // Store the inferred type
    });
  }

  // Shift column position using visController
  shiftCol(columnName, dir) {
    console.log("Shifting column:", columnName, "direction:", dir);

    let colIndex = this.columns.findIndex((c) => c.column === columnName);
    console.log("Found column at index:", colIndex);

    const targetIndex = dir === "left" ? colIndex - 1 : colIndex + 1;
    console.log("Target index:", targetIndex);

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
      this.rebuildTable();
      // this.createHeader();
      // this.createTable();

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

  filter() {
    this.rules.push(this.getSelectionRule());
    this.history.push({ type: "filter", data: this.dataInd });
    this.dataInd = this.getSelection().map((s) => this.dataInd[s.index]);
    this.createTable();
    this.visControllers.map((vc, vci) =>
      vc.updateData(
        this.dataInd.map((i) => this.data[i][this.columns[vci].column])
      )
    );
    this.changed({
      type: "filter",
      indeces: this.dataInd,
      rule: this.getSelectionRule(),
    });
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
      }
    }
  }

  rebuildTable() {
    this.createHeader();
    this.createTable();
  }

  // getSelection() {
  //   let ret = [];
  //   this.tBody.querySelectorAll("tr").forEach((tr, i) => {
  //     if (tr.selected) ret.push({ index: i, data: this.data[this.dataInd[i]] });
  //   });
  //   return ret;
  // }

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
    console.log("Selection result:", ret);
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
      nameSpan.style.fontWeight = "bold";
      nameSpan.style.fontFamily = "Arial, sans-serif"; // Set font (optional)
      nameSpan.style.fontSize = "1em";
      nameSpan.style.cursor = "pointer";
      nameSpan.addEventListener("click", () => {
        const sortCtrl = this.sortControllers.find(
          (ctrl) => ctrl.getColumn() === c.column
        );
        if (sortCtrl) {
          sortCtrl.toggleDirection();
          this.sortChanged(sortCtrl);
        }
      });
      th.appendChild(nameSpan);

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

      // Create and add visualization controller
      let visCtrl = new HistogramController(
        this.dataInd.map((i) => this.data[i][c.column]),
        this.getColumnType(c.column) === "continuous"
          ? { thresholds: c.thresholds }
          : { nominals: c.nominals }
      );
      visCtrl.table = this;
      this.visControllers.push(visCtrl);
      visTd.appendChild(visCtrl.getNode());
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
    this.addingRows = true;

    let min = this.lastLineAdded + 1; // Corrected: Start from the next line
    let max = Math.min(min + howMany - 1, this.dataInd.length - 1); // Corrected: Use Math.min to avoid exceeding dataInd.length

    for (let row = min; row <= max; row++) {
      let dataIndex = this.dataInd[row - 1]; // Adjust index for dataInd
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
        console.log("Row index clicked:", rowIndex);
        if (this.shiftDown) {
          let s = this.getSelection().map((s) => s.index);
          if (s.length == 0) s = [rowIndex];
          let minSelIndex = Math.min(...s); // Use spread operator with Math.min/max
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
        } else {
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

      this.lastLineAdded++;
    }

    this.addingRows = false;
  }

  resetTable() {
    // Reset data and indices to initial state
    this.dataInd = d3.range(this.data.length);
    this.selectedRows.clear();
    this.compoundSorting = {};
    this.rules = [];
    this.history = [];

    // Reset sort and shift controllers
    // this.sortControllers.forEach((ctrl) => ctrl.setDirection("none"));
    this.sortControllers.forEach((ctrl) => ctrl.toggleDirection()); // Toggle direction to reset

    // Update column order to the initial state
    this.columns = this.initialColumns.map((col) => ({ ...col }));

    // Update vis controllers
    this.visControllers.forEach((vc, index) => {
      const columnData = this.dataInd.map(
        (i) => this.data[i][this.columns[index].column]
      );
      vc.updateData(columnData);
    });

    // Re-render the table
    this.createHeader();
    this.createTable();

    // Notify about the reset
    this.changed({ type: "reset" });
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

  //   getNode() {
  //     let container = document.createElement("div");
  //     container.style.maxHeight = "300px";
  //     container.style.overflowY = "auto";
  //     container.style.width = "100%";

  //     this.table.style.width = "100%";
  //     this.table.style.borderCollapse = "collapse";
  //     this.table.style.marginTop = "0px";

  //     let tableControllers = document.createElement("table");
  //     let tableControllersRow = document.createElement("tr");
  //     tableControllers.appendChild(tableControllersRow);

  //     if (this.showDefaultControls) {
  //       let tdController = document.createElement("td");
  //       tableControllersRow.appendChild(tdController);
  //       let filterController = new FilterController(() => this.filter());
  //       tdController.appendChild(filterController.getNode());

  //       tdController = document.createElement("td");
  //       tableControllersRow.appendChild(tdController);
  //       let undoController = new UndoController(() => this.undo());
  //       tdController.appendChild(undoController.getNode());
  //     }
  //     container.appendChild(tableControllers);
  //     container.appendChild(this.table);

  //     container.addEventListener("keydown", (event) => {
  //       if (event.shiftKey) {
  //         this.shiftDown = true;
  //       }
  //       if (event.ctrlKey) this.ctrlDown = true;

  //       event.preventDefault();
  //     });
  //     container.addEventListener("keyup", (event) => {
  //       this.shiftDown = false;
  //       this.ctrlDown = false;
  //       event.preventDefault();
  //     });
  //     container.setAttribute("tabindex", "0");

  //     container.addEventListener("scroll", () => {
  //       const threshold = 500;
  //       const scrollTop = container.scrollTop;
  //       const scrollHeight = container.scrollHeight;
  //       const clientHeight = container.clientHeight;

  //       if (scrollTop + clientHeight >= scrollHeight - threshold) {
  //         this.addTableRows(this.additionalLines);
  //       }
  //     });

  //     return container;
  //   }
  // }

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
      const threshold = 500;
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      if (scrollTop + clientHeight >= scrollHeight - threshold) {
        this.addTableRows(this.additionalLines);
      }
    });

    return container;
  }
}

// function SortController(colName, update) {
//   let controller = this;

//   let div = document.createElement("div");

//   //CREATE SVG
//   let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
//   svg.setAttribute("width", 10);
//   svg.setAttribute("height", 16);
//   // svg.setAttribute("style", "border: 1px solid black; background-color: #f0f0f0");
//   div.appendChild(svg);

//   const leftTriangle = createTriangle("0,7 5,0 10,7", "grey", () => {
//     sorting = "up";
//     update(controller);
//   });
//   const rightTriangle = createTriangle("0,9 10,9 5,16", "grey", () => {
//     sorting = "down";
//     console.log("down");
//     update(controller);
//   });

//   // Add triangles to SVG
//   svg.appendChild(leftTriangle);
//   svg.appendChild(rightTriangle);

//   /* let weight = 1;
//       this.setWeight = (w) => {
//           weight = w;
//           draw();
//       }
//       this.getWeight = () => weight;*/

//   let sorting = "none";
//   this.getDirection = () => sorting;

//   // toggle sorting direction
//   this.setDirection = (newDirection) => {
//     sorting = newDirection;

//     // Update the triangle colors based on the new direction
//     if (sorting === "up") {
//       leftTriangle.setAttribute("fill", "black");
//       rightTriangle.setAttribute("fill", "grey");
//     } else if (sorting === "down") {
//       leftTriangle.setAttribute("fill", "grey");
//       rightTriangle.setAttribute("fill", "black");
//     } else {
//       leftTriangle.setAttribute("fill", "grey");
//       rightTriangle.setAttribute("fill", "grey");
//     }
//   };

//   this.getColumn = () => colName;

//   this.getNode = () => div;

//   return this;
// }

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

// function ColShiftController(update) {
//   let controller = this;

//   let div = document.createElement("div");

//   //CREATE SVG
//   let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
//   svg.setAttribute("width", 20);
//   svg.setAttribute("height", 10);
//   // svg.setAttribute("style", "border: 1px solid black; background-color: #f0f0f0");
//   div.appendChild(svg);

//   const leftTriangle = createTriangle("0,5 9,0 9,10", "grey", () =>
//     update("left")
//   );
//   const rightTriangle = createTriangle("11,0 11,10 20,5", "grey", () =>
//     update("right")
//   );

//   // Add triangles to SVG
//   svg.appendChild(leftTriangle);
//   svg.appendChild(rightTriangle);

//   this.getNode = () => div;

//   return this;
// }

function createTriangle(points, color, action) {
  const triangle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon"
  );
  triangle.setAttribute("points", points);
  triangle.setAttribute("fill", color);

  // Event listeners for hover and click
  triangle.addEventListener("mouseover", () => {
    triangle.setAttribute("fill", "black"); // Change color on hover
  });

  triangle.addEventListener("mouseout", () => {
    triangle.setAttribute("fill", color); // Revert color on hover out
  });

  triangle.addEventListener("click", () => {
    action();
  });

  return triangle;
}

function FilterController(action) {
  let controller = this;

  let div = document.createElement("div");

  //CREATE SVG
  let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", 20);
  svg.setAttribute("height", 20);
  // svg.setAttribute("style", "border: 1px solid black; background-color: #f0f0f0");
  div.appendChild(svg);

  const funnel = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon"
  );
  const points = "2,2 8,8 18,9 18,11 8,12 2,18";
  funnel.setAttribute("points", points);
  funnel.setAttribute("fill", "grey");
  svg.appendChild(funnel);

  funnel.addEventListener("mouseover", () => {
    funnel.setAttribute("fill", "black"); // Change color on hover
  });

  funnel.addEventListener("mouseout", () => {
    funnel.setAttribute("fill", "grey"); // Revert color on hover out
  });

  funnel.addEventListener("click", () => {
    action();
  });

  this.getNode = () => div;

  return this;
}

function UndoController(action) {
  let controller = this;

  let div = document.createElement("div");

  //CREATE SVG
  let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", 20);
  svg.setAttribute("height", 20);
  // svg.setAttribute("style", "border: 1px solid black; background-color: #f0f0f0");
  div.appendChild(svg);

  const arrow = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon"
  );
  const points = "1,10 8,2 8,9 10,9 15,15 13,17 10,11 8,11 8,18";
  arrow.setAttribute("points", points);
  arrow.setAttribute("fill", "grey");
  svg.appendChild(arrow);

  arrow.addEventListener("mouseover", () => {
    arrow.setAttribute("fill", "black"); // Change color on hover
  });

  arrow.addEventListener("mouseout", () => {
    arrow.setAttribute("fill", "grey"); // Revert color on hover out
  });

  arrow.addEventListener("click", () => {
    action();
  });

  this.getNode = () => div;

  return this;
}

function HistogramController(data, binrules) {
  let controller = this;
  let div = document.createElement("div");

  this.updateData = (d) => setData(d);

  function setData(dd) {
    // console.log("dd:", dd);

    div.innerHTML = "";

    //in our aggregations we will need to capture the indeces of
    //the data in each category (not just the counts) to support
    //selection. So, we annotate data with its indeces
    let data = dd.map((d, i) => ({ value: d, index: i }));

    //CREATE SVG
    const svgWidth = 100;
    const svgHeight = 50;
    const margin = { top: 5, right: 5, bottom: 8, left: 5 };

    // Make the histogram responsive to the cell width (not working now)
    // const cellWidth = div.parentNode.clientWidth; // Get cell width
    // const width = cellWidth - margin.left - margin.right;
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;

    // Create the SVG element
    const svg = d3
      .select(div)
      .append("svg")
      .attr("width", svgWidth)
      .attr("height", svgHeight);

    // Append a group element to handle margins
    const chart = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    let x = null;
    let bins = null;

    //bin data by either thresholds or ordinals or nominals
    if ("thresholds" in binrules) {
      // Define the x scale (linear scale for values)
      x = d3
        .scaleThreshold()
        .domain(binrules.thresholds)
        .range([0, 1, 2, 3, 4, 5]); // output: pixel range

      // let binnedData = data.map((d) => x(d));

      // Define histogram bins
      bins = d3
        .bin()
        .domain([0, 1000000]) // Set the domain of the bins
        .thresholds(binrules.thresholds) // Set the number of bins (10 in this case)
        .value((d) => d.value)(data);

      bins = bins.map((b) => ({
        category: b.x0 + "-" + b.x1,
        count: b.length,
        indeces: b.map((v) => v.index),
      }));
    } else if ("ordinals" in binrules || "nominals" in binrules) {
      const frequency = d3.rollup(
        data,
        (values) => ({
          count: values.length,
          indeces: values.map((v) => v.index),
        }),
        (d) => d.value
      );

      // Prepare the data as an array of bins
      const binType = "ordinals" in binrules ? "ordinals" : "nominals";

      if (binType in binrules && Array.isArray(binrules[binType])) {
        bins = binrules[binType].map((v) => ({
          category: v,
          count: frequency.get(v) != null ? frequency.get(v).count : 0,
          indeces: frequency.get(v) != null ? frequency.get(v).indeces : [],
        }));
      } else {
        // Handle cases where binrules[binType] is not a valid array
        bins = Array.from(frequency, ([key, value]) => ({
          category: key,
          count: value.count,
          indeces: value.indeces,
        }));
      }
    }

    //add the bin index to each bin
    bins.map((bin, i) => (bin.index = i));
    // console.log("bins: ", bins);

    // Define the y scale (based on bin counts)
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (d) => d.count)]) // input: max count in bins
      .range([height, 0]); // output: pixel range (inverted for SVG coordinate system)

    //for each bin we'll have to bars, a regular one and an
    //invisible one that stretches through the whole height of the
    //chart; the latter is there for interaction.
    const barGroups = svg
      .selectAll(".bar")
      .data(bins)
      .join("g")
      .attr("class", "bar")
      .attr(
        "transform",
        (d, i) => `translate(${(i * width) / bins.length}, 0)`
      );

    // visible bars
    barGroups
      .append("rect")
      .attr("x", 0)
      .attr("width", (d) => width / bins.length)
      .attr("y", (d) => y(d.count))
      .attr("height", (d) => height - y(d.count))
      .attr("fill", "steelblue");

    //invisible bars for interaction
    barGroups
      .append("rect")
      .attr("width", (d) => width / bins.length)
      .attr("height", height) // Stretch to full height
      .attr("fill", "transparent") // Make invisible
      .on("mouseover", (event, d) => {
        // d3.select(event.currentTarget.previousSibling).attr("fill", "purple"); // Change color on hover for the actual bar

        if (!d.selected) {
          d3.select(event.currentTarget.previousSibling).attr("fill", "purple");
        }

        svg
          .selectAll(".label")
          .data([d]) // Bind the data to the label
          .join("text")
          .attr("class", "label")
          .attr("x", width / 2) // Center the label under the bar
          .attr("y", height + 10) // Position the label below the bar
          .attr("font-size", "10px")
          .attr("fill", "black")
          .attr("text-anchor", "middle") // Center the text
          .text(d.category + ": " + d.count); // Display the value in the label
      })
      .on("mouseout", (event, d) => {
        if (!d.selected) {
          d3.select(event.currentTarget.previousSibling).attr(
            "fill",
            "steelblue"
          );
        }

        // d3.select(event.currentTarget.previousSibling).attr(
        //   "fill",
        //   "steelblue"
        // ); // Revert color on mouseout

        svg.selectAll(".label").remove();
      })
      .on("click", (event, d) => {
        // Toggle the selected state
        d.selected = !d.selected;

        // Update highlight based on selection state
        if (d.selected) {
          d3.select(event.currentTarget.previousSibling).attr("fill", "orange");
        } else {
          d3.select(event.currentTarget.previousSibling).attr(
            "fill",
            "steelblue"
          );
        }

        // d3.select(event.currentTarget.previousSibling).attr("fill", "orange"); // Revert color on mouseout
        console.log("histo select:", bins[d.index].indeces);

        // Select the corresponding rows in the table
        // Assuming 'controller.table' references the sorterTable instance
        if (controller.table) {
          if (!d.selected) {
            controller.table.clearSelection();
          }

          bins[d.index].indeces.forEach((rowIndex) => {
            // Use the dataInd array to get the correct data index
            const actualIndex = controller.table.dataInd[rowIndex];
            const tr = controller.table.tBody.querySelector(
              `tr:nth-child(${actualIndex + 1})`
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
        // if (controller.table) {
        //   controller.table.clearSelection();
        //   bins[d.index].indeces.forEach((rowIndex) => {
        //     const tr = controller.table.tBody.querySelector(
        //       `tr:nth-child(${rowIndex + 1})`
        //     );
        //     if (tr) {
        //       controller.table.selectRow(tr);
        //     }
        //   });
        // }
        // // Inform sorterTable about the selection change
        // controller.table.selectionUpdated();
      });
  }

  setData(data);

  // set this.table from sorterTable
  this.table = null;

  this.getNode = () => div;
  return this;
}
