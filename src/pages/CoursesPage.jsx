import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GRADE } from '../data/mock.js'
import { fetchSafeCourses } from '../lib/tourApi.js'
import GangwonMap from '../components/GangwonMap.jsx'

const CATEGORIES = ['전체', '자연', '역사']

// safetyScore(100 - 10×터널개수)를 거꾸로 풀어서 터널 개수를 되짚고, 백엔드와 동일한 기준으로
// 등급을 매긴다(0개→green, 1~2개→amber, 3개 이상→red).
function tunnelCountFromScore(score) {
  return Math.max(0, Math.round((100 - score) / 10))
}
function classifyGrade(tunnelCount) {
  if (tunnelCount === 0) return 'green'
  if (tunnelCount <= 2) return 'amber'
  return 'red'
}
function shortRegionName(fullName) {
  return /[시군구]$/.test(fullName) ? fullName.slice(0, -1) : fullName
}

export default function CoursesPage() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [selected, setSelected] = useState(searchParams.get('region'))
  const [cat, setCat] = useState('전체')
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  // 강원지도 색깔은 목록 필터(selected)와 무관하게 항상 18개 시군 전체를 보여줘야 하므로,
  // 화면 목록용 courses와 별개로 전체 코스를 한 번 받아서 지역별 평균을 낸다.
  const [allCourses, setAllCourses] = useState([])

  // 지역을 고르면 그 시군구만 조회(약 1초) — 백엔드가 권장하는 방식. 전체 조회는 첫 콜드 호출 시
  // 15초 정도 걸릴 수 있어 로딩 표시를 둔다.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSafeCourses({ region: selected ?? undefined }).then(data => {
      if (!cancelled) { setCourses(data); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [selected])

  useEffect(() => {
    fetchSafeCourses({}).then(setAllCourses)
  }, [])

  const { regionGrades, regionCounts } = useMemo(() => {
    const byRegion = {}
    for (const c of allCourses) {
      const short = shortRegionName(c.region)
      ;(byRegion[short] ??= []).push(tunnelCountFromScore(c.safetyScore))
    }
    const grades = {}, counts = {}
    for (const [region, list] of Object.entries(byRegion)) {
      const avg = list.reduce((a, b) => a + b, 0) / list.length
      counts[region] = Math.round(avg)
      grades[region] = classifyGrade(Math.round(avg))
    }
    return { regionGrades: grades, regionCounts: counts }
  }, [allCourses])

  const list = courses.filter(c => cat === '전체' || c.tags.includes(cat))

  return (
    <div style={{ maxWidth:'var(--max-w)', margin:'0 auto', padding:'30px 26px 80px' }}>
      <h1 style={{ fontSize:30, fontWeight:800, letterSpacing:'-.8px', marginBottom:6 }}>강원 안심 코스</h1>
      <p style={{ fontSize:16, color:'var(--text-sub)', marginBottom:22 }}>3등급 분류 강원도 관광 코스 큐레이션</p>

      <div style={{ display:'grid', gridTemplateColumns:'520px 1fr', gap:30, alignItems:'start' }}>
        {/* 지역 맵 */}
        <div style={{ position:'sticky', top:80 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <span style={{ display:'inline-block', background:'#fff', border:'1px solid var(--border-light)', boxShadow:'var(--shadow-sm)', borderRadius:99, padding:'8px 18px', fontSize:16, fontWeight:700, color:'var(--text-head)' }}>
              강원 18개 시군 안심 등급
            </span>
            <button onClick={() => setSelected(null)} style={{ background:'var(--bg-subtle)', color:'var(--text-sub)', fontWeight:700, fontSize:12.5, padding:'6px 12px', borderRadius:8, cursor:'pointer' }}>전체 보기</button>
          </div>
          <div style={{ marginBottom:48 }}>
            <GangwonMap selected={selected} onSelect={name => setSelected(p => p === name ? null : name)} regionGrades={regionGrades} regionCounts={regionCounts} />
          </div>
          {/* 3등급 안내 */}
          <div style={{ display:'flex', gap:16 }}>
            {Object.entries(GRADE).map(([k,m]) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:13, height:13, borderRadius:4, background:m.bg, border:`1.5px solid ${m.border}`, flexShrink:0 }} />
                <span style={{ fontSize:13, color:'var(--text-sub)', fontWeight:600 }}>{m.label}{k==='red'?' · 터널 노출 多':''}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 코스 목록 */}
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <span style={{ fontSize:17, fontWeight:800, color:'var(--text-head)' }}>{selected ? `${selected} 주변` : '전체 추천 코스'}</span>
            <span style={{ fontSize:14, color:'var(--text-muted)', fontWeight:600 }}>{loading ? '불러오는 중...' : `${list.length}개 코스`}</span>
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:14 }}>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCat(c)}
                style={{
                  background: cat === c ? '#14807A' : '#F1F4F6',
                  color: cat === c ? '#fff' : '#5B6C78',
                  borderRadius:99, padding:'7px 13px', fontSize:11, fontWeight:600, cursor:'pointer',
                }}>{c}</button>
            ))}
          </div>

          {loading && (
            <p style={{ fontSize:13.5, color:'var(--text-sub)', padding:'24px 0' }}>
              {selected ? '코스를 불러오는 중...' : '전체 코스를 불러오는 중 (첫 조회는 최대 15초 정도 걸려요)'}
            </p>
          )}
          {!loading && list.length === 0 && (
            <p style={{ fontSize:13.5, color:'var(--text-muted)', padding:'24px 0', textAlign:'center' }}>이 지역에는 아직 등록된 코스가 없어요.</p>
          )}

          {list.map(c => {
            const m = GRADE[c.grade]
            return (
              <button key={c.id} onClick={() => nav(`/courses/${c.id}`, { state: { course: c } })}
                style={{
                  display:'block', width:'100%', background:'var(--bg-surface)',
                  border:'1px solid var(--border-light)', borderRadius:'var(--r-xl)',
                  marginBottom:14, overflow:'hidden', textAlign:'left', cursor:'pointer',
                  transition:'box-shadow .15s,transform .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow='var(--shadow-sm)'; e.currentTarget.style.transform='translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='translateY(0)' }}
              >
                <div style={{ height:130, background:'linear-gradient(135deg,#DCEBE9,#C0D8D2)' }} />
                <div style={{ padding:'18px 20px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8, gap:12 }}>
                    <div>
                      <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:3 }}>{c.region}</p>
                      <h3 style={{ fontSize:18, fontWeight:800 }}>{c.title}</h3>
                    </div>
                    <span style={{ fontSize:12, fontWeight:700, padding:'4px 10px', borderRadius:99, background:m.bg, border:`1px solid ${m.border}`, color:m.color, whiteSpace:'nowrap', flexShrink:0 }}>{m.label}</span>
                  </div>
                  <p style={{ fontSize:13.5, color:'var(--text-sub)', lineHeight:1.6, marginBottom:12 }}>{c.summary}</p>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    {c.tags.map(t => <span key={t} style={{ fontSize:12, color:'var(--text-sub)', background:'var(--bg-subtle)', padding:'3px 9px', borderRadius:99 }}>{t}</span>)}
                    <span style={{
                      fontSize:10, fontWeight:800,
                      color: c.grade==='green' ? '#2E7D4F' : c.grade==='amber' ? '#9A6B12' : '#A53E33',
                      background: c.grade==='green' ? '#EAF7EF' : c.grade==='amber' ? '#FBF2E0' : '#FBEAE7',
                      borderRadius:6, padding:'4px 7px', marginLeft:'auto',
                    }}>안심 {c.safetyScore}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
