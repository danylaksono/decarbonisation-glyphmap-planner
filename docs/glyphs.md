---
title: Testing data
toc: false
sidebar: false
footer: false
---

```js
import {RadialGlyph} from "./components/radialglyph.js";
```

<!-------- Stylesheets -------->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/bulma@1.0.0/css/bulma.min.css"
>

<style>
body, html {
  height: 100%;
  margin: 0 !important;
  overflow: hidden;
  padding: 0;
}

#observablehq-main, #observablehq-header, #observablehq-footer {
    margin: 0 !important;
    /* width: 100% !important; */
    max-width: 100% !important;
}

/* Make the entire section fill the viewport */
.section {
  height: 90vh !important; /* Full height of the viewport */
  padding: 0;
}

.container {
  margin: 0 !important;
  max-width: 100% !important;
}

/* Make the columns stretch to the full height of the viewport */
.columns {
  height: 100%;
  margin: 0;
}

/* Ensure the column boxes fit inside the layout */
.column {
  display: flex;
  flex-direction: column;
}

/* Ensure the boxes inside left column take full height */
.column.is-one-third .box {
  flex: 1; /* Make the boxes in the left column flexible */
  margin-bottom: 0.5rem; /* Add some spacing between boxes */
}

/* For the right column, ensure the box takes up full height */
.column.is-two-thirds .box {
  height: calc(90vh - 2rem); /* Subtract section padding or any margin if needed */
}
</style>

<section class="section">
    <div class="container">
      <div class="columns">
        <!-- Left Column (5 boxes) -->
        <div class="column is-one-third" style="margin: 0 !important; padding: 0 !important;">
          <div class="columns is-multiline">
            <div class="column is-half">
              <div class="box">Box 1</div>
            </div>
            <div class="column is-half">
              <div class="box">Box 2</div>
            </div>
            <div class="column is-full">
              <div class="box">Box 3</div>
            </div>
            <div class="column is-full">
              <div class="box">Box 4</div>
            </div>
            <div class="column is-full">
              <div class="box">Box 5</div>
            </div>
          </div>
        </div>
        <!-- Right Column (Main Content) -->
        <div class="column is-two-thirds">
          <div id="main-area" class="box" >
            ${resize((width, height) => createCanvas(width, height))}
          </div>
        </div>
      </div>
    </div>
  </section>

```js
function createCanvas(width, height) {
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = width;
    
    let rg = new RadialGlyph([0.4, 0.1, 0.9, 0.3]);
    rg.draw(ctx, width/2,height/2, Math.min(width/2, height/2));
    
    return canvas;
}
```