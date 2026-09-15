// 터널 통과 진행 카드 — 터널 이름 + 통과율 텍스트 + 진행바. 동반 모드 튜토리얼(CompanionPage)과
// 실제 내비게이션 중 동반 모드 오버레이(NavigatingPage)에서 똑같은 UI로 쓴다.
export default function TunnelProgressCard({ name, pct = 0 }) {
  return (
    <div style={{ background:'#fff', borderRadius:14, padding:'13px 16px', boxShadow:'0 6px 20px rgba(20,40,60,.12)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10 }}>
        <span style={{ fontSize:12.5, fontWeight:700, color:'#16242E' }}>{name} 통과 중</span>
        <span style={{ fontSize:12.5, color:'#5B6C78' }}>{pct >= 100 ? '통과 완료' : `${Math.round(pct)}% 통과`}</span>
      </div>
      <div style={{ height:6, borderRadius:99, background:'#E4EAEF', overflow:'hidden', marginTop:8 }}>
        <div style={{ height:'100%', width:`${Math.min(pct, 100)}%`, background:'linear-gradient(90deg,#1E9E94,#0E5E58)', borderRadius:99, transition:'width .3s linear' }} />
      </div>
    </div>
  )
}
