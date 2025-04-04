export class PriorityQueue {
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
      if (this._comparator(this._heap[nodeIndex], this._heap[parentIndex]) < 0) {
        [this._heap[nodeIndex], this._heap[parentIndex]] = [this._heap[parentIndex], this._heap[nodeIndex]];
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
      let smallestIndex = nodeIndex;

      if (leftChildIndex < this.size() && this._comparator(this._heap[leftChildIndex], this._heap[smallestIndex]) < 0) {
        smallestIndex = leftChildIndex;
      }

      if (rightChildIndex < this.size() && this._comparator(this._heap[rightChildIndex], this._heap[smallestIndex]) < 0) {
        smallestIndex = rightChildIndex;
      }

      if (smallestIndex !== nodeIndex) {
        [this._heap[nodeIndex], this._heap[smallestIndex]] = [this._heap[smallestIndex], this._heap[nodeIndex]];
        nodeIndex = smallestIndex;
      } else {
        break;
      }
    }
  }

  _heapify() {
    const start = Math.floor((this.size() - 2) / 2); // Last non-leaf node
    for (let i = start; i >= 0; i--) {
      this._siftDown(i); // Sift down from each non-leaf node
    }
}
}