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
  <style>html,body,#map{width:100%;height:100%;margin:0;padding:0;}</style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map, marker, places, placeMarkers = [], pathLine;
    function post(msg) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }

    window.setCenter = function(lat, lng, withMarker) {
      if (!map) return;
      var pos = new kakao.maps.LatLng(lat, lng);
      map.setCenter(pos);
      if (withMarker) {
        if (!marker) { marker = new kakao.maps.Marker({ position: pos, map: map }); }
        else { marker.setPosition(pos); }
      }
    };

    window.setMarkers = function(json) {
      if (!map || !places) return;
      var spec = JSON.parse(json);
      placeMarkers.forEach(function(m) { m.setMap(null); });
      placeMarkers = [];
      if (pathLine) { pathLine.setMap(null); pathLine = null; }
      var resolved = [];
      var remaining = spec.markers.length;
      if (remaining === 0) return;
      spec.markers.forEach(function(item, idx) {
        places.keywordSearch(item.query, function(data, status) {
          remaining -= 1;
          if (status === kakao.maps.services.Status.OK && data[0]) {
            var pos = new kakao.maps.LatLng(Number(data[0].y), Number(data[0].x));
            resolved[idx] = pos;
            var content = '<div style="background:' + item.color + ';color:#fff;font-weight:800;font-size:11px;' +
              'padding:3px 7px;border-radius:99px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25);">' + item.label + '</div>';
            var overlay = new kakao.maps.CustomOverlay({ position: pos, content: content, yAnchor: 1.6 });
            overlay.setMap(map);
            var dot = new kakao.maps.Marker({
              position: pos, map: map,
              image: new kakao.maps.MarkerImage(
                'data:image/svg+xml;utf8,' + encodeURIComponent(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="7" fill="' + item.color + '" stroke="white" stroke-width="2.5"/></svg>'
                ),
                new kakao.maps.Size(18, 18)
              ),
            });
            placeMarkers.push(overlay, dot);
          }
          if (remaining === 0) {
            var valid = resolved.filter(Boolean);
            if (valid.length > 1 && spec.showPath) {
              pathLine = new kakao.maps.Polyline({
                path: valid, strokeWeight: 4, strokeColor: '#14807A', strokeOpacity: 0.85, strokeStyle: 'solid',
              });
              pathLine.setMap(map);
            }
            if (valid.length > 0) {
              var bounds = new kakao.maps.LatLngBounds();
              valid.forEach(function(p) { bounds.extend(p); });
              map.setBounds(bounds, 60, 60, 60, 60);
            }
          }
        });
      });
    };

    var script = document.createElement('script');
    script.onerror = function() { post({ type: 'error', message: 'sdk-load-failed' }); };
    script.onload = function() {
      try {
        kakao.maps.load(function() {
          map = new kakao.maps.Map(document.getElementById('map'), {
            center: new kakao.maps.LatLng(37.8228, 128.1555),
            level: 8,
          });
          places = new kakao.maps.services.Places();
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

export default function KakaoMapView({ lat, lng, hasFix, markers, showPath, onReady, onError }) {
  const webRef = useRef(null)
  const readyRef = useRef(false)

  const sendMarkers = useCallback(() => {
    if (markers?.length) {
      webRef.current?.injectJavaScript(`window.setMarkers(${JSON.stringify(JSON.stringify({ markers, showPath: !!showPath }))}); true;`)
    }
  }, [markers, showPath])

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
