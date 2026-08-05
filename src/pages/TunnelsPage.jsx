import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TUNNELS, DIFF } from '../data/mock.js'

function DiffBar({ level }) {
  return (
    <div style={{ display:'flex', gap:4 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ width:9, height:20, borderRadius:3, background: i <= level ? DIFF[level].color : '#E7E2D7' }} />
      ))}
    </div>
  )
}

const FILTERS = [
  { value: 'all',  label: '전체' },
  { value: 'desc', label: '난이도 높은 순' },
  { value: 'asc',  label: '난이도 낮은 순' },
]

export default function TunnelsPage() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [selectedFilter, setSelectedFilter] = useState('all')
  const filtered = q ? TUNNELS.filter(t => t.name.includes(q) || t.road.includes(q)) : TUNNELS
  const list = selectedFilter === 'desc'
    ? [...filtered].sort((a, b) => b.diff - a.diff)
    : selectedFilter === 'asc'
      ? [...filtered].sort((a, b) => a.diff - b.diff)
      : filtered

  return (
    <div style={{ maxWidth:1000, margin:'0 auto', padding:'30px 26px 80px' }}>
      <h1 style={{ fontSize:30, fontWeight:800, letterSpacing:'-.8px', marginBottom:6 }}>터널 정보 백과</h1>
      <p style={{ fontSize:16, color:'var(--text-sub)', marginBottom:22 }}>
        길이·차로·환기·정체 종합 <strong style={{ color:'var(--text-head)' }}> 터널별 공황 난이도 1~5단계</strong>
      </p>
      <div style={{ position:'relative', marginBottom:22 }}>
        <span style={{ position:'absolute', left:17, top:'50%', transform:'translateY(-50%)', color:'#9FAEAF', fontSize:17, pointerEvents:'none' }}>⌕</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="터널 이름으로 검색 (예: 미시령, 인제)"
          style={{ width:'100%', border:'1.5px solid var(--border-light)', borderRadius:'var(--r-lg)', padding:'15px 18px 15px 46px', fontSize:16, color:'var(--text-body)', background:'var(--bg-surface)' }} />
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:18 }}>
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => setSelectedFilter(f.value)}
            style={{
              background: selectedFilter === f.value ? '#14807A' : '#F1F4F6',
              color: selectedFilter === f.value ? '#fff' : '#5B6C78',
              borderRadius: 99, padding: '7px 14px', fontSize: 11,
              fontWeight: selectedFilter === f.value ? 700 : 600,
              cursor: 'pointer',
            }}>{f.label}</button>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
        {list.map(t => (
          <button key={t.id} onClick={() => nav(`/tunnels/${t.id}`)}
            style={{ background:'var(--bg-surface)', border:'1px solid var(--border-light)', borderRadius:'var(--r-xl)', padding:'18px 20px', textAlign:'left', cursor:'pointer', transition:'box-shadow .15s,transform .15s' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow='var(--shadow-sm)'; e.currentTarget.style.transform='translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='translateY(0)' }}
          >
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div>
                <h3 style={{ fontSize:18, fontWeight:800, marginBottom:3 }}>{t.name}</h3>
                <p style={{ fontSize:13.5, color:'var(--text-muted)' }}>{t.road}</p>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                <span style={{ fontSize:12, fontWeight:700, color: DIFF[t.diff].color }}>난이도 {t.diff}단계</span>
                <DiffBar level={t.diff} />
              </div>
            </div>
            <div style={{ display:'flex', gap:26 }}>
              {[['길이',`${(t.lengthM/1000).toFixed(2)}km`],['차로',`왕복 ${t.lanes}차로`],['환기',t.ventGrade],['정체',t.congestion]].map(([k,v]) => (
                <div key={k}>
                  <span style={{ fontSize:12.5, color:'var(--text-muted)', display:'block' }}>{k}</span>
                  <span style={{ fontSize:15, fontWeight:700, color:'#243C42' }}>{v}</span>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
