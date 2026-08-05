import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { COURSES, GRADE } from '../data/mock.js'
import GangwonMap from '../components/GangwonMap.jsx'

const CATEGORIES = ['전체', '자연', '해안']

export default function CoursesPage() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [selected, setSelected] = useState(searchParams.get('region'))
  const [cat, setCat] = useState('전체')
  const list = COURSES
    .filter(c => !selected || c.region.includes(selected))
    .filter(c => cat === '전체' || c.tags.includes(cat))

  return (
    //<div style={{ background:'#fff', minHeight:'100%' }}>
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
            <GangwonMap selected={selected} onSelect={name => setSelected(p => p === name ? null : name)} />
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
            <span style={{ fontSize:14, color:'var(--text-muted)', fontWeight:600 }}>{list.length}개 코스</span>
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
          {list.map(c => {
            const m = GRADE[c.grade]
            return (
              <button key={c.id} onClick={() => nav(`/courses/${c.id}`)}
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
    //</div>
  )
}
