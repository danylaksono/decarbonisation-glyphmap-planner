// logger.js - Centralised debug logging with memory protection
// Purpose: Provide safe, memory-efficient debugging without stack overflows
// Used for: Debug logs throughout the application with configurable verbosity

// import { createSafeLogger } from "./utils.js";

// Helper to format individual arguments
const formatArg = (arg) => {
  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg, null, 2);
    } catch (e) {
      return String(arg);
    }
  }
  return String(arg);
};

// Prepend messages with a timestamp and log level, formatting objects and arrays properly
const formatMessage = (level, ...args) => {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.map(formatArg);
  return `[${timestamp}] ${level}: ${formattedArgs.join(" ")}`;
};

// Create a shared logger instance
// Pass true as initial debug mode (can be toggled at runtime)
const logger = createSafeLogger(true);

// Export convenience methods
export const log = (...args) => logger.log(formatMessage("INFO", ...args));
export const warn = (...args) => logger.warn(formatMessage("WARN", ...args));
export const error = (...args) => logger.error(formatMessage("ERROR", ...args));

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
    console.group(formatMessage("GROUP", label));
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
  // Track objects that have been processed to avoid circular references
  const processedObjects = new WeakSet();

  // Helper to safely stringify objects
  function safeStringify(obj, depth = 0, maxDepth = 2) {
    if (depth > maxDepth) return "[Object depth limit]";

    if (obj === null || obj === undefined) return String(obj);
    if (typeof obj !== "object") return String(obj);
    if (processedObjects.has(obj)) return "[Circular reference]";

    try {
      processedObjects.add(obj);

      // Handle arrays
      if (Array.isArray(obj)) {
        if (obj.length > 20) {
          return `[Array(${obj.length}): ${obj
            .slice(0, 3)
            .map((item) => safeStringify(item, depth + 1, maxDepth))
            .join(", ")}...]`;
        }
        return `[${obj
          .slice(0, 10)
          .map((item) => safeStringify(item, depth + 1, maxDepth))
          .join(", ")}${obj.length > 10 ? "..." : ""}]`;
      }

      // Handle objects
      const keys = Object.keys(obj);
      if (keys.length > 20) {
        return `{Object with ${keys.length} keys: ${keys
          .slice(0, 3)
          .map(
            (key) => `${key}: ${safeStringify(obj[key], depth + 1, maxDepth)}`
          )
          .join(", ")}...}`;
      }

      return `{${keys
        .slice(0, 10)
        .map((key) => `${key}: ${safeStringify(obj[key], depth + 1, maxDepth)}`)
        .join(", ")}${keys.length > 10 ? "..." : ""}}`;
    } catch (e) {
      return "[Unprocessable object]";
    } finally {
      processedObjects.delete(obj);
    }
  }

  return {
    log: (...args) => {
      if (!debugMode) return;
      const safeArgs = args.map((arg) => {
        if (typeof arg === "object" && arg !== null) {
          return safeStringify(arg);
        }
        return arg;
      });
      console.log(...safeArgs);
    },
    warn: (...args) => {
      if (!debugMode) return;
      console.warn(...args);
    },
    error: (...args) => console.error(...args), // Errors always show
    setDebug: (mode) => (debugMode = !!mode),
  };
}
