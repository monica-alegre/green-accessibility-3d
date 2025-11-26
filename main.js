// Load FlatGeobuf dynamically from Skypack CDN
const flatgeobuf = await import('https://cdn.skypack.dev/flatgeobuf');

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Data paths
const DATA_DIR = './data/barcelona';
const PARCELS_URL = `${DATA_DIR}/parcels_barcelona.fgb`;
const ROUTES_URL = `${DATA_DIR}/routes_barcelona.fgb`;
const GREEN_AREAS_URL = `${DATA_DIR}/green_areas_barcelona.geojson`;
const GREEN_STRUCTURES_URL = `${DATA_DIR}/green_structures_barcelona.geojson`;
const BOUNDARY_URL = `${DATA_DIR}/boundary_barcelona.geojson`;

// Slider configuration
const INITIAL_MIN = 1;

// Initialize map
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'carto-dark': {
        type: 'raster',
        tiles: ['https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      },
      'carto-dark-labels': {
        type: 'raster',
        tiles: ['https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png'],
        tileSize: 256
      }
    },
    layers: [
      { id: 'basemap', type: 'raster', source: 'carto-dark' },
      {
        id: 'basemap-labels',
        type: 'raster',
        source: 'carto-dark-labels',
        minzoom: 16,
        paint: {
          'raster-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            16, 0,
            17, 1
          ]
        }
      }
    ]
  },
  center: [2.17, 41.39],
  zoom: 15,
  pitch: 60,
  bearing: -20,
  antialias: true
});

const tooltip = document.getElementById('tooltip');

// Add navigation control with custom styling (black background)
map.addControl(new maplibregl.NavigationControl({
  showCompass: true,
  showZoom: true,
  visualizePitch: true
}), 'top-right');

