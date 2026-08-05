// 마음숨길 화면 초안용 mock 데이터 (웹 src/data/mock.js와 동일 — 별도 앱이라 복제 유지)

export const COURSES = [
  {
    id: 'c1', title: '속초 해안 힐링 코스', region: '속초 · 고성',
    grade: 'green', distance: '약 22km', safetyScore: 95,
    tags: ['터널 0', '해안', '해수욕'],
    summary: '청초호에서 아야진까지 7번 국도를 따라 바다를 옆에 끼고 달리는 완전 무터널 코스.',
    spots: [
      { name: '청초호 수변공원', type: '자연', desc: '잔잔한 호수와 도심이 만나는 힐링 공간' },
      { name: '속초해수욕장',   type: '해변', desc: '설악산을 배경으로 펼쳐지는 넓은 백사장' },
      { name: '영금정',         type: '자연', desc: '파도 소리가 울리는 바위 전망대' },
    ],
  },
  {
    id: 'c2', title: '강릉 커피·바다 코스', region: '강릉',
    grade: 'green', distance: '약 18km', safetyScore: 92,
    tags: ['터널 0', '카페', '해안'],
    summary: '안목해변 커피거리에서 경포까지, 바다 뷰 카페와 해변을 잇는 도심 드라이브.',
    spots: [
      { name: '안목해변 커피거리', type: '카페', desc: '자판기 커피로 유명한 해변 거리' },
      { name: '경포해수욕장',     type: '해변', desc: '강릉 대표 해변, 넓은 백사장' },
    ],
  },
  {
    id: 'c3', title: '원주 예술·협곡 코스', region: '원주',
    grade: 'green', distance: '약 16km', safetyScore: 88,
    tags: ['터널 0', '미술관', '트레킹'],
    summary: '뮤지엄산에서 소금산까지, 건축·자연·협곡이 어우러진 무터널 코스.',
    spots: [
      { name: '뮤지엄 산',      type: '문화', desc: '안도 다다오 설계, 건축과 자연의 대화' },
      { name: '소금산 출렁다리', type: '자연', desc: '협곡을 가로지르는 짜릿한 전망' },
    ],
  },
  {
    id: 'c4', title: '평창 고원 힐링 코스', region: '평창',
    grade: 'amber', distance: '약 26km', safetyScore: 72,
    tags: ['터널 1', '고원', '자연'],
    summary: '대관령 양떼목장과 오대산 전나무숲. 짧은 터널 1개 포함, 회피 경로 안내.',
    spots: [
      { name: '대관령 양떼목장',      type: '체험', desc: '탁 트인 고원 양 먹이주기 체험' },
      { name: '오대산 월정사 전나무숲', type: '자연', desc: '평탄한 숲길, 피톤치드 가득' },
    ],
  },
];

export const TUNNELS = [
  { id: 't1', name: '인제양양터널', road: '서울양양고속도로', region: '인제', lengthM: 10965, lanes: 4, ventGrade: '우수',  congestion: '낮음', diff: 5 },
  { id: 't2', name: '미시령터널',   road: '미시령동서관통도로', region: '인제', lengthM: 3690, lanes: 4, ventGrade: '양호', congestion: '보통', diff: 4 },
  { id: 't3', name: '둔내터널',     road: '영동고속도로',      region: '횡성', lengthM: 3300,  lanes: 4, ventGrade: '양호', congestion: '높음', diff: 4 },
  { id: 't4', name: '대관령1터널',  road: '영동고속도로',      region: '평창', lengthM: 1860,  lanes: 4, ventGrade: '양호', congestion: '보통', diff: 3 },
  { id: 't5', name: '광치터널',     road: '국도 31호선',       region: '인제', lengthM: 2140,  lanes: 2, ventGrade: '보통', congestion: '낮음', diff: 4 },
  { id: 't6', name: '백복령터널',   road: '국도 42호선',       region: '정선', lengthM: 870,   lanes: 2, ventGrade: '보통', congestion: '낮음', diff: 2 },
];

export const REGIONS = [
  { name: '고성',  grade: 'green', col: 6, row: 1, tunnels: 0 },
  { name: '화천',  grade: 'red',   col: 2, row: 1, tunnels: 3 },
  { name: '양구',  grade: 'red',   col: 3, row: 1, tunnels: 4 },
  { name: '인제',  grade: 'red',   col: 4, row: 1, tunnels: 5 },
  { name: '철원',  grade: 'red',   col: 1, row: 1, tunnels: 3 },
  { name: '속초',  grade: 'green', col: 6, row: 2, tunnels: 0 },
  { name: '춘천',  grade: 'amber', col: 1, row: 2, tunnels: 1 },
  { name: '홍천',  grade: 'amber', col: 3, row: 2, tunnels: 2 },
  { name: '양양',  grade: 'green', col: 6, row: 3, tunnels: 0 },
  { name: '횡성',  grade: 'amber', col: 2, row: 3, tunnels: 1 },
  { name: '평창',  grade: 'red',   col: 4, row: 3, tunnels: 3 },
  { name: '강릉',  grade: 'green', col: 6, row: 4, tunnels: 0 },
  { name: '원주',  grade: 'amber', col: 1, row: 4, tunnels: 1 },
  { name: '영월',  grade: 'red',   col: 3, row: 4, tunnels: 3 },
  { name: '정선',  grade: 'red',   col: 4, row: 4, tunnels: 4 },
  { name: '동해',  grade: 'amber', col: 6, row: 5, tunnels: 1 },
  { name: '태백',  grade: 'red',   col: 4, row: 5, tunnels: 6 },
  { name: '삼척',  grade: 'amber', col: 5, row: 5, tunnels: 2 },
];

export const GRADE = {
  green: { label: '안심', color: '#1E6B49', bg: '#E8F6EE', border: '#9BD3AF' },
  amber: { label: '보통', color: '#9A6B16', bg: '#FBF0D9', border: '#ECCB86' },
  red:   { label: '주의', color: '#B24A33', bg: '#FAE6E0', border: '#EDB6A8' },
};

export const DIFF = {
  1: { color: '#2E9E6B' }, 2: { color: '#6DB84A' },
  3: { color: '#E0A93B' }, 4: { color: '#D8654E' }, 5: { color: '#B83030' },
};
