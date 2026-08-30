import { MAPS_ENABLED } from './config';
import { loaderTag, missingKeyHtml } from './mapHtml';
import { markersJs } from './mapMarkersJs';
import { strings, type Locale } from './i18n';

const S: Record<Locale, { missingKey: string }> = {
  es: { missingKey: 'Configura EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.' },
  en: { missingKey: 'Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to see the map.' },
};

// A read-only two-marker map (pickup + delivery) on Google Maps. No React/RN imports so both the web
// (iframe) and native (WebView) renderers can share it. A point with no coordinates is
// forward-geocoded from its address, so a stop that was only ever typed still shows up.
//
// Either stop can wear a picture instead of its numbered teardrop (the shop's logo on the office,
// the customer's photo on the door), circle-cropped by the shared marker layer -- a driver reading
// the map at a light recognises a logo faster than they read "1" and "2".
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
  /** Drawn INSIDE the pin (circle-cropped) instead of the teardrop, e.g. the order's photo. */
  imageUrl?: string | null;
  /** When set, tapping the pin posts { pointId } out to the host, which can navigate. */
  id?: string | null;
  /** A count worn on the pin's shoulder (photo pins) when several orders share the spot. */
  badge?: number | null;
}

export interface RouteMapProps {
  pickup: MapPoint;
  client: MapPoint;
  /** The driver's own position, re-sent as they move. Omitted or null draws no third marker. */
  driver?: DriverPosition | null;
}

export interface DriverPosition {
  lat: number;
  lng: number;
  /** Radius the fix is confident within, drawn around the marker. Null hides the halo. */
  accuracyM?: number | null;
}

/**
 * The call that moves the driver's marker, run inside the map document. Both hosts send the same
 * statement -- native injects it into the WebView, web posts it to the iframe -- so the document
 * only has to implement one entry point.
 */
export function setDriverJs(d: DriverPosition): string {
  return `window.setDriver && window.setDriver(${d.lat}, ${d.lng}, ${d.accuracyM ?? 'null'});`;
}

