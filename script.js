// =====================================================
// ============== FUNGSI CACHING GEOJSON ==============
// =====================================================
function cacheFetch(url, key, ttl = 3600) {
  const now = Date.now();
  const cached = localStorage.getItem(key);
  const expiry = localStorage.getItem(`${key}_expiry`);
  if (cached && expiry && now < Number(expiry)) {
    return Promise.resolve(JSON.parse(cached));
  }
  return fetch(url)
    .then(res => res.json())
    .then(data => {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem(`${key}_expiry`, now + ttl * 1000);
      return data;
    });
}

// =====================================================
// ================ INISIALISASI PETA =================
// =====================================================
const map = L.map('map', {
  preferCanvas: true,
  zoomControl: false, // ← Tambahkan ini untuk menonaktifkan tombol zoom
  maxZoom: 20,
  minZoom: 5,
  maxBounds: L.latLngBounds(L.latLng(-11.2, 94.9), L.latLng(6.3, 141.0)),
  maxBoundsViscosity: 1.0
}).setView([-6.13, 106.82], 7);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap & CARTO',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(map);

L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
  subdomains: ['a', 'b', 'c'],
  maxZoom: 20
}).addTo(map);

map.attributionControl.setPrefix(false);
map.attributionControl.setPosition('bottomright');
map.attributionControl.addAttribution(
  'Data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
);
L.control.scale({
  metric: true,
  imperial: false,
  position: 'bottomright' // tampilkan di kanan bawah
}).addTo(map);

// =====================================================
// ================ VARIABEL GLOBAL ====================
// =====================================================

let jalurArah1 = []; // Untuk arah A ke B
let jalurArah2 = []; // Untuk arah B ke A
let jalurLRTArah1 = [];
let jalurLRTArah2 = [];
let stationMap = {};
let stationMarkers = [];
let trainSchedule = [];
let activeMarkers = {};
let autoFollowTrainId = null;
let selectedTrainId = null;
let sidebarJustOpened = false;


// =====================================================
// ============== LOAD GEOJSON JALUR ===================
// =====================================================
Promise.all([
  cacheFetch('data/JalurKertaCepat.json', 'jalurKCIC'),
  cacheFetch('data/JalurLRT.json', 'jalurLRT')
])
.then(([kcicData, lrtData]) => {
  // Proses Jalur Kereta Cepat (KCIC)
  const geometriesKCIC = kcicData.geometries || kcicData.features?.map(f => f.geometry) || [];
  geometriesKCIC.forEach(g => {
    if (g.type === "MultiLineString") {
      g.coordinates.forEach((seg, index) => {
        const path = seg.map(c => L.latLng(c[1], c[0]));
        if (index % 2 === 0) jalurArah1.push(path);
        else jalurArah2.push(path);
      });
    }
  });

  // Proses Jalur LRT
  const geometriesLRT = lrtData.geometries || lrtData.features?.map(f => f.geometry) || [];
  geometriesLRT.forEach(g => {
    if (g.type === "MultiLineString") {
      g.coordinates.forEach((seg, index) => {
        const path = seg.map(c => L.latLng(c[1], c[0]));
        if (index % 2 === 0) jalurLRTArah1.push(path);
        else jalurLRTArah2.push(path);

        L.polyline(path, {
          color: "#800080",
          weight: 4,
          opacity: 0 // Atur visibilitas jalur di awal
        }).addTo(map);
      });
    }
  });

  // Gabungkan semua jalur untuk keperluan animasi atau tampilan
  jalurPerSegmen = [...jalurArah1, ...jalurArah2];
  loadStations(); // Panggil fungsi lanjutan setelah jalur selesai dimuat
});

// =====================================================
// ============== STASIUN DARI SHEET ===================
// =====================================================

