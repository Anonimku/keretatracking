const map = L.map('map', {
  preferCanvas: true,
  maxZoom: 20,
  minZoom: 5,
  maxBounds: L.latLngBounds(L.latLng(-11.2, 94.9), L.latLng(6.3, 141.0)),
  maxBoundsViscosity: 1.0
}).setView([-6.13, 106.82], 7);

// === MapTiler tile ===
L.tileLayer('https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=mGVjpcSejQdJkMddoEoq', {
  tileSize: 512,
  zoomOffset: -1,
  attribution: '&copy; <a href="https://www.maptiler.com/">MapTiler</a>'
}).addTo(map);

// === Jalur OpenRailwayMap ===
L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
  subdomains: ['a', 'b', 'c'],
  maxZoom: 20,
  opacity: 0.6
}).addTo(map);

// ==================== DATA ====================
let jalurArah1 = []; // Untuk arah A ke B
let jalurArah2 = []; // Untuk arah B ke A
let jalurLRTArah1 = [];
let jalurLRTArah2 = [];
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
        g.coordinates.forEach((seg, index) => {
          const path = seg.map(c => L.latLng(c[1], c[0]));

          if (index % 2 === 0) {
            jalurArah1.push(path); // arah 1 (misalnya ke Bandung)
          } else {
            jalurArah2.push(path); // arah 2 (misalnya ke Jakarta)
          }
        });
      }
    });

    // Gabungkan untuk fungsi findRoute
    jalurPerSegmen = [...jalurArah1, ...jalurArah2];


    loadStations();
  });

fetch('data/JalurLRT.json')
  .then(res => res.json())
  .then(geo => {
    const geometries = geo.geometries || geo.features?.map(f => f.geometry) || [];

    geometries.forEach(g => {
      if (g.type === "MultiLineString") {
        g.coordinates.forEach((seg, index) => {
          const path = seg.map(c => L.latLng(c[1], c[0]));

          if (index % 2 === 0) {
  jalurLRTArah1.push(path); // simpan sebagai segmen
} else {
  jalurLRTArah2.push(path); // simpan sebagai segmen
}

          // Untuk debugging visualisasi (boleh dihapus jika ingin tersembunyi)
          L.polyline(path, {
            color: "#800080", // LRT Ungu
            weight: 4,
            opacity: 0
          }).addTo(map);
        });
      }
    });
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
      loadScheduleLRT();
loadScheduleKCIC();

    });
}

map.on('zoomend', () => {
  const zoom = map.getZoom();
  stationMarkers.forEach(m => zoom >= 11 ? map.addLayer(m) : map.removeLayer(m));
});

// ============== JADWAL KERETA =================
function loadScheduleLRT() {
  fetch("https://script.google.com/macros/s/AKfycbxFqzbqbNLEhh0EEQLKae8wxksxrJNbv0fE1JZgpUvCk_Dl7XVqYAUDDpoNzF2AVUj1/exec")
    .then(res => res.json())
    .then(data => {
      const lrtData = data.map(item => ({
        train: item.train,
        stops: Array.isArray(item.stops) ? item.stops : item.stops.split(',').map(s => s.trim()),
        times: Array.isArray(item.times) ? item.times : item.times.split(',').map(s => s.trim()),
        hari: Array.isArray(item.hari) ? item.hari : item.hari.split(',').map(s => s.trim()),
        arah: 1 // default
      }));
      trainSchedule.push(...lrtData);
      console.log("Jadwal LRT dimuat:", trainSchedule);
      startRealtimeTrains(); // ini harus kamu pastikan bekerja
    });
}

