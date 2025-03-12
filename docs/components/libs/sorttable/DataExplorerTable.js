// DataExplorerTable.js
import * as d3 from "npm:d3";
import { BinningService } from "./BinningService.js";
import { HistogramRenderer } from "./HistogramRenderer.js";

export class DataExplorerTable {
  constructor(data, columns, config = {}) {
    this.rawData = data;
    this.config = config;
    this.currentSort = {};
    this.filteredIndices = d3.range(data.length);
    this.binningService = new BinningService(config.binning);
    this.histogramRenderers = new Map();
    this.columnDefs = this.normalizeColumns(columns);
    this.init();
    this.processData();
    this.render();
  }

  normalizeColumns(columns) {
    // Ensure columns is always an array
    const colsArray = Array.isArray(columns) ? columns : [columns];

    return colsArray.map((col) => ({
      // Handle string shorthand syntax
      ...(typeof col === "string" ? { id: col } : col),
      // Set default values
      id: col.id || col.field || col,
      type: col.type || "auto",
      visible: col.visible ?? true,
      sortable: col.sortable ?? true,
      filterable: col.filterable ?? true,
      // Add fallback label
      label: col.label || col.id || col.field || col,
    }));
  }

  init() {
    // Create self-contained container
    this.dom = {
      main: document.createElement("div"),
      table: document.createElement("table"),
      header: document.createElement("thead"),
      body: document.createElement("tbody"),
      controls: this.createControls(),
    };

    // Set styles
    this.dom.main.style.width = this.config.width || "100%";
    this.dom.main.style.height = this.config.height || "600px";
    this.dom.main.style.overflow = "auto";
    this.dom.table.classList.add("data-explorer-table");

    // Build DOM structure
    this.dom.table.append(this.dom.header, this.dom.body);
    this.dom.main.append(this.dom.controls, this.dom.table);
  }

  getNode() {
    return this.dom.main;
  }

  createControls() {
    const controls = document.createElement("div");
    controls.className = "table-controls";
    controls.innerHTML = `
      <button class="reset-btn">Reset</button>
      <button class="undo-btn">Undo</button>
    `;

    controls
      .querySelector(".reset-btn")
      .addEventListener("click", () => this.reset());
    controls
      .querySelector(".undo-btn")
      .addEventListener("click", () => this.undo());

    return controls;
  }

  processData() {
    // Type inference and data processing
    this.columnDefs.forEach((col) => {
      if (col.type === "auto") {
        col.type = this.inferType(col.id);
      }

      // Get bins for histogram
      col.bins = this.binningService.getBins(this.rawData, col.id, col.type);
      col.scale = this.createScale(col);
    });
  }

  inferType(column) {
    const sample = this.rawData[0][column];
    if (typeof sample === "number") return "continuous";
    if (sample instanceof Date) return "date";
    return "ordinal";
  }

  createScale(column) {
    const { type, bins } = column;
    if (type === "continuous" || type === "date") {
      return d3
        .scaleLinear()
        .domain([bins[0].x0, bins[bins.length - 1].x1])
        .range([0, 100]);
    }
    return d3
      .scaleBand()
      .domain(bins.map((b) => b.key))
      .range([0, 100]);
  }

  render() {
    this.renderHeader();
    this.renderBody();
    this.setupEventListeners();
  }

  renderHeader() {
    this.dom.header.innerHTML = "";
    const row = document.createElement("tr");

    this.columnDefs.forEach((col) => {
      const th = document.createElement("th");
      th.innerHTML = `
        <div class="column-header">
          <span class="column-title">${col.label || col.id}</span>
          <div class="column-controls">
            ${this.createSortControls(col)}
            <div class="histogram-container"></div>
          </div>
        </div>
      `;

      // Initialize histogram
      const container = th.querySelector(".histogram-container");
      const renderer = new HistogramRenderer(container, (bins) =>
        this.handleHistogramSelection(col.id, bins)
      );
      renderer.update(col.bins, { type: col.type, scale: col.scale });
      this.histogramRenderers.set(col.id, renderer);

      row.appendChild(th);
    });

    this.dom.header.appendChild(row);
  }

  createSortControls(col) {
    return `
      <div class="sort-controls">
        <button class="sort-asc" data-column="${col.id}">↑</button>
        <button class="sort-desc" data-column="${col.id}">↓</button>
      </div>
    `;
  }

  handleHistogramSelection(columnId, bins) {
    const filtered = new Set();
    bins.forEach((bin) => {
      bin.forEach((item) => filtered.add(item.index));
    });

    this.filteredIndices = Array.from(filtered);
    this.renderBody();
  }

  renderBody() {
    // Virtualized rendering
    const startIdx = Math.floor(this.dom.main.scrollTop / 30);
    const visibleCount = Math.ceil(this.dom.main.clientHeight / 30);
    const endIdx = startIdx + visibleCount + 5;

    this.dom.body.innerHTML = "";
    this.filteredIndices
      .slice(startIdx, endIdx)
      .forEach((idx) => this.renderRow(idx));
  }

  renderRow(index) {
    const row = document.createElement("tr");
    const data = this.rawData[index];

    this.columnDefs.forEach((col) => {
      const cell = document.createElement("td");
      cell.textContent = data[col.id];
      row.appendChild(cell);
    });

    this.dom.body.appendChild(row);
  }

  setupEventListeners() {
    // Sorting
    this.dom.header.addEventListener("click", (event) => {
      const btn = event.target.closest(".sort-asc, .sort-desc");
      if (!btn) return;

      const column = btn.dataset.column;
      const direction = btn.classList.contains("sort-asc") ? "asc" : "desc";
      this.sortBy(column, direction);
    });

    // Virtualization
    this.dom.main.addEventListener("scroll", () => this.renderBody());
  }

  sortBy(column, direction) {
    this.currentSort = { column, direction };
    this.filteredIndices.sort((a, b) => {
      const valA = this.rawData[a][column];
      const valB = this.rawData[b][column];
      return direction === "asc" ? valA - valB : valB - valA;
    });
    this.renderBody();
  }

  reset() {
    this.currentSort = {};
    this.filteredIndices = d3.range(this.rawData.length);
    this.histogramRenderers.forEach((r) => r.clearSelection());
    this.render();
  }

  undo() {
    // Implement undo logic based on history stack
    // (Omitted for brevity, but would track previous states)
  }
}
