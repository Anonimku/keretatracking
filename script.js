const map = L.map('map').setView([-6.9, 107.6], 7); // ubah ke lokasi Indonesia

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Muat data stasiun dan jalur
Promise.all([
  fetch('data/stasiun.json').then(res => res.json()),
  fetch('data/jalur.json').then(res => res.json())
]).then(([stasiunData, jalurData]) => {
  // Tampilkan stasiun
  stasiunData.forEach(stasiun => {
    L.circleMarker([stasiun.lat, stasiun.lon], { radius: 6, color: 'blue' })
      .addTo(map)
      .bindPopup(`<b>${stasiun.nama}</b>`);
  });

  // Tampilkan jalur
  jalurData.forEach(jalur => {
    const latlngs = jalur.koordinat.map(k => [k.lat, k.lon]);
    L.polyline(latlngs, { color: 'black' }).addTo(map);
  });

  // 🚆 Animasikan kereta
  animateTrain(jalurData[0].koordinat); // contoh animasi di jalur pertama
});

function animateTrain(coords) {
  let i = 0;
  const marker = L.circleMarker([coords[0].lat, coords[0].lon], {
    radius: 8,
    color: 'red'
  }).addTo(map);

  function move() {
    if (i < coords.length - 1) {
      marker.setLatLng([coords[i].lat, coords[i].lon]);
      i++;
      setTimeout(move, 500); // jeda 500ms per langkah
    }
  }

  move();
}
