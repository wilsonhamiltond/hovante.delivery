import { MAPS_ENABLED } from './config';
import { loaderTag, missingKeyHtml } from './mapHtml';
import type { MapPoint } from './routeMapHtml';

// A read-only map of N markers (the branch-choice step: every office that could take the order).
// Same conventions as routeMapHtml -- no React/RN imports so the web iframe and the native WebView
// share it, and a point with no coordinates is forward-geocoded from its address so an office that
// was only ever typed still shows up. No line is drawn: these are alternatives, not a route.

export function pointsMapHtml(points: MapPoint[]): string {
  if (!MAPS_ENABLED) {
    return missingKeyHtml('Configura EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.');
  }

  const enc = JSON.stringify(points.map((p) => ({
    lat: p.lat, lng: p.lng, address: p.address ?? null, label: p.label, title: p.title, color: p.color,
  })));

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>html,body,#map{height:100%;margin:0;padding:0}</style>
</head>
<body>
<div id="map"></div>
<script>
  var points = ${enc};

  // The same teardrop pin the route map draws, so branches look like stops everywhere.
  function pin(color) {
    return {
      path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
      fillColor: color, fillOpacity: 1,
      strokeColor: '#ffffff', strokeWeight: 2,
      scale: 1, labelOrigin: new google.maps.Point(0, -30),
    };
  }

  function resolve(geocoder, loc) {
    return new Promise(function (res) {
      if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        res({ lat: loc.lat, lng: loc.lng });
        return;
      }
      if (!loc.address) { res(null); return; }
      geocoder.geocode({ address: loc.address }, function (results, status) {
        if (status === 'OK' && results && results[0]) {
          var p = results[0].geometry.location;
          res({ lat: p.lat(), lng: p.lng() });
        } else {
          res(null);
        }
      });
    });
  }

  function initPoints() {
    var map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 18.4861, lng: -69.9312 }, zoom: 12,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      clickableIcons: false,
    });
    var geocoder = new google.maps.Geocoder();
    var info = new google.maps.InfoWindow();

    function place(point, at) {
      var marker = new google.maps.Marker({
        position: at, map: map, icon: pin(point.color),
        label: { text: point.label, color: '#ffffff', fontWeight: '800', fontSize: '13px' },
        title: point.title,
      });
      marker.addListener('click', function () {
        info.setContent(point.title);
        info.open(map, marker);
      });
    }

    Promise.all(points.map(function (p) { return resolve(geocoder, p); })).then(function (spots) {
      var bounds = new google.maps.LatLngBounds();
      var count = 0;
      spots.forEach(function (at, i) {
        if (!at) return;
        place(points[i], at);
        bounds.extend(at);
        count++;
      });
      if (count > 1) { map.fitBounds(bounds, 50); }
      else if (count === 1) { map.setCenter(bounds.getCenter()); map.setZoom(15); }
    });
  }
</script>
${loaderTag('initPoints')}
</body>
</html>`;
}
