// Simple timing utility to track execution time and frequency of code blocks

const timings = {};
let enabled = true; // Control timing globally

/**
 * Starts a timer for a specific code block.
 * @param {string} id - A unique identifier for the code block.
 */
export function startTimer(id) {
  if (!enabled) return;
  if (!timings[id]) {
    timings[id] = { count: 0, totalDuration: 0, lastStart: null };
  }
  timings[id].lastStart = performance.now();
  console.log(`[Timer] Starting: ${id}`);
}

/**
 * Ends the timer for a specific code block and records the duration.
 * @param {string} id - The unique identifier for the code block.
 */
export function endTimer(id) {
  if (!enabled || !timings[id] || timings[id].lastStart === null) return;

  const duration = performance.now() - timings[id].lastStart;
  timings[id].count++;
  timings[id].totalDuration += duration;
  timings[id].lastStart = null; // Mark as stopped
  console.log(`[Timer] Finished: ${id} (${duration.toFixed(2)}ms)`);
}

/**
 * Retrieves the recorded timing data.
 * @returns {object} An object containing timing data for all tracked blocks.
 */
export function getTimings() {
  // Calculate average duration
  const report = {};
  for (const id in timings) {
    report[id] = {
      count: timings[id].count,
      totalDurationMs: parseFloat(timings[id].totalDuration.toFixed(2)),
      avgDurationMs: parseFloat(
        (timings[id].totalDuration / timings[id].count).toFixed(2)
      ),
    };
  }
  return report;
}

/**
 * Resets all recorded timing data.
 */
export function resetTimings() {
  for (const id in timings) {
    delete timings[id];
  }
  console.log("[Timer] Timings reset.");
}

/**
 * Enables or disables the timer globally.
 * @param {boolean} state - True to enable, false to disable.
 */
export function enableTiming(state) {
  enabled = state;
  console.log(`[Timer] Timing ${enabled ? "enabled" : "disabled"}.`);
}

// Expose functions for easy console access if needed
window.perfTimings = {
  start: startTimer,
  end: endTimer,
  get: getTimings,
  reset: resetTimings,
  enable: enableTiming,
  log: () => console.table(getTimings()),
};
