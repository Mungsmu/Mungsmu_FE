// 마음숨길 화면 초안용 mock 데이터

export const TUNNELS = [
  { id: 't1', name: '인제양양터널', road: '서울양양고속도로', region: '인제', lengthM: 10965, lanes: 4, ventGrade: '우수',  congestion: '낮음', diff: 5 },
  { id: 't2', name: '미시령터널',   road: '미시령동서관통도로', region: '인제', lengthM: 3565, lanes: 4, ventGrade: '양호', congestion: '보통', diff: 5 },
  { id: 't3', name: '둔내터널',     road: '영동고속도로',      region: '횡성', lengthM: 3300,  lanes: 4, ventGrade: '양호', congestion: '높음', diff: 5 },
  { id: 't4', name: '대관령1터널',  road: '영동고속도로',      region: '평창', lengthM: 1830,  lanes: 4, ventGrade: '양호', congestion: '보통', diff: 4 },
  { id: 't5', name: '광치터널',     road: '국도 31호선',       region: '인제', lengthM: 570,  lanes: 2, ventGrade: '보통', congestion: '낮음', diff: 4 },
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
