// 지도 화면 상단 팝업 배너 — 터널 진입 전 / 보호자 호출 / 통과 완료 메시지에 공통 사용.
// onClick을 주면 보호자 호출 버튼처럼 누를 수 있는 배너로 동작한다.
export default function TunnelBanner({ title, subtitle, onClick, disabled }) {
  if (!title) return null
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} disabled={disabled} style={{
      position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
      background: '#0E5E58', borderRadius: 16, padding: subtitle ? '16px 26px' : '15px 26px',
      boxShadow: '0 10px 30px rgba(14,60,55,.35)', textAlign: 'center', minWidth: 220, maxWidth: '86%',
      cursor: onClick ? 'pointer' : 'default', pointerEvents: 'auto', opacity: disabled ? 0.7 : 1,
    }}>
      <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, lineHeight: 1.4 }}>{title}</p>
      {subtitle && <p style={{ color: '#8FD8CF', fontWeight: 700, fontSize: 13, marginTop: 4 }}>{subtitle}</p>}
    </Tag>
  )
}