function loadStations() {
  fetch('https://script.google.com/macros/s/AKfycbxOOcb5HYdFFR8Pwv4bZ75UHARyDg_tQbzNH9oROpBgQy1IcNef0PrIHKtOErm-wGaR/exec')
    .then(res => res.json())
    .then(data => {
      data.forEach(s => {
        const lat = parseFloat((s.Lat || '').toString().replace(',', '.'));
        const lon = parseFloat((s.Lon || '').toString().replace(',', '.'));
        if (isNaN(lat) || isNaN(lon)) return;

        // Marker tidak langsung ditambahkan ke peta
        const marker = L.circleMarker([lat, lon], {
          radius: 3,
          color: 'black',
          weight: 1.5,
          fillColor: 'white',
          fillOpacity: 0.9
        }).bindPopup(`<b>${s.Nama}</b><br>Kode: ${s.Kode}<br>Operator: ${s.Operator}`);

        stationMap[s.Nama] = L.latLng(lat, lon);
        stationMarkers.push(marker);
      });

      // Panggil zoomend manual agar menyesuaikan dengan zoom awal
      map.fire('zoomend');

      loadScheduleLRT();
      loadScheduleKCIC();
    });
}

// Tangani zoom: tambah atau hapus marker sesuai level zoom
map.on('zoomend', () => {
  const z = map.getZoom();
  stationMarkers.forEach(m => {
    const newRadius = z >= 15 ? 5 : z >= 12 ? 4 : 2;
    m.setRadius(newRadius);

    // Tampilkan hanya jika zoom cukup dekat
    if (z >= 11) {
      if (!map.hasLayer(m)) map.addLayer(m);
    } else {
      if (map.hasLayer(m)) map.removeLayer(m);
    }
  });
});


// =====================================================
// ============== LOAD JADWAL KERETA ===================
// =====================================================

function loadScheduleLRT() {
  fetch("https://script.google.com/macros/s/AKfycbxFqzbqbNLEhh0EEQLKae8wxksxrJNbv0fE1JZgpUvCk_Dl7XVqYAUDDpoNzF2AVUj1/exec")
    .then(res => res.json())
    .then(data => {
      const lrtData = data.map(item => ({
        train: item.train,
        stops: Array.isArray(item.stops) ? item.stops : item.stops.split(',').map(s => s.trim()),
        times: Array.isArray(item.times) ? item.times : item.times.split(',').map(s => s.trim()),
        hari: Array.isArray(item.hari) ? item.hari : item.hari.split(',').map(s => s.trim()),
        arah: 1,
        line: item.line || '',
        jenis: item.jenis || 'lrt'
      }));

      lrtData.forEach(adjustLRTStopTimes);
      trainSchedule.push(...lrtData);
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
        arah: parseInt(item.arah || '1'),
        jenis: item.jenis || 'whoosh'
      }));
      kcicData.forEach(adjustKCICStopTimes);
      trainSchedule.push(...kcicData);
      startRealtimeTrains();
    });
}
// =====================================================
// ========= PENYESUAIAN WAKTU KCIC (KARAWANG/PADALARANG) ========
// =====================================================

function adjustKCICStopTimes(schedule) {
  const newStops = [];
  const newTimes = [];
  const newLabels = [];

  schedule.stops.forEach((stop, i) => {
    const time = schedule.times[i];

    if (stop.toLowerCase().includes('karawang')) {
      const dt = parseTime(time);
      dt.setMinutes(dt.getMinutes() - 2);

      newStops.push(stop);          newTimes.push(formatTime(dt));  newLabels.push('Tiba');
      newStops.push(stop);          newTimes.push(time);             newLabels.push('Berangkat');

    } else if (stop.toLowerCase().includes('padalarang')) {
      const dt = parseTime(time);
      dt.setMinutes(dt.getMinutes() - 3);

      newStops.push(stop);          newTimes.push(formatTime(dt));  newLabels.push('Tiba');
      newStops.push(stop);          newTimes.push(time);             newLabels.push('Berangkat');

    } else {
      newStops.push(stop);          newTimes.push(time);            newLabels.push('');
    }
  });

  schedule.stops = newStops;
  schedule.times = newTimes;
  schedule.labels = newLabels; // ← digunakan saat render
}


