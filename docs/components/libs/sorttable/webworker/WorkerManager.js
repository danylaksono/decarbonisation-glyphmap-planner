/**
 * WorkerManager handles communication with the table worker
 * It abstracts the complexity of sending messages to the worker and waiting for responses
 */
export class WorkerManager {
  constructor() {
    this._worker = null;
    this._taskCounter = 0;
    this._pendingTasks = new Map();
    this._isInitialized = false;
    this._workerUrl = null;
  }

  /**
   * Initialize the worker
   * @param {string} workerUrl - URL to the worker script
   * @returns {Promise} Promise that resolves when worker is ready
   */
  initialize(workerUrl) {
    if (this._isInitialized) {
      return Promise.resolve();
    }

    this._workerUrl = workerUrl;

    return new Promise((resolve, reject) => {
      try {
        // Check if Web Workers are available
        if (typeof Worker === "undefined") {
          console.warn(
            "Web Workers not supported, falling back to main thread processing"
          );
          this._isInitialized = true;
          resolve(false);
          return;
        }

        // Create worker
        this._worker = new Worker(workerUrl);

        // Set up message handler
        this._worker.onmessage = (e) => {
          const { taskId, status, result, error } = e.data;

          if (!this._pendingTasks.has(taskId)) {
            console.warn(`Received response for unknown task: ${taskId}`);
            return;
          }

          const { resolve: taskResolve, reject: taskReject } =
            this._pendingTasks.get(taskId);
          this._pendingTasks.delete(taskId);

          if (status === "complete") {
            taskResolve(result);
          } else {
            taskReject(new Error(error || "Unknown error in worker"));
          }
        };

        // Handle worker errors
        this._worker.onerror = (error) => {
          console.error("Worker error:", error);

          // Reject all pending tasks
          this._pendingTasks.forEach(({ reject }) => {
            reject(
              new Error("Worker error: " + (error.message || "Unknown error"))
            );
          });

          this._pendingTasks.clear();
        };

        this._isInitialized = true;
        resolve(true);
      } catch (error) {
        console.error("Failed to initialize worker:", error);
        this._isInitialized = true;
        resolve(false);
      }
    });
  }

  /**
   * Execute a task in the worker
   * @param {string} task - Task name
   * @param {Object} data - Task data
   * @returns {Promise} Promise that resolves with the task result
   */
  executeTask(task, data) {
    return new Promise((resolve, reject) => {
      // If worker isn't available, execute fallback function on main thread
      if (!this._worker) {
        console.warn(
          `Worker not available for task: ${task}, executing on main thread`
        );

        // Execute task on main thread (fallback)
        try {
          if (task === "infer_column_types") {
            // Simplified fallback for column type inference
            const result = {};
            const columns = data.columns;

            columns.forEach((col) => {
              const colName = typeof col === "string" ? col : col.column;
              result[colName] = this._inferColumnType(data.dataArray, colName);
            });

            resolve(result);
          } else {
            reject(new Error(`No fallback implementation for task: ${task}`));
          }
        } catch (error) {
          reject(error);
        }

        return;
      }

      // Generate task ID
      const taskId = `task_${++this._taskCounter}`;

      // Store promise callbacks
      this._pendingTasks.set(taskId, { resolve, reject });

      // Send message to worker
      this._worker.postMessage({ task, taskId, data });
    });
  }

  /**
   * Terminate the worker
   */
  terminate() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }

    this._pendingTasks.clear();
    this._isInitialized = false;
  }

  /**
   * Check if worker is available
   * @returns {boolean} True if worker is available
   */
  isAvailable() {
    return !!this._worker;
  }

  /**
   * Fallback implementation for column type inference
   * Only used when worker is not available
   * @private
   */
  _inferColumnType(data, column) {
    // Count occurrences of types
    let numberCount = 0;
    let stringCount = 0;
    let dateCount = 0;
    let uniqueValues = new Set();

    // Only sample a subset for large datasets
    const sampleSize = Math.min(1000, data.length);
    const step = Math.ceil(data.length / sampleSize);

    for (let i = 0; i < data.length; i += step) {
      const value = data[i][column];
      if (value === null || value === undefined) continue;

      uniqueValues.add(value);

      if (value instanceof Date) {
        dateCount++;
      } else if (typeof value === "number") {
        numberCount++;
      } else if (typeof value === "string") {
        stringCount++;

        // Check if string could be a number
        if (!isNaN(Number(value)) && value.trim() !== "") {
          numberCount++;
        }

        // Check if string could be a date
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          dateCount++;
        }
      }
    }

    // Return dominant type
    if (dateCount > stringCount && dateCount > numberCount) {
      return "date";
    } else if (numberCount > stringCount) {
      return uniqueValues.size > 10 ? "continuous" : "ordinal";
    } else {
      return "ordinal";
    }
  }
}
