import * as d3 from "npm:d3";
import { deepClone, logDebug } from "./utils.js";

export class TableStateManager {
  constructor(data, columns, changed) {
    this.data = data;
    this.columns = columns;
    this.changed = changed;

    this.initialData = deepClone(data);
    this.initialColumns = deepClone(columns);
    this.initialDataInd = d3.range(data.length);

    this.dataInd = [...this.initialDataInd];
    this.compoundSorting = {};
    this.selected = [];
    this.selectedColumn = null;
    this.history = [];
    this.rules = [];
    this.selectedRows = new Set();
    this.isAggregated = false;
  }

  reset() {
    this.dataInd = [...this.initialDataInd];
    this.compoundSorting = {};
    this.selected = [];
    this.selectedColumn = null;
    this.history = [];
    this.rules = [];
    this.selectedRows.clear();
    this.isAggregated = false;
  }

  undo() {
    if (this.history.length > 0) {
      let u = this.history.pop();
      if (u.type === "filter" || u.type === "filterById" || u.type === "sort") {
        this.dataInd = [...u.data];

        if (
          (u.type === "filter" || u.type === "filterById") &&
          this.rules.length > 0
        ) {
          this.rules.pop();
        }
      } else if (u.type === "shiftcol") {
        // This part needs to be handled by the main class
        return u;
      } else if (u.type === "aggregate") {
        this.data = u.data;
        this.dataInd = u.dataInd;
        this.isAggregated = false;
      }
    }
    return null;
  }
}
