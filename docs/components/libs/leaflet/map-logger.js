/**
 * Simple logging utility for the LeafletMap class
 * Provides categorized logging that can be enabled/disabled
 */
export class MapLogger {
  constructor(options = {}) {
    this.options = {
      enabled: false,
      level: "info", // 'debug', 'info', 'warn', 'error'
      categories: ["general", "layers", "events", "clusters", "selection"],
      enabledCategories: ["general", "error"],
      ...options,
    };

    this.levelPriority = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
  }

  /**
   * Enable or disable logging
   * @param {boolean} enabled - Whether logging is enabled
   */
  setEnabled(enabled) {
    this.options.enabled = !!enabled;
    return this;
  }

  /**
   * Set minimum logging level
   * @param {string} level - Minimum level to log ('debug', 'info', 'warn', 'error')
   */
  setLevel(level) {
    if (this.levelPriority[level] !== undefined) {
      this.options.level = level;
    }
    return this;
  }

  /**
   * Enable logging for specific categories
   * @param {string[]} categories - Categories to enable
   */
  enableCategories(categories) {
    if (Array.isArray(categories)) {
      this.options.enabledCategories = [
        ...new Set([...this.options.enabledCategories, ...categories]),
      ];
    }
    return this;
  }

  /**
   * Disable logging for specific categories
   * @param {string[]} categories - Categories to disable
   */
  disableCategories(categories) {
    if (Array.isArray(categories)) {
      this.options.enabledCategories = this.options.enabledCategories.filter(
        (cat) => !categories.includes(cat)
      );
    }
    return this;
  }

  /**
   * Log a message if logging is enabled
   * @param {string} level - Log level
   * @param {string} category - Log category
   * @param {string} message - Message to log
   * @param {any} data - Additional data to log
   */
  _log(level, category, message, data) {
    if (!this.options.enabled) return;

    if (this.levelPriority[level] < this.levelPriority[this.options.level])
      return;

    if (
      !this.options.enabledCategories.includes(category) &&
      !this.options.enabledCategories.includes("all")
    )
      return;

    const timestamp = new Date().toISOString();
    const prefix = `[Leaflet-Map][${timestamp}][${level.toUpperCase()}][${category}]`;

    if (data !== undefined) {
      console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
        `${prefix} ${message}`,
        data
      );
    } else {
      console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
        `${prefix} ${message}`
      );
    }
  }

  /**
   * Log a debug message
   * @param {string} category - Log category
   * @param {string} message - Message to log
   * @param {any} data - Additional data to log
   */
  debug(category, message, data) {
    this._log("debug", category, message, data);
    return this;
  }

  /**
   * Log an info message
   * @param {string} category - Log category
   * @param {string} message - Message to log
   * @param {any} data - Additional data to log
   */
  info(category, message, data) {
    this._log("info", category, message, data);
    return this;
  }

  /**
   * Log a warning message
   * @param {string} category - Log category
   * @param {string} message - Message to log
   * @param {any} data - Additional data to log
   */
  warn(category, message, data) {
    this._log("warn", category, message, data);
    return this;
  }

  /**
   * Log an error message
   * @param {string} category - Log category
   * @param {string} message - Message to log
   * @param {any} data - Additional data to log
   */
  error(category, message, data) {
    this._log("error", category, message, data);
    return this;
  }

  /**
   * Create a timer for performance logging
   * @param {string} category - Log category
   * @param {string} operation - Operation name
   * @returns {Function} - Call to end the timer and log the duration
   */
  time(category, operation) {
    if (!this.options.enabled) return () => {};

    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.debug(
        category,
        `${operation} completed in ${duration.toFixed(2)}ms`
      );
    };
  }
}

// Export a singleton instance
export const mapLogger = new MapLogger();

// Export convenience function to get logger
export function getMapLogger(options) {
  if (options) {
    mapLogger.options = {
      ...mapLogger.options,
      ...options,
    };
  }
  return mapLogger;
}
