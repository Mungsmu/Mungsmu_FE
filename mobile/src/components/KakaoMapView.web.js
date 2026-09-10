import { useRef, useCallback, useEffect } from 'react'
import { StyleSheet } from 'react-native'

const JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY

// 웹 프리뷰(expo start --web) 전용. react-native-webview는 web 플랫폼을 지원하지 않으므로
// 여기서는 WebView 대신 진짜 브라우저 iframe(srcDoc)을 써서 카카오맵을 띄운다.
// sandbox 속성을 주지 않은 srcDoc iframe은 부모 문서와 origin이 같아서, 카카오 SDK가 확인하는
// Referer가 실제 개발 서버 주소(예: http://localhost:8081)가 된다 — 그 주소를 카카오 콘솔
// "내 애플리케이션 > 플랫폼 > Web"에 등록해둬야 지도가 뜬다.
const HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html,body,#map{width:100%;height:100%;margin:0;padding:0;}
    @keyframes ripple { from { transform:scale(0.3); opacity:.6; } to { transform:scale(1); opacity:0; } }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map, myLocOverlay, places, placeMarkers = [], pathLine;
    var navOverlay, navArrowEl, navigating = false;
    function post(msg) { window.parent.postMessage(JSON.stringify(msg), '*'); }

    // 홈 화면의 "현재 위치" 표시 — 웹(MockStreetMap.jsx의 myLocation)과 같은 빨간 리플 오버레이.
    window.setCenter = function(lat, lng, withMarker) {
      if (!map) return;
      var pos = new kakao.maps.LatLng(lat, lng);
      map.setCenter(pos);
      if (!withMarker) {
        if (myLocOverlay) { myLocOverlay.setMap(null); myLocOverlay = null; }
        return;
      }
      if (!myLocOverlay) {
        var el = document.createElement('div');
        el.style.cssText = 'position:relative;width:18px;height:18px';
        el.innerHTML =
          '<span style="position:absolute;inset:-16px;border-radius:50%;background:rgba(212,91,78,.3);animation:ripple 1.8s ease-out infinite"></span>' +
          '<span style="position:absolute;inset:-16px;border-radius:50%;background:rgba(212,91,78,.3);animation:ripple 1.8s ease-out infinite;animation-delay:.9s"></span>' +
          '<span style="position:absolute;inset:0;border-radius:50%;background:#D45B4E;border:3px solid #fff;box-shadow:0 2px 8px rgba(20,40,60,.35)"></span>';
        myLocOverlay = new kakao.maps.CustomOverlay({ position: pos, content: el, zIndex: 4 });
        myLocOverlay.setMap(map);
      } else {
        myLocOverlay.setPosition(pos);
      }
    };

    // 주행 카메라 — 헤딩 화살표 마커가 경로를 따라 움직이고, 지도가 진행 방향 앞쪽을 보도록 따라간다
    // (동반 모드 터널 통과 애니메이션, 향후 턴바이턴 내비게이션에서 공유해 쓴다).
    window.setNavPosition = function(json) {
      if (!map) return;
      var np = json ? JSON.parse(json) : null;
      if (!np) {
        if (navOverlay) { navOverlay.setMap(null); navOverlay = null; }
        navigating = false;
        return;
      }
      var first = !navigating;
      navigating = true;
      var pos = new kakao.maps.LatLng(np.lat, np.lng);
      if (first) {
        var el = document.createElement('div');
        el.style.cssText = 'width:46px;height:46px;border-radius:50%;background:#fff;box-shadow:0 4px 16px rgba(15,50,90,.45);display:flex;align-items:center;justify-content:center;border:2.5px solid #1A6DE3';
        el.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" style="transition:transform .45s ease"><path d="M12 2.5 L18.5 19.5 L12 15.8 L5.5 19.5 Z" fill="#1A6DE3"/></svg>';
        navOverlay = new kakao.maps.CustomOverlay({ position: pos, content: el, zIndex: 10 });
        navOverlay.setMap(map);
        navArrowEl = el.firstChild;
      }
      navOverlay.setPosition(pos);
      if (np.heading != null && navArrowEl) navArrowEl.style.transform = 'rotate(' + np.heading + 'deg)';
      if (np.zoom && map.getLevel() !== np.zoom) map.setLevel(np.zoom, { animate: true });
      var AHEAD_M = { 3: 130, 4: 260, 5: 520, 7: 1500 };
      var aheadM = AHEAD_M[np.zoom] || 260;
      var rad = ((np.heading || 0) * Math.PI) / 180;
      var cLat = np.lat + (aheadM * Math.cos(rad)) / 111320;
      var cLng = np.lng + (aheadM * Math.sin(rad)) / (111320 * Math.cos((np.lat * Math.PI) / 180));
      map.panTo(new kakao.maps.LatLng(cLat, cLng));
    };

    // item에 lat/lng가 이미 있으면(예: RN 쪽에서 카카오 REST로 이미 지오코딩했거나, 실도로 경로 위
    // 좌표를 뽑아둔 경우) 키워드 검색 없이 바로 쓰고, 장소명(query)만 있으면 검색해서 좌표를 구한다.
    window.setMarkers = function(json) {
      if (!map || !places) return;
      var spec = JSON.parse(json);
      placeMarkers.forEach(function(m) { m.setMap(null); });
      placeMarkers = [];
      if (pathLine) { pathLine.setMap(null); pathLine = null; }
      var resolved = [];
      var remaining = spec.markers.length;

      // 웹(MockStreetMap.jsx)과 같은 모양 — 카카오 기본 핀 마커 + 그 위에 라벨 말풍선.
      // (예전엔 커스텀 원형 점을 그렸는데, 웹은 항상 기본 핀 마커를 써서 모양이 달랐다.)
      function placeMarker(idx, item, pos) {
        resolved[idx] = pos;
        var marker = new kakao.maps.Marker({ position: pos, map: map });
        var content = '<div style="background:' + item.color + ';color:#fff;font:700 11px Pretendard,sans-serif;' +
          'padding:3px 8px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25);">' + item.label + '</div>';
        var overlay = new kakao.maps.CustomOverlay({ position: pos, content: content, yAnchor: 2.4 });
        overlay.setMap(map);
        placeMarkers.push(overlay, marker);
      }

      // spec.path(Valhalla가 계산한 실도로 좌표)가 있으면 그걸로 실제 도로 모양 경로선을 그리고,
      // 없으면(계산 실패 등) 예전처럼 마커들을 잇는 직선으로 대체한다.
      function finish() {
        var valid = resolved.filter(Boolean);
        if (spec.path && spec.path.length > 1) {
          var routeLL = spec.path.map(function(p) { return new kakao.maps.LatLng(p[0], p[1]); });
          pathLine = new kakao.maps.Polyline({
            path: routeLL, strokeWeight: 5, strokeColor: '#14807A', strokeOpacity: 0.9, strokeStyle: 'solid',
          });
          pathLine.setMap(map);
          valid = valid.concat(routeLL);
        } else if (valid.length > 1 && spec.showPath) {
          pathLine = new kakao.maps.Polyline({
            path: valid, strokeWeight: 4, strokeColor: '#14807A', strokeOpacity: 0.85, strokeStyle: 'solid',
          });
          pathLine.setMap(map);
        }
        if (valid.length === 1) {
          // 마커(혹은 경로)가 정확히 한 점뿐이면 setBounds가 그 점 하나짜리 영역에 맞춰
          // 최대 확대 레벨로 튀어버린다(도로 몇 미터만 화면 가득) — 대신 적당한 레벨로 고정한다.
          map.setCenter(valid[0]);
          map.setLevel(6);
        } else if (valid.length > 1) {
          var bounds = new kakao.maps.LatLngBounds();
          valid.forEach(function(p) { bounds.extend(p); });
          map.setBounds(bounds, 60, 60, 60, 60);
        }
      }

      if (remaining === 0) { finish(); return; }
      spec.markers.forEach(function(item, idx) {
        if (item.lat != null && item.lng != null) {
          placeMarker(idx, item, new kakao.maps.LatLng(item.lat, item.lng));
          remaining -= 1;
          if (remaining === 0) finish();
          return;
        }
        places.keywordSearch(item.query, function(data, status) {
          remaining -= 1;
          if (status === kakao.maps.services.Status.OK && data[0]) {
            placeMarker(idx, item, new kakao.maps.LatLng(Number(data[0].y), Number(data[0].x)));
          }
          if (remaining === 0) finish();
        });
      });
    };

    var script = document.createElement('script');
    script.onerror = function() { post({ type: 'error', message: 'sdk-load-failed' }); };
    script.onload = function() {
      try {
        kakao.maps.load(function() {
          var mapEl = document.getElementById('map');
          map = new kakao.maps.Map(mapEl, {
            center: new kakao.maps.LatLng(37.8228, 128.1555),
            level: 8,
          });
          places = new kakao.maps.services.Places();

          // iframe이 React 레이아웃(flex)이 자리잡기 전에 삽입되면 #map이 실제보다 작은 크기로
          // 잡힌 채로 지도 캔버스가 만들어져서, 나중에 컨테이너가 커져도 지도가 그 작은 크기에
          // 잘린 채로 남는다. 컨테이너 크기가 바뀔 때마다 relayout()으로 다시 맞춰준다.
          var lastW = mapEl.clientWidth, lastH = mapEl.clientHeight;
          var ro = new ResizeObserver(function() {
            if (mapEl.clientWidth === lastW && mapEl.clientHeight === lastH) return;
            lastW = mapEl.clientWidth; lastH = mapEl.clientHeight;
            var center = map.getCenter();
            map.relayout();
            map.setCenter(center);
          });
          ro.observe(mapEl);

          post({ type: 'ready' });
        });
      } catch (e) {
        post({ type: 'error', message: String(e) });
      }
    };
    script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&libraries=services&autoload=false';
    document.head.appendChild(script);
    setTimeout(function() { if (!map) post({ type: 'error', message: 'timeout' }); }, 6000);
  </script>
