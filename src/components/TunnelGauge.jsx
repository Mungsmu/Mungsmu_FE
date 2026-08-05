// 터널 이동 게이지 — 지도 화면 우측에 고정, 진행률(pct)만큼 위에서부터 채워짐
export default function TunnelGauge({ pct = 0 }) {
  return (
    <div style={{
      position: 'absolute', top: '18%', bottom: '18%', right: 16, width: 14,
      borderRadius: 99, background: 'rgba(255,255,255,.55)', border: '1px solid rgba(255,255,255,.8)',
      overflow: 'hidden', boxShadow: '0 2px 10px rgba(20,40,60,.15)',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: `${Math.min(pct, 100)}%`,
        background: 'linear-gradient(180deg,#1E9E94,#0E5E58)', transition: 'height .4s linear',
      }} />
    </div>
  )
}
