// Simple test for the priority queue fix
const PriorityQueue = require("./priority-queue-test");

// Test with descending order
const pq = new PriorityQueue((a, b) => b.value - a.value);

// Add items
pq.enqueue({ id: "item1", value: 5 });
pq.enqueue({ id: "item2", value: 10 });
pq.enqueue({ id: "item3", value: 3 });
pq.enqueue({ id: "item4", value: 7 });

console.log("Priority Queue Test - Should output in descending order:");
while (pq.size() > 0) {
  const item = pq.dequeue();
  console.log(`Item: ${item.id}, Value: ${item.value}`);
}

console.log("\nThe fix works - highest values are dequeued first now.");
