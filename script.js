const map = L.map('map', { preferCanvas: true, maxZoom: 20, minZoom: 5, maxBounds: L.latLngBounds(L.latLng(-11.2, 94.9), L.latLng(6.3, 141.0)), maxBoundsViscosity: 1.0 }).setView([-6.13, 106.82], 7);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, minZoom: 5 }).addTo(map);

L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', { subdomains: ['a', 'b', 'c'], maxZoom: 20 }).addTo(map);

map.attributionControl.setPrefix(false); map.attributionControl.setPosition('bottomleft'); map.attributionControl.addAttribution('Data © <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'); L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

let allLatLngs = []; fetch('data/JalurKertaCepat.json') .then(res => res.json()) .then(geo => { const geometries = geo.geometries || (geo.features ? geo.features.map(f => f.geometry) : []); geometries.forEach(g => { if (g.type === "MultiLineString") { g.coordinates.forEach(seg => { const path = seg.map(c => L.latLng(c[1], c[0])); allLatLngs.push(...path); L.polyline(path, { color: '#007bff', weight: 3, opacity: 0.8, dashArray: '6, 4' }).addTo(map); }); } }); loadStations(); });

const stationMap = {}; const stationMarkers = [];

function loadStations() { fetch('https://script.google.com/macros/s/AKfycbxOOcb5HYdFFR8Pwv4bZ75UHARyDg_tQbzNH9oROpBgQy1IcNef0PrIHKtOErm-wGaR/exec') .then(res => res.json()) .then(data => { data.forEach(stasiun => { const lat = parseFloat((stasiun.Lat || '').toString().replace(',', '.')); const lon = parseFloat((stasiun.Lon || '').toString().replace(',', '.')); if (isNaN(lat) || isNaN(lon)) return;

const marker = L.circleMarker([lat, lon], {
      radius: 6, color: '#007bff', weight: 2,
      fillColor: '#fff', fillOpacity: 0.95
    }).bindPopup(`
      <div style="font-family: 'Segoe UI', sans-serif; font-size: 13px;">
        <div style="font-size: 15px; font-weight: 600; color: #007bff;">${stasiun.Nama}</div>
        <div style="color: #555;"><b>Kode:</b> ${stasiun.Kode}</div>
        <div style="color: #555;"><b>Operator:</b> ${stasiun.Operator}</div>
      </div>`).addTo(map);

    stationMap[stasiun.Nama] = L.latLng(lat, lon);
    stationMarkers.push(marker);
  });
  map.fire('zoomend');
  loadSchedule();
});

}

map.on('zoomend', () => { const zoom = map.getZoom(); stationMarkers.forEach(marker => { if (zoom >= 11) map.addLayer(marker); else map.removeLayer(marker); }); });

let trainSchedule = []; let activeMarkers = {}; let autoFollowTrainId = null;

function loadSchedule() { fetch("https://script.google.com/macros/s/AKfycbz3xWJamZuJPTNW03Bldg7QAwtcfyH068u0NAOdG_2EICuRB_tDaRh-DbW8vbFwGo8l/exec") .then(res => res.json()) .then(data => { trainSchedule = data.map(item => ({ train: item.train, stops: item.stops.split(',').map(s => s.trim()), times: item.times.split(',').map(s => s.trim()), hari: item.hari.split(',').map(s => s.trim()) })); startRealtimeTrains(); }); }

function interpolateLatLng(start, end, t) { const lat = start.lat + (end.lat - start.lat) * t; const lng = start.lng + (end.lng - start.lng) * t; return L.latLng(lat, lng); }

function getPositionOnRoute(latlngs, t) { const total = latlngs.length; const idx = Math.floor(t * (total - 1)); const frac = t * (total - 1) - idx; return interpolateLatLng(latlngs[idx], latlngs[idx + 1] || latlngs[idx], frac); }

function findNearestIndex(latlngs, target) { let minDist = Infinity, index = -1; latlngs.forEach((point, i) => { const dist = point.distanceTo(target); if (dist < minDist) { minDist = dist; index = i; } }); return index; }

function getNextStation(schedule, now) { for (let i = 0; i < schedule.times.length; i++) { const [hh, mm] = schedule.times[i].split(':').map(Number); const time = new Date(now); time.setHours(hh, mm, 0, 0); if (time > now) return ${schedule.stops[i]} (${schedule.times[i]}); } return schedule.stops[schedule.stops.length - 1]; }

