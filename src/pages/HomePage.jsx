import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MockStreetMap from '../components/MockStreetMap.jsx'
import PlaceAutocomplete from '../components/PlaceAutocomplete.jsx'
import { loadKakaoMaps, coordToAddress } from '../lib/kakaoMap.js'
import { COURSES, GRADE } from '../data/mock.js'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY
const RECENT = ['속초 해수욕장', '양양 낙산사', '강릉 경포해변']

export default function HomePage() {
  const nav = useNavigate()
  const [dest, setDest] = useState('')
  const [panelOpen, setPanelOpen] = useState(true)
  const [myLocation, setMyLocation] = useState('')

  useEffect(() => {
    if (!KAKAO_KEY || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const kakao = await loadKakaoMaps(KAKAO_KEY)
        const addr = await coordToAddress(kakao, pos.coords.latitude, pos.coords.longitude)
        if (addr) setMyLocation(addr)
      } catch { /* 위치 표시는 실패해도 무시하고 '내 위치'로 폴백 */ }
    }, () => {}, { timeout: 6000 })
  }, [])

  const search = () => {
    if (!dest.trim()) return
    nav('/route', { state: { origin: myLocation || '내 위치', dest } })
  }

  return (
    <div style={{ height: '100%' }}>
      <MockStreetMap myLocation>
        {/* 좌상단 플로팅 패널: 목적지 입력 + (열림 시) 안심 코스 목록 */}
        <div style={{ position: 'absolute', top: 16, left: 16, width: 340, maxWidth: 'calc(100vw - 32px)', background: '#fff', borderRadius: 18, boxShadow: '0 12px 30px rgba(20,40,60,.16)', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '15px 16px' }}>
            <PlaceAutocomplete value={dest} onChange={setDest} onEnter={search} dotColor="#D45B4E" placeholder="목적지를 입력하세요" recent={RECENT} />
            <button onClick={() => setPanelOpen(v => !v)} aria-label={panelOpen ? '패널 접기' : '패널 펼치기'}
              style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, background: 'var(--bg-subtle, #F6F8FA)', color: '#8A98A2', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              {panelOpen ? '▲' : '▼'}
            </button>
          </div>

          {panelOpen && (
            <div style={{ borderTop: '1px solid var(--border-light)', padding: '14px 16px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
                <h2 style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-head)' }}>강원 안심 코스</h2>
                <button onClick={() => nav('/courses')} style={{ fontSize: 11.5, color: 'var(--primary)', fontWeight: 700, cursor: 'pointer' }}>전체 보기 →</button>
              </div>
              {COURSES.slice(0, 4).map(c => {
                const m = GRADE[c.grade]
                return (
                  <button key={c.id} onClick={() => nav(`/courses/${c.id}`)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'var(--bg-subtle)', border: '1px solid var(--border-light)', borderRadius: 'var(--r-lg)', padding: '11px 13px', marginBottom: 8, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3 }}>{c.region}</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-head)' }}>{c.title}</p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: m.bg, border: `1px solid ${m.border}`, color: m.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{m.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </MockStreetMap>
    </div>
  )
}
