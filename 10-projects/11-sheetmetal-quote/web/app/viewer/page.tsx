'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import type { ViewerData, DrawEntity, DrawArc } from '@/lib/dxf-viewer'
import { recognizeBox, type RecognitionResult } from '@/lib/recognizer'
import { calcBendCost } from '@/lib/bending'

// ---------------------------------------------------------------------------
// Layer colors
// ---------------------------------------------------------------------------

const KNOWN_COLORS: Record<string, string> = {
  '외형선':      '#1D4ED8',
  '굽힘선아래로': '#DC2626',
  '굽힘선위로':  '#EA580C',
  'SW_노트':    '#6B7280',
  'SW_모델뷰':  '#9CA3AF',
  '0':          '#374151',
}
const PALETTE = ['#7C3AED','#059669','#D97706','#DB2777','#0891B2','#65A30D','#0369A1','#BE185D']
const layerColor = (l: string, i: number) => KNOWN_COLORS[l] ?? PALETTE[i % PALETTE.length]

const CUT_COLOR: Record<string, string> = {
  '레이저': 'bg-green-600',
  '복합기': 'bg-blue-600',
  'NCT':    'bg-purple-600',
  '절단':   'bg-orange-500',
}

// ---------------------------------------------------------------------------
// SVG arc path (DXF CCW in Y-up, inside Y-flip group → sweep=1)
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
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [showResults,  setShowResults]  = useState(false)
  const [resultTab,    setResultTab]    = useState<string | null>(null)

  // Refs to avoid stale closures in useEffect handlers
  const vboxRef       = useRef(vbox)
  const modeRef       = useRef<Mode>('pan')
  const panActive     = useRef(false)
  const lastMouse     = useRef<Pt>({ x: 0, y: 0 })
  const selectStart   = useRef<Pt | null>(null)
  const kRef          = useRef(0)            // K = bbox.minY + bbox.maxY (Y-flip constant)
  const boxCount      = useRef(0)
  const dataRef       = useRef<ViewerData | null>(null)

  vboxRef.current = vbox
  modeRef.current = mode
  if (data) { kRef.current = data.bbox.minY + data.bbox.maxY; dataRef.current = data }

  // ── Screen pixel → DXF coordinate ────────────────────────────────────────
  const screenToDxf = useCallback((clientX: number, clientY: number): Pt | null => {
    const el = svgRef.current
    if (!el || !dataRef.current) return null
    const rect = el.getBoundingClientRect()
    const svgX = vboxRef.current.x + (clientX - rect.left) / rect.width  * vboxRef.current.w
    const svgY = vboxRef.current.y + (clientY - rect.top)  / rect.height * vboxRef.current.h
    return { x: svgX, y: kRef.current - svgY }
  }, [])

  // ── Fit view ──────────────────────────────────────────────────────────────
  const fitView = useCallback((bbox: ViewerData['bbox']) => {
    const pad = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.05 + 1
    setVbox({ x: bbox.minX - pad, y: bbox.minY - pad,
              w: (bbox.maxX - bbox.minX) + pad * 2, h: (bbox.maxY - bbox.minY) + pad * 2 })
  }, [])

  // ── File upload ───────────────────────────────────────────────────────────
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

  // ── Wheel: zoom centered on cursor ────────────────────────────────────────
  useEffect(() => {
    const el = svgRef.current
    if (!el || !data) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mxF = (e.clientX - rect.left) / rect.width
      const myF = (e.clientY - rect.top)  / rect.height
      const v   = vboxRef.current
      const sx  = v.x + mxF * v.w, sy = v.y + myF * v.h
      const k   = e.deltaY > 0 ? 1.15 : 1 / 1.15
      const nw  = v.w * k, nh = v.h * k
      setVbox({ x: sx - mxF * nw, y: sy - myF * nh, w: nw, h: nh })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [data])

  // ── Mouse move / up (window-level) ───────────────────────────────────────
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
        // Capture start position into a local variable BEFORE clearing the ref.
        // The setBoxes updater runs later (during React commit), so if we kept
        // reading selectStart.current inside the updater closure it would already
        // be null by then — causing "Cannot read properties of null (reading 'x')".
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
            // 박스 좌표 확정 즉시 동기 인식 (DXF 엔티티는 이미 메모리에 있음)
            const recognition = d ? recognizeBox(
              { x1: start.x, y1: start.y, x2: pos.x, y2: pos.y },
              d.entities,
            ) : undefined
            const newId = crypto.randomUUID()
            setBoxes(prev => [...prev, {
              id: newId, name,
              x1: start.x, y1: start.y,
              x2: pos.x, y2: pos.y,
              recognition,
            }])
            setResultTab(newId)
            setShowResults(true)
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

  // ── SVG mouse down ────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !data) return
    if (mode === 'pan') {
      panActive.current  = true
      lastMouse.current  = { x: e.clientX, y: e.clientY }
      setPanning(true)
    } else {
      const pos = screenToDxf(e.clientX, e.clientY)
      if (!pos) return
      selectStart.current = pos
      setActiveBox({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
    }
  }

  // ── Cancel in-progress selection when switching modes ────────────────────
  useEffect(() => {
    if (mode === 'pan') { selectStart.current = null; setActiveBox(null) }
  }, [mode])

  // ── Box rename / delete helpers ───────────────────────────────────────────
  const renameBox = (id: string, name: string) =>
    setBoxes(prev => prev.map(b => b.id === id ? { ...b, name } : b))
  const deleteBox = (id: string) =>
    setBoxes(prev => prev.filter(b => b.id !== id))

  // ── Layer color map ───────────────────────────────────────────────────────
  const colors: Record<string, string> = {}
  if (data) data.layers.forEach((l, i) => { colors[l] = layerColor(l, i) })

  const K = data ? data.bbox.minY + data.bbox.maxY : 0

  // Label font size: 2% of current view height (stays readable at any zoom)
  const labelSize = vbox.h * 0.02

  // ── Box SVG helpers ───────────────────────────────────────────────────────
  function boxRect(b: { x1: number; y1: number; x2: number; y2: number }, dashed = false, preview = false) {
    const bx = Math.min(b.x1, b.x2), by = Math.min(b.y1, b.y2)
    const bw = Math.abs(b.x2 - b.x1), bh = Math.abs(b.y2 - b.y1)
    return (
      <rect
        x={bx} y={by} width={bw} height={bh}
        fill={preview ? 'rgba(59,130,246,0.04)' : 'rgba(59,130,246,0.08)'}
        stroke="#3B82F6" strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeDasharray={dashed ? '8 4' : undefined}
      />
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">

        {/* File info */}
        <div className="p-3 border-b border-gray-100 shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">DXF 뷰어</p>
          {data
            ? <p className="text-xs text-gray-500 mt-0.5">{data.entities.length.toLocaleString()}개 엔티티 · {data.layers.length}개 레이어</p>
            : <p className="text-xs text-gray-400 mt-0.5">파일을 올려주세요</p>}
        </div>

        {data && (<>
          {/* Selection boxes list */}
          <div className="p-3 border-b border-gray-100 max-h-80 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600">선택 영역</span>
              {boxes.length > 0 && (
                <button onClick={() => { setBoxes([]); boxCount.current = 0 }}
                  className="text-xs text-gray-400 hover:text-red-500">모두 삭제</button>
              )}
            </div>

            {boxes.length === 0 ? (
              <p className="text-xs text-gray-400">
                {mode === 'select' ? '도면 위에서 드래그하세요' : '"조립체 선택" 모드로 전환 후 드래그'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {boxes.map(b => (
                  <div key={b.id}>
                    {/* 박스 이름 행 */}
                    <div className="flex items-center gap-1.5 group">
                      <span className="w-2 h-2 rounded-sm bg-blue-500 shrink-0" />
                      {editingId === b.id ? (
                        <input
                          autoFocus
                          value={b.name}
                          onChange={e => renameBox(b.id, e.target.value)}
                          onBlur={() => setEditingId(null)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingId(null) }}
                          className="flex-1 text-xs border border-blue-300 rounded px-1 py-0.5 min-w-0"
                        />
                      ) : (
                        <span
                          className="flex-1 text-xs font-medium text-gray-800 truncate cursor-pointer hover:text-blue-600"
                          onDoubleClick={() => setEditingId(b.id)}
                          title="더블클릭으로 이름 변경"
                        >{b.name}</span>
                      )}
                      <button
                        onClick={() => deleteBox(b.id)}
                        className="text-gray-300 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >✕</button>
                    </div>

                    {/* 인식 결과 */}
                    {b.recognition && b.recognition.parts.length > 0 ? (
                      <div className="mt-1 ml-3.5 flex flex-col gap-0.5">
                        {b.recognition.parts.map((p, i) => (
                          <div key={i} className="flex items-center gap-1 flex-wrap">
                            <span className={`text-white text-[10px] font-mono px-1 rounded ${CUT_COLOR[p.cutMethod] ?? 'bg-gray-500'}`}>
                              {p.cutMethod}
                            </span>
                            <span className="text-[11px] text-gray-500">{p.bendTotal}곡</span>
                            {p.material  && <span className="text-[11px] text-gray-700">{p.material}</span>}
                            {p.thickness && <span className="text-[11px] text-gray-500">{p.thickness}</span>}
                            {p.qty       && <span className="text-[11px] text-gray-400">{p.qty}</span>}
                            {p.cutLengthM > 0 && (
                              <span className="text-[11px] text-blue-400">{p.cutLengthM}m</span>
                            )}
                          </div>
                        ))}
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {b.recognition.parts.length}부품 · 총 {b.recognition.totalBends}곡
                          {b.recognition.unassignedBends > 0 && ` (미배정 ${b.recognition.unassignedBends}곡)`}
                        </div>
                      </div>
                    ) : b.recognition ? (
                      <p className="mt-0.5 ml-3.5 text-[10px] text-gray-400">재단 라벨 미검출</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Layer toggles */}
          <div className="p-3 border-b border-gray-100 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500">레이어</span>
              <div className="flex gap-2">
                <button onClick={() => setVisible(new Set(data.layers))} className="text-xs text-gray-400 hover:text-gray-700">전체</button>
                <button onClick={() => setVisible(new Set())} className="text-xs text-gray-400 hover:text-gray-700">없음</button>
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              {data.layers.map(l => {
                const on = visible.has(l)
                return (
                  <label key={l} className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-gray-50">
                    <input type="checkbox" checked={on} className="sr-only"
                      onChange={() => setVisible(prev => {
                        const next = new Set(prev)
                        if (next.has(l)) next.delete(l); else next.add(l)
                        return next
                      })} />
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                      style={{ background: colors[l], opacity: on ? 1 : 0.2 }} />
                    <span className={`text-xs truncate ${on ? 'text-gray-800' : 'text-gray-400'}`}>{l}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="p-3 flex flex-col gap-1.5 shrink-0">
            <button onClick={() => fitView(data.bbox)}
              className="w-full text-xs py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">
              화면 맞춤
            </button>
            <button onClick={() => { setData(null); setError(null); setBoxes([]); boxCount.current = 0 }}
              className="w-full text-xs py-1.5 rounded border border-gray-200 text-gray-400 hover:bg-gray-50">
              다른 파일 열기
            </button>
          </div>
        </>)}
      </aside>

      {/* ── Right area: toolbar + SVG ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        {data && (
          <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-white border-b border-gray-200">
            <button
              onClick={() => setMode('pan')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors
                ${mode === 'pan' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 2v3M8 11v3M2 8h3M11 8h3" strokeLinecap="round"/>
                <circle cx="8" cy="8" r="2.5"/>
              </svg>
              이동
            </button>
            <button
              onClick={() => setMode('select')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors
                ${mode === 'select' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5">
                <rect x="2" y="2" width="12" height="12" rx="1"/>
              </svg>
              조립체 선택
            </button>
            {mode === 'select' && (
              <span className="text-xs text-gray-400 ml-1">드래그로 조립체 영역 지정 · 이름은 더블클릭으로 변경</span>
            )}
            {boxes.some(b => b.recognition) && (
              <button
                onClick={() => setShowResults(v => !v)}
                className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors
                  ${showResults ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100 border border-gray-200'}`}
              >
                인식 결과 {showResults ? '닫기' : `보기 (${boxes.filter(b => b.recognition).length})`}
              </button>
            )}
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden">
          {!data ? (
            <DropZone loading={loading} error={error} onFile={handleFile} />
          ) : (
            <svg
              ref={svgRef}
              width="100%" height="100%"
              viewBox={`${vbox.x} ${vbox.y} ${vbox.w} ${vbox.h}`}
              onMouseDown={onMouseDown}
              style={{
                display: 'block',
                background: '#ffffff',
                cursor: mode === 'select' ? 'crosshair' : panning ? 'grabbing' : 'grab',
              }}
            >
              {/* Y-flip group: DXF Y-up → SVG Y-down */}
              <g transform={`matrix(1,0,0,-1,0,${K})`}>

                {/* DXF entities */}
                {data.entities
                  .filter(e => visible.has(e.layer))
                  .map((e, i) => <EntityEl key={i} e={e} color={colors[e.layer] ?? '#374151'} />)}

                {/* Saved selection boxes (rect only, labels rendered outside) */}
                {boxes.map(b => boxRect(b))}

                {/* Active (in-progress) box */}
                {activeBox && boxRect(activeBox, true, true)}

              </g>

              {/* Box labels — outside Y-flip group, in SVG coordinate space.
                  DXF (x, y) → SVG (x, K-y).
                  Label is placed just inside the top-left corner of the box on screen. */}
              {boxes.map(b => {
                const topY = K - Math.max(b.y1, b.y2)   // SVG Y of top edge
                const leftX = Math.min(b.x1, b.x2)
                return (
                  <text key={`lbl-${b.id}`}
                    x={leftX + labelSize * 0.3}
                    y={topY + labelSize * 1.1}
                    fontSize={labelSize}
                    fill="#1D4ED8"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{b.name}</text>
                )
              })}
            </svg>
          )}
        </div>
        {/* Results Panel */}
        {showResults && boxes.some(b => b.recognition) && (
          <ResultsPanel
            boxes={boxes}
            resultTab={resultTab}
            onTabChange={setResultTab}
            onClose={() => setShowResults(false)}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results Panel
// ---------------------------------------------------------------------------

type ManualCutMethod = '레이저' | '복합기' | 'NCT' | '절단' | ''

function ResultsPanel({ boxes, resultTab, onTabChange, onClose }: {
  boxes: Array<{ id: string; name: string; recognition?: import('@/lib/recognizer').RecognitionResult }>
  resultTab: string | null
  onTabChange: (id: string) => void
  onClose: () => void
}) {
  const [manualCut, setManualCut] = useState<Record<string, ManualCutMethod>>({})

  const boxesWithResult = boxes.filter(b => b.recognition)
  const current = boxesWithResult.find(b => b.id === resultTab) ?? boxesWithResult[0]
  const r = current?.recognition

  const isSinglePart = r && r.parts.length === 1 && r.parts[0].cutMethod === ''

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white flex flex-col" style={{ height: 240 }}>
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-100 bg-gray-50 overflow-x-auto shrink-0">
        {boxesWithResult.map(b => (
          <button
            key={b.id}
            onClick={() => onTabChange(b.id)}
            className={`px-3 py-1.5 text-xs whitespace-nowrap border-r border-gray-200 transition-colors
              ${b.id === current?.id ? 'bg-white text-indigo-700 font-medium border-b border-b-white -mb-px' : 'text-gray-500 hover:bg-gray-100'}`}
          >{b.name}</button>
        ))}
        <button onClick={onClose} className="ml-auto px-3 text-gray-400 hover:text-gray-700 text-xs shrink-0">✕ 닫기</button>
      </div>

      {/* Content */}
      {r && current ? (
        <div className="flex-1 overflow-auto p-3 text-xs">

          {/* 단품 도면 안내 + 재단방식 수동 입력 */}
          {isSinglePart && (
            <div className="mb-2 flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-700">
              <span>단품 도면 — 재단방식 레이어 없음.</span>
              <span className="font-medium">재단방식 선택:</span>
              <select
                value={manualCut[current.id] ?? ''}
                onChange={e => setManualCut(prev => ({ ...prev, [current.id]: e.target.value as ManualCutMethod }))}
                className="border border-amber-300 rounded px-1.5 py-0.5 text-xs bg-white text-gray-800"
              >
                <option value="">— 선택 —</option>
                {['레이저', '복합기', 'NCT', '절단'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {/* 세부부품 테이블 */}
          {r.parts.length > 0 ? (
            <table className="w-full border-collapse mb-3" style={{ fontSize: 11 }}>
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="border border-gray-200 px-2 py-1 text-left font-medium w-8">순번</th>
                  <th className="border border-gray-200 px-2 py-1 text-left font-medium">재단방식</th>
                  <th className="border border-gray-200 px-2 py-1 text-center font-medium">절곡↓</th>
                  <th className="border border-gray-200 px-2 py-1 text-center font-medium">절곡↑</th>
                  <th className="border border-gray-200 px-2 py-1 text-center font-medium">합계</th>
                  <th className="border border-gray-200 px-2 py-1 text-center font-medium">절곡비</th>
                  <th className="border border-gray-200 px-2 py-1 text-center font-medium">재단길이</th>
                  <th className="border border-gray-200 px-2 py-1 text-center font-medium">재질</th>
                  <th className="border border-gray-200 px-2 py-1 text-center font-medium">두께</th>
                  <th className="border border-gray-200 px-2 py-1 text-center font-medium">수량</th>
                </tr>
              </thead>
              <tbody>
                {r.parts.map((p, i) => {
                  const displayMethod = (p.cutMethod === '' && isSinglePart)
                    ? (manualCut[current.id] ?? '')
                    : p.cutMethod
                  const bendCost = calcBendCost(p.bendLengths)
                  return (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-200 px-2 py-1 text-gray-400">{i + 1}</td>
                      <td className="border border-gray-200 px-2 py-1">
                        {displayMethod ? (
                          <span className={`px-1.5 py-0.5 rounded text-white font-mono text-[10px] ${CUT_COLOR[displayMethod] ?? 'bg-gray-400'}`}>
                            {displayMethod}
                          </span>
                        ) : (
                          <span className="text-amber-500 text-[10px]">미지정</span>
                        )}
                      </td>
                      <td className="border border-gray-200 px-2 py-1 text-center text-red-600">{p.bendDown || '-'}</td>
                      <td className="border border-gray-200 px-2 py-1 text-center text-orange-500">{p.bendUp || '-'}</td>
                      <td className="border border-gray-200 px-2 py-1 text-center font-medium">{p.bendTotal || '-'}</td>
                      <td className="border border-gray-200 px-2 py-1 text-center text-emerald-700 font-medium">
                        {bendCost > 0 ? bendCost.toLocaleString() + '원' : '-'}
                      </td>
                      <td className="border border-gray-200 px-2 py-1 text-center text-blue-600">
                        {p.cutLengthM > 0 ? `${p.cutLengthM}m` : '-'}
                      </td>
                      <td className="border border-gray-200 px-2 py-1 text-center">{p.material  || '-'}</td>
                      <td className="border border-gray-200 px-2 py-1 text-center">{p.thickness || '-'}</td>
                      <td className="border border-gray-200 px-2 py-1 text-center">{p.qty       || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 text-gray-500 font-medium">
                  <td colSpan={4} className="border border-gray-200 px-2 py-1 text-right">합계</td>
                  <td className="border border-gray-200 px-2 py-1 text-center">{r.totalBends}곡</td>
                  <td className="border border-gray-200 px-2 py-1 text-center text-emerald-700">
                    {(() => {
                      const total = r.parts.reduce((s, p) => s + calcBendCost(p.bendLengths), 0)
                      return total > 0 ? total.toLocaleString() + '원' : '-'
                    })()}
                  </td>
                  <td colSpan={4} className="border border-gray-200 px-2 py-1 text-gray-400 text-[10px]">
                    {r.unassignedBends > 0 && `미배정 ${r.unassignedBends}곡`}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="text-gray-400 mb-3">재단 라벨 미검출 — 박스 안에 레이저/복합기/NCT/절단 레이어 텍스트가 없습니다.</p>
          )}

          <div className="flex gap-6 flex-wrap">
            {/* 특수가공 */}
            <div>
              <span className="font-medium text-gray-600">특수가공</span>
              {Object.keys(r.specialFeatures).length > 0 ? (
                <span className="ml-2 text-gray-700">
                  {Object.entries(r.specialFeatures).map(([k, v]) => `${k} ${v}개`).join(' · ')}
                </span>
              ) : (
                <span className="ml-2 text-gray-400">없음</span>
              )}
            </div>

            {/* 파이프 절단 */}
            {r.pipes.length > 0 && (
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-600">파이프 절단</span>
                <table className="mt-1 border-collapse" style={{ fontSize: 11 }}>
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      {['품번','규격','재질','수량','길이','각도'].map(h => (
                        <th key={h} className="border border-gray-200 px-2 py-0.5 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.pipes.map((row, i) => (
                      <tr key={i}>
                        {[row.no, row.spec, row.material, row.qty, row.length, row.angle].map((v, j) => (
                          <td key={j} className="border border-gray-200 px-2 py-0.5">{v || '-'}</td>
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
        <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
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
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div
        className={`border-2 border-dashed rounded-2xl px-20 py-14 text-center cursor-pointer transition-colors
          ${over ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-white'}`}
        onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      >
        <input ref={ref} type="file" accept=".dxf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
        {loading
          ? <p className="text-gray-500 text-sm">파싱 중...</p>
          : <>
              <p className="text-gray-700 font-medium">DXF 파일을 드래그하거나 클릭</p>
              <p className="text-sm text-gray-400 mt-1">SolidWorks 전개도 DXF (CP949)</p>
              <p className="text-xs text-gray-400 mt-3">휠: 줌 · 드래그: 이동 · 조립체 선택 모드: 영역 지정</p>
            </>}
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>
    </div>
  )
}
