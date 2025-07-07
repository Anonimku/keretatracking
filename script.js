const map = L.map('map', {
  preferCanvas: true,
  maxZoom: 20,
  minZoom: 5,
  maxBounds: L.latLngBounds(L.latLng(-11.2, 94.9), L.latLng(6.3, 141.0)),
  maxBoundsViscosity: 1.0
}).setView([-6.13, 106.82], 7);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 20,
  minZoom: 5
}).addTo(map);

L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
  subdomains: ['a', 'b', 'c'],
  maxZoom: 20
}).addTo(map);

map.attributionControl.setPrefix(false);
map.attributionControl.setPosition('bottomleft');
map.attributionControl.addAttribution(
  'Data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
);
L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

// ==================== DATA ====================
let jalurPerSegmen = [];
let stationMap = {};
let stationMarkers = [];
let trainSchedule = [];
let activeMarkers = {};
let autoFollowTrainId = null;

// ============ LOAD GEOJSON JALUR =============
fetch('data/JalurKertaCepat.json')
  .then(res => res.json())
  .then(geo => {
    const geometries = geo.geometries || geo.features?.map(f => f.geometry) || [];
    geometries.forEach(g => {
      if (g.type === "MultiLineString") {
        g.coordinates.forEach(seg => {
          const path = seg.map(c => L.latLng(c[1], c[0]));
          jalurPerSegmen.push(path);
        });
      }
    });
    loadStations();
  });

// ============ STASIUN DARI SHEET =============
function loadStations() {
  fetch('https://script.google.com/macros/s/AKfycbxOOcb5HYdFFR8Pwv4bZ75UHARyDg_tQbzNH9oROpBgQy1IcNef0PrIHKtOErm-wGaR/exec')
    .then(res => res.json())
    .then(data => {
      data.forEach(s => {
        const lat = parseFloat((s.Lat || '').toString().replace(',', '.'));
        const lon = parseFloat((s.Lon || '').toString().replace(',', '.'));
        if (isNaN(lat) || isNaN(lon)) return;

        const marker = L.circleMarker([lat, lon], {
          radius: 6,
          color: 'black',
          weight: 2,
          fillColor: 'white',
          fillOpacity: 0.9
        }).bindPopup(`<b>${s.Nama}</b><br>Kode: ${s.Kode}<br>Operator: ${s.Operator}`)
          .addTo(map);

        stationMap[s.Nama] = L.latLng(lat, lon);
        stationMarkers.push(marker);
      });

      map.fire('zoomend');
      loadSchedule();
    });
}

map.on('zoomend', () => {
  const zoom = map.getZoom();
  stationMarkers.forEach(m => zoom >= 11 ? map.addLayer(m) : map.removeLayer(m));
});

// ============== JADWAL KERETA =================
function loadSchedule() {
  fetch("https://script.google.com/macros/s/AKfycbyIsWOyuir9j0zaqs8imoii72IEEtN990cfvFy-pFlN663K5o3OvT8i3fX0yXZQ_Ct7/exec")
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

// ============== TOOLS =====================
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

function getNextStation(schedule, now) {
  for (let i = 0; i < schedule.times.length; i++) {
    const [hh, mm] = schedule.times[i].split(':').map(Number);
    const time = new Date(now);
    time.setHours(hh, mm, 0, 0);
    if (time > now) return `${schedule.stops[i]} (${schedule.times[i]})`;
  }
  return schedule.stops[schedule.stops.length - 1];
}

// ========== RUTE ANTAR STASIUN ============
function findRouteBetweenStations(fromStation, toStation) {
  const from = stationMap[fromStation];
  const to = stationMap[toStation];
  if (!from || !to) return null;

  let bestPath = null;
  let minDistSum = Infinity;

  jalurPerSegmen.forEach(path => {
    const i1 = findNearestIndex(path, from);
    const i2 = findNearestIndex(path, to);
    const d1 = path[i1].distanceTo(from);
    const d2 = path[i2].distanceTo(to);
    const totalDist = d1 + d2;

    if (totalDist < minDistSum) {
      minDistSum = totalDist;
      bestPath = i1 < i2 ? path.slice(i1, i2 + 1) : path.slice(i2, i1 + 1).reverse();
    }
  });

  return bestPath;
}

// ============= ANIMASI KERETA =============
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

  let latlngs = [];
  for (let i = 0; i < schedule.stops.length - 1; i++) {
    const seg = findRouteBetweenStations(schedule.stops[i], schedule.stops[i + 1]);
    if (seg) latlngs.push(...seg);
  }
  if (latlngs.length === 0) return;

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
})
.bindTooltip(`${trainId}`, {
  permanent: false, // awalnya tidak permanen
  direction: 'right',
  offset: [10, 0],
  className: 'train-tooltip'
})