// Tools bantu
function parseTime(str) {
  const [h, m] = str.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatTime(date) {
  return date.toTimeString().slice(0, 5);
}

// =====================================================
// ========= PENYESUAIAN WAKTU LRT ========
// =====================================================

function adjustLRTStopTimes(schedule) {
  const newStops = [];
  const newTimes = [];
  const newLabels = [];

  schedule.stops.forEach((stop, i) => {
    const time = schedule.times[i];
    const dt = parseTime(time);
    dt.setSeconds(dt.getSeconds() - 30); // tiba 30 detik sebelum

    newStops.push(stop);
    newTimes.push(formatTime(dt));
    newLabels.push("Tiba");

    newStops.push(stop);
    newTimes.push(time);
    newLabels.push("Berangkat");
  });

  schedule.stops = newStops;
  schedule.times = newTimes;
  schedule.labels = newLabels;
}

// =====================================================
// ============== TOOLS BANTU PERHITUNGAN ==============
// =====================================================

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

// =====================================================
// =========== RUTE ANTAR STASIUN (FIND ROUTE) =========
// =====================================================

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


/// ==================== IKON KERETA ====================
function getIconByType(type) {
  type = (type || '').toLowerCase();
  if (type.includes("lrt")) return "tram";
  if (type.includes("mrt")) return "subway";
  if (type.includes("whoosh")) return "train";
  return "directions_railway";
}

// ============ ANIMASI REALTIME KERETA ================
function animateTrainRealtime(schedule, jalur) {
  const now = new Date();
  const dayName = now.toLocaleDateString('id-ID', { weekday: 'long' });
  if (!schedule.hari.includes(dayName)) return;

  const trainId = schedule.train;
  const arah = parseInt(schedule.arah || '1');
  const isLRT = trainId.toLowerCase().includes("lrt");

  const times = schedule.times.map(t => {
    const [hh, mm] = t.split(':').map(Number);
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    return d;
  });

  // Gunakan fungsi untuk memastikan end time selalu akurat
  function getEndTime() {
    const [hh, mm] = schedule.times[schedule.times.length - 1].split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d;
  }

  function getStartTime() {
    const [hh, mm] = schedule.times[0].split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d;
  }

const start = getStartTime();
if (now < start || now > getEndTime()) {
  if (activeMarkers[trainId]) {
    activeMarkers[trainId].remove();
    delete activeMarkers[trainId];
  }
  return;
}

  const getTrainPosition = (currentTime) => {
  const lastTime = times[times.length - 1];
  if (currentTime > lastTime) return null;


  for (let i = 0; i < times.length - 1; i++) {
    if (currentTime >= times[i] && currentTime <= times[i + 1]) {
      const from = schedule.stops[i];
      const to = schedule.stops[i + 1];
      const tStart = times[i];
      const tEnd = times[i + 1];
      const segPath = findRouteBetweenStations(from, to, arah.toString(), isLRT);
      if (!segPath || segPath.length === 0) return null;
      const progress = (currentTime - tStart) / (tEnd - tStart);
      return getPositionOnRoute(segPath, progress);
    }
  }

  return null;
};


  const lineRaw = (schedule.line || '').trim().toLowerCase();
  const jenis = (schedule.jenis || '').trim().toLowerCase();

  let fillColor = '#FF0000';
  const lineInfo = lineRaw.includes("bekasi") ? { name: 'LRT Bekasi Line', color: '#006400' }
                : lineRaw.includes("cibubur") ? { name: 'LRT Cibubur Line', color: '#003366' }
                : lineRaw.includes("jakabaring") ? { name: 'LRT Jakabaring Line', color: '#003366' }
                : null;

  if (lineInfo) fillColor = lineInfo.color;
  else if (jenis === 'mrt') fillColor = '#8B008B';
  else if (jenis === 'whoosh') fillColor = '#da2020ff';
  else if (jenis === 'biasa') fillColor = '#A9A9A9';

  let tooltipClass = 'train-tooltip';
  if (isLRT) {
    if (lineRaw.includes('bekasi')) tooltipClass += ' small bekasi';
    else if (lineRaw.includes('cibubur')) tooltipClass += ' small cibubur';
    else if (lineRaw.includes('jakabaring')) tooltipClass += ' small jakabaring';
  } else if (jenis === 'mrt') tooltipClass += ' small mrt';
  else if (jenis === 'whoosh') tooltipClass += ' small whoosh';

  const pos = getTrainPosition(now);
  if (!pos) return;

  if (!activeMarkers[trainId]) {
    const marker = L.circleMarker(pos, {
      radius: 8,
      color: 'white',
      weight: 2,
      fillColor: fillColor,
      fillOpacity: 1
    }).bindTooltip(`${trainId}`, {
      permanent: false,
      direction: 'right',
      offset: [10, 0],
      className: tooltipClass
    }).addTo(map);

    activeMarkers[trainId] = marker;

    if (map.getZoom() >= 13) marker.openTooltip();

    marker.on('popupopen', () => marker.closeTooltip());
    marker.on('popupclose', () => {
      if (map.getZoom() >= 11) marker.openTooltip();
      if (autoFollowTrainId === trainId) autoFollowTrainId = null;
    });

marker.on('click', (e) => {
  // 🔁 Kembalikan warna marker sebelumnya jika ada
  if (selectedTrainId && selectedTrainId !== trainId && activeMarkers[selectedTrainId]) {
    const prevMarker = activeMarkers[selectedTrainId];
    prevMarker.setStyle({ fillColor: getColorBySchedule(trainSchedule.find(s => s.train === selectedTrainId)) });
  }

  // 🟦 Tandai kereta ini sebagai aktif
  selectedTrainId = trainId;
  marker.setStyle({ fillColor: '#0044ffff' }); // Warna biru saat aktif

  const content = generatePopupContent(schedule, trainId, new Date(), isLRT, lineInfo);
  const sidebar = document.getElementById('trainSidebar');
sidebar.innerHTML = content;
sidebar.style.display = 'block';
sidebar.classList.add('show');

sidebarJustOpened = true;
setTimeout(() => { sidebarJustOpened = false; }, 200);

// 🎯 Pindahkan ini ke bawah setelah sidebar.innerHTML
setTimeout(() => {
  const closeBtn = document.getElementById('sidebarCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeTrainSidebar();
    });
  }
}, 10); // Pastikan DOM sudah render

  sidebar.innerHTML = content;
  sidebar.style.display = 'block';
  sidebar.classList.add('show');

  const closeBtn = document.getElementById('sidebarCloseBtn');
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    closeTrainSidebar();
  });
}

  sidebarJustOpened = true;
  setTimeout(() => { sidebarJustOpened = false; }, 200);

  map.panTo(marker.getLatLng());
});

