// Simple test script to manually verify the order
console.log("Testing priority queue ordering for carbon efficiency");

// Mock the comparator functions for both the old and new version
function oldComparator(a, b) {
  return a.carbonEfficiency - b.carbonEfficiency; // Ascending (LOWEST first)
}

function newComparator(a, b) {
  return b.carbonEfficiency - a.carbonEfficiency; // Descending (HIGHEST first)
}

// Test data - buildings with different carbon efficiencies
const buildings = [
  { id: "building1", carbonEfficiency: 2.5 }, // 500 saved / 200 cost
  { id: "building2", carbonEfficiency: 2.67 }, // 800 saved / 300 cost
  { id: "building3", carbonEfficiency: 2.5 }, // 1000 saved / 400 cost
  { id: "building4", carbonEfficiency: 3.0 }, // 1500 saved / 500 cost
  { id: "building5", carbonEfficiency: 2.0 }, // 1200 saved / 600 cost
];

console.log("\n--- Original Order ---");
buildings.forEach((b) =>
  console.log(`Building ${b.id}: Carbon Efficiency = ${b.carbonEfficiency}`)
);

console.log("\n--- Old Priority (ASCENDING - WRONG) ---");
const oldSorted = [...buildings].sort(oldComparator);
oldSorted.forEach((b) =>
  console.log(`Building ${b.id}: Carbon Efficiency = ${b.carbonEfficiency}`)
);

console.log("\n--- New Priority (DESCENDING - CORRECT) ---");
const newSorted = [...buildings].sort(newComparator);
newSorted.forEach((b) =>
  console.log(`Building ${b.id}: Carbon Efficiency = ${b.carbonEfficiency}`)
);

console.log(
  "\nWith the fix, buildings with HIGHER carbon efficiency (better value) are processed first!"
);
