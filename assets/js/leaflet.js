/* Copyright (c) 2025-2026 Jericho Crosby (Chalwk) */

/*
 * Shared Leaflet helpers used across CPAS.
 *
 *   - createMap()          - build a Leaflet map with OSM tiles.
 *   - createLayerGroup()   - convenience for grouping layers.
 *   - drawBoundary()       - dashed polygon + soft fill + vertex dots.
 *   - drawRoute()          - polyline, optionally dashed.
 *   - drawLoop()           - dashed ring for round trips.
 *   - drawAirportMarker()  - solid/hollow airfield dot.
 *   - initRegionMaps()     - auto-inits every [data-region-map] canvas.
 *
 * Region maps are configured entirely through data-* attributes emitted by
 * _includes/region_map.html. Route/loop/marker helpers are consumed by
 * flight_centre.js (Flight Centre route map + route-map modal).
 */

(function () {
    'use strict';

    var DEFAULTS = {
        tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
        minZoom: 4,
        defaultCenter: [-43.5, 171.0],
        defaultZoom: 6
    };

    var COLORS = {
        primary: '#1a365d',
        secondary: '#2d6bc9',
        marker: '#1a365d',
        difficulty: {
            1: '#059669', // Easy
            2: '#0891b2', // Light
            3: '#2d6bc9', // Moderate
            4: '#f59e0b', // Challenging
            5: '#dc2626'  // Expert
        }
    };

    function isLeafletReady() {
        return typeof window.L !== 'undefined';
    }

    function parseJSONAttr(el, name, fallback) {
        var raw = el.getAttribute(name);
        if (!raw) return fallback;
        try { return JSON.parse(raw); } catch (e) { return fallback; }
    }

    // ---- Map creation ---------------------------------------------------

    function createMap(container, options) {
        options = options || {};
        if (!container || !isLeafletReady()) return null;

        // Reuse the same map if the container was already initialised.
        if (container._cpasMap) return container._cpasMap;

        var L = window.L;

        var map = L.map(container, {
            center: options.center || DEFAULTS.defaultCenter,
            zoom: options.zoom != null ? options.zoom : DEFAULTS.defaultZoom,
            scrollWheelZoom: options.scrollWheelZoom !== false,
            zoomControl: options.zoomControl !== false,
            attributionControl: options.attributionControl !== false,
            worldCopyJump: false
        });

        L.tileLayer(options.tileUrl || DEFAULTS.tileUrl, {
            maxZoom: options.maxZoom != null ? options.maxZoom : DEFAULTS.maxZoom,
            minZoom: options.minZoom != null ? options.minZoom : DEFAULTS.minZoom,
            attribution: options.tileAttribution || DEFAULTS.tileAttribution
        }).addTo(map);

        container._cpasMap = map;

        // Give the layout a tick to settle (fonts, container width).
        window.setTimeout(function () { map.invalidateSize(); }, 120);

        return map;
    }

    function createLayerGroup(map) {
        if (!isLeafletReady()) return null;
        var group = window.L.layerGroup();
        if (map) group.addTo(map);
        return group;
    }

    // ---- Drawing primitives --------------------------------------------

    // boundary: [[lat, lon], [lat, lon], ...]  (first point == last point)
    function drawBoundary(map, boundary, options) {
        options = options || {};
        if (!map || !Array.isArray(boundary) || boundary.length < 2) return null;

        var L = window.L;
        var color = options.color || COLORS.secondary;

        var latlngs = boundary.map(function (p) { return [p[0], p[1]]; });

        var outline = L.polyline(latlngs, {
            color: color,
            weight: options.weight != null ? options.weight : 3,
            opacity: options.opacity != null ? options.opacity : 0.9,
            dashArray: options.dashArray || '6 8',
            lineCap: 'round',
            lineJoin: 'round'
        });
        outline.addTo(options.group || map);

        if (options.fill !== false) {
            L.polygon(latlngs, {
                color: color,
                weight: 0,
                fillColor: options.fillColor || color,
                fillOpacity: options.fillOpacity != null ? options.fillOpacity : 0.08,
                interactive: false
            }).addTo(options.group || map);
        }

        if (options.vertices !== false) {
            var vertexColor = options.vertexColor || COLORS.primary;
            latlngs.forEach(function (pt) {
                L.circleMarker(pt, {
                    radius: options.vertexRadius != null ? options.vertexRadius : 3.5,
                    color: '#ffffff',
                    weight: 2,
                    fillColor: vertexColor,
                    fillOpacity: 1
                }).addTo(options.group || map);
            });
        }

        if (options.fitBounds !== false && !options.center) {
            map.fitBounds(outline.getBounds(), { padding: [24, 24] });
        }

        return outline;
    }

    // points accepts either:
    //   [[lat, lon], ...]                    - single leg
    //   [[[lat, lon], [lat, lon]], ...]      - multiple legs
    function drawRoute(map, points, options) {
        options = options || {};
        if (!map || !Array.isArray(points) || points.length === 0) return null;

        var L = window.L;

        var style = {
            color: options.color || COLORS.secondary,
            weight: options.weight != null ? options.weight : 3,
            opacity: options.opacity != null ? options.opacity : 0.75,
            lineCap: 'round',
            lineJoin: 'round'
        };

        if (options.dashed) {
            style.dashArray = options.dashArray || '6 8';
        }

        var line = L.polyline(points, style);
        line.addTo(options.group || map);
        return line;
    }

    // Dashed ring around a base airfield (round trip).
    function drawLoop(map, latlng, options) {
        options = options || {};
        if (!map || !latlng) return null;

        var L = window.L;

        var marker = L.circleMarker(latlng, {
            radius: options.radius != null ? options.radius : 12,
            color: options.color || COLORS.secondary,
            weight: options.weight != null ? options.weight : 3,
            opacity: options.opacity != null ? options.opacity : 0.75,
            fill: false,
            dashArray: options.dashArray || '4 4'
        });

        marker.addTo(options.group || map);
        return marker;
    }

    // Solid navy dot for airfields the route actually flies to.
    // Hollow dot for alternates / optional stops.
    function drawAirportMarker(map, latlng, options) {
        options = options || {};
        if (!map || !latlng) return null;

        var L = window.L;
        var isAlternate = options.alternate === true;

        var marker = L.circleMarker(latlng, {
            radius: options.radius != null ? options.radius : 4,
            color: isAlternate ? COLORS.marker : '#ffffff',
            weight: 2,
            fillColor: isAlternate ? '#ffffff' : COLORS.marker,
            fillOpacity: 1
        });

        marker.addTo(options.group || map);
        return marker;
    }

    // ---- Region map auto-init ------------------------------------------

    // Reads data-boundary / data-center / data-zoom from every
    // [data-region-map] .region-map-canvas element on the page.
    function initRegionMaps(root) {
        if (!isLeafletReady()) return;

        var scope = root || document;
        var canvases = scope.querySelectorAll('[data-region-map] .region-map-canvas');

        Array.prototype.forEach.call(canvases, function (canvas) {
            if (canvas._cpasMap) return;

            var boundary = parseJSONAttr(canvas, 'data-boundary', null);
            if (!Array.isArray(boundary) || boundary.length < 2) return;

            var center = parseJSONAttr(canvas, 'data-center', null);
            var zoom = parseInt(canvas.getAttribute('data-zoom'), 10) || 10;

            var map = createMap(canvas, {
                center: center || DEFAULTS.defaultCenter,
                zoom: zoom
            });
            if (!map) return;

            drawBoundary(map, boundary, {
                center: center || undefined
            });
        });
    }

    function initAll() {
        initRegionMaps(document);
    }

    // ---- Public API ----------------------------------------------------

    window.CPASLeaflet = {
        DEFAULTS: DEFAULTS,
        COLORS: COLORS,
        createMap: createMap,
        createLayerGroup: createLayerGroup,
        drawBoundary: drawBoundary,
        drawRoute: drawRoute,
        drawLoop: drawLoop,
        drawAirportMarker: drawAirportMarker,
        initRegionMaps: initRegionMaps,
        initAll: initAll
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
    } else {
        initAll();
    }
})();