document.addEventListener('click', function (e) {
  const sidebar = document.getElementById('trainSidebar');
  if (!sidebar) return;
  
  if (sidebarJustOpened || !sidebar.classList.contains('show')) return;

  if (!sidebar.contains(e.target)) {
    closeTrainSidebar(); // ✅ gunakan fungsi yang sudah ada
  }
});

// =====================================================
// ========= FUNGSI RESET & CLOSE SIDEBAR ==============
// =====================================================
function closeTrainSidebar() {
  const sidebar = document.getElementById('trainSidebar');
  if (!sidebar) return;

  sidebar.classList.remove('show');
  setTimeout(() => {
    sidebar.style.display = 'none';
  }, 300);

  // 🔁 Reset warna marker
  if (selectedTrainId && activeMarkers[selectedTrainId]) {
    const schedule = trainSchedule.find(s => s.train === selectedTrainId);
    if (schedule) {
      activeMarkers[selectedTrainId].setStyle({
        fillColor: getColorBySchedule(schedule)
      });
    }
    selectedTrainId = null;
  }
}


    map.on('zoomend', () => {
  const z = map.getZoom();
  
  // ⛔ Jangan tampilkan kembali marker yang sudah dihapus dari activeMarkers
  if (!activeMarkers[trainId]) return;

  if (z >= 8) {
    activeMarkers[trainId].openTooltip();
    activeMarkers[trainId].addTo(map);
  } else {
    activeMarkers[trainId].closeTooltip();
    activeMarkers[trainId].remove();
  }

  stationMarkers.forEach(m => z >= 11 ? map.addLayer(m) : map.removeLayer(m));
});

  }

