import { GOOGLE_MAPS_MAP_ID } from './config';
import { strings, type Locale } from './i18n';

// The one user-visible word here: the driver marker's tooltip. Read when the block is generated.
const S: Record<Locale, { you: string }> = {
  es: { you: 'Tú' },
  en: { you: 'You' },
  fr: { you: 'Vous' },
};

// Every marker in the app, as one block of JavaScript the three map documents embed.
//
// Google deprecated google.maps.Marker in February 2024 in favour of
// google.maps.marker.AdvancedMarkerElement, whose content is real DOM instead of a symbol path.
// The catch is that advanced markers need a Map ID, which is created in Google Cloud Console and
// cannot be derived from the API key -- and a map that asks for advanced markers WITHOUT one draws
// no markers at all. So each factory below can build either kind, and picks at runtime: advanced
// once EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID is set, the deprecated marker until then. A delivery app must
// not lose its pins because a console setting has not been made yet.
//
// Keeping both branches HERE, one pair per kind of marker, is what makes that affordable: the map
// documents ask for "a numbered pin" or "the driver" and never mention either API.

export function markersJs(): string {
  const tx = strings(S);
  return `
  var MAP_ID = ${JSON.stringify(GOOGLE_MAPS_MAP_ID)};
  // Decided once the library is loaded, since it reads google.maps: both halves must be present --
  // the marker library AND the Map ID it refuses to render without.
  var ADVANCED = false;
  function markersReady() {
    ADVANCED = !!(MAP_ID && google.maps.marker && google.maps.marker.AdvancedMarkerElement);
  }
  // Passed into every google.maps.Map: a vector map keyed to the console's styling when configured,
  // and the plain raster default when it is not.
  function mapIdOption() { return MAP_ID || undefined; }

  // One shape over both marker APIs, so a call site never asks which one it got. Positions go in
  // and come out as plain {lat,lng} -- the two APIs disagree about whether those are methods.
  function wrapMarker(m, adv) {
    return {
      raw: m,
      setPos: function (at) { if (adv) { m.position = at; } else { m.setPosition(at); } },
      getPos: function () {
        var p = adv ? m.position : m.getPosition();
        if (!p) return null;
        return {
          lat: typeof p.lat === 'function' ? p.lat() : p.lat,
          lng: typeof p.lng === 'function' ? p.lng() : p.lng,
        };
      },
      // 'click' still fires on an advanced marker but is itself deprecated there; 'gmp-click' is
      // the one that is not going away.
      onClick: function (fn) { m.addListener(adv ? 'gmp-click' : 'click', fn); },
      onDragEnd: function (fn) { m.addListener('dragend', fn); },
      // The finished photo pin, replacing whatever stood in for it. It is a teardrop whose tip is
      // the point, so both branches anchor at the bottom centre -- which is what an advanced
      // marker does by itself, and what the classic icon has to be told.
      setPhoto: function (dataUrl, w, h) {
        if (adv) {
          var img = document.createElement('img');
          img.src = dataUrl;
          img.width = w; img.height = h;
          img.style.cssText = 'display:block;cursor:pointer';
          m.content = img;
        } else {
          m.setIcon({
            url: dataUrl,
            scaledSize: new google.maps.Size(w, h),
            anchor: new google.maps.Point(w / 2, h),
          });
          m.setLabel(null);
        }
      },
    };
  }

  // The photo pin: the same teardrop the numbered stops wear, with the picture set into its head
  // instead of a number -- the shop's logo on the office, the customer's face on the door, the
  // product on an available order. Drawn on a canvas rather than as DOM so the classic marker
  // branch (which only takes an image URL) can wear it too.
  //
  // The tip is the point. Everything below is laid out from it: the head sits one path-height up,
  // which is what lets both marker APIs anchor the same image at the same pixel.
  var PIN_SCALE = 2.4;                       // the path below is authored with a 10px head radius
  var PIN_EDGE = 3;                          // room for the white outline, so it is not clipped
  var PIN_HEAD_R = 10 * PIN_SCALE;
  var PHOTO_PIN_W = Math.round(2 * PIN_HEAD_R + 2 * PIN_EDGE);
  var PHOTO_PIN_H = Math.round(40 * PIN_SCALE + 2 * PIN_EDGE);

  // The teardrop outline, traced at the current origin in path units (tip at 0,0; head centred at
  // 0,-30 with radius 10). The same silhouette as the numbered pins' SVG path, as canvas calls --
  // Path2D would read better but is missing from older Android WebViews, and a pin that throws is
  // a pin that never appears.
  function teardropPath(x) {
    x.beginPath();
    x.moveTo(0, 0);
    x.bezierCurveTo(-2, -20, -10, -22, -10, -30);
    x.arc(0, -30, 10, Math.PI, 0, false);
    x.bezierCurveTo(10, -22, 2, -20, 0, 0);
    x.closePath();
  }

  // Calls back with the finished pin as a data URL, and with null when the image cannot be loaded
  // or the canvas is tainted (a bucket serving no CORS headers) -- so the caller keeps the plain
  // numbered pin rather than losing the point altogether.
  function photoDataUrl(url, badge, color, cb) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        var W = PHOTO_PIN_W, H = PHOTO_PIN_H;
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        var x = c.getContext('2d');

        // The body, in the stop's own colour: the photo reads as belonging to a pin rather than
        // floating over the map.
        var tipX = W / 2, tipY = H - PIN_EDGE;
        x.save();
        x.translate(tipX, tipY);
        x.scale(PIN_SCALE, PIN_SCALE);
        teardropPath(x);
        x.fillStyle = color || '#0b2a6b'; x.fill();
        // Stated in path units, so the outline comes out the same weight at any scale.
        x.lineWidth = 2 / PIN_SCALE; x.strokeStyle = '#ffffff'; x.stroke();
        x.restore();

        // The picture, clipped into the head and inset so the body still rings it.
        var headX = tipX, headY = tipY - 30 * PIN_SCALE, r = PIN_HEAD_R - 5;
        x.save();
        x.beginPath(); x.arc(headX, headY, r, 0, Math.PI * 2); x.clip();
        // Cover-fit: the shorter side fills the circle, the longer side is cropped.
        var side = Math.min(img.width, img.height);
        x.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side,
          headX - r, headY - r, r * 2, r * 2);
        x.restore();

        // "There are N here", worn on the head's shoulder -- one photo alone would hide the rest.
        if (badge && badge > 1) {
          var br = 9;
          var bx = headX + PIN_HEAD_R - br, by = headY - PIN_HEAD_R + br;
          x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2);
          x.fillStyle = '#dc2626'; x.fill();
          x.lineWidth = 2; x.strokeStyle = '#ffffff'; x.stroke();
          x.fillStyle = '#ffffff'; x.font = '700 11px system-ui, sans-serif';
          x.textAlign = 'center'; x.textBaseline = 'middle';
          x.fillText(badge > 9 ? '9+' : String(badge), bx, by + 1);
        }
        cb(c.toDataURL());
      } catch (e) {
        cb(null);
      }
    };
    img.onerror = function () { cb(null); };
    img.src = url;
  }

  // Dresses a pin in the picture that belongs to it -- the order's product, the shop's logo, the
  // customer's face. Only once the image is actually in hand: until then (and forever, if it
  // cannot be read) the numbered teardrop stands, so a point is never invisible while a photo
  // that may never arrive is awaited.
  function wearPhoto(marker, point) {
    if (!point.imageUrl) return;
    photoDataUrl(point.imageUrl, point.badge, point.color, function (dataUrl) {
      if (dataUrl) marker.setPhoto(dataUrl, PHOTO_PIN_W, PHOTO_PIN_H);
    });
  }

  // The numbered teardrop every stop is drawn as. The advanced branch is Google's own PinElement,
  // which is the same silhouette this SVG path was imitating in the first place.
  function mkPin(map, at, opts) {
    if (ADVANCED) {
      var Pin = google.maps.marker.PinElement;
      var pinOpts = { background: opts.color, borderColor: '#ffffff', glyphColor: '#ffffff' };
      // The pin API moved on too: glyph became glyphText, and PinElement went from carrying an
      // .element to BEING one (a gmp-pin). Both spellings are still shipped, so ask this version
      // which it speaks rather than picking one and warning -- or breaking -- on the other.
      if ('glyphText' in Pin.prototype) pinOpts.glyphText = opts.label;
      else pinOpts.glyph = opts.label;
      var glyphPin = new Pin(pinOpts);
      return wrapMarker(new google.maps.marker.AdvancedMarkerElement({
        map: map, position: at, title: opts.title, gmpClickable: true,
        content: glyphPin instanceof HTMLElement ? glyphPin : glyphPin.element,
      }), true);
    }
    return wrapMarker(new google.maps.Marker({
      map: map, position: at, title: opts.title,
      icon: {
        path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
        fillColor: opts.color, fillOpacity: 1,
        strokeColor: '#ffffff', strokeWeight: 2,
        scale: 1, labelOrigin: new google.maps.Point(0, -30),
      },
      label: { text: opts.label, color: '#ffffff', fontWeight: '800', fontSize: '13px' },
    }), false);
  }

  // A filled dot for a place that is only context -- the shop the order comes from. Deliberately
  // not a teardrop, so it never reads as a pin you are meant to move, and it lets taps through to
  // the map underneath rather than swallowing one meant for the ground beneath it.
  function mkDot(map, at, opts) {
    if (ADVANCED) {
      var el = document.createElement('div');
      el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#0b2a6b;'
        + 'border:3px solid #fff;box-sizing:content-box;pointer-events:none;'
        + 'transform:translateY(50%)';
      return wrapMarker(new google.maps.marker.AdvancedMarkerElement({
        map: map, position: at, title: opts.title, content: el, zIndex: opts.zIndex,
      }), true);
    }
    return wrapMarker(new google.maps.Marker({
      map: map, position: at, title: opts.title, clickable: false, zIndex: opts.zIndex,
      icon: {
        path: google.maps.SymbolPath.CIRCLE, scale: 8,
        fillColor: '#0b2a6b', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3,
      },
    }), false);
  }

  // The driver's own live dot, worn as a bike. zIndex above every stop: the marker that moves must
  // never end up hidden under one that does not.
  function mkDriver(map, at) {
    if (ADVANCED) {
      var el = document.createElement('div');
      el.style.cssText = 'width:26px;height:26px;border-radius:50%;background:#2563eb;'
        + 'border:3px solid #fff;box-sizing:border-box;display:flex;align-items:center;'
        + 'justify-content:center;font-size:14px;line-height:1;pointer-events:none;'
        + 'transform:translateY(50%)';
      el.textContent = '🛵';
      return wrapMarker(new google.maps.marker.AdvancedMarkerElement({
        map: map, position: at, title: ${JSON.stringify(tx.you)}, content: el, zIndex: 3,
      }), true);
    }
    return wrapMarker(new google.maps.Marker({
      map: map, position: at, title: ${JSON.stringify(tx.you)}, zIndex: 3,
      icon: {
        path: google.maps.SymbolPath.CIRCLE, scale: 13,
        fillColor: '#2563eb', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3,
      },
      label: { text: '🛵', fontSize: '14px' },
    }), false);
  }

  // The one pin the customer drags to say where they are. Google's default marker in both branches:
  // this is the pin people already recognise as "the one you move".
  function mkDraggablePin(map, at, opts) {
    if (ADVANCED) {
      return wrapMarker(new google.maps.marker.AdvancedMarkerElement({
        map: map, position: at, title: opts.title, zIndex: opts.zIndex,
        gmpDraggable: true, gmpClickable: true,
      }), true);
    }
    return wrapMarker(new google.maps.Marker({
      map: map, position: at, title: opts.title, zIndex: opts.zIndex, draggable: true,
    }), false);
  }
`;
}
