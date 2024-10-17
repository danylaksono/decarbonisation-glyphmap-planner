---
title: Testing data
toc: false
sidebar: false
footer: false
---

```js
import {TimeGlyph, GlyphCollection} from "./components/timeGlyph.js";
import {Model} from "./components/model.js";

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
    
    
    //MODEL BUILDING
    
    //repack actual data in a more compact format
    let buildings = modelData.features.map( b => ({
        lsoa : b.properties["LSOA code"],
        msoa : b.properties["MSOA code"],
        building_area : b.properties["Air Source Heat Pump Potential_Building Size (m^2)"],
        garden_area : b.properties["Air Source Heat Pump Potential_Garden Area (m^2)"],
        ashp_suitability : b.properties["Air Source Heat Pump Potential_Overall Suitability Rating"],
        ashp_size : b.properties["Air Source Heat Pump Potential_Recommended Heat Pump Size [kW]"],
        ashp_labour : b.properties["Low Carbon Technology Costs_Air Source Heat Pump - Labour"],
        ashp_material : b.properties["Low Carbon Technology Costs_Air Source Heat Pump - Material"],
        ashp_total : b.properties["Low Carbon Technology Costs_Air Source Heat Pump - Total"],
        gshp_suitability : b.properties["Domestic Ground Source Heat Pump Potential_Overall Suitability Rating"], 
        gshp_size : b.properties["Domestic Ground Source Heat Pump Potential_Recommended Heat Pump Size [kW]"],
        gshp_labour : b.properties["Low Carbon Technology Costs_Ground Source Heat Pump - Labour"],
        gshp_material : b.properties["Low Carbon Technology Costs_Ground Source Heat Pump - Materials"],
        gshp_total : b.properties["Low Carbon Technology Costs_Ground Source Heat Pump - Total"],        
        heat_demand : b.properties["Domestic Heat Demand_Annual Heat Demand (kWh)"],
        insulation_rating :  b.properties["Domestic Insulation Potential_EPC Rating"],
        insulation_cwall: b.properties["Domestic Insulation Potential_Insulation - Cavity Wall"],
        insulation_cwall_labour : b.properties["Low Carbon Technology Costs_Insulation - Cavity Wall - Labour"],
        insulation_cwall_materials : b.properties["Low Carbon Technology Costs_Insulation - Cavity Wall  - Materials"],
        insulation_cwall_total : b.properties["Low Carbon Technology Costs_Insulation - Cavity Wall - Total"],
        insulation_ewall : b.properties["Domestic Insulation Potential_Insulation - External Wall"],
        insulation_ewall_labour : b.properties["Low Carbon Technology Costs_Insulation - External Wall - Labour"],
        insulation_ewall_materials : b.properties["Low Carbon Technology Costs_Insulation - External Wall - Material"],
        insulation_ewall_total : b.properties["Low Carbon Technology Costs_Insulation - External Wall - Total"],
        insulation_roof : b.properties["Domestic Insulation Potential_Insulation - Roof"],
        insulation_roof_labour : b.properties["Low Carbon Technology Costs_Insulation - Loft - Labour"],
        insulation_roof_materials : b.properties["Low Carbon Technology Costs_Insulation - Loft - Material"],
        insulation_roof_total : b.properties["Low Carbon Technology Costs_Insulation - Loft - Total"],
        insulation_floor : b.properties["Domestic Insulation Potential_Insulation - Under Floor"],
        insulation_floor_labour : b.properties["Low Carbon Technology Costs_Insulation - Under Floor - Labour"],
        insulation_floor_materials : b.properties["Low Carbon Technology Costs_Insulation - Under Floor - Material"],
        insulation_floor_total : b.properties["Low Carbon Technology Costs_Insulation - Under Floor- Total"],
        pv_suitability : b.properties["Domestic PV Potential_Overall Suitability"],
        pv_size : b.properties["Domestic PV Potential_Recommended Array Size [kW]"],
        pv_generation : b.properties["Domestic PV Potential_Annual Generation [kWh]"],
        pv_labour : b.properties["Low Carbon Technology Costs_Rooftop PV - Labour"],
        pv_material : b.properties["Low Carbon Technology Costs_Rooftop PV - Materials"],
        pv_total : b.properties["Low Carbon Technology Costs_Rooftop PV - Total"],
    }));
    
    //configure model specifications (for now only two tech, ASHP and PV, hardcoded)
    let modelSpec = {
        nr_years : 10,
        yearly_funding : 300000000,
        tech_allocation : {ASHP : 0.5, PV : 0.5}};
    
    //create (and run) model
    let model = new Model(buildings,modelSpec);
   
    
    
    //CREATE CANVAS AND GLYPHS
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = width;
    
    
    //to support global normalisations and, in the future, mirrored interactions
    let glyphCollection = new GlyphCollection();
    
    
    //we start prepping the data that goes into the glyphs
    
    //we group interventions first by lsoa, then technology, then year
    let lsoaTechYear = model.getInterventions().groupBy("lsoa").groupBy("type").groupBy("year").all();
    console.log("Interventions (grouped lsoa->tech->year)", lsoaTechYear);
    
    //get building data at each simulation year, split by lsoa
    let buildingsYearLsoas = d3.range(modelSpec.nr_years).map( y =>
                    model.getBuildings(y).groupBy("lsoa").all());
    console.log("Buildings by year (grouped lsoa)", buildingsYearLsoas);
    
    
    //prepare glyphs, for now two options: 
    //1. show all technologies (ASHP and PV for now) stacked on top of each other,
    //either cummulatively or not (allTech = true)
    //2. show one tech (ASHP for now) with yearly savings and cummulative potential for saving (allTech = false)
    
    let allTech = false; //allTech will show all technologies as stacked time chart
                        //!allTech will show ASHP saved and potential    
    let cummulative = false; //cummulative savings?
    //only used when !allTech
    let sqrt = true; // potential for saving is much larger than actual saving and 
                        //showing it in sqrt scale might be handy
    let stacked = false; //stacked=false (overlaid) is better for non-cummulative, !allTech, overlaid is better
    
    
    //so, best config:
    if (allTech){
        cummulative = false; stacked = true;
    }
    else{
        cummulative = false; sqrt = true; stacked = false;
    }
    
    Object.keys(lsoaTechYear).map( (lsoaCode,i) => {
        
        let lsoa = lsoaTechYear[lsoaCode];

        let glyphData = new Object();
        
        
        //stacked glyph with the saved MW for all categories
        if (allTech)
            Object.keys(modelSpec.tech_allocation).map( tech =>
                glyphData[tech] = d3.range(modelSpec.nr_years).map( year => 
                    lsoa[tech][year]==null ? 0 : d3.sum(lsoa[tech][year].map( i => i.saved))));

        //stacked glyph with the actual saved MW vs. total saving potential
        else {
            //potential saving by year by this tech (this potential keeps decreasing
            //as more and more buildings have been upgraded)
            glyphData["potential"] = d3.range(modelSpec.nr_years).map(year =>
                d3.sum(buildingsYearLsoas[year][lsoaCode].filter(b => b.ashp_suitability).map(b => b.heat_demand)));
            if (sqrt) glyphData["potential"] = glyphData["potential"].map(v => Math.sqrt(v));

            //for a particular tech
            let tech = "ASHP";
            //cummulative savings over years by this tech
            let sum = 0;
            glyphData[tech] = d3.range(modelSpec.nr_years).map(year => {
                if (cummulative)
                    sum += lsoa[tech][year] == null ? 0 : d3.sum(lsoa[tech][year].map(i => i.saved));
                else sum = lsoa[tech][year] == null ? 0 : d3.sum(lsoa[tech][year].map(i => i.saved));
                return sum;
            });
            if (sqrt) glyphData[tech] = glyphData[tech].map(v => Math.sqrt(v));
        }
        
        let tg = new TimeGlyph(glyphData, glyphCollection, stacked);
        glyphCollection.add(tg);
    });
    
    
    glyphCollection.recalculate = function(){
        glyphCollection.norm = d3.max(this.glyphs.map( g => g.maxAllTime()));
        console.log("norm val: " + glyphCollection.norm);
    };
    glyphCollection.recalculate();
    
    console.log(glyphCollection.glyphs);
    glyphCollection.glyphs.map( (g,i) =>
        g.draw(ctx, Math.floor(i/10)*50, (i%10)*50, 40, 50)    
    );
    
    
    
    
    return canvas;
}
```

```js
const modelData = FileAttachment("./data/result_gdf_admin.geojson").json();
```