export function routeMapHtml(pickup: MapPoint, client: MapPoint): string {
  if (!MAPS_ENABLED) {
    return missingKeyHtml(strings(S).missingKey);
  }

  const enc = (p: MapPoint) => JSON.stringify({
    lat: p.lat, lng: p.lng, address: p.address ?? null, label: p.label, title: p.title, color: p.color,
    imageUrl: p.imageUrl ?? null, badge: p.badge ?? null,
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>html,body,#map{height:100%;margin:0;padding:0}</style>
</head>
<body>
<div id="map"></div>
<script>
${markersJs()}
  var pickup = ${enc(pickup)}, client = ${enc(client)};

  // The driver's live dot. The position is pushed in from the app (expo-location) rather than read
  // here with navigator.geolocation: the app already holds the permission, and a WebView asking for
  // its own would be a second prompt with its own per-platform quirks.
  var mapRef = null, driverMarker = null, driverHalo = null, pendingDriver = null, driverFramed = false;

  function moveDriver(at, acc) {
    // The halo is the fix's own accuracy radius. Worth drawing rather than hiding: a phone indoors
    // or a laptop on wifi can be off by a block, and a bare dot claims a precision it does not have.
    if (typeof acc === 'number' && acc > 0) {
      if (!driverHalo) {
        driverHalo = new google.maps.Circle({
          map: mapRef, center: at, radius: acc, clickable: false, zIndex: 2,
          strokeColor: '#2563eb', strokeOpacity: 0.4, strokeWeight: 1,
          fillColor: '#2563eb', fillOpacity: 0.12,
        });
      } else {
        driverHalo.setCenter(at);
        driverHalo.setRadius(acc);
      }
    } else if (driverHalo) {
      driverHalo.setMap(null);
      driverHalo = null;
    }

    if (!driverMarker) {
      driverMarker = mkDriver(mapRef, at);
    } else {
      driverMarker.setPos(at);
    }
  }

  window.setDriver = function (la, ln, acc) {
    var at = { lat: la, lng: ln };
    // Fixes can beat the Maps library: hold the newest one and place it once the map exists.
    if (!mapRef) { pendingDriver = { at: at, acc: acc }; return; }
    // Kept for the replay after the stops resolve: a fix that lands in the window between the map
    // existing and the geocoder answering has no leg target yet, and a stationary driver
    // (distance-gated watch) may never send another one to retry with.
    lastDriver = { at: at, acc: acc };
    moveDriver(at, acc);

    // Leg 1, redrawn as the driver rides. Its far end is the next stop on the ride: the pickup
    // when there is one, otherwise straight to the client -- which is what the single-pin map
    // becomes when the driver's own position is pushed in. Only once they have actually covered
    // ground: routing on every fix would spend a Directions request on a moto idling at a light.
    var driverTarget = pickupPoint || clientPoint;
    if (driverTarget && (!legDrawnFrom || metresBetween(legDrawnFrom, at) > 75)) {
      legDrawnFrom = at;
      drawLeg(at, driverTarget, '#f59e0b', driverLeg);
    }

    // Only the first fix widens the framing, so a driver who starts outside the two stops still
    // sees themselves. Re-framing on every update would fight them panning the map as they ride.
    if (!driverFramed) {
      var b = mapRef.getBounds();
      // No bounds yet means the map has not settled; leave the flag down and try the next fix.
      if (b) {
        driverFramed = true;
        if (!b.contains(at)) { b.extend(at); mapRef.fitBounds(b, 50); }
      }
    }
  };

  // How the position arrives on web, where the map is an iframe and there is no injectJavaScript.
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
    if (d && d.driver) window.setDriver(d.driver.lat, d.driver.lng, d.driver.accuracyM);
  });

  // The ride is two legs: the driver to the office, then the office to the client. Each keeps its
  // own state so the first can be redrawn as the driver moves without disturbing the second, and
  // its sequence number discards a slow answer that lands after a newer request went out.
  var driverLeg = { seq: 0, line: null, renderer: null };
  var stopsLeg = { seq: 0, line: null, renderer: null };
  var pickupPoint = null, clientPoint = null, legDrawnFrom = null, lastDriver = null;

  function clearLeg(leg) {
    if (leg.line) { leg.line.setMap(null); leg.line = null; }
    if (leg.renderer) { leg.renderer.setMap(null); leg.renderer = null; }
  }

  // The last resort when no router can answer: a dashed straight hop, so the two ends still read as
  // connected rather than as unrelated pins.
  function straightLeg(from, to, color, leg, seq) {
    if (seq !== leg.seq) return;
    clearLeg(leg);
    leg.line = new google.maps.Polyline({
      path: [from, to], map: mapRef, strokeOpacity: 0, geodesic: true,
      icons: [{
        icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: color, strokeWeight: 3, scale: 3 },
        offset: '0', repeat: '14px',
      }],
    });
  }

  // Street route from the public OSRM demo router (no key). Good enough for the driver's overview;
  // replaced by Google's routing the moment the key gains the Directions API.
  function osrmLeg(from, to, color, leg, seq) {
    var url = 'https://router.project-osrm.org/route/v1/driving/'
      + from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat
      + '?overview=full&geometries=geojson';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (seq !== leg.seq) return;
        var coords = d && d.routes && d.routes[0] && d.routes[0].geometry
          && d.routes[0].geometry.coordinates;
        if (!coords || !coords.length) { straightLeg(from, to, color, leg, seq); return; }
        clearLeg(leg);
        leg.line = new google.maps.Polyline({
          path: coords.map(function (c) { return { lat: c[1], lng: c[0] }; }),
          map: mapRef, strokeColor: color, strokeWeight: 5, strokeOpacity: 0.9,
        });
      })
      .catch(function () { straightLeg(from, to, color, leg, seq); });
  }

  function drawLeg(from, to, color, leg) {
    if (!mapRef || !from || !to) return;
    var seq = ++leg.seq;
    new google.maps.DirectionsService().route({
      origin: from, destination: to, travelMode: google.maps.TravelMode.DRIVING,
    }, function (result, status) {
      if (seq !== leg.seq) return;
      if (status === 'OK' && result && result.routes && result.routes[0]) {
        clearLeg(leg);
        leg.renderer = new google.maps.DirectionsRenderer({
          // preserveViewport: the framing is set once from the stops and widened by the driver's
          // first fix. A leg that reframes on redraw would pull the camera away every time the
          // driver moved.
          map: mapRef, directions: result, suppressMarkers: true, preserveViewport: true,
          polylineOptions: { strokeColor: color, strokeWeight: 5, strokeOpacity: 0.9 },
        });
      } else {
        osrmLeg(from, to, color, leg, seq);
      }
    });
  }

  // Metres between two points, for deciding whether the driver has moved enough to be worth
  // re-routing. Rough equirectangular rather than haversine: over the tens of metres that matter
  // here the difference is centimetres.
  function metresBetween(a, b) {
    var x = (b.lng - a.lng) * Math.cos((a.lat + b.lat) * Math.PI / 360);
    var y = b.lat - a.lat;
    return Math.sqrt(x * x + y * y) * 111320;
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
    markersReady();
    var map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 18.4861, lng: -69.9312 }, zoom: 12,
      mapId: mapIdOption(),
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      clickableIcons: false,
    });
    mapRef = map;
    var geocoder = new google.maps.Geocoder();
    var info = new google.maps.InfoWindow();

    function place(point, at) {
      var marker = mkPin(map, at, {
        label: point.label, color: point.color, title: point.title,
      });
      wearPhoto(marker, point);
      marker.onClick(function () {
        info.setContent(point.title);
        info.open({ map: map, anchor: marker.raw });
      });
      return marker;
    }

    Promise.all([resolve(geocoder, pickup), resolve(geocoder, client)]).then(function (pts) {
      var pp = pts[0], cp = pts[1];
      var bounds = new google.maps.LatLngBounds();
      var count = 0;

      if (pp) { place(pickup, pp); bounds.extend(pp); count++; }
      if (cp) { place(client, cp); bounds.extend(cp); count++; }

      if (count === 2) { map.fitBounds(bounds, 50); }
      else if (count === 1) { map.setCenter(bounds.getCenter()); map.setZoom(16); }

      pickupPoint = pp;
      clientPoint = cp;

      // Leg 2, office -> client. Fixed for the life of the screen: neither end moves.
      if (pp && cp) drawLeg(pp, cp, '#2563eb', stopsLeg);

      // Any fix that arrived while the stops were resolving -- before the map existed
      // (pendingDriver) or after it but before this geocode answered (lastDriver). Replayed after
      // the points are set, so it draws leg 1 rather than only placing the dot, and after the
      // framing above so the driver widens the view rather than being overwritten by it.
      var replay = pendingDriver || lastDriver;
      pendingDriver = null;
      if (replay) window.setDriver(replay.at.lat, replay.at.lng, replay.acc);
    });
  }
</script>
${loaderTag('initRoute')}
</body>
</html>`;
}
