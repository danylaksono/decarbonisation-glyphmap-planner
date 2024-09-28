---
title: Testing data
toc: false
sidebar: false
footer: false
---

<!-------- Stylesheets -------->

<!-- <link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/bulma@1.0.0/css/bulma.min.css"
> -->

# Test UI

<label for="decarbonisation-slider">Decarbonisation Progress:</label>

```js
const n = html`<input
  style="width: 800px;"
  type="range"
  step="0.1"
  min="0"
  max="1"
/>`;

const nn = Generators.input(n);

display(n);
```

```js
display(nn);
```

```js
// Copy country data
var countries = data.slice(0);
// Make an alphabetical version
countries.sort(function (a, b) {
  var textA = a.Country.toUpperCase();
  var textB = b.Country.toUpperCase();
  return textA < textB ? -1 : textA > textB ? 1 : 0;
});
const div = html`
  <select>
    ${countries.map(
      (country, index) => `
      <option value="${country.Rank}">${country.Country}</option>`
    )}</select
  ><br />
  <input
    type="range"
    min="1"
    max=${data.length}
    style="width:100%; max-width:640px;"
  />
`;
const range = div.querySelector("[type=range]");
const select = div.querySelector("select");
div.value = range.value = select.value = defaultCountryIndex;
range.addEventListener(
  "input",
  () => (select.value = div.value = range.valueAsNumber)
);
select.addEventListener(
  "change",
  () => (range.value = div.value = parseInt(select.value))
);

select.addEventListener(
  "input",
  () => (range.value = div.value = parseInt(select.value))
);
```
