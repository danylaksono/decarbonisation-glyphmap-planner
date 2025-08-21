export class Toolbar {
  constructor(tableInstance) {
    this.table = tableInstance;
    this.node = this.createNode();
  }

  createNode() {
    const toolbar = document.createElement("div");
    toolbar.className = "sorter-table-toolbar";
    toolbar.style.display = "flex";
    toolbar.style.justifyContent = "space-between";
    toolbar.style.alignItems = "center";
    toolbar.style.padding = "4px 8px";
    toolbar.style.backgroundColor = "#f5f5f5";
    toolbar.style.borderBottom = "1px solid #ccc";

    const rulesContainer = document.createElement("div");
    rulesContainer.className = "rules-container";
    rulesContainer.style.flexGrow = "1";
    rulesContainer.style.overflowX = "auto";
    rulesContainer.style.whiteSpace = "nowrap";
    rulesContainer.innerHTML = `<strong>Rules:</strong> ${this.table.state.rules.length > 0 ? this.table.state.rules.join(" & ") : "None"}`;
    toolbar.appendChild(rulesContainer);

    const buttonContainer = document.createElement("div");
    buttonContainer.className = "button-container";
    buttonContainer.style.display = "flex";
    buttonContainer.style.gap = "8px";

    if (this.table.showDefaultControls) {
      const undoButton = document.createElement("button");
      undoButton.innerHTML = `<i class="fas fa-undo" title="Undo last action"></i>`;
      undoButton.onclick = () => this.table.undo();
      buttonContainer.appendChild(undoButton);

      const resetButton = document.createElement("button");
      resetButton.innerHTML = `<i class="fas fa-sync-alt" title="Reset table"></i>`;
      resetButton.onclick = () => this.table.resetTable();
      buttonContainer.appendChild(resetButton);

      const filterButton = document.createElement("button");
      filterButton.innerHTML = `<i class="fas fa-filter" title="Filter by selection"></i>`;
      filterButton.onclick = () => this.table.filter();
      buttonContainer.appendChild(filterButton);

      const switchViewButton = document.createElement("button");
      switchViewButton.innerHTML = `<i id="switch-view-icon" class="fas fa-th" title="Switch to Small Multiples View"></i>`;
      switchViewButton.onclick = () => this.table.toggleView();
      buttonContainer.appendChild(switchViewButton);
    }

    toolbar.appendChild(buttonContainer);
    return toolbar;
  }

  update() {
    const rulesContainer = this.node.querySelector(".rules-container");
    rulesContainer.innerHTML = `<strong>Rules:</strong> ${this.table.state.rules.length > 0 ? this.table.state.rules.join(" & ") : "None"}`;
  }

  getNode() {
    return this.node;
  }
}
