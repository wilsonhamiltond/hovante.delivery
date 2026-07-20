// Shared, platform-agnostic pieces for the checkout location map. No React/RN imports here so both
// the web (iframe) and native (WebView) pickers can use them.

export interface PickedLocation {
  lat: number;
  lng: number;
  address?: string | null;
}

export interface LocationPickerProps {
  latitude: number;
  longitude: number;
  onPick: (loc: PickedLocation) => void;
}

// Santo Domingo, used when the customer has no saved coordinates yet.
export const DEFAULT_CENTER = { lat: 18.4861, lng: -69.9312 };

// A self-contained Leaflet map (OpenStreetMap tiles) that drops a draggable pin. Tapping or dragging
// posts the coordinates back — to window.ReactNativeWebView on native and to window.parent on web —
// and reverse-geocodes (Nominatim) to include a readable address.
export function leafletHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;margin:0;padding:0}</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var lat = ${lat}, lng = ${lng};
  var map = L.map('map').setView([lat, lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  var marker = L.marker([lat, lng], { draggable: true }).addTo(map);

  function post(obj) {
    var s = JSON.stringify(obj);
    try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); } catch (e) {}
    try { if (window.parent) window.parent.postMessage(s, '*'); } catch (e) {}
  }
  function pick(la, ln) {
    post({ lat: la, lng: ln });
    fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + la + '&lon=' + ln + '&zoom=18')
      .then(function (r) { return r.json(); })
      .then(function (j) { post({ lat: la, lng: ln, address: j && j.display_name ? j.display_name : null }); })
      .catch(function () {});
  }
  map.on('click', function (e) { marker.setLatLng(e.latlng); pick(e.latlng.lat, e.latlng.lng); });
  marker.on('dragend', function () { var p = marker.getLatLng(); pick(p.lat, p.lng); });
</script>
</body>
</html>`;
}
