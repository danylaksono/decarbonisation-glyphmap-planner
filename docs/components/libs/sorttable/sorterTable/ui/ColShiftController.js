export class ColShiftController {
  constructor(column, callback) {
    this.column = column;
    this.callback = callback;
    this.node = this.createNode();
  }

  createNode() {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.alignItems = "center";

    const leftButton = document.createElement("button");
    leftButton.innerHTML = "&larr;"; // Left arrow
    leftButton.style.border = "none";
    leftButton.style.background = "transparent";
    leftButton.style.cursor = "pointer";
    leftButton.onclick = () => this.callback(this.column, "left");
    container.appendChild(leftButton);

    const rightButton = document.createElement("button");
    rightButton.innerHTML = "&rarr;"; // Right arrow
    rightButton.style.border = "none";
    rightButton.style.background = "transparent";
    rightButton.style.cursor = "pointer";
    rightButton.onclick = () => this.callback(this.column, "right");
    container.appendChild(rightButton);

    return container;
  }

  getNode() {
    return this.node;
  }
}
