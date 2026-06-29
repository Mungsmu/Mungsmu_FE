import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function NavigatingPage() {
  const navigate = useNavigate()
  const { origin = '출발지', dest = '목적지', durationMin = 192, distanceKm = 238, tunnel } = useLocation().state ?? {}
  const [pct, setPct] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setPct(p => Math.min(p + 100 / 20, 100)), 500)
    return () => clearInterval(t)
  }, [])

  const arrived = pct >= 100
  const showAlert = !!tunnel && pct >= 55 && !arrived && !dismissed

  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, background:'#EAF0F3', display:'flex', flexDirection:'column', fontFamily:'Pretendard, sans-serif' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'20px 28px' }}>
        <span style={{ fontSize:12.5, fontWeight:700, color:'#5B6C78', background:'#fff', border:'1px solid #E4EAEF', borderRadius:99, padding:'7px 14px' }}>
          {arrived ? '도착 완료' : '주행 중 · 내비게이션'}
        </span>
        <button onClick={() => navigate('/home')} style={{ marginLeft:'auto', color:'#8A98A2', fontWeight:700, fontSize:14, cursor:'pointer' }}>나가기 ✕</button>
      </div>

      <div style={{ padding:'0 28px', maxWidth:560, width:'100%', margin:'0 auto' }}>
        <p style={{ fontSize:14, fontWeight:700, color:'#16242E', marginBottom:10 }}>{origin} → {dest}</p>
        <div style={{ height:8, borderRadius:99, background:'#DCE3E8', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background: tunnel ? '#D45B4E' : '#14807A', borderRadius:99, transition:'width .4s linear' }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:12, color:'#8A98A2' }}>
          <span>{distanceKm}km</span>
          <span>{durationMin}분 예상</span>
        </div>
      </div>

      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 28px' }}>
        {arrived ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:'#EAF7EF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 14px' }}>✓</div>
            <p style={{ fontSize:17, fontWeight:800, color:'#16242E' }}>목적지에 도착했어요</p>
            <p style={{ fontSize:13, color:'#5B6C78', marginTop:6 }}>
              {tunnel ? '터널 구간을 지나 무사히 도착했어요.' : '터널 없는 안심 경로로 편안하게 도착했어요.'}
            </p>
          </div>
        ) : tunnel ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:10 }}>🚗</div>
            <p style={{ fontSize:14, color:'#5B6C78', lineHeight:1.6 }}>{dest} 방향으로 이동 중이에요<br />{tunnel.name} 구간이 다가오고 있어요</p>
          </div>
        ) : (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:10 }}>🛡️</div>
            <p style={{ fontSize:14, color:'#5B6C78', lineHeight:1.6 }}>이 경로는 터널 노출이 없어<br />동반 모드 없이 편안하게 주행할 수 있어요</p>
          </div>
        )}
      </div>

      {showAlert ? (
        <div style={{ position:'absolute', bottom:32, left:20, right:20, background:'#fff', borderRadius:18, padding:'18px 17px', boxShadow:'0 10px 30px rgba(20,40,60,.18)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ width:34, height:34, borderRadius:'50%', background:'#FBEAE7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>⚠️</span>
            <div>
              <p style={{ fontWeight:800, fontSize:14, color:'#16242E' }}>{tunnel.name} 접근</p>
              <p style={{ fontSize:10.5, color:'#A53E33' }}>공황 난이도 {tunnel.diff} · 500m 앞</p>
            </div>
          </div>
          <p style={{ fontSize:12, color:'#5B6C78', marginTop:12 }}>동반 모드를 시작할까요? 호흡 가이드 음성이 자동 재생됩니다.</p>
          <div style={{ display:'flex', gap:9, marginTop:14 }}>
            <button onClick={() => setDismissed(true)} style={{ flex:1, height:42, borderRadius:11, background:'#F1F4F6', color:'#5B6C78', fontWeight:700, fontSize:12.5, cursor:'pointer' }}>나중에</button>
            <button onClick={() => navigate('/companion', { state: { tunnel } })} style={{ flex:1.4, height:42, borderRadius:11, background:'#14807A', color:'#fff', fontWeight:800, fontSize:12.5, cursor:'pointer' }}>동반 시작</button>
          </div>
        </div>
      ) : (
        <div style={{ padding:'16px 28px 32px' }}>
          <button onClick={() => navigate('/home')} style={{ width:'100%', height:44, borderRadius:12, background: arrived ? '#14807A' : '#F1F4F6', color: arrived ? '#fff' : '#5B6C78', fontWeight:800, fontSize:14, cursor:'pointer' }}>
            {arrived ? '여정 마치기' : '안내 종료'}
          </button>
        </div>
      )}
    </div>
  )
}
