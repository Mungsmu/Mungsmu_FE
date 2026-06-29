import { useParams, useNavigate } from 'react-router-dom'
import { TUNNELS, DIFF } from '../data/mock.js'

const DIFF_META = {
  1: { label:'매우 낮음', desc:'길이가 짧고 환기가 잘 돼요. 대부분 부담 없이 통과할 수 있어요.',     bg:'#E8F6EE' },
  2: { label:'낮음',     desc:'짧은 편이고 차선이 넓어요. 처음 도전하기 좋은 난이도예요.',           bg:'#EAF3DE' },
  3: { label:'보통',     desc:'평균적인 강원 터널이에요. 동반 모드를 준비하면 도움이 돼요.',         bg:'#FBF0D9' },
  4: { label:'높음',     desc:'길이가 길거나 정체가 잦아요. 동반 모드를 켜고 진입하세요.',           bg:'#FAE6E0' },
  5: { label:'매우 높음', desc:'장대터널로 10분 이상 소요돼요. 반드시 동반 모드를 준비하세요.',     bg:'#FCEAEA' },
}

export default function TunnelDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const t = TUNNELS.find(t => t.id === id)
  if (!t) return <p style={{ padding:60, textAlign:'center', color:'var(--text-muted)' }}>터널 정보를 찾을 수 없어요.</p>

  const dm = DIFF_META[t.diff]
  const dc = DIFF[t.diff].color
  const avgSec = Math.round((t.lengthM / 80) * 3.6)
  const avgTime = `${Math.floor(avgSec/60)}분 ${avgSec%60}초`

  return (
    <div style={{ maxWidth:800, margin:'0 auto', padding:'24px 26px 80px' }}>
      <button onClick={() => nav('/tunnels')} style={{ color:'var(--text-muted)', fontSize:13.5, fontWeight:600, marginBottom:20, cursor:'pointer' }}>← 터널 백과</button>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:20, marginBottom:20 }}>
        <div>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:5 }}>{t.road}</p>
          <h1 style={{ fontSize:32, fontWeight:800, letterSpacing:'-.8px' }}>{t.name}</h1>
        </div>
        <div style={{ flexShrink:0, padding:'16px 22px', borderRadius:'var(--r-xl)', background:dm.bg, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:36, fontWeight:800, color:dc, lineHeight:1 }}>{t.diff}단계</span>
          <span style={{ fontSize:12, fontWeight:700, color:dc }}>{dm.label}</span>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'flex-start', gap:12, borderRadius:'var(--r-lg)', padding:'16px 18px', marginBottom:28, background:dm.bg, border:`1px solid ${dc}22` }}>
        <span style={{ fontSize:18, flexShrink:0 }}>⚠️</span>
        <p style={{ fontSize:15, lineHeight:1.6, fontWeight:600, color:dc }}>{dm.desc}</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:13, marginBottom:32 }}>
        {[['길이',`${(t.lengthM/1000).toFixed(2)}km`],['차로수',`왕복 ${t.lanes}차로`],['환기 등급',t.ventGrade],['평균 통과',avgTime],['정체 빈도',t.congestion],['공황 난이도',`${t.diff} / 5단계`]].map(([k,v]) => (
          <div key={k} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-light)', borderRadius:'var(--r-lg)', padding:'18px 20px' }}>
            <span style={{ fontSize:12, color:'var(--text-muted)', display:'block', marginBottom:6 }}>{k}</span>
            <span style={{ fontSize:22, fontWeight:800, color:'#243C42', letterSpacing:'-.3px' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
