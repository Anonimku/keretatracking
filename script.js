// Inisialisasi Peta const map = L.map('map', { preferCanvas: true, maxZoom: 20, minZoom: 5, maxBounds: L.latLngBounds( L.latLng(-11.2, 94.9), L.latLng(6.3, 141.0) ), maxBoundsViscosity: 1.0 }).setView([-6.13, 106.82], 7);

// Tile dasar L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, minZoom: 5 }).addTo(map);

// OpenRailwayMap L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', { subdomains: ['a', 'b', 'c'], maxZoom: 20 }).addTo(map);

// Skala & attribution map.attributionControl.setPrefix(false); map.attributionControl.setPosition('bottomleft'); map.attributionControl.addAttribution( 'Data © <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>' ); L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

// Jalur kereta let allLatLngs = [];

fetch('data/JalurKertaCepat.json') .then(res => res.json()) .then(geo => { const geometries = geo.geometries || (geo.features ? geo.features.map(f => f.geometry) : []); geometries.forEach(g => { if (g.type === "MultiLineString") { g.coordinates.forEach(seg => { const path = seg.map(c => L.latLng(c[1], c[0])); allLatLngs.push(...path); }); } }); loadStations(); });

// Stasiun const stationMap = {}; const stationMarkers = [];

function loadStations() { fetch('https://script.google.com/macros/s/AKfycbxOOcb5HYdFFR8Pwv4bZ75UHARyDg_tQbzNH9oROpBgQy1IcNef0PrIHKtOErm-wGaR/exec') .then(res => res.json()) .then(data => { data.forEach(stasiun => { const lat = parseFloat((stasiun.Lat || '').toString().replace(',', '.')); const lon = parseFloat((stasiun.Lon || '').toString().replace(',', '.')); if (isNaN(lat) || isNaN(lon)) return;

const marker = L.circleMarker([lat, lon], {
      radius: 6,
      color: 'black',
      weight: 2,
      fillColor: 'white',
      fillOpacity: 0.9
    }).bindPopup(
      `<div style="font-size: 13px;">
        <div style="font-size: 15px; font-weight: bold; color: #007bff;">${stasiun.Nama}</div>
        <b>Kode:</b> ${stasiun.Kode}<br>
        <b>Operator:</b> ${stasiun.Operator}
      </div>`
    ).addTo(map);

    stationMap[stasiun.Nama] = L.latLng(lat, lon);
    stationMarkers.push(marker);
  });

  map.fire('zoomend');
  loadSchedule();
});

}

map.on('zoomend', () => { const zoom = map.getZoom(); stationMarkers.forEach(marker => { if (zoom >= 11) map.addLayer(marker); else map.removeLayer(marker); }); });

let trainSchedule = [];

function loadSchedule() { fetch("https://script.google.com/macros/s/AKfycbz3xWJamZuJPTNW03Bldg7QAwtcfyH068u0NAOdG_2EICuRB_tDaRh-DbW8vbFwGo8l/exec") .then(res => res.json()) .then(data => { trainSchedule = data.map(item => ({ train: item.train, stops: item.stops.split(',').map(s => s.trim()), times: item.times.split(',').map(s => s.trim()), hari: item.hari.split(',').map(s => s.trim()) }));

trainSchedule.forEach(schedule => visualizeRoute(schedule));
});

}

function findNearestIndex(latlngs, target) { let minDist = Infinity; let index = -1; latlngs.forEach((point, i) => { const dist = point.distanceTo(target); if (dist < minDist) { minDist = dist; index = i; } }); return index; }

function visualizeRoute(schedule) { for (let i = 0; i < schedule.stops.length - 1; i++) { const fromName = schedule.stops[i]; const toName = schedule.stops[i + 1];

const from = stationMap[fromName];
const to = stationMap[toName];

if (!from || !to) continue;

const fromIdx = findNearestIndex(allLatLngs, from);
const toIdx = findNearestIndex(allLatLngs, to);

if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) continue;

const seg = fromIdx < toIdx
  ? allLatLngs.slice(fromIdx, toIdx + 1)
  : allLatLngs.slice(toIdx, fromIdx + 1).reverse();

const first = seg[0];
const last = seg[seg.length - 1];
if (first.distanceTo(from) > 500 || last.distanceTo(to) > 500) continue;

const polyline = L.polyline(seg, {
  color: 'blue',

