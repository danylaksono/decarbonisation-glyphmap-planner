export class SortController {
  constructor(column, callback) {
    this.column = column;
    this.callback = callback;
    this.directions = ["none", "up", "down"];
    this.currentDirection = 0;
    this.node = this.createNode();
  }

  createNode() {
    let e = document.createElement("div");
    e.style.cursor = "pointer";
    e.style.border = "1px solid black";
    e.style.width = "20px";
    e.style.height = "20px";
    e.style.display = "flex";
    e.style.justifyContent = "center";
    e.style.alignItems = "center";
    e.innerHTML = this.getSymbol();
    e.addEventListener("click", () => {
      this.toggleDirection();
      this.callback(this);
    });
    return e;
  }

  getSymbol() {
    if (this.directions[this.currentDirection] == "none") return "";
    if (this.directions[this.currentDirection] == "up") return "↑";
    if (this.directions[this.currentDirection] == "down") return "↓";
  }

  toggleDirection() {
    this.currentDirection = (this.currentDirection + 1) % this.directions.length;
    this.node.innerHTML = this.getSymbol();
  }

  setDirection(dir) {
    this.currentDirection = this.directions.indexOf(dir);
    this.node.innerHTML = this.getSymbol();
  }

  getColumn() {
    return this.column;
  }

  getDirection() {
    return this.directions[this.currentDirection];
  }
}
