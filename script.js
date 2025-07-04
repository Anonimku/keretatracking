const map = L.map('map', {
  preferCanvas: true,
  maxBounds: L.latLngBounds(
    L.latLng(-11.2, 94.9),  // batas barat daya Indonesia
    L.latLng(6.3, 141.0)    // batas timur laut Indonesia
  ),
  maxBoundsViscosity: 1.0
}).setView([-6.13, 106.82], 7);

// Tile dasar: CARTO Light
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap & Carto',
  subdomains: 'abcd',
  maxZoom: 19,
  minZoom: 5
}).addTo(map);

// Overlay: OpenRailwayMap
L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>',
  subdomains: ['a', 'b', 'c'],
  maxZoom: 19
}).addTo(map);

// Daftar file jalur + warna
const jalurFiles = [
  { file: 'data/JalurKertaCepat.json', color: 'orange' },
  { file: 'data/JalurLRT.json', color: 'green' },
  { file: 'data/JalurMRT.json', color: 'purple' },
  { file: 'data/JalurBiasa.json', color: 'red' }
];

// Loop semua jalur
jalurFiles.forEach(({ file, color }) => {
  fetch(file)
    .then(res => res.json())
    .then(geo => {
      if (geo.type === "GeometryCollection") {
        geo.geometries.forEach(geometry => {
          if (geometry.type === "MultiLineString") {
            geometry.coordinates.forEach((segment, i) => {
              const latlngs = segment.map(c => [c[1], c[0]]);

              // Tambahkan jalur transparan
              L.polyline(latlngs, {
                color: color,
                weight: 3,
                opacity: 0  // tidak terlihat
              }).addTo(map);

              // Tambahkan kereta animasi
              if (latlngs.length >= 2) {
                buatKeretaAnimasi(latlngs, color);
              }
            });
          }
        });
      }
    });
});

// Fungsi animasi kereta
function buatKeretaAnimasi(jalur, warna) {
  let index = 0;
  let t = 0;
  const speed = 0.0025;

  const kereta = L.circleMarker(jalur[0], {
    radius: 6,
    color: 'black',
    fillColor: warna,
    fillOpacity: 1
  }).bindPopup(`🚆 Kereta (${warna.toUpperCase()})`).addTo(map);

  function animate() {
    if (jalur.length < 2) return;

    const from = jalur[index];
    const to = jalur[index + 1];
    const pos = lerpLatLng(from, to, t);
    kereta.setLatLng(pos);

    t += speed;
    if (t >= 1) {
      t = 0;
      index++;
      if (index >= jalur.length - 1) index = 0;
    }

    requestAnimationFrame(animate);
  }

  animate();
}

// Fungsi bantu interpolasi posisi
function lerpLatLng(p1, p2, t) {
  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t
  ];
}
