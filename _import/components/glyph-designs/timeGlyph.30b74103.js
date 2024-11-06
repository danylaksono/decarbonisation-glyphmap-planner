import * as d3 from "../../../_npm/d3@7.9.0/_esm.js";

export function TimeGlyph(data, collection = null, stacked = true) {
  //implements a very basic stacked/overlayed time glyph

  //data is of the form
  //data.ASHP = [values for each time step]
  //data.PV = [values for each time step]
  //values are between [0,1] and the sum of tech values for each time stepdoesn't exceed 1
  //(so they can be stacked without fear of running over 1 or height)

  this.timeCount = () => d3.max(Object.keys(data).map((d) => data[d].length));
  this.categories = () => Object.keys(data);
  this.data = (category, time) => data[category][time];
  this.maxAtTime = (time) =>
    stacked
      ? d3.sum(this.categories().map((c) => this.data(c, time)))
      : d3.max(this.categories().map((c) => this.data(c, time)));
  this.maxAllTime = () =>
    d3.max(d3.range(this.timeCount()).map((t) => this.maxAtTime(t)));

  this.draw = (ctx, x, y, w, h) => {
    let maxTime = this.timeCount();
    let xInterval = w / maxTime;

    //if glyph is part of collection then we use the collection's
    //normalisation value; otherwise we compute one for the glyph
    //locally by summing up values for all categories at each time step
    let norm = collection != null ? collection.norm : this.maxAllTime();

    let colors = d3
      .scaleOrdinal(d3.schemeTableau10)
      .domain(d3.range(Object.keys(data).length));

    let yOffset = d3.range(maxTime).map((v) => 0); //zeros
    this.categories().map((c, cindex) => {
      ctx.beginPath();
      ctx.moveTo(
        x + (this.timeCount() - 1) * xInterval,
        y + yOffset[this.timeCount() - 1]
      );
      for (let t = this.timeCount() - 2; t >= 0; t--)
        ctx.lineTo(x + t * xInterval, y + yOffset[t]);

      for (let t = 0; t < this.timeCount(); t++) {
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
  this.add = (glyph) => this.glyphs.push(glyph);

  this.recalculate = () => {};
}