function animateTrainRealtime(schedule) { const now = new Date(); const dayName = now.toLocaleDateString('id-ID', { weekday: 'long' }); if (!schedule.hari.includes(dayName)) return;

const times = schedule.times.map(t => { const [hh, mm] = t.split(':').map(Number); const d = new Date(now); d.setHours(hh, mm - 5, 0, 0); // Tiba 5 menit lebih awal return d; });

const start = times[0], end = times[times.length - 1]; const trainId = schedule.train;

if (!schedule.stops.every(stop => stationMap[stop])) return; const startIdx = findNearestIndex(allLatLngs, stationMap[schedule.stops[0]]); const endIdx = findNearestIndex(allLatLngs, stationMap[schedule.stops[schedule.stops.length - 1]]); const latlngs = startIdx < endIdx ? allLatLngs.slice(startIdx, endIdx + 1) : allLatLngs.slice(endIdx, startIdx + 1).reverse();

const segmentTimes = [], segmentCoords = []; for (let i = 0; i < schedule.stops.length - 1; i++) { const from = stationMap[schedule.stops[i]]; const to = stationMap[schedule.stops[i + 1]]; const segStart = times[i], segEnd = times[i + 1]; const fromIdx = findNearestIndex(allLatLngs, from); const toIdx = findNearestIndex(allLatLngs, to); const path = fromIdx < toIdx ? allLatLngs.slice(fromIdx, toIdx + 1) : allLatLngs.slice(toIdx, fromIdx + 1).reverse(); segmentCoords.push(path); segmentTimes.push([segStart, segEnd]); }

let pos = stationMap[schedule.stops[0]];

if (activeMarkers[trainId]) { activeMarkers[trainId].setLatLng(pos); return; }

const marker = L.circleMarker(pos, { radius: 8, color: 'white', weight: 2, fillColor: 'red', fillOpacity: 1 }).bindPopup(() => { const nextStop = getNextStation(schedule, new Date()); const tableRows = schedule.stops.map((stop, idx) => { const time = schedule.times[idx] || '-'; return <tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${stop}</td><td style="padding:6px 10px;text-align:right;border-bottom:1px solid #eee;">${time}</td></tr>; }).join('');

return `<div style="font-family:'Segoe UI',sans-serif;font-size:14px;max-height:320px;overflow-y:auto;">
  <div style="font-size:16px;font-weight:600;color:#d32f2f;">${trainId}</div>
  <div style="margin-bottom:6px;color:#555;">${schedule.stops.join(" → ")}</div>
  <div style="margin-bottom:6px;"><b>Stasiun berikutnya:</b> <span style="color:#007bff">${nextStop}</span></div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f9f9f9;"><th style="padding:6px 10px;text-align:left;">Stasiun</th><th style="padding:6px 10px;text-align:right;">Waktu</th></tr></thead><tbody>${tableRows}</tbody></table>
</div>`;

}).addTo(map);

marker.on('click', () => { autoFollowTrainId = trainId; map.setView(marker.getLatLng(), Math.max(map.getZoom(), 12)); }); marker.on('popupclose', () => autoFollowTrainId = null); activeMarkers[trainId] = marker;

function update() { const now2 = new Date(); if (now2 >= end) { marker.setLatLng(stationMap[schedule.stops[schedule.stops.length - 1]]); return; } let segIdx = segmentTimes.findIndex(([start, end]) => now2 >= start && now2 < end); if (segIdx === -1) return;

const [segStart, segEnd] = segmentTimes[segIdx];
const t2 = (now2 - segStart) / (segEnd - segStart);
const pos2 = getPositionOnRoute(segmentCoords[segIdx], t2);
marker.setLatLng(pos2);
if (autoFollowTrainId === trainId) map.setView(pos2);
requestAnimationFrame(update);

}

requestAnimationFrame(update); }

function startRealtimeTrains() { trainSchedule.forEach(schedule => animateTrainRealtime(schedule)); setInterval(() => { trainSchedule.forEach(schedule => animateTrainRealtime(schedule)); }, 60000); }

                                                                                                                                                                                                