function loadScheduleKCIC() {
  fetch("https://script.google.com/macros/s/AKfycbyIsWOyuir9j0zaqs8imoii72IEEtN990cfvFy-pFlN663K5o3OvT8i3fX0yXZQ_Ct7/exec")
    .then(res => res.json())
    .then(data => {
      const kcicData = data.map(item => ({
        train: item.train,
        stops: item.stops.split(',').map(s => s.trim()),
        times: item.times.split(',').map(s => s.trim()),
        hari: item.hari.split(',').map(s => s.trim()),
        arah: parseInt(item.arah || '1')
      }));
      trainSchedule.push(...kcicData);
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
function findRouteBetweenStations(fromStation, toStation, arah = '1', isLRT = false) {
  const from = stationMap[fromStation];
  const to = stationMap[toStation];
  if (!from || !to) return null;

  let bestPath = null;
  let minDistSum = Infinity;
  const jalur = isLRT
    ? (arah === '1' ? jalurLRTArah1 : jalurLRTArah2)
    : (arah === '1' ? jalurArah1 : jalurArah2);

  jalur.forEach(path => {
    const i1 = findNearestIndex(path, from);
    const i2 = findNearestIndex(path, to);
    const d1 = path[i1].distanceTo(from);
    const d2 = path[i2].distanceTo(to);
    const totalDist = d1 + d2;

    // ✅ Tambahkan batas maksimum jarak ke jalur (misal: 500 meter)
    if (totalDist < minDistSum && d1 < 500 && d2 < 500) {
      minDistSum = totalDist;
      bestPath = i1 < i2 ? path.slice(i1, i2 + 1) : path.slice(i2, i1 + 1).reverse();
    }
  });

  return bestPath;
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

  const start = times[0];
  const end = times[times.length - 1];
  const trainId = schedule.train;
  const arah = parseInt(trainId.replace(/\D/g, '')) % 2 === 1 ? '2' : '1';
  const isLRT = trainId.toLowerCase().includes("lrt");

  if (now < start || now > end) {
    if (activeMarkers[trainId]) {
      activeMarkers[trainId].remove();
      delete activeMarkers[trainId];
    }
    return;
  }

  const getTrainPosition = (now) => {
    let currentIndex = -1;
    for (let i = 0; i < times.length - 1; i++) {
      if (now >= times[i] && now <= times[i + 1]) {
        currentIndex = i;
        break;
      }
    }
    if (currentIndex === -1) return null;

    const from = schedule.stops[currentIndex];
    const to = schedule.stops[currentIndex + 1];
    const tStart = times[currentIndex];
    const tEnd = times[currentIndex + 1];
    const segPath = findRouteBetweenStations(from, to, arah, isLRT);
    if (!segPath || segPath.length === 0) return null;

    const t = (now - tStart) / (tEnd - tStart);
    const pos = getPositionOnRoute(segPath, t);
    return pos;
  };

  const pos = getTrainPosition(now);
  if (!pos) return;

  // Marker update atau buat baru
  if (activeMarkers[trainId]) {
    activeMarkers[trainId].setLatLng(pos);
  } else {
    const marker = L.circleMarker(pos, {
      radius: isLRT ? 6 : 8,
      color: 'white',
      weight: 2,
      fillColor: isLRT ? '#800080' : '#FF0000',
      fillOpacity: 1
    })
    .bindTooltip(`${trainId}`, {
      permanent: false,
      direction: 'right',
      offset: [10, 0],
      className: isLRT ? 'train-tooltip small' : 'train-tooltip'
    })
    .bindPopup(() => {
      const nextIndex = schedule.times.findIndex(time => {
        const [hh, mm] = time.split(':').map(Number);
        const d = new Date(now);
        d.setHours(hh, mm, 0, 0);
        return d > now;
      });

      const nextStation = schedule.stops[nextIndex] || '–';
      const nextTime = schedule.times[nextIndex] || '–';
      const trainName = `Kereta ${trainId}`;
      const dari = schedule.stops[0];
      const ke = schedule.stops[schedule.stops.length - 1];

      const photo = isLRT
        ? 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/LRT_Jakarta.jpg/1280px-LRT_Jakarta.jpg'
        : 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/KCIC_400-5_with_Whoosh_logo.jpg/1920px-KCIC_400-5_with_Whoosh_logo.jpg';

      const logo = isLRT
        ? 'https://upload.wikimedia.org/wikipedia/id/0/0a/Logo_LRT_Jakarta.png'
        : 'https://upload.wikimedia.org/wikipedia/commons/a/ab/WHOOSH_Logo.svg';

      const rows = schedule.stops.map((stop, i) => `
        <div style="padding: 6px 10px; font-size: 12px; display: flex; justify-content: space-between; background: #f6f6f6; border-radius: 6px; margin-bottom: 6px;">
          <span>${stop}</span>
          <span style="color: #666;">${schedule.times[i] || '–'}</span>
        </div>
      `).join('');

      return `
        <style>.no-scrollbar::-webkit-scrollbar { display: none; }</style>
        <div class="no-scrollbar" style="width: 270px; max-height: 230px; overflow-y: auto; font-family: 'Segoe UI', Roboto, sans-serif; background: white; color: #222; border-radius: 10px; scrollbar-width: none; -ms-overflow-style: none;">
          <img src="${photo}" style="width: 100%; height: 120px; object-fit: cover; border-top-left-radius: 10px; border-top-right-radius: 10px;">
          <div style="padding: 10px 14px 6px; display: flex; align-items: center; justify-content: space-between;">
            <div style="font-size: 14px; font-weight: 600;">${trainName}</div>
            <img src="${logo}" alt="Logo" style="height: 20px; max-height: 20px; object-fit: contain;">
          </div>
          <div style="font-size: 12px; color: #666; padding: 0 14px 10px;">${dari} — ${ke}</div>
          <div style="font-size: 12px; padding: 0 14px 12px;">
            <div style="color: #888;">Stasiun berikutnya:</div>
            <div><strong>${nextStation}</strong> <span style="color: #333;">${nextTime}</span></div>
          </div>
          <div style="height: 1px; background: #eee; margin: 0 14px 10px;"></div>
          <div style="padding: 0 14px 14px;">
            <div style="font-size: 12px; color: #888; margin-bottom: 6px;">Jadwal lengkap:</div>
            ${rows}
          </div>
        </div>
      `;
    })
    .addTo(map);

    activeMarkers[trainId] = marker;

    // Zoom logic
    if (map.getZoom() >= 13) marker.openTooltip();
    map.on('zoomend', () => {
      const z = map.getZoom();
      if (z >= 8) marker.openTooltip(); else marker.closeTooltip();
      stationMarkers.forEach(m => z >= 11 ? map.addLayer(m) : map.removeLayer(m));
      Object.values(activeMarkers).forEach(m => z >= 8 ? m.addTo(map) : m.remove());
    });

    marker.on('popupopen', () => marker.closeTooltip());
    marker.on('popupclose', () => { if (map.getZoom() >= 11) marker.openTooltip(); });
    marker.on('click', () => {
      autoFollowTrainId = trainId;
      map.setView(marker.getLatLng(), 12);
    });
    marker.on('popupclose', () => { autoFollowTrainId = null; });
  }

  // Mulai animasi realtime berdasarkan segmen
  function update() {
    const now2 = new Date();
    if (now2 > end) {
      if (activeMarkers[trainId]) {
        activeMarkers[trainId].remove();
        delete activeMarkers[trainId];
      }
      return;
    }

    const pos2 = getTrainPosition(now2);
    if (pos2 && activeMarkers[trainId]) {
      activeMarkers[trainId].setLatLng(pos2);
      if (autoFollowTrainId === trainId) map.setView(pos2);
    }

    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

function startRealtimeTrains() {
  trainSchedule.forEach(schedule => {
    if (!activeMarkers[schedule.train]) {
      // Tentukan jalur berdasarkan jenis kereta
      const isLRT = schedule.train.startsWith("LRT");
      const jalur = isLRT
        ? (schedule.arah === 1 ? jalurLRTArah1 : jalurLRTArah2)
        : (schedule.arah === 1 ? jalurArah1 : jalurArah2);

      animateTrainRealtime(schedule, jalur);
    }
  });
}
