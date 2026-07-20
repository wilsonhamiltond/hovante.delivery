// A read-only two-marker map (pickup + delivery). No React/RN imports so both the web (iframe) and
// native (WebView) renderers can share it. Points without coordinates are forward-geocoded (Nominatim).

export interface MapPoint {
  lat: number | null;
  lng: number | null;
  address?: string | null;
  label: string; // marker badge, e.g. '1'
  title: string; // popup text
  color: string; // marker colour
}

export interface RouteMapProps {
  pickup: MapPoint;
  client: MapPoint;
}

export function routeMapHtml(pickup: MapPoint, client: MapPoint): string {
  const enc = (p: MapPoint) => JSON.stringify({
    lat: p.lat, lng: p.lng, address: p.address ?? null, label: p.label, title: p.title, color: p.color,
  });
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
  var pickup = ${enc(pickup)}, client = ${enc(client)};
  var map = L.map('map');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  function pin(color, label) {
    return L.divIcon({
      className: '',
      iconSize: [28, 28], iconAnchor: [14, 28],
      html: '<div style="background:' + color + ';width:28px;height:28px;border-radius:50% 50% 50% 0;'
        + 'transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);position:relative">'
        + '<span style="position:absolute;width:28px;text-align:center;top:4px;transform:rotate(45deg);'
        + 'color:#fff;font-weight:800;font-size:13px">' + label + '</span></div>'
    });
  }
  function resolve(loc) {
    return new Promise(function (res) {
      if (typeof loc.lat === 'number' && typeof loc.lng === 'number') { res({ lat: loc.lat, lng: loc.lng }); return; }
      if (!loc.address) { res(null); return; }
      fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(loc.address))
        .then(function (r) { return r.json(); })
        .then(function (j) { res(j && j[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) } : null); })
        .catch(function () { res(null); });
    });
  }

  Promise.all([resolve(pickup), resolve(client)]).then(function (pts) {
    var pp = pts[0], cp = pts[1], bounds = [];
    if (pp) { L.marker([pp.lat, pp.lng], { icon: pin(pickup.color, pickup.label) }).addTo(map).bindPopup(pickup.title); bounds.push([pp.lat, pp.lng]); }
    if (cp) { L.marker([cp.lat, cp.lng], { icon: pin(client.color, client.label) }).addTo(map).bindPopup(client.title); bounds.push([cp.lat, cp.lng]); }
    if (pp && cp) { L.polyline([[pp.lat, pp.lng], [cp.lat, cp.lng]], { color: '#2563eb', weight: 3, dashArray: '6,8' }).addTo(map); }
    if (bounds.length === 2) { map.fitBounds(bounds, { padding: [50, 50] }); }
    else if (bounds.length === 1) { map.setView(bounds[0], 15); }
    else { map.setView([18.4861, -69.9312], 12); }
  });
</script>
</body>
</html>`;
}
