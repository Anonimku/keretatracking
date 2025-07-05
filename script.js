// Inisialisasi peta
const map = L.map('map', {
  preferCanvas: true,
  maxZoom: 20,
  minZoom: 5,
  maxBounds: L.latLngBounds(
    L.latLng(-11.2, 94.9),
    L.latLng(6.3, 141.0)
  ),
  maxBoundsViscosity: 1.0
}).setView([-6.13, 106.82], 7);

// Tile dasar
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 20,
  minZoom: 5
}).addTo(map);

// OpenRailwayMap
L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
  subdomains: ['a', 'b', 'c'],
  maxZoom: 20
}).addTo(map);

// Skala & attribution
map.attributionControl.setPrefix(false);
map.attributionControl.setPosition('bottomleft');
map.attributionControl.addAttribution(
  'Data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
);
L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

// Jalur kereta
let allLatLngs = [];

fetch('data/JalurKertaCepat.json')
  .then(res => res.json())
  .then(geo => {
    const geometries = geo.geometries || (geo.features ? geo.features.map(f => f.geometry) : []);
    geometries.forEach(g => {
      if (g.type === "MultiLineString") {
        g.coordinates.forEach(seg => {
          const path = seg.map(c => L.latLng(c[1], c[0]));
          allLatLngs.push(...path);
        });
      }
    });
    loadStations();
  });

// Stasiun
const stationMap = {};
const stationMarkers = [];

function loadStations() {
  fetch('https://script.google.com/macros/s/AKfycbxOOcb5HYdFFR8Pwv4bZ75UHARyDg_tQbzNH9oROpBgQy1IcNef0PrIHKtOErm-wGaR/exec')
    .then(res => res.json())
    .then(data => {
      data.forEach(stasiun => {
        const lat = parseFloat((stasiun.Lat || '').toString().replace(',', '.'));
        const lon = parseFloat((stasiun.Lon || '').toString().replace(',', '.'));
        if (isNaN(lat) || isNaN(lon)) return;

        const marker = L.circleMarker([lat, lon], {
          radius: 6,
          color: 'black',
          weight: 2,
          fillColor: 'white',
          fillOpacity: 0.9
        }).bindPopup(`
          <div style="font-size: 13px;">
            <div style="font-size: 15px; font-weight: bold; color: #007bff;">${stasiun.Nama}</div>
            <b>Kode:</b> ${stasiun.Kode}<br>
            <b>Operator:</b> ${stasiun.Operator}
          </div>
        `).addTo(map);

        stationMap[stasiun.Nama] = L.latLng(lat, lon);
        stationMarkers.push(marker);
      });

      map.fire('zoomend');
      loadSchedule();
    });
}

// Zoom handler
map.on('zoomend', () => {
  const zoom = map.getZoom();
  stationMarkers.forEach(marker => {
    if (zoom >= 11) map.addLayer(marker);
    else map.removeLayer(marker);
  });
});

// Jadwal & Animasi Kereta
let trainSchedule = [];
let activeMarkers = {};
let autoFollowTrainId = null;

function loadSchedule() {
  fetch("https://script.google.com/macros/s/AKfycbz3xWJamZuJPTNW03Bldg7QAwtcfyH068u0NAOdG_2EICuRB_tDaRh-DbW8vbFwGo8l/exec")
    .then(res => res.json())
    .then(data => {
      trainSchedule = data.map(item => ({
        train: item.train,
        stops: item.stops.split(',').map(s => s.trim()),
        times: item.times.split(',').map(s => s.trim()),
        hari: item.hari.split(',').map(s => s.trim())
      }));
      startRealtimeTrains();
    });
}

function interpolateLatLng(start, end, t) {
  const lat = start.lat + (end.lat - start.lat) * t;
  const lng = start.lng + (end.lng - start.lng) * t;
  return L.latLng(lat, lng);
}

