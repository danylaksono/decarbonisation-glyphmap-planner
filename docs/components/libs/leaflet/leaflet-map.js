import * as L from "npm:leaflet";
import Supercluster from "npm:supercluster";
import "leaflet-draw"; // Leaflet Draw for drawing shapes
import * as turf from "@turf/turf"; // Correct import for Turf.js
import { tileDictionary } from "./basemaps.js";
// import "leaflet-draw/dist/leaflet.draw.css";

export class LeafletMap {
  constructor(container, options = {}) {
    // Default options with new callbacks for select and filter
    this.options = {
      width: "100%",
      height: "400px",
      clusterRadius: 40,
      maxZoom: 20,
      minZoom: 3,
      minPoints: 3,
      defaultTile: "Carto Positron Light NoLabel",
      visibleBaseLayers: [
        "Carto Positron Light NoLabel",
        "OpenStreetMap",
        "Carto Voyager",
      ],
      tooltipFormatter: null,
      onSelect: null, // Callback for when points are selected
      onFilter: null, // Callback for when points are filtered
      ...options,
    };

    // Initialize properties
    this.container = container;
    this.layers = new Map(); // Store named layers
    this.clusters = new Map(); // Store cluster instances
    this.eventListeners = new Map(); // Store event listeners
    this.baseLayers = new Map(); // Store base tile layers
    this.activeBaseLayer = null;
    this.tileDictionary = { ...tileDictionary };
    this.overlayLayers = new Map(); // Store overlay layers for layer control
    this.layerControl = null;
    this.dataBounds = null;
    this.geoJsonData = new Map(); // Store GeoJSON data for each layer
    this.selectionLayerId = null; // Layer ID for selection and filtering
    this.isSelectionMode = false;
    this.drawControl = null;

    this._initializeMap();
  }

