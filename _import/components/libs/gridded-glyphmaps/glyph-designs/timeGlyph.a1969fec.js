import * as d3 from "../../../../../_npm/d3@7.9.0/_esm.js";

export function TimeGlyph(data, collection = null, stacked = true) {
  if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
    throw new Error("Invalid data: Data must be a non-empty object.");
  }

  this.timeCount = () => d3.max(Object.keys(data).map((d) => data[d].length));
  this.categories = () => Object.keys(data);
  this.data = (category, time) => data[category][time];
  this.maxAtTime = (time) =>
    stacked
      ? d3.sum(this.categories().map((c) => this.data(c, time)))
      : d3.max(this.categories().map((c) => this.data(c, time)));
  this.maxAllTime = () =>
    d3.max(d3.range(this.timeCount()).map((t) => this.maxAtTime(t)));

  this.setCollection = (newCollection) => {
    collection = newCollection;
  };

  this.draw = (ctx, x, y, w, h) => {
    let maxTime = this.timeCount();
    let xInterval = w / maxTime;

    // Use the collection's normalization value if available
    let norm = collection != null ? collection.norm : this.maxAllTime();

    let colors = d3
      .scaleOrdinal(d3.schemeTableau10)
      .domain(d3.range(this.categories().length));

    // Use Float32Array for efficient large-scale processing
    let yOffset = new Float32Array(maxTime).fill(0);

    this.categories().forEach((c, cindex) => {
      ctx.beginPath();
      ctx.moveTo(x + (maxTime - 1) * xInterval, y + yOffset[maxTime - 1]);

      for (let t = maxTime - 2; t >= 0; t--) {
        ctx.lineTo(x + t * xInterval, y + yOffset[t]);
      }

      for (let t = 0; t < maxTime; t++) {
        let normalisedValue = this.data(c, t) / norm;
        ctx.lineTo(x + t * xInterval, y + yOffset[t] + normalisedValue * h);

        if (stacked) yOffset[t] += normalisedValue * h;
      }

      ctx.closePath();
      ctx.fillStyle = colors(cindex);
      ctx.fill();
    });
  };
}

export function GlyphCollection() {
  this.glyphs = [];
  this.norm = null;

  // Add a glyph to the collection and update its reference
  this.add = (glyph) => {
    this.glyphs.push(glyph);
    glyph.setCollection(this);
  };

  // Recalculate the global normalization factor
  this.recalculate = () => {
    this.norm = d3.max(
      this.glyphs.flatMap((glyph) =>
        d3.range(glyph.timeCount()).map((t) => glyph.maxAtTime(t))
      )
    );
  };
}
