### Requirements

#### Geographic Selection and Hierarchies

- **User Selection of Geography:**
  - Ability for the user to specify an LA (or set of LAs) of interest.
  - Selection should encompass standardised geographies: LAs, wards, MSOAs, LSOAs.
- **Hierarchical Structure:**
  - Provide a hierarchical structure of geographies:
    - LAs -> MSOAs -> LSOAs.
    - H3 layers.
    - Arbitrary discretisation.
- **Irregular Sub-divisions:**
  - For geographies that do not nest perfectly (e.g., wards, parishes):
    - Mechanism to handle these non-nesting geographies.
- **Visualization Options:**
  - Squarified cartograms for irregular subdivisions using linear programming.
  - Morphing capability between real geometries and cartogram ones.

#### Data Handling and Visualization

- **Data Loading and Processing:**
  - Users can load multivariate and time series data.
  - Data gets filtered to the selected geography and binned into sub-divisions.
  - "Dany" oversampling method for data discretisation (e.g., MSOA -> 100m grid -> LSOA).
- **Data Visualization:**
  - Display multivariate and time series data as a list.
  - Users can select sub-divisions to view.
  - Default and selectable glyph designs for data visualization:
    - Radial design for multivariate data.
    - Stacked time series chart for time series data.
  - Users can add or remove variables from the visualization.

#### Cartogramming and Morphing

- **Cartogram Generation:**
  - Convert known geographies into regular regions (e.g., LSOAs to squares).
  - Ability to arrange hierarchically (e.g., arrange LAs, arrange wards inside LAs, arrange LSOAs inside wards).
- **Morphing Animation:**
  - Animate transitions between real geographies and cartograms.
  - Animate changes between different glyph resolutions.

#### Data Input Formats

- **Supported Formats:**
  - Ability to add data in various formats (e.g., geojson, gsv).
  - Data automatically discretized into the geographies of interest.

#### Glyph Design and Customization

- **Default and Custom Glyphs:**
  - Provide a few concrete glyph designs (e.g., radial multivariate plot, stacked time series, mirror time series).
  - Parameterized glyphs to accept plug-and-show data.
  - Allow users to select a glyph type and drop data variables into it.

#### Configuration and Saving

- **Saving Configurations:**
  - Allow users to save their visualization configurations.

---

#### Additional Considerations

- **Geography Nesting:**
  - Address geographies that do not have perfect nesting properties (e.g., wards, parishes).
- **Cluster-Based Discretisation:**
  - Handle data-driven cluster-based discretisation.
- **Screen-Based Discretisation:**
  - Determine necessity and implementation of screen-based discretisation.
