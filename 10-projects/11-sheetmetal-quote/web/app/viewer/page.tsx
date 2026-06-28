'use client'

import { useRef, useState, useEffect, useCallback, Fragment } from 'react'
import type { ViewerData, DrawEntity, DrawArc } from '@/lib/dxf-viewer'
import { recognizeBox, type RecognitionResult } from '@/lib/recognizer'
import { calcBendCost } from '@/lib/bending'

// ---------------------------------------------------------------------------
// Layer colors
// ---------------------------------------------------------------------------

const KNOWN_COLORS: Record<string, string> = {
  '외형선':      '#93c5fd',
  '굽힘선아래로': '#fca5a5',
  '굽힘선위로':  '#fdba74',
  'SW_노트':    '#94a3b8',
  'SW_모델뷰':  '#475569',
  '0':          '#64748b',
}
const PALETTE = ['#a78bfa','#34d399','#fbbf24','#f472b6','#38bdf8','#a3e635','#67e8f9','#fb7185']
const layerColor = (l: string, i: number) => KNOWN_COLORS[l] ?? PALETTE[i % PALETTE.length]

const CUT_COLOR: Record<string, string> = {
  '레이저': 'bg-green-600',
  '복합기': 'bg-blue-600',
  'NCT':    'bg-purple-600',
  '절단':   'bg-orange-500',
}

// ---------------------------------------------------------------------------
// SVG arc path
// ---------------------------------------------------------------------------

function arcPath(e: DrawArc): string {
  const { cx, cy, r, sa, ea } = e
  const R = (d: number) => d * Math.PI / 180
  let span = (ea - sa + 360) % 360
  if (span < 0.001) span = 360
  const sx = cx + r * Math.cos(R(sa)), sy = cy + r * Math.sin(R(sa))
  if (span >= 360 - 0.001) {
    const mx = cx + r * Math.cos(R(sa + 180)), my = cy + r * Math.sin(R(sa + 180))
    return `M ${sx} ${sy} A ${r} ${r} 0 1 1 ${mx} ${my} A ${r} ${r} 0 1 1 ${sx} ${sy}`
  }
  const ex = cx + r * Math.cos(R(ea)), ey = cy + r * Math.sin(R(ea))
  return `M ${sx} ${sy} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${ex} ${ey}`
}

const toPoints = (pts: number[]) =>
  Array.from({ length: pts.length >> 1 }, (_, i) => `${pts[i*2]},${pts[i*2+1]}`).join(' ')

const SN = { fill: 'none', vectorEffect: 'non-scaling-stroke' as const, strokeWidth: 1 }

