// =====================================================
// ================= INISIALISASI PETA =================
// =====================================================
const map = L.map('map', {
  preferCanvas: true,
  zoomControl: false,
  maxZoom: 20,
  minZoom: 5,
  maxBounds: L.latLngBounds(L.latLng(-11.2, 94.9), L.latLng(6.3, 141.0)),
  maxBoundsViscosity: 1.0
}).setView([-6.13, 106.82], 7);

// Layer dasar (Carto)
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap & CARTO',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(map);

// Layer tambahan dari OpenRailwayMap
L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
  subdomains: ['a', 'b', 'c'],
  maxZoom: 20
}).addTo(map);

// Kontrol tambahan
map.attributionControl.setPrefix(false);
map.attributionControl.setPosition('bottomright');
map.attributionControl.addAttribution(
  'Data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
);
L.control.scale({
  metric: true,
  imperial: false,
  position: 'bottomright'
}).addTo(map);

// =====================================================
// ============ FUNGSI LOAD GEOJSON TRANSPARAN =========
// =====================================================
function loadRailLine(jsonFile, warna) {
  fetch(jsonFile)
    .then(res => res.json())
    .then(data => {
      L.geoJSON(data, {
        style: {
          color: warna,
          weight: 2,
          opacity: 1,         // tidak transparan
          interactive: false  // tidak bisa diklik
        }
      }).addTo(map);
    })
    .catch(err => console.error(`Gagal memuat ${jsonFile}:`, err));
}

// =====================================================
// ================= TAMPILKAN SEMUA JALUR =============
// =====================================================
loadRailLine('data/JalurBiasa.json',       '#FF5733');
loadRailLine('data/JalurKertaCepat.json',  '#2980B9');
loadRailLine('data/JalurLRT.json',         '#27AE60');
loadRailLine('data/JalurMRT.json',         '#8E44AD');

