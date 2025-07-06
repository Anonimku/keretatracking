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



  // Simpan waktu asli (untuk tampilan)

  const realTimes = schedule.times.slice();



  // Waktu datang dimajukan 5 menit (tiba lebih awal)

  const times = schedule.times.map(t => {

    const [hh, mm] = t.split(':').map(Number);

    const d = new Date(now);

    d.setHours(hh);

    d.setMinutes(mm - 5); // 5 menit lebih awal

    return d;

  });



  const trainId = schedule.train;



  // Jika sudah lewat akhir perjalanan, hapus marker

  if (now > times[times.length - 1]) {

    if (activeMarkers[trainId]) {

      activeMarkers[trainId].remove();

      delete activeMarkers[trainId];

    }

    return;

  }



  // Jika belum mulai, jangan tampilkan dulu

  if (now < times[0]) return;



  // Validasi koordinat stasiun awal dan akhir

  const startStation = schedule.stops[0];

  const endStation = schedule.stops[schedule.stops.length - 1];

  if (!stationMap[startStation] || !stationMap[endStation]) return;



  // Buat segmen antar stasiun

  const segmentCoords = [];

  const segmentTimes = [];



  for (let i = 0; i < schedule.stops.length - 1; i++) {

    const from = stationMap[schedule.stops[i]];

    const to = stationMap[schedule.stops[i + 1]];

    const fromIdx = findNearestIndex(allLatLngs, from);

    const toIdx = findNearestIndex(allLatLngs, to);

    const path = fromIdx < toIdx

      ? allLatLngs.slice(fromIdx, toIdx + 1)

      : allLatLngs.slice(toIdx, fromIdx + 1).reverse();



    segmentCoords.push(path);

    segmentTimes.push([times[i], times[i + 1]]);

  }



  // Cari segmen aktif berdasarkan waktu sekarang

  let segIdx = segmentTimes.findIndex(([start, end]) => now >= start && now < end);



  // Jika kereta sedang berhenti (dalam jeda antar segmen)

  let isStopped = false;

  if (segIdx === -1) {

    // Cek apakah kereta sedang berhenti di stasiun (±5 menit)

    for (let i = 0; i < times.length; i++) {

      const t = times[i].getTime();

      if (Math.abs(now.getTime() - t) < 5 * 60 * 1000) {

        isStopped = true;

        segIdx = i;

        break;

      }

    }

  }



  let pos;

  if (isStopped || segIdx === -1) {

    // Jika berhenti, ambil posisi stasiun

    const stopIdx = segIdx >= segmentCoords.length ? schedule.stops.length - 1 : segIdx;

    pos = stationMap[schedule.stops[stopIdx]];

  } else {

    // Hitung t pada segmen

    const [segStart, segEnd] = segmentTimes[segIdx];

    const t = (now - segStart) / (segEnd - segStart);

    pos = getPositionOnRoute(segmentCoords[segIdx], t);

  }



  // Update atau buat marker

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

  }).bindPopup(() => {

    const nextStop = getNextStation(schedule, new Date());



    const tableRows = schedule.stops.map((stop, idx) => {

      const time = realTimes[idx] || '-';

      return `<tr>

        <td style="padding: 4px 8px; border: 1px solid #ccc;">${stop}</td>

        <td style="padding: 4px 8px; border: 1px solid #ccc; text-align: center;">${time}</td>

      </tr>`;

    }).join('');



    return `

      <div style="font-size: 14px; max-height: 300px; overflow-y: auto;">

        <div style="font-size: 16px; font-weight: bold; color: red;">${trainId}</div>

        <div>${schedule.stops.join(" → ")}</div>

        <hr style="margin: 4px 0;">

        <div><b>Stasiun berikutnya:</b> ${nextStop}</div>

        <hr style="margin: 4px 0;">

        <div style="font-weight: bold; margin-bottom: 4px;">Jadwal Lengkap:</div>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">

          <thead>

            <tr style="background-color: #f0f0f0;">

              <th style="padding: 4px 8px; border: 1px solid #ccc;">Stasiun</th>

              <th style="padding: 4px 8px; border: 1px solid #ccc;">Waktu</th>

            </tr>

          </thead>

          <tbody>

            ${tableRows}

          </tbody>

        </table>

      </div>

    `;

  }).addTo(map);



  marker.on('click', () => {

    autoFollowTrainId = trainId;

    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 12));

  });



  marker.on('popupclose', () => {

    autoFollowTrainId = null;

  });



  activeMarkers[trainId] = marker;



  // Update posisi animasi real-time

  function update() {

    const now2 = new Date();

    if (now2 >= times[times.length - 1]) {

      marker.remove();

      delete activeMarkers[trainId];

      return;

    }



    // Update posisi

    let newSegIdx = segmentTimes.findIndex(([start, end]) => now2 >= start && now2 < end);

    let newPos;



    if (newSegIdx === -1) {

      newPos = pos;

    } else {

      const [segStart, segEnd] = segmentTimes[newSegIdx];

      const t2 = (now2 - segStart) / (segEnd - segStart);

      newPos = getPositionOnRoute(segmentCoords[newSegIdx], t2);

    }



    marker.setLatLng(newPos);

    if (autoFollowTrainId === trainId) map.setView(newPos);

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