// Add geocoder/search control
class GeocoderControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group geocoder-control';
    this._container.innerHTML = `
      <div class="geocoder-wrapper">
        <input type="text" class="geocoder-input" placeholder="Search address..." />
        <div class="geocoder-results"></div>
      </div>
    `;

    const input = this._container.querySelector('.geocoder-input');
    const results = this._container.querySelector('.geocoder-results');

    let debounceTimer;
    input.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value.trim();

      if (query.length < 3) {
        results.innerHTML = '';
        results.style.display = 'none';
        return;
      }

      debounceTimer = setTimeout(async () => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?` +
            `format=json&q=${encodeURIComponent(query + ' Barcelona')}&` +
            `limit=5&bounded=1&viewbox=2.0524,41.3201,2.2281,41.4695`
          );
          const data = await response.json();

          if (data.length === 0) {
            results.innerHTML = '<div class="geocoder-result">No results found</div>';
            results.style.display = 'block';
            return;
          }

          results.innerHTML = data.map(item =>
            `<div class="geocoder-result" data-lon="${item.lon}" data-lat="${item.lat}">
              ${item.display_name}
            </div>`
          ).join('');
          results.style.display = 'block';

          // Add click handlers
          results.querySelectorAll('.geocoder-result').forEach(el => {
            el.addEventListener('click', () => {
              const lon = parseFloat(el.dataset.lon);
              const lat = parseFloat(el.dataset.lat);
              map.flyTo({ center: [lon, lat], zoom: 17 });
              input.value = el.textContent.trim();
              results.innerHTML = '';
              results.style.display = 'none';
            });
          });
        } catch (error) {
          console.error('Geocoding error:', error);
          results.innerHTML = '<div class="geocoder-result">Search error</div>';
          results.style.display = 'block';
        }
      }, 300);
    });

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
      if (!this._container.contains(e.target)) {
        results.innerHTML = '';
        results.style.display = 'none';
      }
    });

    return this._container;
  }

  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
}

map.addControl(new GeocoderControl(), 'top-left');

// Helper to stream FlatGeobuf using bounding box
async function loadFGB(url, mapBbox = null) {
  try {
    const { deserialize } = flatgeobuf.geojson;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Convert bbox to FlatGeobuf format if provided: {minX, minY, maxX, maxY}
    const bbox = mapBbox
      ? {
          minX: mapBbox.getWest(),
          minY: mapBbox.getSouth(),
          maxX: mapBbox.getEast(),
          maxY: mapBbox.getNorth()
        }
      : null;

    const iter = deserialize(response.body, bbox);
    const features = [];
    let idCounter = 0;

    for await (const feature of iter) {
      // Add unique ID if not present
      if (!feature.id) {
        feature.id = idCounter++;
      }
      features.push(feature);
    }

    return {
      type: 'FeatureCollection',
      features: features
    };
  } catch (error) {
    console.error(`[loadFGB] Failed to load ${url}:`, error);
    return { type: 'FeatureCollection', features: [] };
  }
}

map.on('load', async () => {
  // Green areas fill layer
  map.addSource('green_areas', { type: 'geojson', data: GREEN_AREAS_URL });
  map.addLayer({
    id: 'green-areas-fill',
    type: 'fill-extrusion',
    source: 'green_areas',
    paint: {
      'fill-extrusion-color': '#10B981',
      'fill-extrusion-opacity': 0.85,
      'fill-extrusion-height': 0.5,
      'fill-extrusion-base': 0
    }
  });

  // Green area outline/structure layer
  map.addSource('green_structures', { type: 'geojson', data: GREEN_STRUCTURES_URL });
  map.addLayer({
    id: 'green-structures-line',
    type: 'line',
    source: 'green_structures',
    paint: {
      'line-color': '#059669',
      'line-width': 2,
      'line-opacity': 0.9
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    }
  });

  // Barcelona boundary
  map.addSource('boundary', { type: 'geojson', data: BOUNDARY_URL });
  map.addLayer({
    id: 'boundary-line',
    type: 'line',
    source: 'boundary',
    paint: {
      'line-color': '#ffffff',
      'line-width': 2,
      'line-opacity': 0.6
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    }
  });

  // Parcels (FlatGeobuf with spatial index)
  // Initially load all parcels to show full Barcelona
  const parcels = await loadFGB(PARCELS_URL, null);
  map.addSource('parcels', {
    type: 'geojson',
    data: parcels,
    generateId: true
  });

  map.addLayer({
    id: 'parcels-3d',
    type: 'fill-extrusion',
    source: 'parcels',
    filter: ['<=', ['coalesce', ['get', 'walk_time'], 999], 42],
    paint: {
      'fill-extrusion-height': [
        'case',
        ['>', ['get', 'population'], 0],
        ['*', ['get', 'population'], 0.8],
        0.5
      ],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.9,
      'fill-extrusion-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#f87171',  // Coral red for selected building (matches pause button)
        ['boolean', ['feature-state', 'hover'], false],
        '#FFFFFF',  // White border/highlight on hover
        ['has', 'walk_time'],
        ['interpolate', ['linear'], ['coalesce', ['get', 'walk_time'], 42],
          0, '#4A148C',    // Deep purple (0 min - CLOSE)
          3, '#6A1B9A',    // Purple (3 min)
          6, '#8E24AA',    // Medium purple (6 min)
          10, '#AB47BC',   // Light purple (10 min)
          15, '#CE93D8',   // Lavender (15 min)
          25, '#E1BEE7',   // Pale lavender (25 min)
          42, '#F3E5F5'    // Very pale lavender (42 min - FAR)
        ],
        '#27272a'  // Gray for parcels without walk_time
      ]
    }
  });

  // Variable to track selected parcel and hovered parcel
  let selectedParcelId = null;
  let hoveredParcelId = null;

  // Update parcels dynamically when moving or zooming (with bbox for performance)
  // No debounce here to keep selection responsive
  map.on('moveend', async () => {
    const bbox = map.getBounds();
    const parcels = await loadFGB(PARCELS_URL, bbox);
    map.getSource('parcels').setData(parcels);
  });

  // Add hover effect to buildings
  map.on('mousemove', 'parcels-3d', (e) => {
    if (e.features.length > 0) {
      if (hoveredParcelId !== null) {
        map.setFeatureState(
          { source: 'parcels', id: hoveredParcelId },
          { hover: false }
        );
      }
      hoveredParcelId = e.features[0].id;
      map.setFeatureState(
        { source: 'parcels', id: hoveredParcelId },
        { hover: true }
      );
      map.getCanvas().style.cursor = 'pointer';
    }
  });

  map.on('mouseleave', 'parcels-3d', () => {
    if (hoveredParcelId !== null) {
      map.setFeatureState(
        { source: 'parcels', id: hoveredParcelId },
        { hover: false }
      );
    }
    hoveredParcelId = null;
    map.getCanvas().style.cursor = '';
  });

  // Empty source for selected routes with lineMetrics enabled for gradient
  map.addSource('routes-selected', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    lineMetrics: true
  });

  map.addSource('route-points', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });

  map.addLayer({
    id: 'routes-line',
    type: 'line',
    source: 'routes-selected',
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },
    paint: {
      'line-width': 3,
      'line-opacity': 0.95,
      'line-gradient': [
        'interpolate',
        ['linear'],
        ['line-progress'],
        0, '#f87171',    // Coral red (start - matches selected building)
        0.5, '#fb923c',  // Orange (middle)
        1, '#FFCD93'     // Peach (end)
      ]
    }
  });

  map.addLayer({
    id: 'route-endpoints',
    type: 'circle',
    source: 'route-points',
    paint: {
      'circle-radius': 6,
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 1
    }
  });

  // Tooltip for green areas
  map.on('mousemove', 'green-areas-fill', (e) => {
    const f = e.features?.[0];
    if (!f) return hideTip();
    const name = f.properties.green_area_name || '—';
    const area = (f.properties.green_area_m2 || 0) + ' m²';
    const icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="#10B981"><circle cx="12" cy="8" r="5"/><circle cx="8" cy="10" r="4"/><circle cx="16" cy="10" r="4"/><rect x="11" y="13" width="2" height="8"/></svg>';
    showTip(e.point.x, e.point.y, `<div style="display:flex;align-items:center;gap:10px;">${icon}<div><b>${name}</b><br><span style="font-size:11px;opacity:0.7;">${area}</span></div></div>`, 'park');
  });
  map.on('mouseleave', 'green-areas-fill', hideTip);

  // Tooltip for parcels
  map.on('mousemove', 'parcels-3d', (e) => {
    const f = e.features?.[0];
    if (!f) return hideTip();
    const cad = f.properties.cadastral_parcel || f.properties.parcel_id;
    const pop = f.properties.population ?? 0;
    const walkTime = f.properties.walk_time ? `${f.properties.walk_time} min` : '—';
    const icon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="#AB47BC"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`;
    showTip(e.point.x, e.point.y, `<div style="display:flex;align-items:center;gap:10px;">${icon}<div><div style="font-weight:500;margin-bottom:2px;">Parcel ${cad}</div><span style="font-size:11px;opacity:0.7;">Population: ${pop}<br>Walk time: ${walkTime}</span></div></div>`, 'parcel');
  });
  map.on('mouseleave', 'parcels-3d', hideTip);

  // Tooltip for routes
  map.on('mousemove', 'routes-line', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const f = e.features?.[0];
    if (!f) return hideTip();
    const walkTime = f.properties?.walk_time ?? '—';
    const walkDist = f.properties?.walk_distance ? `${f.properties.walk_distance.toLocaleString()} m` : '—';
    const icon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>';
    showTip(e.point.x, e.point.y, `<div style="display:flex;align-items:center;gap:10px;">${icon}<div><b>Route</b><br><span style="font-size:11px;opacity:0.7;">Time: ${walkTime} min<br>Distance: ${walkDist}</span></div></div>`, 'route');
  });
  map.on('mouseleave', 'routes-line', () => {
    map.getCanvas().style.cursor = '';
    hideTip();
  });

  // Click on parcel -> load routes filtered by parcel_id
  map.on('click', 'parcels-3d', async (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const parcelId = f.properties.parcel_id;
    if (!parcelId) return;

    // If clicking the same parcel, toggle route visibility
    if (selectedParcelId === f.id) {
      // Hide routes
      map.getSource('routes-selected').setData({ type: 'FeatureCollection', features: [] });
      map.getSource('route-points').setData({ type: 'FeatureCollection', features: [] });
      // Clear selection
      map.removeFeatureState({ source: 'parcels', id: selectedParcelId });
      selectedParcelId = null;
      return;
    }

    // Clear previous selection
    if (selectedParcelId !== null) {
      map.removeFeatureState({ source: 'parcels', id: selectedParcelId });
    }

    // Set new selection using feature-state (no geometry duplication)
    selectedParcelId = f.id;
    map.setFeatureState(
      { source: 'parcels', id: selectedParcelId },
      { selected: true }
    );

    try {
      // Load routes and filter by parcel_id
      const { deserialize } = flatgeobuf.geojson;
      const response = await fetch(ROUTES_URL);
      if (!response.ok) {
        console.error('Failed to load routes');
        return;
      }

      const features = [];

      // Load all routes and filter by parcel_id
      for await (const feat of deserialize(response.body, null)) {
        if (feat.properties.parcel_id === parcelId) {
          features.push(feat);
        }
      }

      const gj = { type: 'FeatureCollection', features };
      map.getSource('routes-selected').setData(gj);

      // Extract start and end points from routes
      const points = [];
      features.forEach((feat, idx) => {
        if (!feat.geometry || !feat.geometry.coordinates) return;

        // Get coordinates and normalize based on geometry type
        let coords = feat.geometry.coordinates;

        if (feat.geometry.type === 'MultiLineString') {
          if (!coords || !coords.length || !coords[0]) return;
          coords = coords[0]; // first LineString inside the MultiLineString
        } else if (feat.geometry.type !== 'LineString') {
          return; // Skip unsupported geometry types
        }

        if (!coords || coords.length < 2) return;

        const start = coords[0];
        const end = coords[coords.length - 1];

        // Validate coordinates are valid [lon, lat] pairs
        if (Array.isArray(start) && start.length >= 2 && !isNaN(start[0]) && !isNaN(start[1])) {
          points.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [start[0], start[1]] },
            properties: {
              color: '#f87171',  // Coral red (matches gradient start and selected building)
              type: 'start',
              routeIndex: idx
            }
          });
        }

        if (Array.isArray(end) && end.length >= 2 && !isNaN(end[0]) && !isNaN(end[1])) {
          points.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [end[0], end[1]] },
            properties: {
              color: '#FFCD93',  // Peach (matches gradient end)
              type: 'end',
              routeIndex: idx
            }
          });
        }
      });

      map.getSource('route-points').setData({
        type: 'FeatureCollection',
        features: points
      });
    } catch (error) {
      console.error('Error loading routes:', error);
    }
  });

  // Slider - filter parcels by walk_time
  const slider = document.getElementById('timeSlider');
  const timeVal = document.getElementById('timeVal');
  const playButton = document.getElementById('playButton');
  slider.value = INITIAL_MIN;
  timeVal.textContent = INITIAL_MIN;

  // Update filter function
  const updateParcelFilter = (v) => {
    map.setFilter('parcels-3d', ['<=', ['coalesce', ['get', 'walk_time'], 999], v]);
  };

  // Debounced version for better performance
  const debouncedUpdateFilter = debounce(updateParcelFilter, 150);

  // Update slider gradient on input
  const updateSliderGradient = (value) => {
    const percent = ((value - 1) / (42 - 1)) * 100;
    slider.style.background = `linear-gradient(to right, #ffffff ${percent}%, #d1d5db ${percent}%)`;
  };

  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    timeVal.textContent = v;
    updateSliderGradient(v);
    debouncedUpdateFilter(v);
  });

  // Initialize slider gradient
  updateSliderGradient(INITIAL_MIN);

  // Play/pause functionality
  let isPlaying = false;
  let playInterval = null;

  playButton.addEventListener('click', () => {
    if (isPlaying) {
      // Stop playing
      clearInterval(playInterval);
      isPlaying = false;
      playButton.textContent = '▶';
      playButton.classList.remove('playing');
    } else {
      // Start playing from beginning
      slider.value = 1;
      timeVal.textContent = 1;
      updateSliderGradient(1);
      updateParcelFilter(1);
      isPlaying = true;
      playButton.textContent = '⏸';
      playButton.classList.add('playing');

      playInterval = setInterval(() => {
        const current = Number(slider.value);
        if (current >= 42) {
          // Reached the end, stop
          clearInterval(playInterval);
          isPlaying = false;
          playButton.textContent = '▶';
          playButton.classList.remove('playing');
        } else if (current >= 20) {
          // Jump from 20 to 42 (end)
          slider.value = 42;
          timeVal.textContent = 42;
          updateSliderGradient(42);
          updateParcelFilter(42);
          clearInterval(playInterval);
          isPlaying = false;
          playButton.textContent = '▶';
          playButton.classList.remove('playing');
        } else {
          const next = current + 1;
          slider.value = next;
          timeVal.textContent = next;
          updateSliderGradient(next);
          updateParcelFilter(next);
        }
      }, 500); // Advance every 500ms
    }
  });

  // Track active popups to prevent duplicates
  let activeUserGuidePopup = null;
  let activeAboutPopup = null;

  // User Guide button functionality
  const userGuideButton = document.getElementById('userGuideButton');
  userGuideButton.addEventListener('click', () => {
    // Close if already open, or close other popup and open this one
    if (activeUserGuidePopup) {
      activeUserGuidePopup.remove();
      activeUserGuidePopup = null;
      return;
    }

    // Close About popup if open
    if (activeAboutPopup) {
      activeAboutPopup.remove();
      activeAboutPopup = null;
    }

    const guideContent = `
      <div style="background:#1E1F21;padding:16px;border-radius:0;">
        <h3 style="margin:0 0 12px 0;color:#ffffff;font-size:16px;font-weight:600;">How to use the viewer</h3>
        <div style="font-size:12px;line-height:1.7;color:#d1d5db;">
          <p style="margin:0 0 10px 0;"><strong style="color:#fff;">Rotate / Zoom</strong> – Navigate the 3D city with your mouse or touchpad.</p>
          <p style="margin:0 0 10px 0;"><strong style="color:#fff;">Hover parcels</strong> – See cadastral ID and estimated population.</p>
          <p style="margin:0 0 10px 0;"><strong style="color:#fff;">Click a parcel</strong> – Display walking route(s) to nearest green area (click again to hide).</p>
          <p style="margin:0 0 10px 0;"><strong style="color:#fff;">Hover green areas</strong> – View park name and surface area.</p>
          <p style="margin:0 0 10px 0;"><strong style="color:#fff;">Green structures</strong> – Outlined areas representing aggregated groups of nearby parks.</p>
          <p style="margin:0 0 10px 0;"><strong style="color:#fff;">Time slider</strong> – Filter parcels by walking time threshold (in minutes).</p>
          <p style="margin:0;"><strong style="color:#fff;">Color scale</strong> – Deep purple (close) to pale lavender (far).</p>
        </div>
      </div>
    `;

    // Calculate center position
    const center = map.getCenter();

    activeUserGuidePopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: '400px',
      className: 'custom-popup',
      anchor: 'center'
    })
      .setLngLat(center)
      .setHTML(guideContent)
      .addTo(map);

    // Remove arrow
    activeUserGuidePopup._container.querySelector('.maplibregl-popup-tip').style.display = 'none';

    // Clear reference when closed
    activeUserGuidePopup.on('close', () => {
      activeUserGuidePopup = null;
    });
  });

  // About button functionality
  const aboutButton = document.getElementById('aboutButton');
  aboutButton.addEventListener('click', () => {
    // Close if already open, or close other popup and open this one
    if (activeAboutPopup) {
      activeAboutPopup.remove();
      activeAboutPopup = null;
      return;
    }

    // Close User Guide popup if open
    if (activeUserGuidePopup) {
      activeUserGuidePopup.remove();
      activeUserGuidePopup = null;
    }

    const aboutContent = `
      <div style="background:#1E1F21;padding:16px;border-radius:0;">
        <h3 style="margin:0 0 12px 0;color:#ffffff;font-size:16px;font-weight:600;">About this project</h3>
        <p style="margin:0 0 12px 0;font-size:12px;line-height:1.6;color:#d1d5db;">
          This 3D viewer explores walking accessibility to green areas in the municipality of Barcelona.
          Parcels are extruded according to their estimated residential population, and colored by walking
          time to the nearest significant green area or aggregated green structure.
        </p>
        <h4 style="margin:0 0 6px 0;color:#ffffff;font-size:14px;font-weight:600;">Data sources</h4>
        <ul style="margin:0 0 12px 0;padding-left:18px;font-size:12px;line-height:1.6;color:#d1d5db;">
          <li><strong>OpenStreetMap / Overpass API</strong> – green areas and pedestrian network</li>
          <li><strong>Spanish Cadastre</strong> – parcel geometries and cadastral attributes</li>
          <li><strong>INE</strong> – population per census section</li>
          <li><strong>ICGC</strong> – census section geometries</li>
          <li><strong>Derived datasets</strong> – parcel population, green structures, and shortest walking routes</li>
        </ul>
        <h4 style="margin:0 0 6px 0;color:#ffffff;font-size:14px;font-weight:600;">Technologies</h4>
        <p style="margin:0 0 12px 0;font-size:12px;line-height:1.6;color:#d1d5db;">
          JavaScript • MapLibre GL JS • WebGL 3D • Python for preprocessing • Network analysis • FlatGeobuf • GeoJSON • GitHub Pages
        </p>
        <h4 style="margin:0 0 6px 0;color:#ffffff;font-size:14px;font-weight:600;">Author</h4>
        <p style="margin:0 0 4px 0;font-size:12px;line-height:1.6;color:#d1d5db;">
          <strong style="color:#fff;">Mónica Alegre</strong>
        </p>
        <p style="margin:0 0 2px 0;font-size:12px;color:#d1d5db;">
          LinkedIn: <a href="https://www.linkedin.com/in/monicaalegre" target="_blank" style="color:#AB47BC;">linkedin.com/in/monicaalegre</a>
        </p>
        <p style="margin:0;font-size:12px;color:#d1d5db;">
          Web: <a href="https://monica-alegre.github.io" target="_blank" style="color:#AB47BC;">monica-alegre.github.io</a>
        </p>
      </div>
    `;

    // Calculate center position
    const center = map.getCenter();

    activeAboutPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: '480px',
      className: 'custom-popup',
      anchor: 'center'
    })
      .setLngLat(center)
      .setHTML(aboutContent)
      .addTo(map);

    // Remove arrow
    activeAboutPopup._container.querySelector('.maplibregl-popup-tip').style.display = 'none';

    // Clear reference when closed
    activeAboutPopup.on('close', () => {
      activeAboutPopup = null;
    });
  });
});

