import { MAPS_ENABLED } from './config';
import { loaderTag, missingKeyHtml } from './mapHtml';

// A read-only two-marker map (pickup + delivery) on Google Maps. No React/RN imports so both the web
// (iframe) and native (WebView) renderers can share it. A point with no coordinates is
// forward-geocoded from its address, so a stop that was only ever typed still shows up.
//
// When both stops resolve, the map draws a driving route between them (office -> order for a
// driver) along the streets: Google Directions first, and when that cannot answer (key without
// the Directions API, quota) the public OSRM router. The dashed straight hop remains only as the
// last resort when neither source can produce a route.

export interface MapPoint {
  lat: number | null;
  lng: number | null;
  address?: string | null;
  label: string; // marker badge, e.g. '1'
  title: string; // info-window text
  color: string; // marker colour
}

export interface RouteMapProps {
  pickup: MapPoint;
  client: MapPoint;
}

export function routeMapHtml(pickup: MapPoint, client: MapPoint): string {
  if (!MAPS_ENABLED) {
    return missingKeyHtml('Configura EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.');
  }

  const enc = (p: MapPoint) => JSON.stringify({
    lat: p.lat, lng: p.lng, address: p.address ?? null, label: p.label, title: p.title, color: p.color,
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>html,body,#map{height:100%;margin:0;padding:0}</style>
</head>
<body>
<div id="map"></div>
<script>
  var pickup = ${enc(pickup)}, client = ${enc(client)};

  // A teardrop in the stop's colour with its number in the middle -- the same shape the map had
  // before, drawn as an SVG path so Google can scale and anchor it properly.
  function pin(color) {
    return {
      path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
      fillColor: color, fillOpacity: 1,
      strokeColor: '#ffffff', strokeWeight: 2,
      scale: 1, labelOrigin: new google.maps.Point(0, -30),
    };
  }

  // Coordinates when we have them; otherwise ask Google where the address is. Resolves to null when
  // there is neither, so a one-sided route still draws the side it knows.
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

  function initRoute() {
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
      return marker;
    }

    // The last-resort line when no router can answer: a dashed straight hop between the stops.
    function straightLine(pp, cp) {
      new google.maps.Polyline({
        path: [pp, cp], map: map, strokeOpacity: 0, geodesic: true,
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#2563eb', strokeWeight: 3, scale: 3 },
          offset: '0', repeat: '14px',
        }],
      });
    }

    // Street route from the public OSRM demo router (no key). Good enough for the driver's
    // overview; replaced by Google's routing the moment the key gains the Directions API.
    function osrmRoute(pp, cp) {
      var url = 'https://router.project-osrm.org/route/v1/driving/'
        + pp.lng + ',' + pp.lat + ';' + cp.lng + ',' + cp.lat
        + '?overview=full&geometries=geojson';
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var coords = d && d.routes && d.routes[0] && d.routes[0].geometry
            && d.routes[0].geometry.coordinates;
          if (!coords || !coords.length) { straightLine(pp, cp); return; }
          new google.maps.Polyline({
            path: coords.map(function (c) { return { lat: c[1], lng: c[0] }; }),
            map: map, strokeColor: '#2563eb', strokeWeight: 5, strokeOpacity: 0.9,
          });
        })
        .catch(function () { straightLine(pp, cp); });
    }

    Promise.all([resolve(geocoder, pickup), resolve(geocoder, client)]).then(function (pts) {
      var pp = pts[0], cp = pts[1];
      var bounds = new google.maps.LatLngBounds();
      var count = 0;

      if (pp) { place(pickup, pp); bounds.extend(pp); count++; }
      if (cp) { place(client, cp); bounds.extend(cp); count++; }

      if (count === 2) { map.fitBounds(bounds, 50); }
      else if (count === 1) { map.setCenter(bounds.getCenter()); map.setZoom(16); }

      if (pp && cp) {
        // The driving route from the office to the order. Markers stay ours (suppressMarkers), the
        // renderer only contributes the road polyline, and its own fitBounds is disabled so the
        // route appearing does not fight the framing set above.
        var directions = new google.maps.DirectionsService();
        directions.route({
          origin: pp, destination: cp,
          travelMode: google.maps.TravelMode.DRIVING,
        }, function (result, status) {
          if (status === 'OK' && result && result.routes && result.routes[0]) {
            new google.maps.DirectionsRenderer({
              map: map, directions: result,
              suppressMarkers: true, preserveViewport: false,
              polylineOptions: { strokeColor: '#2563eb', strokeWeight: 5, strokeOpacity: 0.9 },
            });
          } else {
            osrmRoute(pp, cp);
          }
        });
      }
    });
  }
</script>
${loaderTag('initRoute')}
</body>
</html>`;
}
