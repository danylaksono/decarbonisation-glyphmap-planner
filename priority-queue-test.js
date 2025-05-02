// Simple priority queue implementation for testing
class PriorityQueue {
  constructor(comparator = (a, b) => a - b) {
    this._heap = [];
    this._comparator = comparator;
  }

  size() {
    return this._heap.length;
  }

  peek() {
    return this._heap[0];
  }

  enqueue(value) {
    this._heap.push(value);
    this._siftUp();
  }

  dequeue() {
    if (this.size() === 0) {
      return undefined;
    }

    const root = this.peek();
    const last = this._heap.pop();

    if (this.size() > 0) {
      this._heap[0] = last;
      this._siftDown();
    }

    return root;
  }

  _siftUp() {
    let nodeIndex = this.size() - 1;
    while (nodeIndex > 0) {
      const parentIndex = Math.floor((nodeIndex - 1) / 2);
      if (
        this._comparator(this._heap[nodeIndex], this._heap[parentIndex]) < 0
      ) {
        [this._heap[nodeIndex], this._heap[parentIndex]] = [
          this._heap[parentIndex],
          this._heap[nodeIndex],
        ];
        nodeIndex = parentIndex;
      } else {
        break;
      }
    }
  }

  _siftDown() {
    let nodeIndex = 0;
    while (true) {
      const leftChildIndex = 2 * nodeIndex + 1;
      const rightChildIndex = 2 * nodeIndex + 2;

      let smallestChildIndex = nodeIndex;

      if (
        leftChildIndex < this.size() &&
        this._comparator(
          this._heap[leftChildIndex],
          this._heap[smallestChildIndex]
        ) < 0
      ) {
        smallestChildIndex = leftChildIndex;
      }

      if (
        rightChildIndex < this.size() &&
        this._comparator(
          this._heap[rightChildIndex],
          this._heap[smallestChildIndex]
        ) < 0
      ) {
        smallestChildIndex = rightChildIndex;
      }

      if (smallestChildIndex === nodeIndex) {
        break;
      }

      [this._heap[nodeIndex], this._heap[smallestChildIndex]] = [
        this._heap[smallestChildIndex],
        this._heap[nodeIndex],
      ];

      nodeIndex = smallestChildIndex;
    }
  }

  _heapify() {
    let lastNonLeafIndex = Math.floor(this.size() / 2) - 1;
    for (let i = lastNonLeafIndex; i >= 0; i--) {
      this._siftDownAt(i);
    }
  }

  _siftDownAt(index) {
    let nodeIndex = index;
    while (true) {
      const leftChildIndex = 2 * nodeIndex + 1;
      const rightChildIndex = 2 * nodeIndex + 2;

      let smallestChildIndex = nodeIndex;

      if (
        leftChildIndex < this.size() &&
        this._comparator(
          this._heap[leftChildIndex],
          this._heap[smallestChildIndex]
        ) < 0
      ) {
        smallestChildIndex = leftChildIndex;
      }

      if (
        rightChildIndex < this.size() &&
        this._comparator(
          this._heap[rightChildIndex],
          this._heap[smallestChildIndex]
        ) < 0
      ) {
        smallestChildIndex = rightChildIndex;
      }

      if (smallestChildIndex === nodeIndex) {
        break;
      }

      [this._heap[nodeIndex], this._heap[smallestChildIndex]] = [
        this._heap[smallestChildIndex],
        this._heap[nodeIndex],
      ];

      nodeIndex = smallestChildIndex;
    }
  }
}

module.exports = PriorityQueue;
