import { useRef, useCallback, useEffect } from 'react'
import { StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'

const JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY

// 실제 카카오맵을 그리는 HTML — WebView 안에서 로드된다.
// 카카오맵 JS SDK는 브라우저 전용이라 RN에서 직접 못 쓰기 때문에 WebView로 감싸는 표준적인 방법을 쓴다.
// baseUrl을 카카오 콘솔에 등록된 도메인으로 정확히 맞춰줘야 SDK·키워드 검색 요청이 도메인 검증을 통과한다.
// (직접 확인함: 이 JS 키는 http://localhost:5173 이 등록돼 있어서 그 값이어야 통과하고,
//  포트가 다르거나 그냥 http://localhost 만 쓰면 지도는 뜨지만 키워드 검색이 막힌다.)
// libraries=services를 넣어야 장소 이름(query)을 좌표로 바꾸는 키워드 검색을 쓸 수 있다.
const HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html,body{width:100%;height:100%;margin:0;padding:0;}
    /* 주행 중 지도를 돌리려면(헤딩업) #map 자체를 CSS로 회전시켜야 하는데, 그러면 네모난 지도가
       모서리에서 빈 공간을 드러낸다 — #mapWrap으로 화면 크기만큼만 잘라 보여주고(overflow:hidden),
       그 안의 #map은 대각선 길이로 넉넉하게 키워 어느 각도로 돌아도 항상 꽉 차 보이게 한다.
       평소(비주행) 화면에서는 다시 원래 크기로 되돌려 불필요한 타일 로딩을 피한다. */
    #mapWrap{width:100%;height:100%;overflow:hidden;position:relative;}
    #map{position:absolute;width:100%;height:100%;left:0;top:0;}
    @keyframes ripple { from { transform:scale(0.3); opacity:.6; } to { transform:scale(1); opacity:0; } }
  </style>
</head>
<body>
  <div id="mapWrap"><div id="map"></div></div>
  <script>
    var map, mapWrapEl, mapEl, myLocOverlay, places, placeMarkers = [], pathLine;
    var navOverlay, navArrowEl, navigating = false;
    function post(msg) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }

    // 주행 중(헤딩업)에는 #map을 대각선 크기로 키워 중앙 정렬하고, 평소에는 원래 크기로 되돌린다.
    function sizeMapDiagonal() {
      var w = mapWrapEl.clientWidth, h = mapWrapEl.clientHeight;
      var diag = Math.ceil(Math.sqrt(w * w + h * h));
      mapEl.style.width = diag + 'px'; mapEl.style.height = diag + 'px';
      mapEl.style.left = ((w - diag) / 2) + 'px'; mapEl.style.top = ((h - diag) / 2) + 'px';
    }
    function sizeMapNormal() {
      mapEl.style.width = '100%'; mapEl.style.height = '100%';
      mapEl.style.left = '0px'; mapEl.style.top = '0px';
    }
    function relayoutKeepCenter() {
      if (!map) return;
      var center = map.getCenter();
      map.relayout();
      map.setCenter(center);
    }

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

    // 주행 카메라 — 헤딩업(진행 방향이 항상 화면 위) 방식. 화살표는 항상 화면 하단 중앙에 고정해
    // 위를 가리키고, 대신 지도(#map) 자체를 진행 방향의 반대로 돌려서 "지금 가는 방향 = 화면 위"가
    // 되게 한다. 실제 내비 앱들과 같은 방식 — 카카오맵 SDK엔 지도 자체 회전 API가 없어서 #map을
    // CSS로 통째로 돌리는 방식을 쓴다(지도 위 지명 라벨도 같이 도는 건 감수한다).
    window.setNavPosition = function(json) {
      if (!map) return;
      var np = json ? JSON.parse(json) : null;
      if (!np) {
        if (navOverlay) { navOverlay.setMap(null); navOverlay = null; }
        if (navigating) {
          navigating = false;
          mapEl.style.transform = 'rotate(0deg)';
          sizeMapNormal();
          relayoutKeepCenter();
        }
        return;
      }
      var first = !navigating;
      navigating = true;
      var pos = new kakao.maps.LatLng(np.lat, np.lng);
      if (first) {
        sizeMapDiagonal();
        relayoutKeepCenter();
        mapEl.style.transition = 'transform .45s ease';
        var el = document.createElement('div');
        el.style.cssText = 'width:46px;height:46px;border-radius:50%;background:#fff;box-shadow:0 4px 16px rgba(15,50,90,.45);display:flex;align-items:center;justify-content:center;border:2.5px solid #1A6DE3';
        el.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" style="transition:transform .45s ease"><path d="M12 2.5 L18.5 19.5 L12 15.8 L5.5 19.5 Z" fill="#1A6DE3"/></svg>';
        navOverlay = new kakao.maps.CustomOverlay({ position: pos, content: el, zIndex: 10 });
        navOverlay.setMap(map);
        navArrowEl = el.firstChild;
      }
      navOverlay.setPosition(pos);
      // #map이 -heading만큼 돌기 때문에, 그 안에 얹힌 화살표도 같이 돌아 보인다 — 화살표 자체에
      // +heading을 걸어 상쇄하면 화면상으로는 항상 정확히 위를 가리키게 된다.
      if (np.heading != null && navArrowEl) navArrowEl.style.transform = 'rotate(' + np.heading + 'deg)';
      if (np.heading != null) mapEl.style.transform = 'rotate(' + (-np.heading) + 'deg)';
      if (np.zoom && map.getLevel() !== np.zoom) map.setLevel(np.zoom, { animate: true });
      // 실제 내비처럼 차량이 화면 하단에 오도록, 지도 중심을 진행 방향 앞쪽으로 당긴다. 위 회전과
      // 합쳐지면 헤딩과 무관하게 항상 화면 아래쪽에 차량이, 위쪽에 앞으로 갈 길이 보인다.
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
          mapWrapEl = document.getElementById('mapWrap');
          mapEl = document.getElementById('map');
          map = new kakao.maps.Map(mapEl, {
            center: new kakao.maps.LatLng(37.8228, 128.1555),
            level: 8,
          });
          places = new kakao.maps.services.Places();

          // WebView 컨테이너 크기가 회전·키보드 등으로 바뀌면 지도 캔버스가 이전 크기에 잘린 채로
          // 남을 수 있어서, 크기 변화가 감지되면 relayout()으로 다시 맞춰준다. #mapWrap(실제 화면
          // 크기)을 관찰해야 한다 — 주행 중엔 #map 자신을 우리가 대각선 크기로 직접 키우므로
          // #map 자신의 크기 변화를 관찰하면 그 변화까지 리사이즈로 오인한다.
          var lastW = mapWrapEl.clientWidth, lastH = mapWrapEl.clientHeight;
          var ro = new ResizeObserver(function() {
            if (mapWrapEl.clientWidth === lastW && mapWrapEl.clientHeight === lastH) return;
            lastW = mapWrapEl.clientWidth; lastH = mapWrapEl.clientHeight;
            if (navigating) sizeMapDiagonal(); else sizeMapNormal();
            relayoutKeepCenter();
          });
          ro.observe(mapWrapEl);

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
  const webRef = useRef(null)
  const readyRef = useRef(false)

  const sendMarkers = useCallback(() => {
    if (markers?.length) {
      webRef.current?.injectJavaScript(`window.setMarkers(${JSON.stringify(JSON.stringify({ markers, showPath: !!showPath, path }))}); true;`)
    }
  }, [markers, showPath, path])

  useEffect(() => {
    if (!readyRef.current) return
    const arg = navPosition ? JSON.stringify(JSON.stringify(navPosition)) : 'null'
    webRef.current?.injectJavaScript(`window.setNavPosition(${arg}); true;`)
  }, [navPosition])

  const handleMessage = useCallback(e => {
    try {
      const msg = JSON.parse(e.nativeEvent.data)
      if (msg.type === 'ready') {
        readyRef.current = true
        onReady?.()
        if (markers?.length) {
          sendMarkers()
        } else if (lat != null && lng != null) {
          webRef.current?.injectJavaScript(`window.setCenter(${lat}, ${lng}, ${hasFix}); true;`)
        }
      } else if (msg.type === 'error') {
        onError?.(msg.message)
      }
    } catch { /* ignore */ }
  }, [lat, lng, hasFix, markers, onReady, onError, sendMarkers])

  // GPS 좌표가 지도 준비 이후에 뒤늦게 들어오는 경우에도 중심을 갱신한다 (마커가 없을 때만).
  useEffect(() => {
    if (readyRef.current && !markers?.length && lat != null && lng != null) {
      webRef.current?.injectJavaScript(`window.setCenter(${lat}, ${lng}, ${hasFix}); true;`)
    }
  }, [lat, lng, hasFix, markers])

  useEffect(() => {
    if (readyRef.current) sendMarkers()
  }, [sendMarkers])

  return (
    <WebView
      ref={webRef}
      originWhitelist={['*']}
      source={{ html: HTML, baseUrl: 'http://localhost:5173' }}
      onMessage={handleMessage}
      onError={() => onError?.('webview-error')}
      style={StyleSheet.absoluteFill}
      scrollEnabled={false}
      javaScriptEnabled
      domStorageEnabled
    />
  )
}