function getPositionOnRoute(latlngs, t) {
  const total = latlngs.length;
  const idx = Math.floor(t * (total - 1));
  const frac = t * (total - 1) - idx;
  return interpolateLatLng(latlngs[idx], latlngs[idx + 1] || latlngs[idx], frac);
}

function getNextStation(schedule, now) {
  for (let i = 0; i < schedule.times.length; i++) {
    const [hh, mm] = schedule.times[i].split(':').map(Number);
    const time = new Date(now);
    time.setHours(hh, mm, 0, 0);
    if (time > now) return `${schedule.stops[i]} (${schedule.times[i]})`;
  }
  return schedule.stops[schedule.stops.length - 1];
}

function findNearestIndex(latlngs, target) {
  let minDist = Infinity;
  let index = -1;
  latlngs.forEach((point, i) => {
    const dist = point.distanceTo(target);
    if (dist < minDist) {
      minDist = dist;
      index = i;
    }
  });
  return index;
}

function animateTrainRealtime(schedule) {
  const now = new Date();
  const dayName = now.toLocaleDateString('id-ID', { weekday: 'long' });

  if (!schedule.hari.includes(dayName)) return;

  const times = schedule.times.map(t => {
    const [hh, mm] = t.split(':').map(Number);
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    return d;
  });

  const start = times[0], end = times[times.length - 1];
  const trainId = schedule.train;

  if (now > end) {
    if (activeMarkers[trainId]) {
      activeMarkers[trainId].remove();
      delete activeMarkers[trainId];
    }
    return;
  }

  if (now < start) return;

  const startStation = schedule.stops[0];
  const endStation = schedule.stops[schedule.stops.length - 1];

  if (!stationMap[startStation] || !stationMap[endStation]) {
    console.warn("Stasiun tidak ditemukan:", startStation, endStation);
    return;
  }

  const startIdx = findNearestIndex(allLatLngs, stationMap[startStation]);
  const endIdx = findNearestIndex(allLatLngs, stationMap[endStation]);

  let latlngs = [];
  if (startIdx >= 0 && endIdx >= 0) {
    if (startIdx < endIdx) {
      latlngs = allLatLngs.slice(startIdx, endIdx + 1);
    } else {
      latlngs = allLatLngs.slice(endIdx, startIdx + 1).reverse();
    }
  } else {
    console.warn("Lintasan tidak ditemukan:", schedule.train);
    return;
  }

  const t = (now - start) / (end - start);
  const pos = getPositionOnRoute(latlngs, t);

  if (activeMarkers[trainId]) {
    activeMarkers[trainId].setLatLng(pos);
    return;
  }

  const marker = L.circleMarker(pos, {
    radius: 8,
    color: 'white',
    weight: 2,
    fillColor: 'red',
    fillOpacity: 1
  }).bindPopup(`
    <div style="font-size: 14px;">
      <div style="font-size: 16px; font-weight: bold; color: red;">${trainId}</div>
      <div>${schedule.stops.join(" → ")}</div>
      <hr style="margin: 4px 0;">
      <div><b>Stasiun berikutnya:</b> ${getNextStation(schedule, now)}</div>
    </div>
  `).addTo(map);

  marker.on('click', () => {
    autoFollowTrainId = trainId;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 12));
  });

  marker.on('popupclose', () => {
    autoFollowTrainId = null;
  });

  activeMarkers[trainId] = marker;

  function update() {
    const now2 = new Date();
    if (now2 >= end) {
      marker.remove();
      delete activeMarkers[trainId];
      return;
    }
    const t2 = (now2 - start) / (end - start);
    const pos2 = getPositionOnRoute(latlngs, t2);
    marker.setLatLng(pos2);
    if (autoFollowTrainId === trainId) {
      map.setView(pos2);
    }
    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

function startRealtimeTrains() {
  trainSchedule.forEach(schedule => animateTrainRealtime(schedule));
  setInterval(() => {
    trainSchedule.forEach(schedule => animateTrainRealtime(schedule));
  }, 60 * 1000);
}
