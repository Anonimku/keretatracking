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

// OpenRailwayMap overlay
L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
  subdomains: ['a', 'b', 'c'],
  maxZoom: 20
}).addTo(map);

// Skala & attribution
map.attributionControl.setPrefix(false);
map.attributionControl.setPosition('bottomleft');
map.attributionControl.addAttribution(
  'Data Peta &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> & <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
);
L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

// Jalur kereta
const semuaPolyline = [];
const jalurFiles = [
  { file: 'data/JalurKertaCepat.json', color: '#ff0c00' },
  { file: 'data/JalurLRT.json', color: '#00bd14' },
  { file: 'data/JalurMRT.json', color: '#6865db' },
  { file: 'data/JalurBiasa.json', color: '#ff8100' }
];

jalurFiles.forEach(({ file, color }) => {
  fetch(file)
    .then(res => res.json())
    .then(geo => {
      if (geo.type === "GeometryCollection") {
        geo.geometries.forEach(geometry => {
          if (geometry.type === "MultiLineString") {
            geometry.coordinates.forEach(segment => {
              const latlngs = segment.map(c => [c[1], c[0]]);
              const polyline = L.polyline(latlngs, {
                color,
                weight: 3,
                opacity: 0
              }).addTo(map);
              semuaPolyline.push(polyline);
            });
          }
        });
      }
    });
});

map.on('zoomend', () => {
  const zoom = map.getZoom();
  semuaPolyline.forEach(line => {
    if (zoom >= 20) {
      line.setStyle({ opacity: 1 });
      if (!map.hasLayer(line)) map.addLayer(line);
    } else {
      line.setStyle({ opacity: 0 });
      if (map.hasLayer(line)) map.removeLayer(line);
    }
  });
});

// Stasiun
const stationMap = {};
const stationMarkers = [];
let allLatLngs = [];

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
        <div style="font-size: 13px; line-height: 1.4;">
          <div style="font-size: 15px; font-weight: bold; color: #007bff;">${stasiun.Nama}</div>
          <b>Kode:</b> ${stasiun.Kode}<br>
          <b>Operator:</b> ${stasiun.Operator}
        </div>
      `).addTo(map);
      stationMap[stasiun.Nama] = L.latLng(lat, lon);
      stationMarkers.push(marker);
    });
    map.fire('zoomend');
    loadRoute();
  });

map.on('zoomend', () => {
  const zoom = map.getZoom();
  stationMarkers.forEach(marker => {
    if (zoom >= 11) map.addLayer(marker);
    else map.removeLayer(marker);
  });
});

function loadRoute() {
  fetch('data/JalurKertaCepat.json')
    .then(res => res.json())
    .then(geo => {
      geo.geometries.forEach(g => {
        if (g.type === "MultiLineString") {
          g.coordinates.forEach(seg => {
            allLatLngs.push(...seg.map(c => L.latLng(c[1], c[0])));
          });
        }
      });
      loadSchedule();
    });
}

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

function animateTrainRealtime(schedule) {
  const now = new Date();
  const dayName = now.toLocaleDateString('id-ID', { weekday: 'long' });

  // Cek hari operasi
  if (!schedule.hari.includes(dayName)) return;

  // Konversi waktu
  const times = schedule.times.map(t => {
    const [hh, mm] = t.split(':').map(Number);
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    return d;
  });

  const start = times[0], end = times[times.length - 1];

  // ⛔ Jangan munculkan kereta sebelum jam berangkat atau setelah tiba
  if (now < start || now > end) return;

  // ✅ Jika marker sudah ada, cukup update posisinya
  if (activeMarkers[schedule.train]) return;

  // Hitung rute
  const startStation = schedule.stops[0];
  const endStation = schedule.stops[schedule.stops.length - 1];

  const distStart = allLatLngs[0].distanceTo(stationMap[startStation] || allLatLngs[0]);
  const distEnd = allLatLngs[0].distanceTo(stationMap[endStation] || allLatLngs[0]);

  const latlngs = distStart < distEnd ? allLatLngs : [...allLatLngs].reverse();

  // Posisi awal berdasarkan waktu saat ini
  const t = (now - start) / (end - start);
  const pos = getPositionOnRoute(latlngs, t);

  const marker = L.circleMarker(pos, {
    radius: 7,
    color: 'white',
    weight: 2,
    fillColor: 'red',
    fillOpacity: 1
  }).bindPopup(`
    <div style="font-size: 14px;">
      <div style="font-size: 16px; font-weight: bold; color: red;">${schedule.train}</div>
      <div>${schedule.stops.join(" → ")}</div>
      <hr style="margin: 4px 0;">
      <div><b>Stasiun berikutnya:</b> ${getNextStation(schedule, now)}</div>
    </div>
  `).addTo(map);

  marker.on('click', () => {
    autoFollowTrainId = schedule.train;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 12));
  });

  marker.on('popupclose', () => {
    autoFollowTrainId = null;
  });

  activeMarkers[schedule.train] = marker;

  function update() {
    const now2 = new Date();

    if (now2 > end) {
      marker.remove();
      delete activeMarkers[schedule.train];
      return;
    }

    const t2 = (now2 - start) / (end - start);
    const pos2 = getPositionOnRoute(latlngs, t2);
    marker.setLatLng(pos2);

    if (autoFollowTrainId === schedule.train) {
      map.setView(pos2);
    }

    requestAnimationFrame(update);
  }

  update();
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

function startRealtimeTrains() {
  trainSchedule.forEach(schedule => animateTrainRealtime(schedule));
  setInterval(() => {
    trainSchedule.forEach(schedule => animateTrainRealtime(schedule));
  }, 60 * 1000);
}
