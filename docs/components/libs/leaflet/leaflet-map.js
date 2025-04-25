import * as L from "npm:leaflet";
import Supercluster from "npm:supercluster";
import "leaflet-draw"; // Leaflet Draw for drawing shapes
import * as turf from "@turf/turf"; // Correct import for Turf.js
import { tileDictionary } from "./basemaps.js";
import { getMapLogger } from "./map-logger.js"; // Import the logger
// import "leaflet-draw/dist/leaflet.draw.css";

export class LeafletMap {
  constructor(container, options = {}) {
    // Initialize logger first for early logging
    this.logger = getMapLogger({
      enabled: options.debug === true,
      level: options.logLevel || "info",
      enabledCategories: options.logCategories || ["general", "error"],
    });

    this.logger.info("general", "Initializing LeafletMap");

    // Validate container
    if (!container) {
      const error = new Error("Container element is required");
      this.logger.error("general", "Container element is missing", error);
      throw error;
    }

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
      debug: false, // Enable debug logging
      logLevel: "info", // Log level
      logCategories: ["general", "error"], // Enabled log categories
      ...options,
    };

    try {
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
      this.originalGeoJsonData = new Map(); // Store original GeoJSON data for reset functionality
      this.selectionLayerId = null; // Layer ID for selection and filtering
      this.isSelectionMode = false;
      this.clearSelectionButton = null; // Reference to clear selection button control
      this.mapInitialized = false; // Track if map was successfully initialized
      this.pendingActions = []; // Store actions that need to be performed after initialization

      this._initializeMap();
      this.logger.info("general", "LeafletMap initialization complete");
    } catch (error) {
      this.logger.error(
        "general",
        "Error during LeafletMap initialization",
        error
      );
      throw error;
    }
  }

  _initializeMap() {
    try {
      this.logger.debug("general", "Starting map initialization");

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

      // Defensive check to ensure the container exists in the DOM
      if (!this.container.parentElement) {
        this.logger.warn("general", "Container is not attached to the DOM yet");
      }

      // Create map with error handling
      try {
        this.map = L.map(this.container, {
          maxZoom: this.options.maxZoom,
          minZoom: this.options.minZoom,
        });
        this.map.setView([0, 0], 2);
        this.logger.debug("general", "Map instance created successfully");
      } catch (mapError) {
        this.logger.error(
          "general",
          "Failed to create Leaflet map instance",
          mapError
        );
        throw new Error(`Failed to initialize map: ${mapError.message}`);
      }

      // Initialize base layers with defensive checks
      this._initializeBaseLayers();
      if (!this.setBaseLayer(this.options.defaultTile)) {
        this.logger.warn(
          "layers",
          `Default base layer "${this.options.defaultTile}" not found, trying first available`
        );
        const firstBaseLayer = Array.from(this.baseLayers.keys())[0];
        if (firstBaseLayer) {
          this.setBaseLayer(firstBaseLayer);
        } else {
          this.logger.error("layers", "No base layers available");
        }
      }

      // Create Leaflet Draw control but don't add it yet
      this.drawControl = new L.Control.Draw({
        position: "bottomleft",
        draw: {
          polygon: {
            allowIntersection: false,
            showArea: false,
            shapeOptions: {
              color: "#3388ff",
            },
            // metric: true,
          },
          polyline: false,
          rectangle: {
            showArea: false,
            shapeOptions: {
              color: "#3388ff",
              fillOpacity: 0.2,
              weight: 2,
            },
            metric: true,
          },
          circle: {
            showRadius: true,
            shapeOptions: {
              color: "#3388ff",
              fillOpacity: 0.2,
              weight: 2,
            },
            metric: true,
          },
          marker: false,
          circlemarker: false,
        },
        edit: false,
      });

      // Add reset button
      const resetButton = L.control({ position: "bottomleft" });
      resetButton.onAdd = () => {
        const div = L.DomUtil.create("div", "reset-button leaflet-bar");
        div.innerHTML =
          '<a href="#" title="Reset Map" class="map-control-button"><i class="fa fa-refresh"></i></a>';
        div.firstChild.onclick = (e) => {
          e.preventDefault();
          this.logger.debug("general", "Reset button clicked");
          this.resetMap();
        };
        return div;
      };
      resetButton.addTo(this.map);

      // Add toggle selection mode button
      const selectionButton = L.control({ position: "bottomleft" });
      selectionButton.onAdd = () => {
        const div = L.DomUtil.create("div", "selection-button leaflet-bar");
        div.innerHTML =
          '<a href="#" title="Toggle Selection Mode" class="map-control-button"><i class="fa fa-object-group"></i></a>';
        div.firstChild.onclick = (e) => {
          e.preventDefault();
          this.toggleSelectionMode();
        };
        return div;
      };
      selectionButton.addTo(this.map);

      // Add Filter button
      const filterButton = L.control({ position: "bottomleft" });
      filterButton.onAdd = () => {
        const div = L.DomUtil.create("div", "filter-button leaflet-bar");
        div.innerHTML =
          '<a href="#" title="Filter Selection" class="map-control-button"><i class="fa fa-filter"></i></a>';
        div.firstChild.onclick = (e) => {
          e.preventDefault();
          this.filterPoints(this.selectionLayerId);
        };
        return div;
      };
      filterButton.addTo(this.map);

      // Add clear selection button
      this.clearSelectionButton = L.control({ position: "bottomleft" });
      this.clearSelectionButton.onAdd = () => {
        const div = L.DomUtil.create(
          "div",
          "clear-selection-button leaflet-bar"
        );
        div.innerHTML =
          '<a href="#" title="Clear Selection" class="map-control-button"><i class="fa fa-times"></i></a>';
        div.firstChild.onclick = (e) => {
          e.preventDefault();
          this.clearSelection(this.selectionLayerId);
        };
        return div;
      };

      // Safe wrapper for event handler to prevent errors from crashing the app
      const safeEventHandler = (handlerFn) => {
        return (e) => {
          try {
            handlerFn(e);
          } catch (error) {
            this.logger.error("events", "Error in event handler", error);
          }
        };
      };

      // Handle drawing events for selection
      this.map.on(
        "draw:created",
        safeEventHandler((e) => {
          if (!this.isSelectionMode) return;
          this.logger.debug("selection", "Draw created event triggered", {
            type: e.layerType,
          });

          const layer = e.layer;
          const layerType = e.layerType;
          const layerId = this.selectionLayerId;

          if (!layerId || !this.geoJsonData.has(layerId)) {
            this.logger.warn(
              "selection",
              "No valid selection layer for drawing",
              { layerId }
            );
            return;
          }

          try {
            const points = this.geoJsonData.get(layerId);
            if (
              !points ||
              !points.features ||
              !Array.isArray(points.features)
            ) {
              this.logger.error(
                "selection",
                "Invalid GeoJSON data for selection",
                { layerId }
              );
              return;
            }

            let selectedFeatures;

            if (layerType === "polygon" || layerType === "rectangle") {
              const polygon = layer.toGeoJSON();
              selectedFeatures = turf.pointsWithinPolygon(points, polygon);
            } else if (layerType === "circle") {
              const center = layer.getLatLng();
              const radius = layer.getRadius(); // Gets radius in meters
              const centerPoint = turf.point([center.lng, center.lat]);
              const buffered = turf.buffer(centerPoint, radius / 1000, {
                units: "kilometers",
              });
              selectedFeatures = turf.pointsWithinPolygon(points, buffered);
            } else {
              return;
            }

            // Clear previous selections
            points.features.forEach((feature) => {
              feature.properties.selected = false;
            });

            // Mark new selected features
            if (selectedFeatures && selectedFeatures.features) {
              this.logger.info(
                "selection",
                `Selected ${selectedFeatures.features.length} points`,
                { layerId }
              );
              selectedFeatures.features.forEach((feature) => {
                feature.properties.selected = true;
              });
            }

            // Update markers to reflect selection
            this._updateMarkers(layerId);

            // Clean up the temporary drawn shape
            layer.remove();

            // Trigger onSelect callback if set
            if (this.options.onSelect) {
              this.options.onSelect(selectedFeatures.features);
            }
          } catch (error) {
            this.logger.error("selection", "Error during selection", error);
            layer.remove();
          }
        })
      );

      // Mark as initialized and process any pending actions
      this.mapInitialized = true;
      this.logger.debug("general", "Processing pending actions", {
        count: this.pendingActions.length,
      });
      this.pendingActions.forEach((action) => action());
      this.pendingActions = [];
    } catch (error) {
      this.logger.error("general", "Error initializing map", error);
      throw error;
    }
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
    try {
      if (!Array.isArray(data)) {
        this.logger.error(
          "general",
          "Invalid data format for GeoJSON conversion",
          {
            type: typeof data,
            isArray: Array.isArray(data),
          }
        );
        return { type: "FeatureCollection", features: [] };
      }

      this.logger.debug(
        "general",
        `Converting ${data.length} points to GeoJSON`
      );

      // Filter out invalid points first to prevent errors
      const validPoints = data.filter(
        (point) =>
          point &&
          typeof point === "object" &&
          typeof point.x === "number" &&
          typeof point.y === "number" &&
          isFinite(point.x) &&
          isFinite(point.y)
      );

      if (validPoints.length < data.length) {
        this.logger.warn(
          "general",
          `Filtered out ${data.length - validPoints.length} invalid points`
        );
      }

      return {
        type: "FeatureCollection",
        features: validPoints.map((point) => ({
          type: "Feature",
          properties: { ...point },
          geometry: {
            type: "Point",
            coordinates: [point.x, point.y],
          },
        })),
      };
    } catch (error) {
      this.logger.error("general", "Error converting to GeoJSON", error);
      return { type: "FeatureCollection", features: [] };
    }
  }

  _initializeCluster(geoJsonFeatures, options = {}) {
    try {
      // Validate input
      if (!geoJsonFeatures || !Array.isArray(geoJsonFeatures)) {
        this.logger.error(
          "clusters",
          "Invalid GeoJSON features for clustering",
          geoJsonFeatures
        );
        // Return a minimal cluster with no data as fallback
        const emptyCluster = new Supercluster();
        emptyCluster.load([]);
        return emptyCluster;
      }

      // Filter out invalid features that could break clustering
      const validFeatures = geoJsonFeatures.filter(
        (feature) =>
          feature &&
          feature.geometry &&
          feature.geometry.type === "Point" &&
          Array.isArray(feature.geometry.coordinates) &&
          feature.geometry.coordinates.length >= 2 &&
          isFinite(feature.geometry.coordinates[0]) &&
          isFinite(feature.geometry.coordinates[1])
      );

      if (validFeatures.length < geoJsonFeatures.length) {
        this.logger.warn(
          "clusters",
          `Filtered out ${
            geoJsonFeatures.length - validFeatures.length
          } invalid features for clustering`
        );
      }

      this.logger.debug(
        "clusters",
        `Initializing cluster with ${validFeatures.length} features`
      );

      // Create cluster with defensive options
      const cluster = new Supercluster({
        radius: options.clusterRadius || this.options.clusterRadius || 40,
        maxZoom: options.maxZoom || this.options.maxZoom || 16,
        minPoints: options.minPoints || this.options.minPoints || 3,
        log: this.options.debug === true, // Enable Supercluster logging if in debug mode
        ...options.clusterOptions,
      });

      // Safely load features
      try {
        cluster.load(validFeatures);
        this.logger.debug("clusters", "Cluster initialized successfully");
      } catch (loadError) {
        this.logger.error(
          "clusters",
          "Error loading features into cluster",
          loadError
        );
        // Try with minimal features to avoid complete failure
        cluster.load([]);
      }

      return cluster;
    } catch (error) {
      this.logger.error(
        "clusters",
        "Critical error initializing cluster",
        error
      );

      // Provide a fallback empty cluster
      try {
        const fallbackCluster = new Supercluster();
        fallbackCluster.load([]);
        return fallbackCluster;
      } catch (fallbackError) {
        this.logger.error(
          "clusters",
          "Failed to create fallback cluster",
          fallbackError
        );
        // Return a mock object with required methods to prevent crashes
        return {
          getClusters: () => [],
          getClusterExpansionZoom: () => this.options.maxZoom,
        };
      }
    }
  }

  _updateMarkers(layerId) {
    try {
      const timeEnd = this.logger.time(
        "clusters",
        `Update markers for layer ${layerId}`
      );

      const layer = this.layers.get(layerId);
      const cluster = this.clusters.get(layerId);

      if (!layer || !cluster) {
        this.logger.warn(
          "clusters",
          `Cannot update markers: Layer or cluster not found for ${layerId}`
        );
        return false;
      }

      // Safety check: ensure map is defined and has valid bounds
      if (!this.map || !this.map.getBounds) {
        this.logger.error("clusters", "Map is not properly initialized");
        return false;
      }

      try {
        // Get current map bounds
        const bounds = this.map.getBounds();
        const zoom = Math.floor(this.map.getZoom());

        // Safety bounds check
        if (
          !bounds ||
          !bounds.getWest ||
          typeof bounds.getWest !== "function"
        ) {
          this.logger.error("clusters", "Invalid map bounds", bounds);
          return false;
        }

        // Get clusters within the current viewport
        const boundingBox = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ];

        // Check if any of the values are NaN or Infinity
        if (boundingBox.some((coord) => !isFinite(coord))) {
          this.logger.error(
            "clusters",
            "Invalid bounding box coordinates",
            boundingBox
          );
          return false;
        }

        this.logger.debug("clusters", "Getting clusters with bounds", {
          boundingBox,
          zoom,
        });

        // Get clusters from Supercluster
        let clusters;
        try {
          clusters = cluster.getClusters(boundingBox, zoom);
          this.logger.debug(
            "clusters",
            `Got ${clusters.length} clusters/points`
          );
        } catch (clusterError) {
          this.logger.error("clusters", "Error getting clusters", clusterError);
          return false;
        }

        // Cache layer references to avoid repeated lookups
        const existingMarkers = new Map();
        layer.eachLayer((marker) => {
          if (marker._leaflet_id) {
            existingMarkers.set(marker._leaflet_id, marker);
          }
        });

        // Clear existing layers with safety check
        if (typeof layer.clearLayers === "function") {
          layer.clearLayers();
        } else {
          this.logger.error(
            "layers",
            "Layer does not have clearLayers method",
            { layerId }
          );
          return false;
        }

        // Process each cluster/point
        clusters.forEach((clusterPoint) => {
          // Safety check for coordinates
          if (
            !Array.isArray(clusterPoint.geometry?.coordinates) ||
            clusterPoint.geometry.coordinates.length < 2 ||
            !isFinite(clusterPoint.geometry.coordinates[0]) ||
            !isFinite(clusterPoint.geometry.coordinates[1])
          ) {
            this.logger.warn(
              "clusters",
              "Invalid coordinates in cluster point",
              clusterPoint
            );
            return; // Skip this point
          }

          const [lng, lat] = clusterPoint.geometry.coordinates;

          // Handle cluster points
          if (clusterPoint.properties.cluster) {
            try {
              const marker = L.marker([lat, lng], {
                icon: this._createClusterIcon(
                  clusterPoint.properties.point_count
                ),
              });

              // Add cluster expansion click handler
              marker.on("click", () => {
                try {
                  // Check if the cluster has the getClusterExpansionZoom method
                  if (typeof cluster.getClusterExpansionZoom === "function") {
                    const expansionZoom = cluster.getClusterExpansionZoom(
                      clusterPoint.id
                    );
                    this.logger.debug(
                      "clusters",
                      `Expanding cluster to zoom ${expansionZoom}`
                    );
                    this.map.setView([lat, lng], expansionZoom);
                  } else {
                    // Fallback if method is missing
                    this.logger.warn(
                      "clusters",
                      "getClusterExpansionZoom method missing"
                    );
                    this.map.setView([lat, lng], this.map.getZoom() + 1);
                  }
                } catch (error) {
                  this.logger.error(
                    "clusters",
                    "Error expanding cluster",
                    error
                  );
                  // Fallback: just zoom in one level
                  this.map.setView([lat, lng], this.map.getZoom() + 1);
                }
              });

              layer.addLayer(marker);
            } catch (markerError) {
              this.logger.error(
                "clusters",
                "Error creating cluster marker",
                markerError
              );
            }
          } else {
            // Handle individual points
            try {
              // Default empty properties if missing
              const properties = clusterPoint.properties || {};

              const marker = L.marker([lat, lng], {
                icon: this._createMarkerIcon(properties),
              });

              // Add click handler for selection/deselection
              marker.on("click", () => {
                try {
                  if (!this.isSelectionMode) return;

                  // Toggle selection state
                  properties.selected = !properties.selected;

                  // Update marker appearance
                  marker.setIcon(this._createMarkerIcon(properties));

                  // Update the underlying data
                  const geoJsonData = this.geoJsonData.get(layerId);
                  if (geoJsonData && Array.isArray(geoJsonData.features)) {
                    const feature = geoJsonData.features.find(
                      (f) =>
                        f.geometry.coordinates[0] === lng &&
                        f.geometry.coordinates[1] === lat
                    );
                    if (feature) {
                      feature.properties.selected = properties.selected;
                    }

                    // Trigger onSelect callback if set
                    if (this.options.onSelect) {
                      const selectedFeatures = geoJsonData.features.filter(
                        (f) => f.properties.selected
                      );
                      this.options.onSelect(selectedFeatures);
                    }
                  }
                } catch (error) {
                  this.logger.error(
                    "selection",
                    "Error in marker click handler",
                    error
                  );
                }
              });

              if (properties) {
                try {
                  marker.bindPopup(this._createPopupContent(properties));
                } catch (popupError) {
                  this.logger.error(
                    "layers",
                    "Error binding popup",
                    popupError
                  );
                  // Fallback simple popup
                  marker.bindPopup("Error displaying data");
                }
              }

              layer.addLayer(marker);
            } catch (markerError) {
              this.logger.error(
                "layers",
                "Error creating point marker",
                markerError
              );
            }
          }
        });

        timeEnd();
        return true;
      } catch (error) {
        this.logger.error(
          "clusters",
          "Error in _updateMarkers core functionality",
          error
        );
        return false;
      }
    } catch (outerError) {
      this.logger.error(
        "clusters",
        "Critical error in _updateMarkers",
        outerError
      );
      return false;
    }
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

    // Store both current and original data for reset functionality
    this.geoJsonData.set(layerId, geoJsonData);

    // Store a deep copy of the original data
    const originalCopy = JSON.parse(JSON.stringify(geoJsonData));
    this.originalGeoJsonData.set(layerId, originalCopy);

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
    try {
      this.logger.info("general", "Destroying map instance");

      // Remove all event listeners
      this.eventListeners.forEach((updateFn, layerId) => {
        if (this.map && typeof this.map.off === "function") {
          this.map.off("moveend", updateFn);
          this.logger.debug(
            "events",
            `Removed event listener for layer ${layerId}`
          );
        }
      });

      // Remove all layers from the map first
      this.layers.forEach((layer, layerId) => {
        try {
          if (layer && typeof layer.remove === "function") {
            layer.remove();
            this.logger.debug("layers", `Removed layer ${layerId}`);
          }
        } catch (error) {
          this.logger.warn("layers", `Error removing layer ${layerId}`, error);
        }
      });

      // Remove controls
      if (this.layerControl && typeof this.layerControl.remove === "function") {
        this.layerControl.remove();
      }

      if (this.drawControl && typeof this.drawControl.remove === "function") {
        this.drawControl.remove();
      }

      if (
        this.clearSelectionButton &&
        typeof this.clearSelectionButton.remove === "function"
      ) {
        this.clearSelectionButton.remove();
      }

      // Clear all data structures
      this.layers.clear();
      this.clusters.clear();
      this.eventListeners.clear();
      this.baseLayers.clear();
      this.overlayLayers.clear();
      this.geoJsonData.clear();
      this.originalGeoJsonData.clear(); // Make sure to clear this too

      // Finally remove the map
      if (this.map && typeof this.map.remove === "function") {
        this.map.remove();
        this.logger.debug("general", "Map instance removed");
      }

      // Reset initialization flag
      this.mapInitialized = false;

      this.logger.info("general", "Map destruction complete");
    } catch (error) {
      this.logger.error("general", "Error during map destruction", error);
      // Continue with cleanup even if there's an error
    }
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

      // Show clear selection button
      this.clearSelectionButton.addTo(this.map);

      // Update button state
      const selButton = document.querySelector(".selection-button a");
      if (selButton) {
        selButton.classList.add("active");
      }
    } else {
      // Disable selection mode
      this.map.removeControl(this.drawControl);

      // Re-enable other interactions
      this.layers.forEach((layer, layerId) => {
        this._updateMarkers(layerId);
      });

      // Hide clear selection button
      this.clearSelectionButton.remove();

      // Update button state
      const selButton = document.querySelector(".selection-button a");
      if (selButton) {
        selButton.classList.remove("active");
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

  /**
   * Resets the map to its initial state
   * Optimized for performance with large datasets
   * @param {Object} options - Reset options
   * @param {Array<string>} options.layerIds - Specific layer IDs to reset (all layers if not specified)
   * @param {boolean} options.resetView - Whether to reset the map view to initial bounds (default: false)
   * @returns {boolean} - Success status
   */
  resetMap(options = {}) {
    const { layerIds, resetView = false } = options;
    const layersToReset = layerIds
      ? layerIds.filter((id) => this.layers.has(id))
      : Array.from(this.layers.keys());

    if (layersToReset.length === 0) return false;

    // Structure-sharing approach - more memory efficient than deep cloning
    layersToReset.forEach((layerId) => {
      const originalData = this.originalGeoJsonData.get(layerId);
      if (!originalData) return;

      // Create a shallow copy of the original data
      const resetData = {
        type: originalData.type,
        // Create new features array with shallow copies of each feature
        features: originalData.features.map((feature) => ({
          type: feature.type,
          geometry: feature.geometry,
          // Only clone the properties object since that's where changes occur
          properties: { ...feature.properties },
        })),
      };

      // Replace current data with reset data
      this.geoJsonData.set(layerId, resetData);

      // Rebuild only the clusters that need updating
      const cluster = this._initializeCluster(resetData.features);
      this.clusters.set(layerId, cluster);

      // Update markers for this layer
      this._updateMarkers(layerId);
    });

    // Reset map view if specified
    if (resetView && this.dataBounds && this.dataBounds.isValid()) {
      this.map.fitBounds(this.dataBounds, { padding: [50, 50] });
    }

    return true;
  }

  /**
   * Programmatically selects points based on IDs or a filter function
   * @param {string} layerId - The ID of the layer to select points from
   * @param {Object} options - Selection options
   * @param {Array<string|number>} options.ids - Array of IDs to select
   * @param {string} options.idField - Field name to match IDs against (default: "id")
   * @param {Function} options.filterFn - Custom filter function that receives feature.properties
   * @returns {Array} - The selected features
   */
  setSelectedData(layerId, options = {}) {
    const geoJsonData = this.geoJsonData.get(layerId);
    if (!geoJsonData) return [];

    const { ids, idField = "id", filterFn } = options;

    // Clear any current selection
    geoJsonData.features.forEach((feature) => {
      feature.properties.selected = false;
    });

    // Apply selection based on IDs or filter function
    if (Array.isArray(ids) && ids.length > 0) {
      geoJsonData.features.forEach((feature) => {
        if (ids.includes(feature.properties[idField])) {
          feature.properties.selected = true;
        }
      });
    } else if (typeof filterFn === "function") {
      geoJsonData.features.forEach((feature) => {
        if (filterFn(feature.properties)) {
          feature.properties.selected = true;
        }
      });
    }

    // Update the map visualization
    this._updateMarkers(layerId);

    // Return selected features for convenience
    const selectedFeatures = geoJsonData.features.filter(
      (feature) => feature.properties.selected
    );

    // Trigger onSelect callback if set
    if (this.options.onSelect) {
      this.options.onSelect(selectedFeatures);
    }

    return selectedFeatures;
  }

  /**
   * Apply a custom filter to the map data, showing only points that match criteria
   * @param {string} layerId - The ID of the layer to filter
   * @param {Object} options - Filter options
   * @param {Array<string|number>} options.ids - Array of IDs to include
   * @param {string} options.idField - Field name to match IDs against (default: "id")
   * @param {Function} options.filterFn - Custom filter function that receives feature.properties
   * @param {boolean} options.updateOriginal - Whether to update the original data (default: false)
   * @returns {Array} - The filtered features
   */
  setFilteredData(layerId, options = {}) {
    const geoJsonData = this.geoJsonData.get(layerId);
    if (!geoJsonData) return [];

    const { ids, idField = "id", filterFn, updateOriginal = false } = options;

    let filteredFeatures = [];

    // Apply filtering based on IDs or filter function
    if (Array.isArray(ids) && ids.length > 0) {
      filteredFeatures = geoJsonData.features.filter((feature) =>
        ids.includes(feature.properties[idField])
      );
    } else if (typeof filterFn === "function") {
      filteredFeatures = geoJsonData.features.filter((feature) =>
        filterFn(feature.properties)
      );
    } else {
      return geoJsonData.features; // Nothing to filter by
    }

    // Create a new filtered GeoJSON
    const filteredGeoJson = {
      type: "FeatureCollection",
      features: filteredFeatures,
    };

    // Update the internal data structure
    if (updateOriginal) {
      this.originalGeoJsonData.set(layerId, this.geoJsonData.get(layerId));
    }
    this.geoJsonData.set(layerId, filteredGeoJson);

    // Update the cluster and markers
    const cluster = this._initializeCluster(filteredFeatures);
    this.clusters.set(layerId, cluster);
    this._updateMarkers(layerId);

    // Trigger onFilter callback if set
    if (this.options.onFilter) {
      this.options.onFilter(filteredFeatures);
    }

    return filteredFeatures;
  }

  /**
   * Updates the dimensions of the map container after initialization
   * @param {string|number} width - New width as number (pixels) or CSS string (e.g. '100%')
   * @param {string|number} height - New height as number (pixels) or CSS string (e.g. '400px')
   */
  setDimensions(width, height) {
    // Convert numeric values to pixel strings
    const widthValue = typeof width === "number" ? `${width}px` : width;
    const heightValue = typeof height === "number" ? `${height}px` : height;

    // Update container dimensions
    if (width) this.container.style.width = widthValue;
    if (height) this.container.style.height = heightValue;

    // Invalidate size to force Leaflet to recalculate dimensions
    this.map.invalidateSize();

    // Update stored options
    if (width) this.options.width = width;
    if (height) this.options.height = height;
  }

  /**
   * Check if the map is in a valid state and ready for operations
   * @private
   * @returns {boolean} Whether the map is ready
   */
  _isMapReady() {
    return (
      this.mapInitialized &&
      this.map &&
      typeof this.map.getBounds === "function" &&
      typeof this.map.getZoom === "function"
    );
  }

  /**
   * Safe version of addLayer that handles errors and falls back if the map isn't ready
   * @param {string} layerId - The ID for the new layer
   * @param {Array} data - Array of data points with x, y coordinates
   * @param {Object} options - Options for the layer
   * @returns {Promise<boolean>} - Success status
   */
  addLayerSafe(layerId, data, options = {}) {
    return new Promise((resolve) => {
      try {
        this.logger.info(
          "layers",
          `Adding layer ${layerId} with ${data?.length || 0} points`
        );

        // Validate inputs
        if (!layerId || typeof layerId !== "string") {
          this.logger.error("layers", "Invalid layerId", { layerId });
          resolve(false);
          return;
        }

        if (!data || !Array.isArray(data) || data.length === 0) {
          this.logger.warn("layers", `No valid data for layer ${layerId}`);
          // Could still create an empty layer, so we continue
        }

        // Check if map is ready
        if (!this._isMapReady()) {
          this.logger.warn("layers", "Map not ready, queuing layer addition", {
            layerId,
          });

          // Queue the addition for when map is ready
          this.pendingActions.push(() => {
            this.addLayer(layerId, data, options);
            resolve(true);
          });
          return;
        }

        // Call the original method
        this.addLayer(layerId, data, options);
        resolve(true);
      } catch (error) {
        this.logger.error("layers", `Error adding layer ${layerId}`, error);
        resolve(false);
      }
    });
  }

  /**
   * Recover map state after error or invalid operation
   * @param {Object} options - Recovery options
   * @returns {Promise<boolean>} - Success status
   */
  recoverMapState(options = {}) {
    return new Promise((resolve) => {
      try {
        this.logger.info("general", "Attempting to recover map state", options);

        // Check if map exists
        if (!this.map) {
          this.logger.error(
            "general",
            "Cannot recover: map instance does not exist"
          );
          resolve(false);
          return;
        }

        // Force refresh visible layers
        this.layers.forEach((layer, layerId) => {
          try {
            this._updateMarkers(layerId);
            this.logger.debug("layers", `Refreshed layer ${layerId}`);
          } catch (error) {
            this.logger.error(
              "layers",
              `Error refreshing layer ${layerId}`,
              error
            );
          }
        });

        // Ensure a base layer is active
        if (!this.activeBaseLayer && this.baseLayers.size > 0) {
          const firstBaseLayer = Array.from(this.baseLayers.keys())[0];
          this.setBaseLayer(firstBaseLayer);
        }

        // Force a map redraw by invalidating size
        this.map.invalidateSize(true);

        // Reset view if needed
        if (options.resetView && this.dataBounds && this.dataBounds.isValid()) {
          this.map.fitBounds(this.dataBounds, { padding: [50, 50] });
        }

        // Recreate layer control
        this._updateLayerControl();

        this.logger.info("general", "Map state recovery complete");
        resolve(true);
      } catch (error) {
        this.logger.error("general", "Error recovering map state", error);
        resolve(false);
      }
    });
  }

  /**
   * Enable or disable debug logging
   * @param {boolean} enabled - Whether to enable logging
   * @param {Object} options - Additional logging options
   * @returns {this} - For method chaining
   */
  setDebugLogging(enabled, options = {}) {
    this.options.debug = !!enabled;

    this.logger.setEnabled(enabled);

    if (options.level) {
      this.logger.setLevel(options.level);
    }

    if (Array.isArray(options.categories)) {
      this.logger.enableCategories(options.categories);
    }

    this.logger.info(
      "general",
      `Debug logging ${enabled ? "enabled" : "disabled"}`,
      {
        level: this.logger.options.level,
        categories: this.logger.options.enabledCategories,
      }
    );

    return this;
  }
}
