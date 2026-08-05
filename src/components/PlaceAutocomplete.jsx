import { useEffect, useRef, useState } from 'react'
import { loadKakaoMaps, keywordSearch } from '../lib/kakaoMap.js'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY

// 카카오맵 Places 키워드 검색으로 실제 장소를 추천해주는 출발지/목적지 입력창.
// 비어있는 채로 포커스하면 최근 검색을 드롭다운으로 보여준다 (네이버 지도 검색창 방식).
// 키가 없으면 그냥 평범한 텍스트 입력창으로 동작한다.
export default function PlaceAutocomplete({ value, onChange, onEnter, placeholder, dotColor, recent }) {
  const [results, setResults] = useState([])
  const [showRecent, setShowRecent] = useState(false)
  const [open, setOpen] = useState(false)
  const kakaoRef = useRef(null)
  const debounceRef = useRef(null)
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!KAKAO_KEY) return
    let cancelled = false
    loadKakaoMaps(KAKAO_KEY).then(kakao => { if (!cancelled) kakaoRef.current = kakao }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handleChange = v => {
    onChange(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (v.trim() === '') {
      setResults([])
      setShowRecent(true)
      setOpen(!!recent?.length)
      return
    }
    setShowRecent(false)
    if (!kakaoRef.current || v.trim().length < 2) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      const data = await keywordSearch(kakaoRef.current, v.trim())
      setResults(data.slice(0, 6))
      // 검색이 늦게 끝나서 응답이 왔을 때 사용자가 이미 다른 입력창으로 넘어갔다면
      // (포커스가 떠난 상태) 드롭다운을 다시 띄우지 않는다 — 다음 필드를 가리는 문제 방지.
      if (focusedRef.current) setOpen(data.length > 0)
    }, 280)
  }

  const pick = place => {
    onChange(place.place_name)
    setOpen(false)
  }

  const pickRecent = text => {
    onChange(text)
    setShowRecent(false)
    setOpen(false)
  }

  const handleFocus = () => {
    focusedRef.current = true
    if (value.trim() === '' && recent?.length) { setShowRecent(true); setOpen(true) }
    else if (results.length > 0) setOpen(true)
  }

  const handleBlur = () => {
    focusedRef.current = false
    setTimeout(() => setOpen(false), 150)
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <input
          value={value}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setOpen(false); onEnter?.() } }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13.5, fontWeight: 600, color: 'var(--text-head, #16242E)' }}
        />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: -20, right: -13, zIndex: 30, background: '#fff', border: '1px solid #E4EAEF', borderRadius: 10, marginTop: 8, boxShadow: '0 8px 24px rgba(20,40,60,.14)', overflow: 'hidden' }}>
          {showRecent ? (
            <>
              <div style={{ padding: '9px 14px 4px', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: '#8A98A2', letterSpacing: '0.05em' }}>최근 검색</div>
              {recent.map(r => (
                <div key={r} onMouseDown={() => pickRecent(r)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', cursor: 'pointer', borderTop: '1px solid #F0F3F5' }}>
                  <span style={{ fontSize: 13 }}>🕓</span>
                  <span style={{ fontSize: 12.5, color: '#5B6C78' }}>{r}</span>
                </div>
              ))}
            </>
          ) : (
            results.map(r => (
              <div key={r.id} onMouseDown={() => pick(r)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F0F3F5' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#16242E' }}>{r.place_name}</div>
                <div style={{ fontSize: 11, color: '#8A98A2', marginTop: 2 }}>{r.road_address_name || r.address_name}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
