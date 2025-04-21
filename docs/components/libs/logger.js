// logger.js - Centralised debug logging with memory protection
// Purpose: Provide safe, memory-efficient debugging without stack overflows
// Used for: Debug logs throughout the application with configurable verbosity

// import { createSafeLogger } from "./utils.js";

// Format timestamp and level prefix
const formatPrefix = (level) => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] ${level}:`;
};

// Create a shared logger instance
// Pass true as initial debug mode (can be toggled at runtime)
const logger = createSafeLogger(true);

// Export convenience methods
export const log = (...args) => logger.log(formatPrefix("INFO"), ...args);
export const warn = (...args) => logger.warn(formatPrefix("WARN"), ...args);
export const error = (...args) => logger.error(formatPrefix("ERROR"), ...args);

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
    console.group(formatPrefix("GROUP"), label);
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

// Safe debug logging utility with circular reference protection
export function createSafeLogger(debugMode = false) {
  // Track objects being logged to avoid circular reference issues
  const inProgress = new WeakSet();

  // Safety check to prevent circular reference issues
  function checkCircular(args) {
    // Create safe copies of args if needed, only for detection
    return args.map((arg) => {
      // Only perform checks on objects
      if (arg === null || typeof arg !== "object") {
        return arg;
      }

      if (inProgress.has(arg)) {
        // Just log a warning but still allow the object to be logged
        console.warn("[LOGGER] Circular reference detected in logged object");
      }

      return arg;
    });
  }

  return {
    log: (...args) => {
      if (!debugMode) return;
      // Pass objects directly to console.log for interactive inspection
      console.log(...checkCircular(args));
    },
    warn: (...args) => {
      if (!debugMode) return;
      console.warn(...checkCircular(args));
    },
    error: (...args) => console.error(...checkCircular(args)), // Errors always show
    setDebug: (mode) => (debugMode = !!mode),
  };
}
