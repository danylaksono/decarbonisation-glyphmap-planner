// This is a patch file with only the fixed toggleView method
// to be applied to the sorterTableClass.js file

// Copy this method and replace the existing toggleView method in sorterTableClass.js
function fixedToggleView() {
  // Toggle the view state
  this.currentView = this.currentView === "table" ? "smallMultiples" : "table";

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
        switchViewIcon.setAttribute("title", "Switch to Small Multiples View");
      } else {
        switchViewIcon.classList.add("fa-table");
        switchViewIcon.setAttribute("title", "Switch to Table View");
      }
    }
  }

  // Find the content container (the second child of the container)
  if (this._containerNode) {
    // Get the content div (second child of the container)
    const contentDiv = this._containerNode.querySelector("div:nth-child(2)");

    if (contentDiv) {
      // Clear current content
      contentDiv.innerHTML = "";

      // Add appropriate content based on the current view
      if (this.currentView === "table") {
        // Table view
        this._scrollContainer = contentDiv;

        // Re-create the table
        if (!this.tBody) {
          this.tBody = document.createElement("tbody");
          this.tBody.className = "clusterize-content";
        }

        this.table.innerHTML = "";
        if (this.tHead) this.table.appendChild(this.tHead);
        this.table.appendChild(this.tBody);
        contentDiv.appendChild(this.table);

        // Reset the clusterize instance to force recreation
        this._clusterize = null;

        // Set proper container dimensions
        contentDiv.style.height = this.options.containerHeight || "400px";
        contentDiv.style.width = this.options.containerWidth || "100%";

        // Create table rows and initialize Clusterize
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

        // Show initial rows
        if (rows.length > 0) {
          const initialVisibleCount = Math.min(50, rows.length);
          this.tBody.innerHTML = rows.slice(0, initialVisibleCount).join("");
          this._attachRowEvents();
        }

        // Initialize Clusterize after a short delay
        setTimeout(() => {
          const rowsInBlock = Math.min(
            200,
            Math.max(50, Math.floor(this.data.length / 20))
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
