// src/components/TableView.js - Table Component
// Purpose: Renders and manages the sortable table.
// Inputs: buildingsData, state.
// Functions:
// renderTable(data, state): Creates sorterTable instance and handles events (tableChanged).
// Dependencies: sorterTableClass.js.

// src/components/TableView.js

// Import required dependencies
import { sorterTable } from "../libs/sorttable/sorterTableClass.js";
import { html } from "npm:htl";

// Define excluded columns and custom order for table display
const excludedColumns = [
  "properties",
  "x",
  "y",
  "score",
  "ashp_labour",
  "ashp_material",
  "pv_labour",
  "pv_material",
  "gshp_labour",
  "gshp_material",
  "ashp_suitability",
  "pv_suitability",
  "gshp_suitability",
  "substation_headroom_pct",
  "substation_peakload",
  "deprivation_decile",
];

const customOrder = ["id", "lsoa", "msoa", "EPC_rating"];

// TableView component
export function TableView(data, state) {
  // Extract state setters
  const { setSelectedTableRow, setTableFiltered } = state;

  // Define table columns dynamically from data
  const tableColumns = [
    { column: "id", unique: true },
    ...Object.keys(data[0] || {})
      .filter((key) => !excludedColumns.includes(key) && key !== "id")
      .sort((a, b) => {
        const indexA = customOrder.indexOf(a);
        const indexB = customOrder.indexOf(b);
        if (indexA === -1 && indexB === -1) return a.localeCompare(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      })
      .map((key) => ({ column: key })),
  ];

  // Handle table events (filtering, sorting, selection)
  function tableChanged(event) {
    console.log("Table changed:", event);

    if (event.type === "filter") {
      console.log("Filtered indices:", event.indeces);
      setTableFiltered(event.indeces); // Update filtered indices in state
    }

    if (event.type === "sort") {
      console.log("Sorted indices:", event.indeces);
      console.log("Sort criteria:", event.sort);
    }

    if (event.type === "selection") {
      setSelectedTableRow(event.selection); // Update selected rows in state
      console.log("Selected rows:", event.selection);
    }
  }

  // Create the sortable table instance
  const table = new sorterTable(data, tableColumns, tableChanged, {
    height: "300px", // Fixed height for the table
  });

  // Compute filtered data based on state
  const tableFilteredData = state.getTableFiltered
    ? state
        .getTableFiltered()
        .map((index) => table.data?.[index])
        .filter(Boolean)
    : null;

  const card = document.createElement("div");
  card.className = "card";

  const header = document.createElement("header");
  header.className = "quickview-header";

  const title = document.createElement("p");
  title.className = "title";
  title.textContent = "Table View";
  header.appendChild(title);

  const cardContent = document.createElement("div");
  cardContent.className = "card-content";
  cardContent.style.overflowY = "auto";
  cardContent.style.height = "100%";

  const content = document.createElement("div");
  content.className = "content";
  content.appendChild(table.getNode()); // Assuming getNode returns a DOM element

  if (tableFilteredData) {
    const filteredText = document.createElement("p");
    filteredText.textContent = `No. of Filtered Data: ${tableFilteredData.length}`;
    content.appendChild(filteredText);
  }

  cardContent.appendChild(content);
  card.appendChild(header);
  card.appendChild(cardContent);

  return card;
}

// Export a utility to access filtered data (optional, for external use)
export function getFilteredData(tableFiltered, data) {
  return tableFiltered.map((index) => data[index]).filter(Boolean);
}

// Dependencies:  sorterTableClass.js.
// State: Expects state to include setSelectedTableRow, setTableFiltered, and optionally getTableFiltered.
// Rendering: Uses Observable’s html for templating, embedding the table node and displaying filtered data count.
// Events: Updates state on filter and selection events, logs sorting for debugging.
