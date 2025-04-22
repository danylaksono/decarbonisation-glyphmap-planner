// Adapter for backward compatibility: convert between ids and indices
// Use this utility in places where legacy code expects indices

export class IdIndexAdapter {
  constructor(data) {
    this.idToIndex = new Map();
    this.indexToId = new Map();
    data.forEach((row, idx) => {
      if (row && row.id !== undefined) {
        this.idToIndex.set(row.id, idx);
        this.indexToId.set(idx, row.id);
      }
    });
  }

  getIndexById(id) {
    return this.idToIndex.get(id);
  }

  getIdByIndex(index) {
    return this.indexToId.get(index);
  }

  // Update the mapping if data changes
  update(data) {
    this.idToIndex.clear();
    this.indexToId.clear();
    data.forEach((row, idx) => {
      if (row && row.id !== undefined) {
        this.idToIndex.set(row.id, idx);
        this.indexToId.set(idx, row.id);
      }
    });
  }
}
