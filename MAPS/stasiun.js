const STASIUN_API_URL = "https://script.google.com/macros/s/AKfycbyVIc8r7Z8EVoIse4Dvf2epuFC1cx3dhN0eLBpIdeb6IoxJ1XD87--827BtJ4TY69mZJQ/exec";

    let activeMarker = null;
    let activeCircle = null;

function showStationInfo(stasiun, lat, lon) {
  document.getElementById("info-title").textContent = stasiun.Nama;
  document.getElementById("info-content").innerHTML = `
    <b>Kode:</b> ${stasiun.Kode}<br>
    <b>Operator:</b> ${stasiun.Operator}<br>
    ${stasiun.Tags?.wikipedia ? `<b>Wikipedia:</b> <a href="https://id.wikipedia.org/wiki/${stasiun.Tags.wikipedia.replace("id:", "")}" target="_blank">${stasiun.Nama}</a><br>` : ""}
  `;

  const photo = document.getElementById("station-photo");
  const fallback = document.getElementById("fallback-icon");

  fallback.style.display = "none";
  photo.style.display = "block";

  photo.src = stasiun.Foto && stasiun.Foto.trim() !== "" 
    ? stasiun.Foto 
    : "https://via.placeholder.com/80";

  photo.onerror = function () {
    photo.style.display = "none";
    fallback.style.display = "flex";
  };

  document.getElementById("station-info").style.display = 'block';

  // Simpan data stasiun aktif untuk openFullDetail
  window.lastStationData = stasiun;
}



    function loadStasiun() {
      fetch(STASIUN_API_URL)
        .then(response => response.json())
        .then(data => {
          data.forEach(stasiun => {
            const lat = parseFloat(String(stasiun.Lat).replace(",", "."));
            const lon = parseFloat(String(stasiun.Lon).replace(",", "."));

            if (!isNaN(lat) && !isNaN(lon)) {
              const marker = L.circleMarker([lat, lon], {
                radius: 6,
                color: 'black',
                weight: 1.5,
                fillColor: 'white',
                fillOpacity: 1
              }).addTo(map);

              marker.on('click', (e) => {
                e.originalEvent.stopPropagation(); // Cegah map click event
                if (activeMarker) {
                  activeMarker.setStyle({ color: 'black', fillColor: 'white' });
                }
                if (activeCircle) {
                  map.removeLayer(activeCircle);
                }

                marker.setStyle({ color: '#1a73e8', fillColor: '#1a73e8' });
                activeMarker = marker;

                activeCircle = L.circle([lat, lon], {
                  radius: 300,
                  color: '#1a73e8',
                  fillColor: '#1a73e8',
                  fillOpacity: 0.15,
                  weight: 1
                }).addTo(map);

                closeFullDetail(); // Tutup panel bawah jika sedang terbuka

                map.setView([lat, lon], map.getZoom(), { animate: true });
                showStationInfo(stasiun, lat, lon);
              });
            }
          });
        })
        .catch(error => {
          console.error("Gagal memuat data stasiun:", error);
        });
    }

    // Tutup info saat klik di luar marker dan panel
    map.on('click', function (e) {
      if (!e.originalEvent.target.closest('.leaflet-interactive')) {
        closeStationInfo();
      }
    });
    
function openFullDetail() {
  const stasiun = document.getElementById("info-title").textContent;
  const detailContent = document.getElementById("info-content").innerHTML;
  const photoSrc = document.getElementById("station-photo").src;

  document.getElementById("detail-title").textContent = stasiun;
  document.getElementById("detail-text").innerHTML = detailContent;
  document.getElementById("detail-photo").src = photoSrc;
  document.getElementById("detail-photo").style.display = 'block';
  document.getElementById("detail-fallback-icon").style.display = 'none';

  const tagContainer = document.getElementById("station-tags");
  tagContainer.innerHTML = "";

  const tags = window.lastStationData?.Tags || {};
  const penting = ['network', 'railway', 'operator:website'];

  penting.forEach(k => {
    if (tags[k]) {
      const badge = document.createElement('span');
      badge.textContent = tags[k]; // ✅ hanya value, tanpa key

      // Warna dinamis
      let bg = '#f0f0f0';
      if (k === 'train') bg = '#1a73e8';
      else if (k === 'railway') bg = '#fbbc04';
      else if (k === 'network') bg = '#9c27b0';
      else if (k === 'ele') bg = '#ff7043';
      else if (k === 'operator:website') bg = '#607d8b';

      badge.style.cssText = `
        background: ${bg};
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        color: white;
        font-weight: 500;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      tagContainer.appendChild(badge);
    }
  });

  document.getElementById("station-detail").style.bottom = '0';
}

function closeFullDetail() {
  document.getElementById("station-detail").style.bottom = '-100%';
}

// Drag to close
let startY = 0;
let isDragging = false;
const detailPanel = document.getElementById("station-detail");

detailPanel.addEventListener('touchstart', (e) => {
  startY = e.touches[0].clientY;
  isDragging = true;
});

detailPanel.addEventListener('touchmove', (e) => {
  if (!isDragging) return;
  const moveY = e.touches[0].clientY;
  const deltaY = moveY - startY;
  if (deltaY > 50) {
    closeFullDetail();
    isDragging = false;
  }
});

detailPanel.addEventListener('touchend', () => {
  isDragging = false;
});


function closeFullDetail() {
  document.getElementById("station-detail").style.bottom = '-100%';
}

function closeStationInfo() {
  document.getElementById("station-info").style.display = 'none';
  closeFullDetail(); // Tutup panel detail juga

  if (activeMarker) {
    activeMarker.setStyle({ color: 'black', fillColor: 'white' });
    activeMarker = null;
  }

  if (activeCircle) {
    map.removeLayer(activeCircle);
    activeCircle = null;
  }
}

function tampilkanJadwal(kodeStasiun) {
  const list = document.getElementById("schedule-list");
  list.innerHTML = ""; // Bersihkan dulu

  const jadwal = jadwalStasiun[kodeStasiun];

  if (!jadwal || jadwal.length === 0) {
    list.innerHTML = "<li style='color:#888'>Tidak ada jadwal</li>";
    return;
  }

  const jadwalStasiun = {
  "DPB": [
    { jam: "05:30", tujuan: "Jakarta Kota", kereta: "Commuter Line" },
    { jam: "06:00", tujuan: "Bogor", kereta: "Commuter Line" },
    { jam: "06:30", tujuan: "Tanah Abang", kereta: "KRL Ekonomi" }
  ],
  "SUD": [
    { jam: "05:45", tujuan: "Depok", kereta: "Commuter Line" },
    { jam: "06:20", tujuan: "Manggarai", kereta: "KRL Ekonomi" }
  ]
  // Tambahkan kode stasiun dan data lain sesuai kebutuhan
};

  jadwal.forEach(item => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.padding = "6px 0";
    li.style.borderBottom = "1px solid #eee";

    li.innerHTML = `
      <span style="font-weight:bold">${item.jam}</span>
      <span>${item.kereta} → ${item.tujuan}</span>
    `;

    list.appendChild(li);
  });
}


    loadStasiun();