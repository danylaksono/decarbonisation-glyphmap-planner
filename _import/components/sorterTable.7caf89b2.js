import * as d3 from "../../_npm/d3@7.9.0/_esm.js";

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

export function createTable(data, columns, changed) {
  let thisObject = this;

  //we'll use this (dataIndeces) throughout the class
  //the manipulate how original data is shown
  let dataInd = d3.range(data.length);

  let sortControllers = [];
  let visControllers = [];

  let table = document.createElement("table");
  table.style.userSelect = "none";

  let compoundSorting = new Object();

  let selected = [];

  let history = [];

  let tBody = null;
  let tHead = null;

  let ctrlDown = false;
  let shiftDown = false;
  let lastRowSelected = 0;

  let defaultLines = 1000;
  let lastLineAdded = 0;
  let additionalLines = 500;
  let addingRows = false;

  let rules = [];

  let percentiles = [
    0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8,
    0.9, 0.95, 0.96, 0.97, 0.98, 0.99, 1,
  ];
  function percentalize(v, dir = "top") {
    if (dir === "bottom") {
      for (let i = 1; i < percentiles.length; i++) {
        if (v >= percentiles[i - 1] && v <= percentiles[i]) {
          console.log("yes");
          return 100 * percentiles[i - 1];
        }
      }
    } else if (dir === "top") {
      for (let i = 1; i < percentiles.length; i++) {
        if (v >= percentiles[i - 1] && v <= percentiles[i])
          return 100 * percentiles[i];
      }
    } else return -1;
  }

  let columnTypes = new Object();
  this.setColumnType = (columnName, type) => {
    columnTypes[columnName] = type;
  };

  this.getColumnType = (columnName) => {
    if (columnName in columnTypes) return columnTypes[columnName];
    return null;
  };

  createHeader();
  createTable();

  function shiftCol(col, dir) {
    let colIndex = columns.findIndex((c) => c.column == col);
    const targetIndex = dir === "left" ? colIndex - 1 : colIndex + 1;

    if (targetIndex >= 0 && targetIndex < columns.length) {
      history.push({ type: "shiftcol", col: col, dir: dir });

      for (let row of table.rows) {
        const cell1 = row.cells[colIndex];
        const cell2 = row.cells[targetIndex];

        if (dir == "left") row.insertBefore(cell1, cell2);
        else row.insertBefore(cell2, cell1);
      }

      //swap columns
      let sw = columns[colIndex];
      columns[colIndex] = columns[targetIndex];
      columns[targetIndex] = sw;

      //swap sortControllers...
      sw = sortControllers[colIndex];
      sortControllers[colIndex] = sortControllers[targetIndex];
      sortControllers[targetIndex] = sw;

      //swap visControllers
      sw = visControllers[colIndex];
      visControllers[colIndex] = visControllers[targetIndex];
      visControllers[targetIndex] = sw;
    }
  }

  function filter() {
    rules.push(getSelectionRule());
    //keep only data indeces that are selected
    history.push({ type: "filter", data: dataInd });
    dataInd = thisObject.getSelection().map((s) => dataInd[s.index]);
    //and recreate table
    createTable();

    //updatevis ctrls
    visControllers.map((vc, vci) =>
      vc.updateData(dataInd.map((i) => data[i][columns[vci].column]))
    );
    changed({ type: "filter", indeces: dataInd, rule: getSelectionRule() });
  }

  this.getAllRules = () => rules;

  function undo() {
    if (history.length > 0) {
      let u = history.pop();
      console.log(u);
      if (u.type === "filter" || u.type === "sort") {
        dataInd = u.data;
        createTable();
        visControllers.map((vc, vci) =>
          vc.updateData(dataInd.map((i) => data[i][columns[vci].column]))
        );
        changed({ type: "undo", indeces: dataInd, sort: compoundSorting });
      } else if (u.type === "shiftcol") {
        shiftCol(u.col, u.dir === "left" ? "right" : "left");
      }
    }
  }

  this.getSelection = () => {
    let ret = [];
    tBody.querySelectorAll("tr").forEach((tr, i) => {
      if (tr.selected) ret.push({ index: i, data: data[dataInd[i]] });
    });
    return ret;
  };

  function getSelectionRule() {
    let sel = thisObject.getSelection();

    let sortKeys = Object.keys(compoundSorting);

    //there is no sorting; for now we assume that there's no rule
    //however, in the future we should revisit this... users could
    //select things one by one.
    if (sortKeys.length === 0) {
      return null;
    }
    //there is sorting
    else {
      //for we deal only with single sortings - so just one column)
      let col = sortKeys[0];

      //also, for now selections are contiguous
      let firstIndex = sel[sel.length - 1].index;
      let lastIndex = sel[sel.length - 1].index;

      if ((firstIndex = 0 && lastIndex == dataInd.length - 1))
        //all data selected, no rule
        return [];
      else {
        console.log(
          "why?",
          lastIndex < dataInd.length - 1,
          data[dataInd[lastIndex + 1]],
          data[dataInd[lastIndex]]
        );
        let rule = [];
        //first check for rules based on values
        let r = "";
        //check the top of the range
        if (
          firstIndex > 0 &&
          data[dataInd[firstIndex - 1]][col] != data[dataInd[firstIndex]][col]
        ) {
          r =
            col +
            (compoundSorting[col].how === "up"
              ? " lower than "
              : " higher than ") +
            data[dataInd[firstIndex]][col];
        }
        if (
          lastIndex < dataInd.length - 1 &&
          data[dataInd[lastIndex + 1]][col] != data[dataInd[lastIndex]][col]
        ) {
          if (r.length == 0)
            r =
              col +
              (compoundSorting[col].how === "up"
                ? " lower than "
                : " higher than ") +
              data[dataInd[lastIndex]][col];
          else
            r =
              r +
              (compoundSorting[col].how === "up"
                ? " and lower than"
                : "  and higher than ") +
              data[dataInd[lastIndex]][col];
        }
        if (r.length > 0) rule.push(r);

        //then add percentile rules
        if (compoundSorting[col].how === "up")
          r =
            col +
            " in bottom " +
            percentalize(lastIndex / data.length, "top") +
            " percentile";
        else
          r =
            col +
            " in top " +
            percentalize(1 - lastIndex / data.length, "bottom") +
            " percentile";
        rule.push(r);

        return rule;
      }
    }
  }

  function selectionUpdated() {
    changed({
      type: "selection",
      indeces: dataInd,
      selection: thisObject.getSelection(),
      rule: getSelectionRule(),
    });
  }

  function clearSelection() {
    if (tBody != null)
      tBody.querySelectorAll("tr").forEach((tr) => unselectRow(tr));
  }

  function selectRow(tr) {
    tr.selected = true;
    tr.style.fontWeight = "bold";
    tr.style.color = "black";
  }
  function unselectRow(tr) {
    tr.selected = false;
    tr.style.fontWeight = "normal";
    tr.style.color = "grey";
  }
  function getRowIndex(tr) {
    let index = -1;
    tBody.querySelectorAll("tr").forEach((t, i) => {
      if (t == tr) index = i;
    });
    return index;
  }

  function createHeader() {
    //if the table already has thead, remove it
    if (tHead != null) table.removeChild(tHead);

    sortControllers = [];

    tHead = document.createElement("thead");
    table.appendChild(tHead);
    let tr = document.createElement("tr");
    tHead.append(tr);

    columns.map((c) => {
      let th = document.createElement("th");
      tr.appendChild(th);

      //create a small table to put the column name and all controllers inside
      let ctrlTable = document.createElement("table");
      ctrlTable.style.margin = "0px";
      th.appendChild(ctrlTable);

      //col name
      let row = document.createElement("tr");
      ctrlTable.append(row);
      let td = document.createElement("td");
      row.appendChild(td);
      td.innerText = c.column;
      td.setAttribute("colspan", 3);

      //vis row
      row = document.createElement("tr");
      ctrlTable.append(row);

      td = document.createElement("td");
      td.setAttribute("colspan", 3);
      row.appendChild(td);
      let visCtrl = new HistogramController(
        dataInd.map((i) => data[i][c.column]),
        c
      );
      visControllers.push(visCtrl);
      td.appendChild(visCtrl.getNode());

      //ctrl row
      row = document.createElement("tr");
      ctrlTable.append(row);

      td = document.createElement("td");
      row.appendChild(td);
      td.appendChild(
        new ColShiftController((dir) => shiftCol(c, dir)).getNode()
      );
      td = document.createElement("td");
      row.appendChild(td);
      let sortCtrl = new SortController(c.column, sortChanged);
      sortControllers.push(sortCtrl);
      td.appendChild(sortCtrl.getNode());

      td = document.createElement("td");
      td.style.width = "100%";
      row.appendChild(td);
    });
  }

  function createTable() {
    //if the table already has a tbody, remove it
    if (tBody != null) table.removeChild(tBody);

    tBody = document.createElement("tbody");
    table.appendChild(tBody);

    lastLineAdded = -1;
    addTableRows(defaultLines);
  }

  function addTableRows(howMany) {
    addingRows = true;

    let min = lastLineAdded;
    let max = lastLineAdded + howMany;
    dataInd.map((d, row) => {
      if (row <= min || row > max) {
        //  if (row%100 == 0 && row < 3000) console.log("skipping row " + row, min, max);
        return;
      }

      lastLineAdded++;

      //console.log("adding row " + row);
      let tr = document.createElement("tr");
      tr.selected = false;
      tr.style.color = "grey";
      tBody.appendChild(tr);

      columns.map((c) => {
        let td = document.createElement("td");
        td.innerText = data[d][c.column];
        tr.appendChild(td);
        td.style.color = "inherit";
        td.style.fontWidth = "inherit";
      });

      //deal with selection
      tr.addEventListener("click", (event) => {
        let rowIndex = getRowIndex(tr);

        //limit to contiguous selections by not allowing ctrl selection
        /* if (ctrlDown){
                    if (tr.selected) {
                        unselectRow(tr);
                        lastRowSelected = 0;
                    }
                    else{
                        selectRow(tr);
                        lastRowSelected = rowIndex;
                    }
                }*/
        if (shiftDown) {
          let s = thisObject.getSelection().map((s) => s.index);
          if (s.length == 0) s = [rowIndex];
          let minSelIndex = d3.min(s);
          let maxSelIndex = d3.max(s);

          if (rowIndex <= minSelIndex)
            tBody
              .querySelectorAll("tr")
              .forEach((tr, i) =>
                i >= rowIndex && i < minSelIndex ? selectRow(tr) : null
              );
          else if (rowIndex >= maxSelIndex)
            tBody
              .querySelectorAll("tr")
              .forEach((tr, i) =>
                i <= rowIndex && i > maxSelIndex ? selectRow(tr) : null
              );
        } else {
          clearSelection();
          selectRow(tr);
        }
        console.log(selectionUpdated());
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

    //  lastLineAdded = Math.max(dataInd.length-1, lastLineAdded+defaultLines);
    addingRows = false;
  }

  function sortChanged(controller) {
    history.push({ type: "sort", data: [...dataInd] });
    //single sorting for now
    compoundSorting = new Object();

    //update the compound sorting object
    let col = controller.getColumn();
    let how = controller.getDirection();

    if (how == "none") {
      //we need to remove this sorting rule
      let w = compoundSorting[col].weight;
      delete compoundSorting[col];
      //redistribute the remove weight to remaining sort
      let sorts = Object.keys(compoundSorting);
      let sum = 0;
      sorts.map((sk) => (sum = sum + compoundSorting[sk].weight));
      sorts.map((sk) => (compoundSorting[sk].weight /= sum));
    } else {
      //add or replace a sort
      //if the sort exists, just update its direction
      if (col in compoundSorting) compoundSorting[col].how = how;
      else {
        //update the weights of the existing ones
        let sorts = Object.values(compoundSorting);
        let w = 1 / (sorts.length + 1);
        sorts.map((s) => (s.weight *= 1 - w));
        compoundSorting[col] = { weight: w, how: how };
      }
    }

    //update the wights in the controllers
    /* sortControllers.map( ctrl => {
           if (ctrl.getColumn() in compoundSorting)
               ctrl.setWeight(compoundSorting[ctrl.getColumn()].weight);
        });*/

    //update the actual sorting

    //we blend ranks rather than values (for now only option)

    let sorts = new Object();
    Object.keys(compoundSorting).map((col) => {
      //for each sorted col we first sort table indeces
      //based on its sort rule
      let sortDir = compoundSorting[col].how === "up" ? 1 : -1;
      if (typeof data[0][col] === "string") sortDir *= -1;
      let sortedCol = d3
        .range(dataInd.length)
        .sort(
          (i1, i2) =>
            sortDir * (data[dataInd[i1]][col] > data[dataInd[i2]][col] ? 1 : -1)
        );

      //the position of each index in sortedCol now represents
      //the ranking in the ordering.

      //however, we'd like the rank to be the same for elements with the same
      //value (imagine EPC rating - all As should have rank 0, all Bs ranks should
      //start with the rank of the first B in the list, etc.
      sorts[col] = new Array(data.length);
      let rank = 0;
      sorts[col][sortedCol[0]] = rank;
      for (let i = 1; i < sortedCol.length; i++) {
        if (
          data[dataInd[sortedCol[i]]][col] !=
          data[dataInd[sortedCol[i - 1]]][col]
        )
          rank = i;
        sorts[col][sortedCol[i]] = rank;
      }
    });

    //now we have the ranks stored in sorts for each sorted column;
    //ranks are at most table.length so we can normalise them easily

    //we are ready to sort the entire table by weight-blending the different
    //sorting rules

    //during sorting, we'll need access to the value indeces (not just the values)
    //so, first, we have to add indeces to each table element
    dataInd.map((v, i) => (data[v].tabindex = i));

    dataInd.sort((a, b) => {
      let scoreA = 0;
      Object.keys(sorts).map(
        (col) =>
          (scoreA += compoundSorting[col].weight * sorts[col][data[a].tabindex])
      );
      let scoreB = 0;
      Object.keys(sorts).map(
        (col) =>
          (scoreB += compoundSorting[col].weight * sorts[col][data[b].tabindex])
      );
      return scoreA - scoreB;
    });

    //remove the tabindeces we add
    dataInd.map((v, i) => delete data[v].tabindex);

    //update the actual table
    createTable();

    changed({ type: "sort", sort: compoundSorting, indeces: dataInd });
  }

  let container = document.createElement("div");
  container.style.maxHeight = "300px"; // Set max height for vertical scroll
  container.style.overflowY = "auto"; // Enable vertical scrolling
  container.style.width = "100%"; // Full width of container

  table.style.width = "100%"; // Make table full width of container
  table.style.borderCollapse = "collapse";
  table.style.marginTop = "0px";

  let tableControllers = document.createElement("table");
  let tableControllersRow = document.createElement("tr");
  tableControllers.appendChild(tableControllersRow);

  let tdController = document.createElement("td");
  tableControllersRow.appendChild(tdController);
  let filterController = new FilterController(filter);
  tdController.appendChild(filterController.getNode());

  tdController = document.createElement("td");
  tableControllersRow.appendChild(tdController);
  let undoController = new UndoController(undo);
  tdController.appendChild(undoController.getNode());

  container.appendChild(tableControllers);
  container.appendChild(table);

  container.addEventListener("keydown", function (event) {
    if (event.shiftKey) {
      shiftDown = true;
    }
    if (event.ctrlKey) ctrlDown = true;

    event.preventDefault();
  });
  container.addEventListener("keyup", function (event) {
    shiftDown = false;
    ctrlDown = false;
    event.preventDefault();
  });
  container.setAttribute("tabindex", "0");

  container.addEventListener("scroll", () => {
    const threshold = 500;
    const scrollTop = container.scrollTop; // Distance scrolled from the top
    const scrollHeight = container.scrollHeight; // Total scrollable height
    const clientHeight = container.clientHeight; // Visible height of the container

    // Check if we're within `threshold` pixels of the bottom
    if (scrollTop + clientHeight >= scrollHeight - threshold) {
      console.log("add rows:");
      addTableRows(additionalLines);
      console.log("lastLineAdded:" + lastLineAdded);
      // Add your desired logic here
    }
  });

  this.getNode = () => container;
  return this;
}
