import * as L from "npm:leaflet";
import Supercluster from "npm:supercluster";
import { tileDictionary } from "./basemaps.js";

console.log("Leaflet version:", L.version);

export class LeafletMap {
  constructor(container, options = {}) {
    // Default options
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
      ], // Default visible basemaps
      tooltipFormatter: null, // Add default tooltip formatter option
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
    // Add bounds property
    this.dataBounds = null;

    this._initializeMap();
  }

  // Initialize the map
  _initializeMap() {
    const width =
      typeof this.options.width === "number"
        ? `${this.options.width}px`
        : this.options.width;
    const height =
      typeof this.options.height === "number"
        ? `${this.options.height}px`
        : this.options.height;

    // Set container dimensions
    this.container.style.width = width;
    this.container.style.height = height;

    // Create map instance
    this.map = L.map(this.container, {
      maxZoom: this.options.maxZoom,
      minZoom: this.options.minZoom,
    });

    // Set initial view to [0,0] with zoom level 2
    this.map.setView([0, 0], 2);

    // Initialize base layers
    this._initializeBaseLayers();

    // Set default base layer
    this.setBaseLayer(this.options.defaultTile);

    // Add default tile layer
    // this.baseLayer = L.tileLayer(this.options.tileLayer, {
    //   attribution: this.options.attribution,
    // }).addTo(this.map);
  }

  _initializeBaseLayers() {
    // Create tile layers for all entries in tileDictionary
    Object.entries(this.tileDictionary).forEach(([name, config]) => {
      const layer = L.tileLayer(config.url, config.options);
      this.baseLayers.set(name, layer);
    });
  }

  // Get available base layer names
  getAvailableBaseLayers() {
    return Array.from(this.baseLayers.keys());
  }

  // Set active base layer
  setBaseLayer(layerName) {
    if (!this.baseLayers.has(layerName)) {
      console.warn(`Base layer "${layerName}" not found in available layers`);
      return false;
    }

    // Remove current base layer if exists
    if (this.activeBaseLayer) {
      this.activeBaseLayer.remove();
    }

    // Add new base layer
    const newBaseLayer = this.baseLayers.get(layerName);
    newBaseLayer.addTo(this.map);
    this.activeBaseLayer = newBaseLayer;

    return true;
  }

  // Get current base layer name
  getCurrentBaseLayer() {
    for (const [name, layer] of this.baseLayers.entries()) {
      if (layer === this.activeBaseLayer) {
        return name;
      }
    }
    return null;
  }

  // Add a new base layer
  addBaseLayer(name, url, options = {}) {
    if (this.baseLayers.has(name)) {
      console.warn(`Base layer "${name}" already exists`);
      return false;
    }

    const layer = L.tileLayer(url, options);
    this.baseLayers.set(name, layer);
    return true;
  }

  // Remove a base layer
  removeBaseLayer(name) {
    if (!this.baseLayers.has(name)) {
      return false;
    }

    const layer = this.baseLayers.get(name);
    if (layer === this.activeBaseLayer) {
      layer.remove();
      this.activeBaseLayer = null;
    }

    this.baseLayers.delete(name);
    return true;
  }

  // Convert data to GeoJSON format
  _toGeoJSON(data) {
    return data.map((point) => ({
      type: "Feature",
      properties: { ...point },
      geometry: {
        type: "Point",
        coordinates: [point.x, point.y],
      },
    }));
  }

  // Initialize clustering for a layer
  _initializeCluster(geoJsonData, options = {}) {
    const cluster = new Supercluster({
      radius: options.clusterRadius || this.options.clusterRadius,
      maxZoom: options.maxZoom || this.options.maxZoom,
      minPoints: options.minPoints || this.options.minPoints,
      ...options.clusterOptions,
    });

    cluster.load(geoJsonData);
    return cluster;
  }

  // Update markers for a specific layer
  _updateMarkers(layerId) {
    const layer = this.layers.get(layerId);
    const cluster = this.clusters.get(layerId);

    if (!layer || !cluster) return;

    const bounds = this.map.getBounds();
    const zoom = Math.floor(this.map.getZoom());

    // Get clusters for current viewport
    const clusters = cluster.getClusters(
      [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ],
      zoom
    );

    // Clear existing markers
    layer.clearLayers();

    // Add new markers
    clusters.forEach((cluster) => {
      const [lng, lat] = cluster.geometry.coordinates;

      if (cluster.properties.cluster) {
        // Create cluster marker
        const marker = L.marker([lat, lng], {
          icon: this._createClusterIcon(cluster.properties.point_count),
        });

        marker.on("click", () => {
          const expansionZoom = cluster.getClusterExpansionZoom(cluster.id);
          this.map.setView([lat, lng], expansionZoom);
        });

        layer.addLayer(marker);
      } else {
        // Create individual marker
        const marker = L.marker([lat, lng], {
          icon: this._createMarkerIcon(),
        });

        if (cluster.properties) {
          marker.bindPopup(this._createPopupContent(cluster.properties));
        }

        layer.addLayer(marker);
      }
    });
  }

  // Create cluster icon
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

  // Create marker icon
  _createMarkerIcon() {
    return L.divIcon({
      html: '<div style="background-color: #dc3545; border-radius: 50%; width: 8px; height: 8px;"></div>',
      className: "marker-individual",
    });
  }

  // Create popup content
  _createPopupContent(properties) {
    // Use custom formatter if available
    if (this.options.tooltipFormatter) {
      return this.options.tooltipFormatter(properties);
    }

    // Default formatting
    return Object.entries(properties)
      .filter(([key]) => !["cluster", "cluster_id"].includes(key))
      .map(([key, value]) => `${key}: ${value}`)
      .join("<br>");
  }

  // Add new method to set tooltip formatter
  setTooltipFormatter(formatter) {
    if (typeof formatter !== "function") {
      throw new Error("Tooltip formatter must be a function");
    }
    this.options.tooltipFormatter = formatter;
  }

  // Public Methods

  // Add a new data layer with clustering
  addLayer(layerId, data, options = {}) {
    if (this.layers.has(layerId)) {
      console.warn(`Layer ${layerId} already exists. Use updateLayer instead.`);
      return;
    }

    const geoJsonData = this._toGeoJSON(data);
    this.dataBounds = this._calculateBounds(geoJsonData);
    const cluster = this._initializeCluster(geoJsonData, options);
    const layer = L.layerGroup().addTo(this.map);

    this.layers.set(layerId, layer);
    this.clusters.set(layerId, cluster);
    this.overlayLayers.set(layerId, layer); // Add to overlay layers for control

    // Add update listener if not already added
    if (!this.eventListeners.has(layerId)) {
      const updateFn = () => this._updateMarkers(layerId);
      this.map.on("moveend", updateFn);
      this.eventListeners.set(layerId, updateFn);
    }

    this._updateMarkers(layerId);
    this._updateLayerControl(); // Update layer control

    // Fit bounds if specified
    if (options.fitBounds !== false && data.length > 0) {
      const bounds = L.latLngBounds(data.map((point) => [point.y, point.x]));
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  // Update existing layer with new data
  updateLayer(layerId, data, options = {}) {
    if (!this.layers.has(layerId)) {
      console.warn(`Layer ${layerId} doesn't exist. Use addLayer instead.`);
      return;
    }

    const geoJsonData = this._toGeoJSON(data);
    this.dataBounds = this._calculateBounds(geoJsonData);
    const cluster = this._initializeCluster(geoJsonData, options);

    this.clusters.set(layerId, cluster);
    this._updateMarkers(layerId);

    if (options.fitBounds && data.length > 0) {
      const bounds = L.latLngBounds(data.map((point) => [point.y, point.x]));
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  // Remove a layer
  removeLayer(layerId) {
    const layer = this.layers.get(layerId);
    const updateFn = this.eventListeners.get(layerId);

    if (layer) {
      layer.remove();
      this.layers.delete(layerId);
      this.clusters.delete(layerId);
      this.overlayLayers.delete(layerId); // Remove from overlay layers
      this._updateLayerControl(); // Update layer control
    }

    if (updateFn) {
      this.map.off("moveend", updateFn);
      this.eventListeners.delete(layerId);
    }
  }

  // Set layer visibility
  setLayerVisibility(layerId, visible) {
    const layer = this.layers.get(layerId);
    if (layer) {
      if (visible) {
        layer.addTo(this.map);
      } else {
        layer.remove();
      }
    }
  }

  // Add a custom tile layer
  addTileLayer(url, options = {}) {
    return L.tileLayer(url, {
      attribution: options.attribution || "",
      ...options,
    }).addTo(this.map);
  }

  // Set map view
  setView(center, zoom) {
    this.map.setView([center.y, center.x], zoom);
  }

  // Fit bounds to show all markers in a layer
  fitLayerBounds(layerId) {
    const layer = this.layers.get(layerId);
    if (layer) {
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        this.map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }

  // Add event listener
  on(event, callback) {
    this.map.on(event, callback);
  }

  // Remove event listener
  off(event, callback) {
    this.map.off(event, callback);
  }

  // Add new methods
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
    // Remove existing control if it exists
    if (this.layerControl) {
      this.layerControl.remove();
    }

    // Create base layers object
    const baseLayers = {};
    this.baseLayers.forEach((layer, name) => {
      if (this.options.visibleBaseLayers.includes(name)) {
        baseLayers[name] = layer;
      }
    });

    // Create overlay layers object
    const overlays = {};
    this.overlayLayers.forEach((layer, name) => {
      overlays[name] = layer;
    });

    // Create new control
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
        duration: 2, // Animation duration in seconds
        easeLinearity: 0.5,
      });

      this.map.once("moveend", () => {
        resolve();
      });
    });
  }

  // Clean up
  destroy() {
    // Remove all event listeners
    this.eventListeners.forEach((updateFn, layerId) => {
      this.map.off("moveend", updateFn);
    });

    // Clear all maps
    this.layers.clear();
    this.clusters.clear();
    this.eventListeners.clear();
    this.baseLayers.clear();
    this.overlayLayers.clear();
    if (this.layerControl) {
      this.layerControl.remove();
    }

    // Remove the map
    this.map.remove();
  }

  // Calculate bounds from GeoJSON data
  _calculateBounds(geoJsonData) {
    const coordinates = geoJsonData.map(
      (feature) => feature.geometry.coordinates
    );

    const bounds = L.latLngBounds(
      coordinates.map((coord) => [coord[1], coord[0]])
    );
    return bounds;
  }

  // Public method to zoom to data bounds
  zoomToDataBounds(animate = true) {
    if (!this.dataBounds || !this.dataBounds.isValid()) {
      return false;
    }

    if (animate) {
      this.map.flyToBounds(this.dataBounds, {
        padding: [50, 50],
        duration: 1,
      });
    } else {
      this.map.fitBounds(this.dataBounds, {
        padding: [50, 50],
      });
    }
    return true;
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
