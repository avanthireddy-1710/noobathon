// ── MAP SETUP ────────────────────────────────────────────────
let mapInstance    = null;
let markersLayer   = { all: [], safehouse: [], operation: [], high_risk: [] };
let criminalMarker = null;
let trailLine      = null;
let trailPositions = [];
let activeFilters  = new Set(['safehouse', 'operation', 'high_risk']);

const CRIMINAL_START = { lat: 34.052, lng: -118.250 };

function initMap() {
  if (mapInstance) {
    mapInstance.invalidateSize();
    return;
  }

  mapInstance        = L.map('map', { center: [34.052, -118.252], zoom: 12, zoomControl: true });
  window.mapInstance = mapInstance;

  // Dark GTA-style tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CartoDB',
    maxZoom: 19,
  }).addTo(mapInstance);

  loadMapLocations();
  startCriminalTracker();
}

// ── CUSTOM ICONS ─────────────────────────────────────────────
function makeIcon(color, symbol) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        background:${color}22; border:2px solid ${color};
        width:32px; height:32px; display:flex; align-items:center; justify-content:center;
        font-size:14px; position:relative;
        clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);
        box-shadow:0 0 12px ${color}66;
      ">${symbol}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  });
}

function heatColor(heat) {
  if (heat <= 3) return '#00f5a0';
  if (heat <= 6) return '#ffd700';
  return '#ff2d55';
}

// ── LOAD LOCATIONS ───────────────────────────────────────────
async function loadMapLocations() {
  try {
    const res = await fetch('/api/map/locations', { credentials: 'include' });
    if (!res.ok) return;
    const locations = await res.json();

    locations.forEach(loc => {
      const color  = heatColor(loc.heat || 0);
      const symbol = loc.type === 'safehouse' ? '🏠' : loc.type === 'high_risk' ? '⚠️' : '⚡';

      const marker = L.marker([loc.lat, loc.lng], { icon: makeIcon(color, symbol) })
        .addTo(mapInstance);

      marker.bindPopup(`
        <div style="background:#0a1520;border:1px solid #1a3040;padding:12px 16px;font-family:'Share Tech Mono',monospace;color:#c8d8e0;min-width:180px">
          <div style="color:${color};font-size:0.7rem;letter-spacing:0.2em;margin-bottom:6px">
            ${loc.type.toUpperCase().replace('_', ' ')}
          </div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:1.2rem;color:#fff;margin-bottom:8px">
            ${loc.name}
          </div>
          <div style="font-size:0.65rem;color:#4a6070;line-height:1.8">
            🔥 HEAT: <span style="color:${color}">${loc.heat}/10</span><br>
            💰 EARNINGS: <span style="color:#00f5a0">$${(loc.earnings || 0).toLocaleString()}</span>
          </div>
        </div>
      `, { className: 'gta-popup' });

      markersLayer['all'].push(marker);
      const typeKey = loc.type;
      if (markersLayer[typeKey]) markersLayer[typeKey].push(marker);
    });
  } catch(e) { console.error('Map load error:', e); }
}

// ── FILTER TOGGLE ────────────────────────────────────────────
function toggleFilter(btn, type) {
  if (type === 'all') {
    const allOn = activeFilters.size === 3;
    if (allOn) {
      activeFilters.clear();
      markersLayer['all'].forEach(m => { if (mapInstance.hasLayer(m)) mapInstance.removeLayer(m); });
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('on'));
    } else {
      activeFilters = new Set(['safehouse', 'operation', 'high_risk']);
      markersLayer['all'].forEach(m => { if (!mapInstance.hasLayer(m)) m.addTo(mapInstance); });
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.add('on'));
    }
    return;
  }

  if (activeFilters.has(type)) {
    activeFilters.delete(type);
    markersLayer[type].forEach(m => { if (mapInstance.hasLayer(m)) mapInstance.removeLayer(m); });
    btn.classList.remove('on');
  } else {
    activeFilters.add(type);
    markersLayer[type].forEach(m => { if (!mapInstance.hasLayer(m)) m.addTo(mapInstance); });
    btn.classList.add('on');
  }

  // Sync "ALL" button
  const allBtn = document.querySelector('.filter-btn[onclick*="\'all\'"]');
  if (allBtn) allBtn.classList.toggle('on', activeFilters.size === 3);
}

// ── CRIMINAL GPS TRACKER ─────────────────────────────────────
function startCriminalTracker() {
  let pos = { ...CRIMINAL_START };
  trailPositions = [{ ...pos }];

  const criminalIcon = L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;inset:0;border-radius:50%;border:2px solid #ff2d55;animation:sonar 1.5s infinite;opacity:0.6"></div>
        <div style="width:24px;height:24px;background:#ff2d55;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 16px #ff2d55;z-index:1">🎯</div>
      </div>
      <style>@keyframes sonar{0%{transform:scale(1);opacity:0.6}100%{transform:scale(2.5);opacity:0}}</style>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

  criminalMarker = L.marker([pos.lat, pos.lng], { icon: criminalIcon })
    .addTo(mapInstance)
    .bindPopup(`
      <div style="background:#0a1520;border:1px solid #ff2d55;padding:12px 16px;font-family:'Share Tech Mono',monospace;color:#c8d8e0">
        <div style="color:#ff2d55;font-size:0.7rem;letter-spacing:0.2em;margin-bottom:4px">⚠ HIGH-VALUE TARGET</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:1.2rem;color:#fff">SUBJECT: UNKNOWN</div>
        <div style="font-size:0.65rem;color:#4a6070;margin-top:6px">STATUS: AT LARGE<br>THREAT: EXTREME</div>
      </div>`);

  trailLine = L.polyline(trailPositions.map(p => [p.lat, p.lng]), {
    color: '#ff2d55', weight: 2, opacity: 0.4, dashArray: '4 4'
  }).addTo(mapInstance);

  setInterval(() => {
    pos = {
      lat: pos.lat + (Math.random() - 0.5) * 0.018,
      lng: pos.lng + (Math.random() - 0.5) * 0.025,
    };

    // Clamp to LA area
    pos.lat = Math.max(33.8, Math.min(34.5, pos.lat));
    pos.lng = Math.max(-118.7, Math.min(-117.8, pos.lng));

    trailPositions.push({ ...pos });
    if (trailPositions.length > 10) trailPositions.shift();

    criminalMarker.setLatLng([pos.lat, pos.lng]);
    trailLine.setLatLngs(trailPositions.map(p => [p.lat, p.lng]));

    showMapToast();
  }, 6000);
}

function showMapToast() {
  const toast = document.getElementById('mapToast');
  const badge = document.getElementById('targetBadge');
  if (!toast) return;

  toast.style.display = 'block';
  if (badge) badge.style.display = 'block';

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// ── INIT MAP WHEN SECTION IS SHOWN ───────────────────────────
// This is triggered by dashboard.js showSection('map-section')
// The initMap function is called from there with a setTimeout.
// Also handle if map section is already active on page load.
document.addEventListener('DOMContentLoaded', () => {
  const mapSection = document.getElementById('map-section');
  if (mapSection && mapSection.classList.contains('active')) {
    setTimeout(initMap, 200);
  }
});
