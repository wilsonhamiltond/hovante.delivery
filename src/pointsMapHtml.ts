import { MAPS_ENABLED } from './config';
import { loaderTag, missingKeyHtml } from './mapHtml';
import { markersJs } from './mapMarkersJs';
import type { MapPoint } from './routeMapHtml';

// A read-only map of N markers (branch choice, the driver home's pickup pool). Same conventions as
// routeMapHtml -- no React/RN imports so the web iframe and the native WebView share it, and a
// point with no coordinates is forward-geocoded from its address. No line is drawn: these are
// alternatives, not a route.
//
// A point with an imageUrl is drawn as a round photo pin (the order's product picture) instead of
// the teardrop; the photo is circle-cropped on a canvas, and if the image cannot be read (CORS,
// broken link) the teardrop stays, so a pin never silently disappears. A point with an id posts
// { pointId } to the host when tapped -- the driver home turns that into opening the delivery.
//
// With routeFromDriver, the map also rides: the street route from the driver's live position to
// the FIRST point, redrawn once they have covered ground -- the home's "current order" mode,
// where the one pin is the leg's destination (the office before pickup, the client after).

export function pointsMapHtml(points: MapPoint[], routeFromDriver = false): string {
  if (!MAPS_ENABLED) {
    return missingKeyHtml('Configura EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.');
  }

  const enc = JSON.stringify(points.map((p) => ({
    lat: p.lat, lng: p.lng, address: p.address ?? null, label: p.label, title: p.title,
    color: p.color, imageUrl: p.imageUrl ?? null, id: p.id ?? null, badge: p.badge ?? null,
  })));

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
  var points = ${enc};
  var ROUTE_FROM_DRIVER = ${routeFromDriver ? 'true' : 'false'};

  // The driver's live bike, same contract as the route map: the app pushes fixes in through
  // window.setDriver (injected on native, postMessage on web), so the WebView never asks for its
  // own location permission.
  var mapRef = null, driverMarker = null, driverHalo = null, pendingDriver = null, driverFramed = false;

  function moveDriver(at, acc) {
    // The halo is the fix's own accuracy radius: a bare marker would claim a precision a phone
    // indoors does not have.
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

  // The live leg: driver -> the first point, in current-order mode. Same cascade as every other
  // route in the app (Google Directions, then OSRM, then a dashed straight hop), with a sequence
  // number so a slow answer can never paint a stale route over a fresh one.
  var routeState = { seq: 0, line: null, renderer: null };
  var routeTargetAt = null, routeDrawnFrom = null;

  function metresBetween(a, b) {
    var R = 6371000, toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad, dLng = (b.lng - a.lng) * toRad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function clearRoute() {
    if (routeState.line) { routeState.line.setMap(null); routeState.line = null; }
    if (routeState.renderer) { routeState.renderer.setMap(null); routeState.renderer = null; }
  }

  function straightRoute(from, to, seq) {
    if (seq !== routeState.seq) return;
    clearRoute();
    routeState.line = new google.maps.Polyline({
      path: [from, to], map: mapRef, strokeOpacity: 0, geodesic: true,
      icons: [{
        icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#2563eb', strokeWeight: 3, scale: 3 },
        offset: '0', repeat: '14px',
      }],
    });
  }

  function osrmRoute(from, to, seq) {
    var url = 'https://router.project-osrm.org/route/v1/driving/'
      + from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat
      + '?overview=full&geometries=geojson';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (seq !== routeState.seq) return;
        var coords = d && d.routes && d.routes[0] && d.routes[0].geometry
          && d.routes[0].geometry.coordinates;
        if (!coords || !coords.length) { straightRoute(from, to, seq); return; }
        clearRoute();
        routeState.line = new google.maps.Polyline({
          path: coords.map(function (c) { return { lat: c[1], lng: c[0] }; }),
          map: mapRef, strokeColor: '#2563eb', strokeWeight: 5, strokeOpacity: 0.9,
        });
      })
      .catch(function () { straightRoute(from, to, seq); });
  }

  function drawRoute(from, to) {
    var seq = ++routeState.seq;
    new google.maps.DirectionsService().route({
      origin: from, destination: to,
      travelMode: google.maps.TravelMode.DRIVING,
    }, function (result, status) {
      if (seq !== routeState.seq) return;
      if (status === 'OK' && result && result.routes && result.routes[0]) {
        clearRoute();
        routeState.renderer = new google.maps.DirectionsRenderer({
          map: mapRef, directions: result, suppressMarkers: true, preserveViewport: true,
          polylineOptions: { strokeColor: '#2563eb', strokeWeight: 5, strokeOpacity: 0.9 },
        });
      } else {
        osrmRoute(from, to, seq);
      }
    });
  }

  // Close-up on the leg being ridden: both ends of it, tightly framed. Re-framed on every route
  // redraw (>= 75 m of travel), so the view narrows as the driver closes in on the destination
  // without fighting a pan between redraws.
  function frameLeg(from, to) {
    var b = new google.maps.LatLngBounds();
    b.extend(from);
    b.extend(to);
    mapRef.fitBounds(b, 60);
  }

  // Redraw only once the driver has actually covered ground: routing on every fix would spend a
  // request on a moto idling at a light.
  function maybeRouteFromDriver(at) {
    if (!ROUTE_FROM_DRIVER || !routeTargetAt) return;
    if (routeDrawnFrom && metresBetween(routeDrawnFrom, at) < 75) return;
    routeDrawnFrom = at;
    drawRoute(at, routeTargetAt);
    frameLeg(at, routeTargetAt);
  }

  window.setDriver = function (la, ln, acc) {
    var at = { lat: la, lng: ln };
    // Fixes can beat the Maps library: hold the newest one and place it once the map exists.
    if (!mapRef) { pendingDriver = { at: at, acc: acc }; return; }
    moveDriver(at, acc);
    maybeRouteFromDriver(at);

    // Only the first fix widens the framing, so a driver outside the pinned area still sees
    // themselves; re-framing every update would fight them panning as they ride. Current-order
    // mode skips this: frameLeg above already owns the framing there.
    if (!ROUTE_FROM_DRIVER && !driverFramed) {
      var b = mapRef.getBounds();
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

  function post(obj) {
    var s = JSON.stringify(obj);
    try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); } catch (e) {}
    try { if (window.parent) window.parent.postMessage(s, '*'); } catch (e) {}
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
    markersReady();
    var map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 18.4861, lng: -69.9312 }, zoom: 12,
      mapId: mapIdOption(),
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      clickableIcons: false,
    });
    mapRef = map;
    // A fix that arrived before the map existed is placed now.
    if (pendingDriver) {
      var pd = pendingDriver; pendingDriver = null;
      window.setDriver(pd.at.lat, pd.at.lng, pd.acc);
    }
    var geocoder = new google.maps.Geocoder();
    var info = new google.maps.InfoWindow();

    function place(point, at) {
      var marker = mkPin(map, at, {
        label: point.label, color: point.color, title: point.title,
      });
      wearPhoto(marker, point);
      marker.onClick(function () {
        if (point.id) { post({ pointId: point.id }); return; }
        info.setContent(point.title);
        info.open({ map: map, anchor: marker.raw });
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

      // Current-order mode: the first point is the leg's destination. A fix that already arrived
      // gets its route now; later fixes keep it fresh through setDriver.
      if (ROUTE_FROM_DRIVER && spots[0]) {
        routeTargetAt = spots[0];
        if (driverMarker) maybeRouteFromDriver(driverMarker.getPos());
      }
    });
  }
</script>
${loaderTag('initPoints')}
</body>
</html>`;
}
