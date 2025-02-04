class SessionStorageManager {
  constructor(prefix = "") {
    this.prefix = prefix; // Optional prefix for namespacing
  }

  setItem(key, value) {
    try {
      sessionStorage.setItem(this._getKey(key), JSON.stringify(value));
    } catch (error) {
      console.error("Error saving to sessionStorage:", error);
    }
  }

  getItem(key) {
    try {
      const item = sessionStorage.getItem(this._getKey(key));
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error("Error reading from sessionStorage:", error);
      return null;
    }
  }

  removeItem(key) {
    sessionStorage.removeItem(this._getKey(key));
  }

  clear() {
    sessionStorage.clear();
  }

  resetNamespace() {
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith(this.prefix)) {
        sessionStorage.removeItem(key);
      }
    });
  }

  hasItem(key) {
    return sessionStorage.getItem(this._getKey(key)) !== null;
  }

  _getKey(key) {
    return this.prefix ? `${this.prefix}_${key}` : key;
  }
}
