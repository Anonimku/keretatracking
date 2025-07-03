const map = L.map('map').setView([-6.9, 107.6], 7);

// Peta dasar
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Load stasiun.geojson
fetch('stasiun.json.geojson')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, {
          radius: 6,
          color: 'blue',
          fillColor: 'lightblue',
          fillOpacity: 0.9
        }).bindPopup(`<b>${feature.properties.nama}</b>`);
      }
    }).addTo(map);
  });

// Load jalur.geojson dan animasikan kereta
fetch('jalur.json.geojson')
  .then(res => res.json())
  .then(data => {
    const allCoords = [];

    L.geoJSON(data, {
      style: {
        color: 'black',
        weight: 3
      },
      onEachFeature: function (feature) {
        const coords = feature.geometry.coordinates.map(c => [c[1], c[0]]); // GeoJSON = [lon, lat]
        allCoords.push(...coords);
      }
    }).addTo(map);

    setTimeout(() => animateTrain(allCoords), 1000); // jalankan animasi setelah peta selesai
  });

function animateTrain(coords) {
  let i = 0;
  const marker = L.circleMarker(coords[0], {
    radius: 8,
    color: 'red',
    fillColor: 'pink',
    fillOpacity: 0.9
  }).addTo(map);

  function move() {
    if (i < coords.length - 1) {
      marker.setLatLng(coords[i]);
      i++;
      setTimeout(move, 300); // jeda antar titik
    }
  }

  move();
}