.bindPopup(() => {
  const now = new Date();

  const nextIndex = schedule.times.findIndex(time => {
    const [hh, mm] = time.split(':').map(Number);
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    return d > now;
  });

  const nextStation = schedule.stops[nextIndex] || '–';
  const nextTime = schedule.times[nextIndex] || '–';

  const trainName = `Kereta ${trainId}`;
  const from = schedule.stops[0];
  const to = schedule.stops[schedule.stops.length - 1];

  const photo = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/KCIC_400-5_with_Whoosh_logo.jpg/1920px-KCIC_400-5_with_Whoosh_logo.jpg';
  const logo = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/WHOOSH_Logo.svg';

  const rows = schedule.stops.map((stop, i) => `
    <div style="padding: 6px 10px; font-size: 12px; display: flex; justify-content: space-between; background: #f6f6f6; border-radius: 6px; margin-bottom: 6px;">
      <span>${stop}</span>
      <span style="color: #666;">${schedule.times[i] || '–'}</span>
    </div>
  `).join('');

  return `
    <style>
      .no-scrollbar::-webkit-scrollbar {
        display: none;
      }
    </style>

    <div class="no-scrollbar" style="
      width: 270px;
      max-height: 280px;
      overflow-y: auto;
      font-family: 'Segoe UI', Roboto, sans-serif;
      background: white;
      color: #222;
      border-radius: 10px;
      scrollbar-width: none;       /* Firefox */
      -ms-overflow-style: none;    /* IE/Edge */
    ">

      <!-- Gambar Kereta -->
      <img src="${photo}" alt="Kereta WHOOSH"
           style="width: 100%; border-top-left-radius: 10px; border-top-right-radius: 10px;">

      <!-- Header: Nama + Logo -->
      <div style="padding: 10px 14px 6px; display: flex; align-items: center; justify-content: space-between;">
        <div style="font-size: 14px; font-weight: 600;">${trainName}</div>
        <img src="${logo}" alt="Logo WHOOSH" style="height: 10px; opacity: 0.85;">
      </div>

      <!-- Rute -->
      <div style="font-size: 12px; color: #666; padding: 0 14px 10px;">
        ${from} — ${to}
      </div>

      <!-- Stasiun Berikutnya -->
      <div style="font-size: 12px; padding: 0 14px 12px;">
        <div style="color: #888;">Stasiun berikutnya:</div>
        <div><strong>${nextStation}</strong> <span style="color: #333;">${nextTime}</span></div>
      </div>

      <!-- Divider -->
      <div style="height: 1px; background: #eee; margin: 0 14px 10px;"></div>

      <!-- Jadwal -->
      <div style="padding: 0 14px 14px;">
        <div style="font-size: 12px; color: #888; margin-bottom: 6px;">Jadwal lengkap:</div>
        ${rows}
      </div>

    </div>
  `;
}).addTo(map);



const zoom = map.getZoom();
if (zoom >= 13) marker.openTooltip();

map.on('zoomend', () => {
  const currentZoom = map.getZoom();
  if (currentZoom >= 11) {
    marker.openTooltip();
  } else {
    marker.closeTooltip();
  }
});

marker.on('popupopen', () => {
  marker.closeTooltip();
});

marker.on('popupclose', () => {
  if (map.getZoom() >= 11) marker.openTooltip();
});

  marker.on('click', () => {
    autoFollowTrainId = trainId;
    map.setView(marker.getLatLng(), 12);
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
    if (autoFollowTrainId === trainId) map.setView(pos2);
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

// ============ LOAD GEOJSON JALUR =============
fetch('data/JalurMRT.json') // ← Ganti file GeoJSON untuk MRT
  .then(res => res.json())
  .then(geo => {
    const geometries = geo.geometries || geo.features?.map(f => f.geometry) || [];
    geometries.forEach(g => {
      if (g.type === "MultiLineString") {
        g.coordinates.forEach(seg => {
          const path = seg.map(c => L.latLng(c[1], c[0]));
          jalurPerSegmen.push(path);
        });
      } else if (g.type === "LineString") {
        const path = g.coordinates.map(c => L.latLng(c[1], c[0]));
        jalurPerSegmen.push(path);
      }
    });
    loadStations();
  });