function EntityEl({ e, color }: { e: DrawEntity; color: string }) {
  const s = { ...SN, stroke: color }
  switch (e.kind) {
    case 'line':     return <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} {...s} />
    case 'arc':      return <path d={arcPath(e)} {...s} />
    case 'circle':   return <circle cx={e.cx} cy={e.cy} r={e.r} {...s} />
    case 'polyline': return e.closed
      ? <polygon  points={toPoints(e.pts)} {...s} />
      : <polyline points={toPoints(e.pts)} {...s} />
    case 'spline':   return <polyline points={toPoints(e.pts)} {...s} strokeDasharray="4 2" />
    case 'insert':   return null
    case 'text':
      return (
        <text x={e.x} y={e.y}
          transform={`matrix(1,0,0,-1,0,${2 * e.y})`}
          fontSize={e.h} fill={color} stroke="none" fontFamily="sans-serif">
          {e.txt}
        </text>
      )
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'pan' | 'select'
interface SelBox { id: string; name: string; x1: number; y1: number; x2: number; y2: number; recognition?: RecognitionResult }
interface VBox   { x: number; y: number; w: number; h: number }
interface Pt     { x: number; y: number }

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ViewerPage() {
  const svgRef = useRef<SVGSVGElement>(null)

  const [data,      setData]      = useState<ViewerData | null>(null)
  const [vbox,      setVbox]      = useState<VBox>({ x: 0, y: 0, w: 1, h: 1 })
  const [visible,   setVisible]   = useState<Set<string>>(new Set())
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [panning,   setPanning]   = useState(false)
  const [mode,      setMode]      = useState<Mode>('pan')
  const [boxes,     setBoxes]     = useState<SelBox[]>([])
  const [activeBox, setActiveBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [resultTab, setResultTab] = useState<string | null>(null)

  const vboxRef     = useRef(vbox)
  const modeRef     = useRef<Mode>('pan')
  const panActive   = useRef(false)
  const lastMouse   = useRef<Pt>({ x: 0, y: 0 })
  const selectStart = useRef<Pt | null>(null)
  const kRef        = useRef(0)
  const boxCount    = useRef(0)
  const dataRef     = useRef<ViewerData | null>(null)

  vboxRef.current = vbox
  modeRef.current = mode
  if (data) { kRef.current = data.bbox.minY + data.bbox.maxY; dataRef.current = data }

  const screenToDxf = useCallback((clientX: number, clientY: number): Pt | null => {
    const el = svgRef.current
    if (!el || !dataRef.current) return null
    const ctm = el.getScreenCTM()
    if (!ctm) return null
    const pt = el.createSVGPoint()
    pt.x = clientX; pt.y = clientY
    const svgPt = pt.matrixTransform(ctm.inverse())
    return { x: svgPt.x, y: kRef.current - svgPt.y }
  }, [])

  const fitView = useCallback((bbox: ViewerData['bbox']) => {
    const pad = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.05 + 1
    setVbox({ x: bbox.minX - pad, y: bbox.minY - pad,
              w: (bbox.maxX - bbox.minX) + pad * 2, h: (bbox.maxY - bbox.minY) + pad * 2 })
  }, [])

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dxf')) { setError('.dxf 파일만 지원합니다'); return }
    setLoading(true); setError(null); setData(null); setBoxes([]); boxCount.current = 0
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/viewer', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '파싱 실패')
      const vd = json as ViewerData
      setData(vd); setVisible(new Set(vd.layers)); fitView(vd.bbox)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [fitView])

  useEffect(() => {
    const el = svgRef.current
    if (!el || !data) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const ctm = el.getScreenCTM()
      if (!ctm) return
      const pt = el.createSVGPoint()
      pt.x = e.clientX; pt.y = e.clientY
      const { x: sx, y: sy } = pt.matrixTransform(ctm.inverse())
      const k  = e.deltaY > 0 ? 1.15 : 1 / 1.15
      const v  = vboxRef.current
      const nw = v.w * k, nh = v.h * k
      const mxF = (sx - v.x) / v.w
      const myF = (sy - v.y) / v.h
      setVbox({ x: sx - mxF * nw, y: sy - myF * nh, w: nw, h: nh })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [data])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (modeRef.current === 'pan' && panActive.current) {
        const el = svgRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const dx = e.clientX - lastMouse.current.x
        const dy = e.clientY - lastMouse.current.y
        lastMouse.current = { x: e.clientX, y: e.clientY }
        setVbox(v => ({ ...v,
          x: v.x - dx * v.w / rect.width,
          y: v.y - dy * v.h / rect.height,
        }))
      } else if (modeRef.current === 'select' && selectStart.current) {
        const pos = screenToDxf(e.clientX, e.clientY)
        if (!pos) return
        setActiveBox({ x1: selectStart.current.x, y1: selectStart.current.y, x2: pos.x, y2: pos.y })
      }
    }

    const onUp = (e: MouseEvent) => {
      if (modeRef.current === 'pan') {
        panActive.current = false; setPanning(false)
      } else if (modeRef.current === 'select' && selectStart.current) {
        const start = selectStart.current
        selectStart.current = null
        setActiveBox(null)
        const pos = screenToDxf(e.clientX, e.clientY)
        if (pos) {
          const w = Math.abs(pos.x - start.x)
          const h = Math.abs(pos.y - start.y)
          const d = dataRef.current
          const minSize = d ? Math.min(d.bbox.maxX - d.bbox.minX, d.bbox.maxY - d.bbox.minY) * 0.005 : 0
          if (w > minSize && h > minSize) {
            boxCount.current++
            const name = `조립체-${String(boxCount.current).padStart(2, '0')}`
            const recognition = d ? recognizeBox(
              { x1: start.x, y1: start.y, x2: pos.x, y2: pos.y },
              d.entities,
              name,
            ) : undefined
            const newId = crypto.randomUUID()
            setBoxes(prev => [...prev, { id: newId, name, x1: start.x, y1: start.y, x2: pos.x, y2: pos.y, recognition }])
            setResultTab(newId)
          }
        }
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [screenToDxf])

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !data) return
    if (mode === 'pan') {
      panActive.current = true
      lastMouse.current = { x: e.clientX, y: e.clientY }
      setPanning(true)
    } else {
      const pos = screenToDxf(e.clientX, e.clientY)
      if (!pos) return
      selectStart.current = pos
      setActiveBox({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
    }
  }

  useEffect(() => {
    if (mode === 'pan') { selectStart.current = null; setActiveBox(null) }
  }, [mode])

  const renameBox = (id: string, name: string) =>
    setBoxes(prev => prev.map(b => b.id === id ? { ...b, name } : b))
  const deleteBox = (id: string) =>
    setBoxes(prev => prev.filter(b => b.id !== id))

  const colors: Record<string, string> = {}
  if (data) data.layers.forEach((l, i) => { colors[l] = layerColor(l, i) })

  const K = data ? data.bbox.minY + data.bbox.maxY : 0
  const labelSize = vbox.h * 0.02

  function boxRect(b: { x1: number; y1: number; x2: number; y2: number }, dashed = false, preview = false) {
    const bx = Math.min(b.x1, b.x2), by = Math.min(b.y1, b.y2)
    const bw = Math.abs(b.x2 - b.x1), bh = Math.abs(b.y2 - b.y1)
    return (
      <rect x={bx} y={by} width={bw} height={bh}
        fill={preview ? 'rgba(96,165,250,0.06)' : 'rgba(96,165,250,0.12)'}
        stroke="#60a5fa" strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeDasharray={dashed ? '8 4' : undefined}
      />
    )
  }

  const hasResults = boxes.some(b => b.recognition)

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* ── Left Sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-52 shrink-0 bg-white border-r border-[#c3c6d7] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e7eeff] shrink-0">
          <p className="text-[10px] font-bold text-[#004ac6] uppercase tracking-widest">DXF Viewer</p>
          {data
            ? <p className="text-[11px] text-[#565e74] mt-0.5">{data.entities.length.toLocaleString()}개 엔티티 · {data.layers.length}개 레이어</p>
            : <p className="text-[11px] text-[#565e74] mt-0.5">파일을 올려주세요</p>}
        </div>

        {data && (<>
          {/* Selection boxes */}
          <div className="px-3 py-2 border-b border-[#e7eeff] max-h-72 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-[#565e74] uppercase tracking-wider">선택 영역</span>
              {boxes.length > 0 && (
                <button onClick={() => { setBoxes([]); boxCount.current = 0 }}
                  className="text-[10px] text-[#737686] hover:text-red-500">모두 삭제</button>
              )}
            </div>
            {boxes.length === 0 ? (
              <p className="text-[11px] text-[#737686]">
                {mode === 'select' ? '도면 위에서 드래그하세요' : '"조립체 선택" 후 드래그'}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {boxes.map(b => (
                  <div key={b.id}>
                    <div className="flex items-center gap-1.5 group">
                      <span className="w-2 h-2 rounded-sm bg-[#004ac6] shrink-0" />
                      {editingId === b.id ? (
                        <input autoFocus value={b.name}
                          onChange={e => renameBox(b.id, e.target.value)}
                          onBlur={() => setEditingId(null)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingId(null) }}
                          className="flex-1 text-[11px] border border-[#004ac6] rounded px-1 py-0.5 min-w-0 outline-none"
                        />
                      ) : (
                        <span className="flex-1 text-[11px] font-medium text-[#111c2d] truncate cursor-pointer hover:text-[#004ac6]"
                          onDoubleClick={() => setEditingId(b.id)} title="더블클릭으로 이름 변경">
                          {b.name}
                        </span>
                      )}
                      <button onClick={() => deleteBox(b.id)}
                        className="text-[#c3c6d7] hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                    </div>
                    {b.recognition && b.recognition.parts.length > 0 ? (
                      <div className="mt-0.5 ml-3.5 flex flex-col gap-0.5">
                        {b.recognition.parts.map((p, i) => (
                          <div key={i} className="flex items-center gap-1 flex-wrap">
                            <span className={`text-white text-[9px] font-mono px-1 rounded ${CUT_COLOR[p.cutMethod] ?? 'bg-gray-500'}`}>
                              {p.cutMethod}
                            </span>
                            <span className="text-[10px] text-[#565e74]">{p.bendTotal}곡</span>
                            {p.material  && <span className="text-[10px] text-[#111c2d]">{p.material}</span>}
                            {p.thickness && <span className="text-[10px] text-[#565e74]">{p.thickness}</span>}
                          </div>
                        ))}
                        <p className="text-[9px] text-[#737686]">{b.recognition.parts.length}부품 · {b.recognition.totalBends}곡</p>
                      </div>
                    ) : b.recognition ? (
                      <p className="mt-0.5 ml-3.5 text-[9px] text-[#737686]">재단 라벨 미검출</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Layer toggles */}
          <div className="px-3 py-2 border-b border-[#e7eeff] flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-[#565e74] uppercase tracking-wider">레이어</span>
              <div className="flex gap-2">
                <button onClick={() => setVisible(new Set(data.layers))} className="text-[10px] text-[#737686] hover:text-[#111c2d]">전체</button>
                <button onClick={() => setVisible(new Set())} className="text-[10px] text-[#737686] hover:text-[#111c2d]">없음</button>
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              {data.layers.map(l => {
                const on = visible.has(l)
                return (
                  <label key={l} className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-[#f0f3ff]">
                    <input type="checkbox" checked={on} className="sr-only"
                      onChange={() => setVisible(prev => {
                        const next = new Set(prev); if (next.has(l)) next.delete(l); else next.add(l); return next
                      })} />
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                      style={{ background: colors[l], opacity: on ? 1 : 0.2 }} />
                    <span className={`text-[11px] truncate ${on ? 'text-[#111c2d]' : 'text-[#737686]'}`}>{l}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="px-3 py-2.5 flex flex-col gap-1.5 shrink-0">
            <button onClick={() => fitView(data.bbox)}
              className="w-full text-[11px] py-1.5 rounded border border-[#c3c6d7] text-[#565e74] hover:bg-[#f0f3ff] transition-colors">
              화면 맞춤
            </button>
            <button onClick={() => { setData(null); setError(null); setBoxes([]); boxCount.current = 0 }}
              className="w-full text-[11px] py-1.5 rounded border border-[#c3c6d7] text-[#737686] hover:bg-[#f0f3ff] transition-colors">
              다른 파일 열기
            </button>
          </div>
        </>)}
      </aside>

      {/* ── Center + Right ────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* CAD Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {data && (
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-white border-b border-[#c3c6d7]">
              <button onClick={() => setMode('pan')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors
                  ${mode === 'pan' ? 'bg-[#111c2d] text-white' : 'text-[#565e74] hover:bg-[#f0f3ff]'}`}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2v3M8 11v3M2 8h3M11 8h3" strokeLinecap="round"/><circle cx="8" cy="8" r="2.5"/>
                </svg>
                이동
              </button>
              <button onClick={() => setMode('select')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors
                  ${mode === 'select' ? 'bg-[#004ac6] text-white' : 'text-[#565e74] hover:bg-[#f0f3ff]'}`}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5">
                  <rect x="2" y="2" width="12" height="12" rx="1"/>
                </svg>
                조립체 선택
              </button>
              {mode === 'select' && (
                <span className="text-[11px] text-[#737686] ml-1">드래그로 영역 지정 · 이름은 더블클릭으로 변경</span>
              )}
            </div>
          )}
          <div className="flex-1 relative overflow-hidden">
            {!data ? (
              <DropZone loading={loading} error={error} onFile={handleFile} />
            ) : (
              <svg ref={svgRef} width="100%" height="100%"
                viewBox={`${vbox.x} ${vbox.y} ${vbox.w} ${vbox.h}`}
                onMouseDown={onMouseDown}
                style={{ display: 'block', background: '#0f172a',
                  cursor: mode === 'select' ? 'crosshair' : panning ? 'grabbing' : 'grab' }}>
                <g transform={`matrix(1,0,0,-1,0,${K})`}>
                  {data.entities.filter(e => visible.has(e.layer)).map((e, i) =>
                    <EntityEl key={i} e={e} color={colors[e.layer] ?? '#374151'} />)}
                  {boxes.map(b => <Fragment key={b.id}>{boxRect(b)}</Fragment>)}
                  {activeBox && boxRect(activeBox, true, true)}
                </g>
                {boxes.map(b => {
                  const topY = K - Math.max(b.y1, b.y2)
                  const leftX = Math.min(b.x1, b.x2)
                  return (
                    <text key={`lbl-${b.id}`} x={leftX + labelSize * 0.3} y={topY + labelSize * 1.1}
                      fontSize={labelSize} fill="#93c5fd" fontWeight="bold" fontFamily="sans-serif"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>{b.name}</text>
                  )
                })}
              </svg>
            )}
          </div>
        </div>

        {/* ── Right: Estimation Panel ───────────────────────────────────── */}
        <aside className="w-[360px] shrink-0 bg-[#f9f9ff] border-l border-[#c3c6d7] flex flex-col overflow-hidden">
          {!data ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
              <div className="w-10 h-10 rounded-lg bg-[#e7eeff] flex items-center justify-center mb-1">
                <svg className="w-5 h-5 text-[#004ac6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-[11px] font-bold text-[#111c2d] uppercase tracking-wider">견적 패널</p>
              <p className="text-[11px] text-[#737686]">DXF 파일을 올리면<br/>견적 정보가 표시됩니다</p>
            </div>
          ) : !hasResults ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
              <div className="w-10 h-10 rounded-lg bg-[#e7eeff] flex items-center justify-center mb-1">
                <svg className="w-5 h-5 text-[#004ac6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v13.75c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </div>
              <p className="text-[11px] font-bold text-[#111c2d] uppercase tracking-wider">조립체 선택</p>
              <p className="text-[11px] text-[#737686]">조립체 선택 모드에서<br/>도면 위를 드래그하세요</p>
            </div>
          ) : (
            <ResultsPanel boxes={boxes} resultTab={resultTab} onTabChange={setResultTab} />
          )}
        </aside>

      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results Panel
// ---------------------------------------------------------------------------

type ManualCutMethod = '레이저' | '복합기' | 'NCT' | '절단' | ''

function ResultsPanel({ boxes, resultTab, onTabChange }: {
  boxes: Array<{ id: string; name: string; recognition?: import('@/lib/recognizer').RecognitionResult }>
  resultTab: string | null
  onTabChange: (id: string) => void
}) {
  const [manualCut,      setManualCut]      = useState<Record<string, ManualCutMethod>>({})
  const [quoteInputs,    setQuoteInputs]    = useState<Record<string, {
    weightKg: string; matUnit: string; cutUnit: string; holeCount: string; pierceUnit: string
  }>>({})
  const [fetchedPricing, setFetchedPricing] = useState<import('@/lib/estimate').PricingData | null>(null)

  useEffect(() => {
    fetch('/api/pricing')
      .then(r => r.json())
      .then(data => { setFetchedPricing(data) })
      .catch(() => {})
  }, [])

  // 탭이 처음 열릴 때만 자동 채우기
  useEffect(() => {
    if (!fetchedPricing || !resultTab) return
    const box = boxes.find(b => b.id === resultTab)
    const r = box?.recognition
    if (!r) return
    const id = box!.id

    setQuoteInputs(prev => {
      if (prev[id] !== undefined) return prev
      const firstWithMat = r.parts.find(p => p?.material)
      const mat  = firstWithMat?.material  ?? ''
      const rawT = (firstWithMat?.thickness ?? '').replace(/t$/, '')
      const tKey = rawT && !rawT.includes('.') ? rawT + '.0' : rawT
      const matUnit    = mat  ? String(fetchedPricing.material_price[mat]   ?? '') : ''
      const cutUnit    = tKey ? String(fetchedPricing.cut_price_per_m[tKey] ?? '') : ''
      const pierceUnit = tKey ? String(fetchedPricing.pierce_price[tKey]    ?? '') : ''
      return { ...prev, [id]: { weightKg: '', matUnit, cutUnit, holeCount: '', pierceUnit } }
    })
  }, [fetchedPricing, resultTab, boxes])

  const boxesWithResult = boxes.filter(b => b.recognition)
  const current = boxesWithResult.find(b => b.id === resultTab) ?? boxesWithResult[0]
  const r = current?.recognition

  const isSinglePart  = r && r.parts.length === 1 && r.parts[0].cutMethod === ''
  const totalBendCost = r ? r.parts.reduce((s, p) => s + calcBendCost(p.bendLengths), 0) : 0
  const totalCutM     = r ? Math.round(r.parts.reduce((s, p) => s + p.cutLengthM, 0) * 100) / 100 : 0
  const autoMaterial  = r ? (r.parts[0]?.material ?? '') : ''

  const currentId = current?.id ?? ''
  const qin = quoteInputs[currentId] ?? { weightKg: '', matUnit: '', cutUnit: '', holeCount: '', pierceUnit: '' }
  const updateQin = (patch: Partial<typeof qin>) =>
    setQuoteInputs(prev => ({ ...prev, [currentId]: { ...qin, ...patch } }))

  const 재료비 = Math.round((parseFloat(qin.weightKg) || 0) * (parseFloat(qin.matUnit) || 0))
  const 절단비 = Math.round(
    totalCutM * (parseFloat(qin.cutUnit) || 0) +
    (parseInt(qin.holeCount) || 0) * (parseFloat(qin.pierceUnit) || 0)
  )
  const 합계 = 재료비 + 절단비 + Math.round(totalBendCost)

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ userSelect: 'none' }}>

      {/* Sticky Total Card */}
      <div className="shrink-0 bg-white border-b-2 border-[#004ac6] px-4 py-3">
        <p className="text-[10px] font-bold text-[#565e74] uppercase tracking-widest mb-1">총 예상 비용</p>
        <p className="text-2xl font-bold text-[#111c2d] tabular-nums">
          {합계 > 0 ? `₩${합계.toLocaleString()}` : '—'}
        </p>
        {합계 > 0 && (
          <div className="flex gap-2 mt-1 text-[10px] text-[#565e74] tabular-nums">
            <span>재료 ₩{재료비.toLocaleString()}</span>
            <span className="text-[#c3c6d7]">+</span>
            <span>절단 ₩{절단비.toLocaleString()}</span>
            <span className="text-[#c3c6d7]">+</span>
            <span className="text-[#006242]">절곡 ₩{Math.round(totalBendCost).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex border-b border-[#c3c6d7] bg-[#f0f3ff] overflow-x-auto">
        {boxesWithResult.map(b => (
          <button key={b.id} onClick={() => onTabChange(b.id)}
            className={`px-3 py-2 text-[11px] whitespace-nowrap border-r border-[#c3c6d7] transition-colors
              ${b.id === current?.id
                ? 'bg-white text-[#004ac6] font-bold border-b-2 border-b-[#004ac6] -mb-px'
                : 'text-[#565e74] hover:bg-[#e7eeff]'}`}>
            {b.name}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      {r && current ? (
        <div className="flex-1 overflow-y-auto">

          {/* 요약 카드 3종 */}
          <div className="flex gap-2 p-3 border-b border-[#e7eeff]">
            <div className="flex-1 rounded p-2 bg-white border border-[#c3c6d7]">
              <p className="text-[9px] font-bold text-[#006242] uppercase tracking-wider">절곡비</p>
              <p className="text-sm font-bold text-[#006242] mt-0.5 tabular-nums">
                {totalBendCost > 0 ? `₩${Math.round(totalBendCost).toLocaleString()}` : '—'}
              </p>
            </div>
            <div className="flex-1 rounded p-2 bg-white border border-[#c3c6d7]">
              <p className="text-[9px] font-bold text-[#004ac6] uppercase tracking-wider">총 절곡</p>
              <p className="text-sm font-bold text-[#004ac6] mt-0.5">{r.totalBends}곡</p>
            </div>
            <div className="flex-1 rounded p-2 bg-white border border-[#c3c6d7]">
              <p className="text-[9px] font-bold text-[#565e74] uppercase tracking-wider">재단길이</p>
              <p className="text-sm font-bold text-[#111c2d] mt-0.5 tabular-nums">
                {totalCutM > 0 ? `${totalCutM}m` : '—'}
              </p>
            </div>
          </div>

          {/* 견적 입력 */}
          <div className="p-3 border-b border-[#e7eeff] bg-white">
            <p className="text-[10px] font-bold text-[#565e74] uppercase tracking-widest mb-2">견적 입력</p>
            <div className="flex gap-3 mb-2.5 text-[10px]">
              <span className="text-[#565e74]">재질 <span className="font-bold text-[#111c2d]">{autoMaterial || '—'}</span></span>
              <span className="text-[#565e74]">재단 <span className="font-bold text-[#111c2d]">{totalCutM > 0 ? totalCutM + 'm' : '—'}</span></span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['중량',       'weightKg',   '0.01', 'kg'],
                ['재료단가',   'matUnit',    '1',    '원/kg'],
                ['절단단가',   'cutUnit',    '1',    '원/m'],
                ['구멍수',     'holeCount',  '1',    '개'],
                ['피어싱단가', 'pierceUnit', '1',    '원/개'],
              ] as [string, keyof typeof qin, string, string][]).map(([label, key, step, unit]) => (
                <label key={key} className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-[#565e74] uppercase tracking-wider">{label}</span>
                  <div className="relative">
                    <input type="number" min="0" step={step} placeholder="0"
                      value={qin[key]}
                      onChange={e => updateQin({ [key]: e.target.value } as Partial<typeof qin>)}
                      className="w-full border border-[#c3c6d7] rounded px-2 py-1 pr-9 text-[11px] bg-[#f9f9ff] text-[#111c2d] text-right tabular-nums focus:ring-1 focus:ring-[#004ac6] focus:border-[#004ac6] outline-none"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[#737686] pointer-events-none">{unit}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 부품 상세 */}
          <div className="p-3">
            {isSinglePart && (
              <div className="mb-2 flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-700 text-[11px]">
                <span>단품 도면 — 재단방식:</span>
                <select value={manualCut[current.id] ?? ''}
                  onChange={e => setManualCut(prev => ({ ...prev, [current.id]: e.target.value as ManualCutMethod }))}
                  className="border border-amber-300 rounded px-1.5 py-0.5 text-[11px] bg-white text-[#111c2d] outline-none">
                  <option value="">— 선택 —</option>
                  {['레이저', '복합기', 'NCT', '절단'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}

            {r.parts.length > 0 ? (
              <div className="overflow-x-auto mb-3">
                <table className="w-full border-collapse" style={{ fontSize: 10 }}>
                  <thead>
                    <tr className="bg-[#f0f3ff]">
                      {['#','재단','↓','↑','곡','절곡비','재단m','재질','두께','수량'].map(h => (
                        <th key={h} className="border border-[#c3c6d7] px-1.5 py-1 text-[9px] font-bold text-[#565e74] uppercase tracking-wider text-center whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.parts.map((p, i) => {
                      const displayMethod = (p.cutMethod === '' && isSinglePart) ? (manualCut[current.id] ?? '') : p.cutMethod
                      const bendCost = calcBendCost(p.bendLengths)
                      return (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f9f9ff]'}>
                          <td className="border border-[#c3c6d7] px-1.5 py-1 text-center text-[#737686]">{i + 1}</td>
                          <td className="border border-[#c3c6d7] px-1.5 py-1 text-center">
                            {displayMethod
                              ? <span className={`px-1 py-0.5 rounded text-white text-[9px] font-mono ${CUT_COLOR[displayMethod] ?? 'bg-gray-400'}`}>{displayMethod}</span>
                              : <span className="text-amber-500 text-[9px]">미지정</span>}
                          </td>
                          <td className="border border-[#c3c6d7] px-1.5 py-1 text-center text-red-500">{p.bendDown || '—'}</td>
                          <td className="border border-[#c3c6d7] px-1.5 py-1 text-center text-orange-500">{p.bendUp || '—'}</td>
                          <td className="border border-[#c3c6d7] px-1.5 py-1 text-center font-bold">{p.bendTotal || '—'}</td>
                          <td className="border border-[#c3c6d7] px-1.5 py-1 text-center text-[#006242] tabular-nums">
                            {bendCost > 0 ? `₩${bendCost.toLocaleString()}` : '—'}
                          </td>
                          <td className="border border-[#c3c6d7] px-1.5 py-1 text-center text-[#004ac6] tabular-nums">
                            {p.cutLengthM > 0 ? `${p.cutLengthM}m` : '—'}
                          </td>
                          <td className="border border-[#c3c6d7] px-1.5 py-1 text-center">{p.material  || '—'}</td>
                          <td className="border border-[#c3c6d7] px-1.5 py-1 text-center">{p.thickness || '—'}</td>
                          <td className="border border-[#c3c6d7] px-1.5 py-1 text-center">{p.qty       || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#f0f3ff] font-bold">
                      <td colSpan={4} className="border border-[#c3c6d7] px-1.5 py-1 text-right text-[9px] text-[#565e74] uppercase tracking-wider">합계</td>
                      <td className="border border-[#c3c6d7] px-1.5 py-1 text-center text-[#111c2d]">{r.totalBends}곡</td>
                      <td className="border border-[#c3c6d7] px-1.5 py-1 text-center text-[#006242] tabular-nums">
                        {totalBendCost > 0 ? `₩${Math.round(totalBendCost).toLocaleString()}` : '—'}
                      </td>
                      <td colSpan={4} className="border border-[#c3c6d7] px-1.5 py-1 text-[9px] text-[#737686]">
                        {r.unassignedBends > 0 && `미배정 ${r.unassignedBends}곡`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-[11px] text-[#737686] mb-3">재단 라벨 미검출 — 박스 안에 레이저/복합기/NCT/절단 레이어가 없습니다.</p>
            )}

            {/* 특수가공 */}
            <div className="mb-3">
              <span className="text-[10px] font-bold text-[#565e74] uppercase tracking-wider">특수가공</span>
              {Object.keys(r.specialFeatures).length > 0 ? (
                <span className="ml-2 text-[11px] text-[#111c2d]">
                  {Object.entries(r.specialFeatures).map(([k, v]) => `${k} ${v}개`).join(' · ')}
                </span>
              ) : (
                <span className="ml-2 text-[11px] text-[#737686]">없음</span>
              )}
            </div>

            {/* 파이프 절단 */}
            {r.pipes.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-[#565e74] uppercase tracking-wider mb-1">파이프 절단</p>
                <table className="w-full border-collapse" style={{ fontSize: 10 }}>
                  <thead>
                    <tr className="bg-[#f0f3ff]">
                      {['품번','규격','재질','수량','길이','각도'].map(h => (
                        <th key={h} className="border border-[#c3c6d7] px-1.5 py-0.5 text-[9px] font-bold text-[#565e74] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.pipes.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f9f9ff]'}>
                        {[row.no, row.spec, row.material, row.qty, row.length, row.angle].map((v, j) => (
                          <td key={j} className="border border-[#c3c6d7] px-1.5 py-0.5">{v || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[11px] text-[#737686]">
          탭을 선택하세요
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drop zone
// ---------------------------------------------------------------------------

function DropZone({ loading, error, onFile }: {
  loading: boolean; error: string | null; onFile: (f: File) => void
}) {
  const [over, setOver] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="h-full flex items-center justify-center bg-[#0f172a]">
      <div
        className={`border-2 border-dashed rounded-xl px-16 py-12 text-center cursor-pointer transition-colors
          ${over ? 'border-[#004ac6] bg-[#004ac6]/10' : 'border-[#2d3f5c] hover:border-[#004ac6]/50'}`}
        onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      >
        <input ref={ref} type="file" accept=".dxf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
        {loading
          ? <p className="text-[#93c5fd] text-sm">파싱 중...</p>
          : <>
              <p className="text-white font-semibold text-sm">DXF 파일을 드래그하거나 클릭</p>
              <p className="text-[#93c5fd] text-xs mt-1">SolidWorks 전개도 DXF (CP949)</p>
              <p className="text-[#4a6080] text-[10px] mt-3">휠: 줌 · 드래그: 이동 · 조립체 선택 모드: 영역 지정</p>
            </>}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  )
}
