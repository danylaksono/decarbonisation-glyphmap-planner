---
toc: false
sidebar: false
footer: "<strong> giCentre@2024 </strong>"
---

```js
import ParticleNetwork from "./components/particles.js";
```

<!--------------Stylesheets-------------->

<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/bulma@1.0.0/css/bulma.min.css"
>

<style>

html,
body {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

#particle-canvas {
  position: fixed !important;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -1; /* Set a lower z-index value */
}

.hero {
  position: relative;
  pointer-events: none;
  /* z-index: 1; Set a higher z-index value */
}


.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--sans-serif);
  margin: 4rem 0 8rem;
  text-wrap: balance;
  text-align: center;
}

.hero h1 {
  margin: 2rem 0;
  max-width: none;
  font-size: 14vw;
  font-weight: 900;
  line-height: 1;
  background: linear-gradient(90deg,#9ddb00 0%,#e09900 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
    -webkit-animation: AnimateBG 20s ease infinite;
          animation: AnimateBG 20s ease infinite;
}

.hero h2 {
  margin: 0;
  max-width: 34em;
  font-size: 20px;
  font-style: initial;
  font-weight: 500;
  line-height: 1.5;
  color: var(--theme-foreground-muted);
}

@media (min-width: 640px) {
  .hero h1 {
    font-size: 90px;
  }
}

/* Animated background */
.bg {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-size: 300% 300%;
  background-image: linear-gradient(-45deg, yellow 0%, yellow 25%, yellow 51%, #ff357f 100%);
  -webkit-animation: AnimateBG 20s ease infinite;
          animation: AnimateBG 20s ease infinite;
}

@-webkit-keyframes AnimateBG {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

@keyframes AnimateBG {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.subhead {
  /* font-weight: 800; */
  font-size: 80px;
  /* color: #D2FF57!important; */
  /* line-height: 5.8em; */
  text-shadow: 0.08em 0.08em 0.13em rgba(0,0,0,0.4);
}
</style>

<div id="particle-canvas"></div>
<div class="hero" >
  <h1>Decarbonisation Planner</h1>
  <h2 class="subhead">Glyphmap experiments</h2>
</div>
<div class="has-text-centered">
  <a target="_blank" style="text-decoration:none; color: black;"
      href="/dashboard" class="button is-large is-primary">Dashboard</a>
</div>

```js
// particle Initialisation
var canvasDiv = document.getElementById("particle-canvas");
var options = {
  particleColor: "#888",
  background: "./assets/dots-2.png",
  // background: "#25282e",
  interactive: true,
  speed: "medium",
  density: "high",
};
var particleCanvas = new ParticleNetwork(canvasDiv, options);
```