function update() {
  const now2 = new Date();
  const pos2 = getTrainPosition(now2);

  // Hapus marker jika kereta sudah tidak punya posisi (sudah selesai)
if (!pos2) {
  if (activeMarkers[trainId]) {
    // Pastikan sekarang sudah lewat dari waktu terakhir
    const lastTime = times[times.length - 1];
    if (now2 > lastTime) {
      activeMarkers[trainId].remove();
      delete activeMarkers[trainId];
    }
  }
  return;
}

  if (activeMarkers[trainId]) {
    activeMarkers[trainId].setLatLng(pos2);
    if (autoFollowTrainId === trainId) map.setView(pos2);

    if (activeMarkers[trainId].isPopupOpen()) {
      const content = generatePopupContent(schedule, trainId, now2, isLRT, lineInfo);
      activeMarkers[trainId].setPopupContent(content);
    }
  }

  requestAnimationFrame(update);
}
  requestAnimationFrame(update);
}

// =====================================================
// ===== WARNA MARKER BERDASARKAN JADWAL ===============
// =====================================================
function getColorBySchedule(schedule) {
  const lineRaw = (schedule.line || '').trim().toLowerCase();
  const jenis = (schedule.jenis || '').trim().toLowerCase();

  if (lineRaw.includes("bekasi")) return '#006400';
  if (lineRaw.includes("cibubur")) return '#003366';
  if (lineRaw.includes("jakabaring")) return '#003366';
  if (jenis === 'mrt') return '#8B008B';
  if (jenis === 'whoosh') return '#da2020ff';
  if (jenis === 'biasa') return '#A9A9A9';

  return '#FF0000'; // default
}