  _initializeMap() {
    const width =
      typeof this.options.width === "number"
        ? `${this.options.width}px`
        : this.options.width;
    const height =
      typeof this.options.height === "number"
        ? `${this.options.height}px`
        : this.options.height;

    this.container.style.width = width;
    this.container.style.height = height;

    this.map = L.map(this.container, {
      maxZoom: this.options.maxZoom,
      minZoom: this.options.minZoom,
    });
    this.map.setView([0, 0], 2);

    this._initializeBaseLayers();
    this.setBaseLayer(this.options.defaultTile);

    // Create Leaflet Draw control but don't add it yet
    this.drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        polygon: true,
        polyline: false,
        rectangle: true,
        circle: true,
        marker: false,
        circlemarker: false,
      },
      edit: false,
    });

    // Add toggle selection mode button
    const selectionButton = L.control({ position: "topright" });
    selectionButton.onAdd = () => {
      const div = L.DomUtil.create("div", "selection-button leaflet-bar");
      div.innerHTML =
        '<a href="#" title="Toggle Selection Mode" style="font-weight: bold;">S</a>';
      div.firstChild.onclick = (e) => {
        e.preventDefault();
        this.toggleSelectionMode();
      };
      return div;
    };
    selectionButton.addTo(this.map);

    // Add Filter button
    const filterButton = L.control({ position: "topright" });
    filterButton.onAdd = () => {
      const div = L.DomUtil.create("div", "filter-button leaflet-bar");
      div.innerHTML = '<a href="#" title="Filter Selection">F</a>';
      div.firstChild.onclick = (e) => {
        e.preventDefault();
        this.filterPoints(this.selectionLayerId);
      };
      return div;
    };
    filterButton.addTo(this.map);

    // Add clear selection button
    const clearSelectionButton = L.control({ position: "topright" });
    clearSelectionButton.onAdd = () => {
      const div = L.DomUtil.create("div", "clear-selection-button leaflet-bar");
      div.innerHTML = '<a href="#" title="Clear Selection">C</a>';
      div.firstChild.onclick = (e) => {
        e.preventDefault();
        this.clearSelection(this.selectionLayerId);
      };
      return div;
    };
    clearSelectionButton.addTo(this.map);

    // Handle drawing events for selection
    this.map.on("draw:created", (e) => {
      if (!this.isSelectionMode) return;

      const layer = e.layer;
      const type = e.layerType;
      const layerId = this.selectionLayerId;

      if (!layerId || !this.geoJsonData.has(layerId)) {
        return;
      }

      const points = this.geoJsonData.get(layerId);
      let selectedFeatures;

      if (type === "polygon" || type === "rectangle") {
        const polygon = layer.toGeoJSON();
        selectedFeatures = turf.pointsWithinPolygon(points, polygon);
      } else if (type === "circle") {
        const circle = layer.toGeoJSON();
        const radius = circle.properties.radius; // in meters
        const center = circle.geometry;
        const buffered = turf.buffer(center, radius, { units: "meters" });
        selectedFeatures = turf.pointsWithinPolygon(points, buffered);
      } else {
        return;
      }

      // Clear previous selections
      points.features.forEach((feature) => {
        delete feature.properties.selected;
      });

      // Mark new selected features
      selectedFeatures.features.forEach((feature) => {
        feature.properties.selected = true;
      });

      // Update markers to reflect selection
      this._updateMarkers(layerId);

      // Trigger onSelect callback if set
      if (this.options.onSelect) {
        this.options.onSelect(selectedFeatures.features);
      }
    });
  }

  _initializeBaseLayers() {
    Object.entries(this.tileDictionary).forEach(([name, config]) => {
      const layer = L.tileLayer(config.url, config.options);
      this.baseLayers.set(name, layer);
    });
  }

  getAvailableBaseLayers() {
    return Array.from(this.baseLayers.keys());
  }

  setBaseLayer(layerName) {
    if (!this.baseLayers.has(layerName)) {
      console.warn(`Base layer "${layerName}" not found`);
      return false;
    }
    if (this.activeBaseLayer) {
      this.activeBaseLayer.remove();
    }
    const newBaseLayer = this.baseLayers.get(layerName);
    newBaseLayer.addTo(this.map);
    this.activeBaseLayer = newBaseLayer;
    return true;
  }

  getCurrentBaseLayer() {
    for (const [name, layer] of this.baseLayers.entries()) {
      if (layer === this.activeBaseLayer) return name;
    }
    return null;
  }

  addBaseLayer(name, url, options = {}) {
    if (this.baseLayers.has(name)) {
      console.warn(`Base layer "${name}" already exists`);
      return false;
    }
    const layer = L.tileLayer(url, options);
    this.baseLayers.set(name, layer);
    return true;
  }

  removeBaseLayer(name) {
    if (!this.baseLayers.has(name)) return false;
    const layer = this.baseLayers.get(name);
    if (layer === this.activeBaseLayer) {
      layer.remove();
      this.activeBaseLayer = null;
    }
    this.baseLayers.delete(name);
    return true;
  }

  _toGeoJSON(data) {
    return {
      type: "FeatureCollection",
      features: data.map((point) => ({
        type: "Feature",
        properties: { ...point },
        geometry: {
          type: "Point",
          coordinates: [point.x, point.y],
        },
      })),
    };
  }

  _initializeCluster(geoJsonFeatures, options = {}) {
    const cluster = new Supercluster({
      radius: options.clusterRadius || this.options.clusterRadius,
      maxZoom: options.maxZoom || this.options.maxZoom,
      minPoints: options.minPoints || this.options.minPoints,
      ...options.clusterOptions,
    });
    cluster.load(geoJsonFeatures);
    return cluster;
  }

  _updateMarkers(layerId) {
    const layer = this.layers.get(layerId);
    const cluster = this.clusters.get(layerId);
    if (!layer || !cluster) return;

    const bounds = this.map.getBounds();
    const zoom = Math.floor(this.map.getZoom());
    const clusters = cluster.getClusters(
      [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ],
      zoom
    );

    layer.clearLayers();
    clusters.forEach((cluster) => {
      const [lng, lat] = cluster.geometry.coordinates;
      if (cluster.properties.cluster) {
        const marker = L.marker([lat, lng], {
          icon: this._createClusterIcon(cluster.properties.point_count),
        });
        marker.on("click", () => {
          const expansionZoom = cluster.getClusterExpansionZoom(cluster.id);
          this.map.setView([lat, lng], expansionZoom);
        });
        layer.addLayer(marker);
      } else {
        const marker = L.marker([lat, lng], {
          icon: this._createMarkerIcon(cluster.properties),
        });

        // Add click handler for selection/deselection
        marker.on("click", () => {
          if (!this.isSelectionMode) return;

          // Toggle selection state
          cluster.properties.selected = !cluster.properties.selected;

          // Update marker appearance
          marker.setIcon(this._createMarkerIcon(cluster.properties));

          // Update the underlying data
          const geoJsonData = this.geoJsonData.get(layerId);
          const feature = geoJsonData.features.find(
            (f) =>
              f.geometry.coordinates[0] === lng &&
              f.geometry.coordinates[1] === lat
          );
          if (feature) {
            feature.properties.selected = cluster.properties.selected;
          }

          // Trigger onSelect callback if set
          if (this.options.onSelect) {
            const selectedFeatures = geoJsonData.features.filter(
              (f) => f.properties.selected
            );
            this.options.onSelect(selectedFeatures);
          }
        });

        if (cluster.properties) {
          marker.bindPopup(this._createPopupContent(cluster.properties));
        }
        layer.addLayer(marker);
      }
    });
  }

  _createClusterIcon(count) {
    return L.divIcon({
      html: `<div style="
          background-color: #3388ff;
          color: white;
          border-radius: 50%;
          width: ${count < 100 ? "30px" : "40px"};
          height: ${count < 100 ? "30px" : "40px"};
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        ">${count}</div>`,
      className: "marker-cluster",
    });
  }

  _createMarkerIcon(properties = {}) {
    // Use more distinct colours and sizes for selected vs unselected points
    const size = properties.selected ? "12px" : "8px";
    const color = properties.selected ? "#ff3860" : "#3388ff"; // Bright red for selected, blue for default
    const border = properties.selected ? "2px solid #fff" : "none"; // White border for selected points
    const boxShadow = properties.selected ? "0 0 4px rgba(0,0,0,0.4)" : "none"; // Shadow for selected points

    return L.divIcon({
      html: `<div style="
        background-color: ${color};
        border-radius: 50%;
        width: ${size};
        height: ${size};
        border: ${border};
        box-shadow: ${boxShadow};
        transition: all 0.2s ease-in-out;
      "></div>`,
      className: "marker-individual",
    });
  }

  _createPopupContent(properties) {
    if (this.options.tooltipFormatter) {
      return this.options.tooltipFormatter(properties);
    }
    return Object.entries(properties)
      .filter(([key]) => !["cluster", "cluster_id", "selected"].includes(key))
      .map(([key, value]) => `${key}: ${value}`)
      .join("<br>");
  }

  setTooltipFormatter(formatter) {
    if (typeof formatter !== "function") {
      throw new Error("Tooltip formatter must be a function");
    }
    this.options.tooltipFormatter = formatter;
  }

  addLayer(layerId, data, options = {}) {
    if (this.layers.has(layerId)) {
      console.warn(`Layer ${layerId} already exists. Use updateLayer instead.`);
      return;
    }

    const geoJsonData = this._toGeoJSON(data);
    this.geoJsonData.set(layerId, geoJsonData);
    this.dataBounds = this._calculateBounds(geoJsonData.features);
    const cluster = this._initializeCluster(geoJsonData.features, options);
    const layer = L.layerGroup().addTo(this.map);

    this.layers.set(layerId, layer);
    this.clusters.set(layerId, cluster);
    this.overlayLayers.set(layerId, layer);

    // Set as selection layer if none is set
    if (!this.selectionLayerId) {
      this.selectionLayerId = layerId;
    }

    if (!this.eventListeners.has(layerId)) {
      const updateFn = () => this._updateMarkers(layerId);
      this.map.on("moveend", updateFn);
      this.eventListeners.set(layerId, updateFn);
    }

    this._updateMarkers(layerId);
    this._updateLayerControl();

    if (options.fitBounds !== false && data.length > 0) {
      const bounds = L.latLngBounds(data.map((point) => [point.y, point.x]));
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  updateLayer(layerId, data, options = {}) {
    if (!this.layers.has(layerId)) {
      console.warn(`Layer ${layerId} doesn't exist. Use addLayer instead.`);
      return;
    }

    const geoJsonData = this._toGeoJSON(data);
    this.geoJsonData.set(layerId, geoJsonData);
    this.dataBounds = this._calculateBounds(geoJsonData.features);
    const cluster = this._initializeCluster(geoJsonData.features, options);

    this.clusters.set(layerId, cluster);
    this._updateMarkers(layerId);

    if (options.fitBounds && data.length > 0) {
      const bounds = L.latLngBounds(data.map((point) => [point.y, point.x]));
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  removeLayer(layerId) {
    const layer = this.layers.get(layerId);
    const updateFn = this.eventListeners.get(layerId);

    if (layer) {
      layer.remove();
      this.layers.delete(layerId);
      this.clusters.delete(layerId);
      this.geoJsonData.delete(layerId);
      this.overlayLayers.delete(layerId);
      this._updateLayerControl();
      if (this.selectionLayerId === layerId) {
        this.selectionLayerId = null;
      }
    }

    if (updateFn) {
      this.map.off("moveend", updateFn);
      this.eventListeners.delete(layerId);
    }
  }

  setLayerVisibility(layerId, visible) {
    const layer = this.layers.get(layerId);
    if (layer) {
      if (visible) layer.addTo(this.map);
      else layer.remove();
    }
  }

  addTileLayer(url, options = {}) {
    return L.tileLayer(url, {
      attribution: options.attribution || "",
      ...options,
    }).addTo(this.map);
  }

  setView(center, zoom) {
    this.map.setView([center.y, center.x], zoom);
  }

  fitLayerBounds(layerId) {
    const layer = this.layers.get(layerId);
    if (layer && layer.getBounds().isValid()) {
      this.map.fitBounds(layer.getBounds(), { padding: [50, 50] });
    }
  }

  on(event, callback) {
    this.map.on(event, callback);
  }

  off(event, callback) {
    this.map.off(event, callback);
  }

  addGeoJSONLayer(layerId, geojson, options = {}) {
    if (this.overlayLayers.has(layerId)) {
      console.warn(`Layer ${layerId} already exists`);
      return;
    }
    const layer = L.geoJSON(geojson, {
      style: options.style,
      pointToLayer: options.pointToLayer,
      onEachFeature: options.onEachFeature,
    }).addTo(this.map);
    this.overlayLayers.set(layerId, layer);
    this._updateLayerControl();
    return layer;
  }

  _updateLayerControl() {
    if (this.layerControl) this.layerControl.remove();
    const baseLayers = {};
    this.baseLayers.forEach((layer, name) => {
      if (this.options.visibleBaseLayers.includes(name)) {
        baseLayers[name] = layer;
      }
    });
    const overlays = {};
    this.overlayLayers.forEach((layer, name) => {
      overlays[name] = layer;
    });
    this.layerControl = L.control.layers(baseLayers, overlays).addTo(this.map);
  }

  removeGeoJSONLayer(layerId) {
    const layer = this.overlayLayers.get(layerId);
    if (layer) {
      layer.remove();
      this.overlayLayers.delete(layerId);
      this._updateLayerControl();
    }
  }

  setVisibleBaseLayers(layerNames) {
    this.options.visibleBaseLayers = layerNames;
    this._updateLayerControl();
  }

  flyTo(center, zoom) {
    return new Promise((resolve) => {
      this.map.flyTo([center.y, center.x], zoom || this.options.maxZoom, {
        duration: 2,
        easeLinearity: 0.5,
      });
      this.map.once("moveend", () => resolve());
    });
  }

  destroy() {
    this.eventListeners.forEach((updateFn, layerId) => {
      this.map.off("moveend", updateFn);
    });
    this.layers.clear();
    this.clusters.clear();
    this.eventListeners.clear();
    this.baseLayers.clear();
    this.overlayLayers.clear();
    this.geoJsonData.clear();
    if (this.layerControl) this.layerControl.remove();
    this.map.remove();
  }

  _calculateBounds(geoJsonFeatures) {
    const coordinates = geoJsonFeatures.map(
      (feature) => feature.geometry.coordinates
    );
    return L.latLngBounds(coordinates.map((coord) => [coord[1], coord[0]]));
  }

  zoomToDataBounds(animate = true) {
    if (!this.dataBounds || !this.dataBounds.isValid()) return false;
    if (animate) {
      this.map.flyToBounds(this.dataBounds, { padding: [50, 50], duration: 1 });
    } else {
      this.map.fitBounds(this.dataBounds, { padding: [50, 50] });
    }
    return true;
  }

  /**
   * Sets the layer to be used for selection and filtering operations.
   * @param {string} layerId - The ID of the layer to set as the selection layer.
   */
  setSelectionLayer(layerId) {
    if (this.layers.has(layerId)) {
      this.selectionLayerId = layerId;
    } else {
      console.warn(`Layer ${layerId} does not exist`);
    }
  }

  /**
   * Filters the specified layer to display only the selected points.
   * Triggers the onFilter callback with the filtered features if set.
   * @param {string} layerId - The ID of the layer to filter.
   */
  filterPoints(layerId) {
    const geoJsonData = this.geoJsonData.get(layerId);
    if (!geoJsonData) return;

    const selectedFeatures = geoJsonData.features.filter(
      (feature) => feature.properties.selected
    );

    const selectedGeoJson = {
      type: "FeatureCollection",
      features: selectedFeatures,
    };

    const cluster = this._initializeCluster(selectedFeatures);
    this.clusters.set(layerId, cluster);
    this._updateMarkers(layerId);

    if (this.options.onFilter) {
      this.options.onFilter(selectedFeatures);
    }
  }

  /**
   * Toggles selection mode on/off
   */
  toggleSelectionMode() {
    this.isSelectionMode = !this.isSelectionMode;

    if (this.isSelectionMode) {
      // Enable selection mode
      this.map.addControl(this.drawControl);

      // Disable other interactions
      this.layers.forEach((layer) => {
        layer.eachLayer((marker) => {
          if (marker.getPopup()) {
            marker.unbindPopup();
          }
        });
      });

      // Update button state
      const selButton = document.querySelector(".selection-button a");
      if (selButton) {
        selButton.style.backgroundColor = "#ffeb3b";
      }
    } else {
      // Disable selection mode
      this.map.removeControl(this.drawControl);

      // Re-enable other interactions
      this.layers.forEach((layer, layerId) => {
        this._updateMarkers(layerId);
      });

      // Update button state
      const selButton = document.querySelector(".selection-button a");
      if (selButton) {
        selButton.style.backgroundColor = "";
      }
    }
  }

  /**
   * Clears all selections from the specified layer
   * @param {string} layerId - The ID of the layer to clear selections from
   */
  clearSelection(layerId) {
    const geoJsonData = this.geoJsonData.get(layerId);
    if (!geoJsonData) return;

    // Clear selected state from all features
    geoJsonData.features.forEach((feature) => {
      feature.properties.selected = false;
    });

    // Update markers to reflect cleared selection
    this._updateMarkers(layerId);

    // Trigger onSelect callback with empty selection
    if (this.options.onSelect) {
      this.options.onSelect([]);
    }
  }
}

// Usage example:
/*
  const container = document.createElement('div');
  document.body.appendChild(container);
  
  const mapInstance = new LeafletMap(container, {
    width: '800px',
    height: '600px'
  });
  
  // Add a data layer
  const buildingsData = [
    { x: -123, y: 54231, name: "Building A" },
    { x: -122, y: 54235, name: "Building B" }
  ];
  
  mapInstance.addLayer('buildings', buildingsData, {
    clusterRadius: 50,
    fitBounds: true
  });
  
  // Later, update the layer
  mapInstance.updateLayer('buildings', newData);
  
  // Toggle layer visibility
  mapInstance.setLayerVisibility('buildings', false);
  
  // Clean up
  mapInstance.destroy();
  */
