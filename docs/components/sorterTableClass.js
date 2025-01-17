import * as d3 from "npm:d3";

export class sorterTable {
  constructor(data, columns, changed) {
    this.data = data;
    this.columns = columns;
    this.changed = changed;
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
    this.createHeader();
    this.createTable();
  }

  setColumnType(columnName, type) {
    this.columnTypes[columnName] = type;
  }

  getColumnType(columnName) {
    if (columnName in this.columnTypes) return this.columnTypes[columnName];
    return null;
  }

  shiftCol(col, dir) {
    let colIndex = this.columns.findIndex((c) => c.column == col);
    const targetIndex = dir === "left" ? colIndex - 1 : colIndex + 1;

    if (targetIndex >= 0 && targetIndex < this.columns.length) {
      this.history.push({ type: "shiftcol", col: col, dir: dir });

      for (let row of this.table.rows) {
        const cell1 = row.cells[colIndex];
        const cell2 = row.cells[targetIndex];

        if (dir == "left") row.insertBefore(cell1, cell2);
        else row.insertBefore(cell2, cell1);
      }

      let sw = this.columns[colIndex];
      this.columns[colIndex] = this.columns[targetIndex];
      this.columns[targetIndex] = sw;

      sw = this.sortControllers[colIndex];
      this.sortControllers[colIndex] = this.sortControllers[targetIndex];
      this.sortControllers[targetIndex] = sw;

      sw = this.visControllers[colIndex];
      this.visControllers[colIndex] = this.visControllers[targetIndex];
      this.visControllers[targetIndex] = sw;
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
        this.visControllers.map((vc, vci) =>
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
        this.shiftCol(u.col, u.dir === "left" ? "right" : "left");
      }
    }
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
    if (this.tBody != null)
      this.tBody.querySelectorAll("tr").forEach((tr) => this.unselectRow(tr));
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
    if (this.tHead != null) this.table.removeChild(this.tHead);

    this.sortControllers = [];

    this.tHead = document.createElement("thead");
    this.table.appendChild(this.tHead);
    let tr = document.createElement("tr");
    this.tHead.append(tr);

    this.columns.map((c) => {
      let th = document.createElement("th");
      tr.appendChild(th);

      let ctrlTable = document.createElement("table");
      ctrlTable.style.margin = "0px";
      th.appendChild(ctrlTable);

      let row = document.createElement("tr");
      ctrlTable.append(row);
      let td = document.createElement("td");
      row.appendChild(td);
      td.innerText = c.column;
      td.setAttribute("colspan", 3);

      row = document.createElement("tr");
      ctrlTable.append(row);

      td = document.createElement("td");
      td.setAttribute("colspan", 3);
      row.appendChild(td);
      let visCtrl = new HistogramController(
        this.dataInd.map((i) => this.data[i][c.column]),
        c
      );
      this.visControllers.push(visCtrl);
      td.appendChild(visCtrl.getNode());

      row = document.createElement("tr");
      ctrlTable.append(row);

      td = document.createElement("td");
      row.appendChild(td);
      td.appendChild(
        new ColShiftController((dir) => this.shiftCol(c, dir)).getNode()
      );
      td = document.createElement("td");
      row.appendChild(td);
      let sortCtrl = new SortController(c.column, (controller) =>
        this.sortChanged(controller)
      );
      this.sortControllers.push(sortCtrl);
      td.appendChild(sortCtrl.getNode());

      td = document.createElement("td");
      td.style.width = "100%";
      row.appendChild(td);
    });
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

    let min = this.lastLineAdded;
    let max = this.lastLineAdded + howMany;
    this.dataInd.map((d, row) => {
      if (row <= min || row > max) {
        return;
      }

      this.lastLineAdded++;

      let tr = document.createElement("tr");
      tr.selected = false;
      tr.style.color = "grey";
      this.tBody.appendChild(tr);

      this.columns.map((c) => {
        let td = document.createElement("td");
        td.innerText = this.data[d][c.column];
        tr.appendChild(td);
        td.style.color = "inherit";
        td.style.fontWidth = "inherit";
      });

      tr.addEventListener("click", (event) => {
        let rowIndex = this.getRowIndex(tr);

        if (this.shiftDown) {
          let s = this.getSelection().map((s) => s.index);
          if (s.length == 0) s = [rowIndex];
          let minSelIndex = d3.min(s);
          let maxSelIndex = d3.max(s);

          if (rowIndex <= minSelIndex)
            this.tBody
              .querySelectorAll("tr")
              .forEach((tr, i) =>
                i >= rowIndex && i < minSelIndex ? this.selectRow(tr) : null
              );
          else if (rowIndex >= maxSelIndex)
            this.tBody
              .querySelectorAll("tr")
              .forEach((tr, i) =>
                i <= rowIndex && i > maxSelIndex ? this.selectRow(tr) : null
              );
        } else {
          this.clearSelection();
          this.selectRow(tr);
        }
        this.selectionUpdated();
      });

      tr.addEventListener("mouseover", (event) => {
        tr.selected
          ? (tr.style.color = "rgb(120,30,30)")
          : (tr.style.color = "rgb(180,80,80)");
        event.stopPropagation();
      });
      tr.addEventListener("mouseout", (event) => {
        tr.selected ? (tr.style.color = "black") : (tr.style.color = "gray");
      });
    });

    this.addingRows = false;
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

    // this.dataInd.map((v, i) => (this.data[v].tabindex = i));

    // this.dataInd.sort((a, b) => {
    //   let scoreA = 0;
    //   Object.keys(sorts).map(
    //     (col) =>
    //       (scoreA +=
    //         this.compoundSorting[col].weight *
    //         sorts[col][this.data[a].tabindex])
    //   );
    //   let scoreB = 0;
    //   Object.keys(sorts).map(
    //     (col) =>
    //       (scoreB +=
    //         this.compoundSorting[col].weight *
    //         sorts[col][this.data[b].tabindex])
    //   );
    //   return scoreA - scoreB;
    // });

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

  getNode() {
    let container = document.createElement("div");
    container.style.maxHeight = "300px";
    container.style.overflowY = "auto";
    container.style.width = "100%";

    this.table.style.width = "100%";
    this.table.style.borderCollapse = "collapse";
    this.table.style.marginTop = "0px";

    let tableControllers = document.createElement("table");
    let tableControllersRow = document.createElement("tr");
    tableControllers.appendChild(tableControllersRow);

    let tdController = document.createElement("td");
    tableControllersRow.appendChild(tdController);
    let filterController = new FilterController(() => this.filter());
    tdController.appendChild(filterController.getNode());

    tdController = document.createElement("td");
    tableControllersRow.appendChild(tdController);
    let undoController = new UndoController(() => this.undo());
    tdController.appendChild(undoController.getNode());

    container.appendChild(tableControllers);
    container.appendChild(this.table);

    container.addEventListener("keydown", (event) => {
      if (event.shiftKey) {
        this.shiftDown = true;
      }
      if (event.ctrlKey) this.ctrlDown = true;

      event.preventDefault();
    });
    container.addEventListener("keyup", (event) => {
      this.shiftDown = false;
      this.ctrlDown = false;
      event.preventDefault();
    });
    container.setAttribute("tabindex", "0");

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

function SortController(colName, update) {
  let controller = this;

  let div = document.createElement("div");

  //CREATE SVG
  let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", 10);
  svg.setAttribute("height", 16);
  // svg.setAttribute("style", "border: 1px solid black; background-color: #f0f0f0");
  div.appendChild(svg);

  const leftTriangle = createTriangle("0,7 5,0 10,7", "grey", () => {
    sorting = "up";
    update(controller);
  });
  const rightTriangle = createTriangle("0,9 10,9 5,16", "grey", () => {
    sorting = "down";
    console.log("down");
    update(controller);
  });

  // Add triangles to SVG
  svg.appendChild(leftTriangle);
  svg.appendChild(rightTriangle);

  /* let weight = 1;
      this.setWeight = (w) => {
          weight = w;
          draw();
      }
      this.getWeight = () => weight;*/

  let sorting = "none";
  this.getDirection = () => sorting;

  this.getColumn = () => colName;

  this.getNode = () => div;

  return this;
}

function ColShiftController(update) {
  let controller = this;

  let div = document.createElement("div");

  //CREATE SVG
  let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", 20);
  svg.setAttribute("height", 10);
  // svg.setAttribute("style", "border: 1px solid black; background-color: #f0f0f0");
  div.appendChild(svg);

  const leftTriangle = createTriangle("0,5 9,0 9,10", "grey", () =>
    update("left")
  );
  const rightTriangle = createTriangle("11,0 11,10 20,5", "grey", () =>
    update("right")
  );

  // Add triangles to SVG
  svg.appendChild(leftTriangle);
  svg.appendChild(rightTriangle);

  this.getNode = () => div;

  return this;
}

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
    console.log("dd:", dd);

    div.innerHTML = "";

    //in our aggregations we will need to capture the indeces of
    //the data in each category (not just the counts) to support
    //selection. So, we annotate data with its indeces
    let data = dd.map((d, i) => ({ value: d, index: i }));

    //CREATE SVG
    const svgWidth = 100;
    const svgHeight = 50;
    const margin = { top: 5, right: 5, bottom: 12, left: 5 };
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

      let binnedData = data.map((d) => x(d));

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
      //I'll use d3.rollup but need to captur the data indeces in each
      //category, not jut their counts

      // const frequency = d3.rollup(data, v => v.length, d => d);

      const frequency = d3.rollup(
        data,
        (values) => ({
          count: values.length,
          indeces: values.map((v) => v.index),
        }),
        (d) => d.value
      );
      // Prepare the data as an array of bins
      if ("ordinals" in binrules)
        bins = binrules.ordinals.map((v) => ({
          category: v,
          count: frequency.get(v) != null ? frequency.get(v).count : 0,
          indeces: frequency.get(v) != null ? frequency.get(v).indeces : [],
        }));
      else
        bins = Array.from(frequency, ([key, value]) => ({
          category: key,
          count: value.count,
          indeces: value.indeces,
        }));
    }

    //add the bin index to each bin
    bins.map((bin, i) => (bin.index = i));
    console.log("bins: ", bins);

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
        d3.select(event.currentTarget.previousSibling).attr("fill", "purple"); // Change color on hover for the actual bar

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
        d3.select(event.currentTarget.previousSibling).attr(
          "fill",
          "steelblue"
        ); // Revert color on mouseout

        svg.selectAll(".label").remove();
      })
      .on("click", (event, d) => {
        d3.select(event.currentTarget.previousSibling).attr("fill", "orange"); // Revert color on mouseout

        console.log("histo select:", bins[d.index].indeces);
      });
  }

  setData(data);

  this.getNode = () => div;
  return this;
}
