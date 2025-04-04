// logger.js - Centralised debug logging with memory protection
// Purpose: Provide safe, memory-efficient debugging without stack overflows
// Used for: Debug logs throughout the application with configurable verbosity

import { createSafeLogger } from "./utils.js";

// Create a shared logger instance
// Pass true as initial debug mode (can be toggled at runtime)
const logger = createSafeLogger(true);

// Export convenience methods
export const log = (...args) => logger.log(...args);
export const warn = (...args) => logger.warn(...args);
export const error = (...args) => logger.error(...args);

// Export the logger configuration function
export const setDebugMode = (enabled) => logger.setDebug(enabled);

// Export performance measurement utilities
export const measurePerformance = (label, fn, ...args) => {
  const start = performance.now();
  const result = fn(...args);
  const end = performance.now();

  log(`${label} took ${(end - start).toFixed(2)}ms`);
  return result;
};

// Debug groups for organized console output
export const startGroup = (label) => {
  if (console.group) {
    console.group(label);
  } else {
    log(`--- START ${label} ---`);
  }
};

export const endGroup = () => {
  if (console.groupEnd) {
    console.groupEnd();
  } else {
    log("--- END ---");
  }
};

// Export the full logger object for more advanced usage
export default logger;
