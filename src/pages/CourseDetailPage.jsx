import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { GRADE } from '../data/mock.js'
import { fetchSafeCourses } from '../lib/tourApi.js'
import MockStreetMap from '../components/MockStreetMap.jsx'

const TYPE_BG = { '자연':'#E8F6EE','해변':'#E3F0F2','카페':'#FBF0D9','문화':'#EDE8F6','체험':'#F6EEE8','어촌':'#EBF0E8','역사':'#F6EEE0' }

export default function CourseDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  // 목록에서 클릭해 들어온 경우엔 코스 객체를 그대로 받아서 재조회가 필요 없다(빠름).
  // 새로고침/직접 URL 진입 등 state가 없을 때만 백엔드에 코스 상세 조회 API가 없어서
  // 전체 목록을 다시 받아 id로 찾는다(느림, 최대 15초) — 백엔드가 안내한 방식 그대로.
  const [course, setCourse] = useState(location.state?.course ?? null)
  const [loading, setLoading] = useState(!location.state?.course)

  useEffect(() => {
    if (location.state?.course) return
    let cancelled = false
    setLoading(true)
    fetchSafeCourses({}).then(data => {
      if (cancelled) return
      setCourse(data.find(c => c.id === id) ?? null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [id, location.state])

  if (loading) return <p style={{ padding:60, textAlign:'center', color:'var(--text-muted)' }}>코스를 불러오는 중... (최대 15초)</p>
  if (!course) return <p style={{ padding:60, textAlign:'center', color:'var(--text-muted)' }}>코스를 찾을 수 없어요.</p>
  const m = GRADE[course.grade]

  // 지오코딩 검색어에 "강원 + 시군구명"을 같이 넣는다 — 시군구명만으로는 부족한 경우가 있다
  // (예: "고성군"은 강원/경남에 둘 다 있어서, 관광지 이름이 검색 안 돼 지역명까지 폴백되면
  // 카카오가 경남 고성군을 대표로 잡아버림 — 실측 확인). "강원"까지 붙이면 최후의 폴백(지역명만
  // 남는 경우)에서도 항상 올바른 도로 좁혀진다.
  const withRegion = name => `강원 ${course.region} ${name}`

  const guideCourse = () => {
    const [first, ...rest] = course.spots
    const last = rest.pop()
    nav('/route', {
      state: {
        courseMode: true,
        courseTitle: course.title,
        origin: withRegion(first.name),
        dest: withRegion(last.name),
        waypoints: rest.map(s => withRegion(s.name)),
        distance: course.distance,
        tunnelTag: course.tags.find(t => t.startsWith('터널')),
      },
    })
  }

  return (
    <div style={{ maxWidth:1000, margin:'0 auto', padding:'24px 26px 80px' }}>
      <button onClick={() => nav('/courses')} style={{ color:'var(--text-muted)', fontSize:13.5, fontWeight:600, marginBottom:20, cursor:'pointer' }}>← 코스 목록</button>

      <div style={{ display:'grid', gridTemplateColumns:'380px 1fr', gap:32, alignItems:'start' }}>
        {/* 지도 */}
        <div style={{ position:'sticky', top:80 }}>
          <div style={{ borderRadius:24, height:420, overflow:'hidden', border:'1px solid var(--border-light)' }}>
            <MockStreetMap
              showPath
              markers={course.spots.map((s, i) => ({ id:s.name, label:String(i + 1), query:withRegion(s.name), color:'#14807A' }))}
            >
              <div style={{ position:'absolute', right:14, top:14, background:'rgba(255,255,255,.92)', borderRadius:8, padding:'6px 12px', fontSize:12.5, fontWeight:700, color:'var(--text-sub)' }}>
                {course.spots.length}개 경유지
              </div>
            </MockStreetMap>
          </div>
        </div>

        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:14 }}>
            <div>
              <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:4 }}>{course.region}</p>
              <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:'-.8px' }}>{course.title}</h1>
            </div>
            <span style={{ fontSize:13, fontWeight:700, padding:'6px 14px', borderRadius:99, background:m.bg, border:`1px solid ${m.border}`, color:m.color, flexShrink:0 }}>{m.label}</span>
          </div>
          <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
            {course.tags.map(t => <span key={t} style={{ fontSize:12, color:'var(--text-sub)', background:'var(--bg-subtle)', padding:'4px 10px', borderRadius:99 }}>{t}</span>)}
            <span style={{ fontSize:12, color:'var(--text-sub)', background:'var(--bg-subtle)', padding:'4px 10px', borderRadius:99 }}>📍 {course.distance}</span>
          </div>
          <p style={{ fontSize:15, color:'var(--text-sub)', lineHeight:1.7, marginBottom:28, paddingBottom:24, borderBottom:'1px solid var(--border-light)' }}>{course.summary}</p>

          <h2 style={{ fontSize:18, fontWeight:800, marginBottom:16 }}>경유지</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:32 }}>
            {course.spots.map((s, i) => (
              <div key={s.name} style={{ display:'flex', gap:16, background:'var(--bg-surface)', border:'1px solid var(--border-light)', borderRadius:'var(--r-xl)', padding:16 }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, flexShrink:0 }}>
                  <span style={{ width:24, height:24, borderRadius:'50%', background:'var(--primary)', color:'#fff', fontSize:12, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>{i+1}</span>
                  <div style={{ width:72, height:60, borderRadius:8, background: TYPE_BG[s.type] ?? '#F0ECE2' }} />
                </div>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                    <span style={{ fontSize:15.5, fontWeight:800, color:'var(--text-head)' }}>{s.name}</span>
                    <span style={{ fontSize:11, color:'var(--text-sub)', background:'var(--bg-subtle)', padding:'2px 8px', borderRadius:99 }}>{s.type}</span>
                  </div>
                  <p style={{ fontSize:13.5, color:'var(--text-sub)', lineHeight:1.55 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <button onClick={guideCourse} style={{ width:'100%', background:'var(--primary)', color:'#fff', fontWeight:700, fontSize:16, padding:15, borderRadius:'var(--r-lg)', boxShadow:'var(--shadow-lg)', cursor:'pointer' }}>코스 안내</button>
        </div>
      </div>
    </div>
  )
}
