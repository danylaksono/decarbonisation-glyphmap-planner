// Control debug output - set to true during development, false in production
const DEBUG = false;

// Custom logging functions that respect the DEBUG flag
export const logDebug = (...args) => DEBUG && console.log(...args);
export const warnDebug = (...args) => DEBUG && console.warn(...args);
export const errorDebug = (...args) => console.error(...args); // Errors always show

// Utility to deep clone objects/arrays
export function deepClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    warnDebug("deepClone failed, returning original object:", e);
    return obj;
  }
}
