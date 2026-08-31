# 마음숨길 (MAEUM SUMGIL) — Frontend

공황장애 환자를 위한 **터널 회피 내비게이션** 웹 앱 (강원 관광 특화).
React 18 + Vite, 카카오맵 JS SDK(지도 표시), Valhalla(실도로 경로 계산) 기반.

## 실행 방법

```bash
npm install
npm run dev        # http://localhost:5173
```

- `.env.local`에 카카오맵 JavaScript 키 필요: `VITE_KAKAO_MAP_KEY=...`
  - 카카오 개발자 콘솔에서 **카카오맵 서비스 활성화** + **[앱 키] > [JavaScript SDK 도메인]**에 `http://localhost:5173` 등록
- 백엔드([Ma_BE](https://github.com/Mungsmu/Ma_BE))는 `8081` 포트로 실행 (`server.port=8081`) — Vite가 `/api`를 프록시함. 로그인/회원가입/SMS에만 필요하고 내비게이션은 백엔드 없이 동작.

## 네비게이션 기능 정리

### 1. 실도로 경로 계산 — `src/lib/route.js`
- **Valhalla** 공개 서버(`valhalla1.openstreetmap.de`) 사용 — 무료·무키·CORS 허용 (상용 트래픽은 자체 호스팅 필요)
- `fetchRoute(points, opts)` — polyline6 디코딩, 턴바이턴 maneuver(한국어 매핑 30여 종), 거리/시간 반환
- **터널 완전 회피**: `costing_options.auto.exclude_tunnels: true` — 터널을 하나도 지나지 않는 경로 (구룡령·대관령 옛길 등 우회)
  - ⚠️ 최상위 `exclude_tunnels`는 조용히 무시됨 — 반드시 `costing_options.auto` 안에 넣을 것
- **실측 터널 검증**: `traceTunnels(shapes)` — `/trace_attributes`(edge.tunnel, OSM 태그)로 경로가 실제 지나는 터널 구간을 이름·길이와 함께 추출 (leg별 인덱스 리셋 주의 — leg 안에서만 병합)

### 2. 경로 비교 화면 — `src/pages/RoutePage.jsx`
- 최단 루트 vs 터널 회피 루트를 병렬 계산해 카드로 비교 (터널 수·소요 시간 차이 표시)
- 터널 수는 mock이 아니라 `traceTunnels` 실측값 (500m 이상 구간, 이름 우선순위: OSM 터널명 → 도로명+터널 → ref번호)
- 검증 예 (춘천역→속초해수욕장): 최단 132.7km·1h48m·터널 22개 / **완전 회피 265km·5h15m·터널 0개**

### 3. 실시간 턴바이턴 내비 — `src/pages/NavigatingPage.jsx` + `src/components/NavOverlays.jsx`
실시간 오버레이 3종 (각각 `React.memo`로 독립 갱신):
- **턴바이턴 패널** (상단 파란 바): 다음 회전까지 거리 + 화살표 SVG + 도로 번호 배지 + 방면, 그다음 안내 서브바
- **위험구간 위젯** (좌측): 단속📷/사고🚨/공사🚧/급정거🛑 + 제한속도 링 + 남은 거리 (현재는 데모 시드 — 실데이터는 공공데이터포털 연동 필요)
- **주행 요약 바** (하단): 현재 도로명 / 남은 거리 / 도착 예정 시각 + 진행률 게이지

거리 표기 규칙: 1km 미만 `m` 정수, 이상 소수 1자리 `km` / 시각은 12시간제 `오전/오후`.

예외 처리: GPS 신호 끊김 배지 → 6초 후 시뮬레이션 폴백, 경로 이탈(250m 초과) 시 자동 재탐색, 도착/데이터 실패 상태 표시, 음성 안내(700m 이내 1회).

### 4. 거리뷰(스트리트 레벨) 주행 화면 — `src/components/MockStreetMap.jsx`
- 회전 600m 전 줌인(level 3), 평시 level 4 — 건물·상호가 보이는 축척
- **전방 시야 카메라**: 진행 방향(heading)으로 130~260m 앞을 지도 중심으로 — 차량이 화면 하단, 전방 도로가 화면을 채움
  - 카카오맵 JS SDK는 지도 회전(heading-up)을 지원하지 않아 north-up + 전방 오프셋으로 대체
- 경로 3중 폴리라인: 지나온 길(회색) / 남은 길(파랑) / **진출 방향 강조**(주황, 끝화살표, ~600m 구간) + 회전 지점 화살표 배지

### 5. 테스트 페이지
- `nav-test.html` — Leaflet 기반 단독 비교 페이지 (OSRM vs Valhalla vs 회피 옵션), 팀 공유용
- `screenshots/` — 기능별 검증 캡처 모음

## 알려진 한계
- 단속카메라/위험구간은 데모 시드 (공공데이터포털 CSV 연동 예정)
- 차선 단위 안내는 미지원 (필요 시 TMAP API — 무료 쿼터 약 1,000건/일)
- 경로 이탈 재탐색 시 지도 기본 폴리라인은 다시 그리지 않음
