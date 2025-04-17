// src/utils/stateUtils.js

import { Mutable } from "npm:@observablehq/stdlib";

// Custom useState hook using Mutable
export function useState(initialValue) {
  console.log("setting up state");
  const state = Mutable(initialValue);
  return [() => state.value, (value) => (state.value = value)];
}

// Initialize application state
export function initState() {
  const [getSelectedAllocation, setSelectedAllocation] = useState([]);
  const [getSelectedTableRow, setSelectedTableRow] = useState([]);
  const [getInterventions, setInterventions] = useState([]);
  const [getResults, setResults] = useState([]);
  const [getSelectedInterventionIndex, setSelectedInterventionIndex] =
    useState(null);
  const [getTimelineModifications, setTimelineModifications] = useState([]);
  const [getTableFiltered, setTableFiltered] = useState([]);
  const [getMapAggregate, setMapAggregate] = useState("LSOA Level");
  const [getToggleGrids, setToggleGrids] = useState(false);
  const [getMorphFactor, setMorphFactor] = useState(0);

  return {
    getSelectedAllocation,
    setSelectedAllocation,
    getSelectedTableRow,
    setSelectedTableRow,
    getInterventions,
    setInterventions,
    getResults,
    setResults,
    getSelectedInterventionIndex,
    setSelectedInterventionIndex,
    getTimelineModifications,
    setTimelineModifications,
    getTableFiltered,
    setTableFiltered,
    getMapAggregate,
    setMapAggregate,
    getToggleGrids,
    setToggleGrids,
    getMorphFactor,
    setMorphFactor,
  };
}

// Session storage utilities (simple in-memory fallback for Observable)
export function saveToSession(key, value) {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(key, JSON.stringify(value));
  } else {
    console.warn("Session storage not available; using in-memory fallback");
    window._session = window._session || {};
    window._session[key] = value;
  }
}

export function getFromSession(key) {
  if (typeof sessionStorage !== "undefined") {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } else {
    console.warn("Session storage not available; using in-memory fallback");
    return window._session?.[key] || null;
  }
}

// Dependencies: Uses Mutable for reactive state management.
// Functions: Provides useState hook, initState for initializing all state variables, and session storage helpers (saveToSession, getFromSession).
// Usage: Called by index.md to set up state, used by all components.