// --- Tooltip helpers ---
function showTip(x, y, html, type = 'default') {
  tooltip.style.display = 'block';
  tooltip.innerHTML = html;

  // Reset classes
  tooltip.className = 'tooltip';

  // Add type-specific class
  if (type === 'park') {
    tooltip.classList.add('tooltip-park');
  } else if (type === 'parcel') {
    tooltip.classList.add('tooltip-parcel');
  } else if (type === 'route') {
    tooltip.classList.add('tooltip-route');
  }

  // Position tooltip with bounds checking to prevent viewport changes
  const tooltipRect = tooltip.getBoundingClientRect();
  const mapRect = document.getElementById('map').getBoundingClientRect();

  let left = x + 12;
  let top = y + 12;

  // Keep tooltip within map bounds
  if (left + tooltipRect.width > mapRect.right) {
    left = x - tooltipRect.width - 12;
  }
  if (top + tooltipRect.height > mapRect.bottom) {
    top = y - tooltipRect.height - 12;
  }
  if (left < mapRect.left) {
    left = mapRect.left + 5;
  }
  if (top < mapRect.top) {
    top = mapRect.top + 5;
  }

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

function hideTip() {
  tooltip.style.display = 'none';
}

function midPointOfLine(f) {
  const g = f.geometry;
  if (!g) return null;
  const c = (g.type === 'LineString' ? g.coordinates : (g.coordinates?.[0] || []));
  return c[Math.floor(c.length / 2)];
}
