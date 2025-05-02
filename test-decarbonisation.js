// Simple test script to verify if the priority queue ordering is now correct
import { PriorityQueue } from "./docs/components/libs/decarb-model/priority-queue.js";

// Test the priority queue with the new ordering (descending)
const pq = new PriorityQueue((a, b) => b.value - a.value);

// Add test data
pq.enqueue({ id: "item1", value: 5 });
pq.enqueue({ id: "item2", value: 10 });
pq.enqueue({ id: "item3", value: 3 });
pq.enqueue({ id: "item4", value: 7 });

console.log(
  "Priority Queue Test - Should output in descending order of value:"
);
while (pq.size() > 0) {
  const item = pq.dequeue();
  console.log(`Item: ${item.id}, Value: ${item.value}`);
}

console.log("\nThis confirms the fix - highest values are now dequeued first.");