</body>
</html>
`

export default function KakaoMapView({ lat, lng, hasFix, markers, showPath, path, navPosition, onReady, onError }) {
  const iframeRef = useRef(null)
  const readyRef = useRef(false)

  const sendMarkers = useCallback(() => {
    if (markers?.length) {
      iframeRef.current?.contentWindow?.setMarkers(JSON.stringify({ markers, showPath: !!showPath, path }))
    }
  }, [markers, showPath, path])

  useEffect(() => {
    if (readyRef.current) {
      iframeRef.current?.contentWindow?.setNavPosition(navPosition ? JSON.stringify(navPosition) : null)
    }
  }, [navPosition])

  useEffect(() => {
    const handleMessage = e => {
      if (e.source !== iframeRef.current?.contentWindow) return
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'ready') {
          readyRef.current = true
          onReady?.()
          if (markers?.length) {
            sendMarkers()
          } else if (lat != null && lng != null) {
            iframeRef.current?.contentWindow?.setCenter(lat, lng, hasFix)
          }
        } else if (msg.type === 'error') {
          onError?.(msg.message)
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [lat, lng, hasFix, markers, onReady, onError, sendMarkers])

  // GPS 좌표가 지도 준비 이후에 뒤늦게 들어오는 경우에도 중심을 갱신한다 (마커가 없을 때만).
  useEffect(() => {
    if (readyRef.current && !markers?.length && lat != null && lng != null) {
      iframeRef.current?.contentWindow?.setCenter(lat, lng, hasFix)
    }
  }, [lat, lng, hasFix, markers])

  useEffect(() => {
    if (readyRef.current) sendMarkers()
  }, [sendMarkers])

  return (
    <iframe
      ref={iframeRef}
      title="kakao-map"
      srcDoc={HTML}
      onError={() => onError?.('iframe-error')}
      style={{ ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', border: 0 }}
    />
  )
}