// =====================================================
// ========= GENERATE POPUP / SIDEBAR KERETA ===========
// =====================================================
function generatePopupContent(schedule, trainId, now, isLRT, lineInfo) {
  const nextIndex = schedule.times.findIndex(time => {
    const [hh, mm] = time.split(':').map(Number);
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    return d > now;
  });

  const nextStation = schedule.stops[nextIndex] || '–';
  const nextTime = schedule.times[nextIndex] || '–';
  const dari = schedule.stops[0];
  const ke = schedule.stops[schedule.stops.length - 1];

  const fullTimes = schedule.times.map(t => {
    const [hh, mm] = t.split(':').map(Number);
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    return d;
  });

  const rows = schedule.stops.map((stop, i) => {
    const label = schedule.labels?.[i] || '';
    if (label === 'Tiba') return '';

    const stopTime = fullTimes[i];
    const nextStopTime = fullTimes[i + 1] || stopTime;

    const isNow = now >= stopTime && now <= nextStopTime;
    const isPast = now > nextStopTime || (!isNow && stopTime < now && !label);

    const dotColor = isNow ? '#FFA500' : isPast ? '#bbb' : '#1E90FF';
    const lineColor = isPast ? '#ddd' : '#1E90FF';
    const textColor = isNow ? '#000' : isPast ? '#999' : '#222';
    const fontWeight = isNow ? 'bold' : 'normal';

  return `
    <div style="display: flex; align-items: flex-start; margin-bottom: 0;">
      <div style="width: 20px; display: flex; flex-direction: column; align-items: center;">
        <div style="width: 10px; height: 10px; background: ${dotColor}; border-radius: 50%; z-index: 2;"></div>
        ${i < schedule.stops.length - 1
          ? `<div style="width: 2px; height: 24px; background: ${lineColor}; margin-top: 0px;"></div>`
          : ''
        }
      </div>
      <div style="flex: 1; padding-left: 8px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; color: ${textColor}; font-weight: ${fontWeight}; border-bottom: 1px solid #eee; padding: 6px 0; margin-top: -12px;">
        <span>${stop}</span>
        <span>${schedule.times[i] || '–'}</span>
      </div>
    </div>`;
}).join('');

  const photo = isLRT
    ? 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/LRT_Jakarta.jpg/1280px-LRT_Jakarta.jpg'
    : 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/KCIC_400-5_with_Whoosh_logo.jpg/1920px-KCIC_400-5_with_Whoosh_logo.jpg';

  const logo = isLRT
    ? 'https://upload.wikimedia.org/wikipedia/id/0/0a/Logo_LRT_Jakarta.png'
    : 'https://upload.wikimedia.org/wikipedia/commons/a/ab/WHOOSH_Logo.svg';

  const trainName = `Kereta ${trainId}`.replace(/kereta\s*/gi, '');

  return `
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded" rel="stylesheet" />
    <style>
      .material-symbols-rounded {
        font-variation-settings: 'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 24;
        font-size: 16px; vertical-align: middle; color: #444;
      }
      .sidebar-close-btn {
        background: none;
        border: none;
        font-size: 22px;
        font-weight: bold;
        color: #666;
        cursor: pointer;
      }
    </style>

    <div style="width: 100%; font-family: 'Segoe UI', Roboto, sans-serif; background: white; color: #222; border-radius: 10px; overflow: hidden;">
      <div style="position: relative;">
        <img src="${photo}" style="width: 100%; height: 120px; object-fit: cover;">
<button id="sidebarCloseBtn" style="
  position: absolute;
  top: 10px;
  right: 10px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  cursor: pointer;
">
  <span class="material-symbols-rounded" style="font-size: 20px; color: #444;">close</span>
</button>


      </div>
      <div style="padding: 12px 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600;">
            <span class="material-symbols-rounded">${getIconByType(trainId)}</span>
            ${lineInfo ? `<div style="font-size: 10px; color: white; background: ${lineInfo.color}; padding: 2px 6px; border-radius: 4px;">${lineInfo.name}</div>` : ''}
            <div>${trainName}</div>
          </div>
          <img src="${logo}" style="height: 20px; max-width: 60px;">
        </div>
        <div style="font-size: 12px; color: #666; margin: 8px 0 14px;">${dari} — ${ke}</div>

        <div style="font-size: 12px; background: #f8f8f8; padding: 8px 10px; border-radius: 6px; margin-bottom: 16px;">
          <div style="font-weight: 500; color: #888;">Stasiun berikutnya:</div>
          <div style="font-weight: bold; color: #333;">${nextStation} <span style="font-weight: normal; color: #666;">${nextTime}</span></div>
        </div>

        <div>
          <div style="font-size: 11px; color: #888; margin-bottom: 8px;">Jadwal lengkap:</div>
          ${rows}
        </div>
      </div>
    </div>
  `;
}



// =====================================================
// ============== START REALTIME TRAINS ================
// =====================================================
function startRealtimeTrains() {
  // Tidak perlu hapus marker
  trainSchedule.forEach(schedule => {
    const isLRT = schedule.train.toLowerCase().startsWith("lrt");
    const arahVal = parseInt(schedule.arah || '1');
    const jalur = isLRT
      ? (arahVal === 1 ? jalurLRTArah1 : jalurLRTArah2)
      : (arahVal === 1 ? jalurArah1 : jalurArah2);

    animateTrainRealtime(schedule, jalur);
  });
}


// Mulai update realtime tiap 10 detik
setInterval(startRealtimeTrains, 10000);

