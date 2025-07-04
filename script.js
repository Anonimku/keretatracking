const map = L.map('map').setView([-6.13, 106.82], 15);

// Tile dasar: CARTO Light (putih abu-abu)
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap & Carto',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// Overlay: OpenRailwayMap
L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>',
  subdomains: ['a', 'b', 'c'],
  maxZoom: 19
}).addTo(map);

let jalurKereta = []; // satu segmen utama untuk animasi
let index1 = 0, t1 = 0;
let index2 = 0, t2 = 0;
let speed = 0.01;

let kereta1, kereta2;
let followKereta = null; // 'kereta1', 'kereta2', atau null

fetch('data/JalurKertaCepat.json')
  .then(res => res.json())
  .then(geo => {
    if (geo.type === "GeometryCollection") {
      geo.geometries.forEach(geometry => {
        if (geometry.type === "MultiLineString") {
          geometry.coordinates.forEach((segment, i) => {
            const latlngs = segment.map(coord => [coord[1], coord[0]]); // konversi ke [lat, lon]

            // Tambahkan polyline transparan
            L.polyline(latlngs, {
              color: 'transparent',
              weight: 0,
              opacity: 0
            }).addTo(map);

            // Ambil segmen pertama untuk animasi
            if (i === 0 && jalurKereta.length === 0) {
              jalurKereta = latlngs;
              index2 = latlngs.length - 2;
            }
          });
        }
      });

      if (jalurKereta.length > 1) {
        // Kereta 1 (maju)
        kereta1 = L.circleMarker(jalurKereta[0], {
          radius: 7,
          color: 'black',
          fillColor: 'orange',
          fillOpacity: 1
        }).bindPopup('🚆 Kereta 1').addTo(map);

        // Kereta 2 (mundur)
        kereta2 = L.circleMarker(jalurKereta[jalurKereta.length - 1], {
          radius: 7,
          color: 'black',
          fillColor: 'blue',
          fillOpacity: 1
        }).bindPopup('🚆 Kereta 2').addTo(map);

        // Event: klik kereta untuk follow
        kereta1.on('click', () => followKereta = 'kereta1');
        kereta2.on('click', () => followKereta = 'kereta2');

        // Event: klik peta untuk berhenti follow
        map.on('click', () => followKereta = null);

        // Mulai animasi
        animateKeduaKereta();
      }
    }
  });

// Interpolasi posisi antara dua titik
function lerpLatLng(p1, p2, t) {
  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t
  ];
}

// Animasi dua kereta
function animateKeduaKereta() {
  if (jalurKereta.length < 2) return;

  // Kereta 1 (maju)
  const from1 = jalurKereta[index1];
  const to1 = jalurKereta[index1 + 1];
  const pos1 = lerpLatLng(from1, to1, t1);
  kereta1.setLatLng(pos1);

  if (followKereta === 'kereta1') map.panTo(pos1, { animate: true });

  t1 += speed;
  if (t1 >= 1) {
    t1 = 0;
    index1++;
    if (index1 >= jalurKereta.length - 1) index1 = 0;
  }

  // Kereta 2 (mundur)
  const from2 = jalurKereta[index2 + 1];
  const to2 = jalurKereta[index2];
  const pos2 = lerpLatLng(from2, to2, t2);
  kereta2.setLatLng(pos2);

  if (followKereta === 'kereta2') map.panTo(pos2, { animate: true });

  t2 += speed;
  if (t2 >= 1) {
    t2 = 0;
    index2--;
    if (index2 < 0) index2 = jalurKereta.length - 2;
  }

  requestAnimationFrame(animateKeduaKereta);
}
