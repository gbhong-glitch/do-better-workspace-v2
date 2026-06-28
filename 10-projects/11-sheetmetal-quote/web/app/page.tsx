'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ParsedDxf } from '@/lib/dxf-parser'
import type { BendMode, SurfaceType, SpecialProcesses } from '@/lib/estimate'

const SURFACE_OPTIONS: { value: SurfaceType; label: string }[] = [
  { value: '분체도장', label: '분체도장' },
  { value: '도장',    label: '도장' },
  { value: '도금',    label: '도금' },
  { value: '없음',    label: '없음' },
]

const SPECIAL_KEYS = [
  { key: 'TAP_M3', label: 'M3 탭' },
  { key: 'TAP_M4', label: 'M4 탭' },
  { key: 'TAP_M5', label: 'M5 탭' },
  { key: 'TAP_M6', label: 'M6 탭' },
  { key: 'TAP_M8', label: 'M8 탭' },
  { key: 'BUR',    label: '버링' },
  { key: 'EM',     label: '엠보싱' },
] as const

export default function HomePage() {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [dragging,      setDragging]      = useState(false)
  const [parsing,       setParsing]       = useState(false)
  const [parsed,        setParsed]        = useState<ParsedDxf | null>(null)
  const [parseError,    setParseError]    = useState<string | null>(null)

  const [qty,         setQty]         = useState(1)
  const [bendMode,    setBendMode]    = useState<BendMode>('P4')
  const [surfaceType, setSurfaceType] = useState<SurfaceType>('분체도장')
  const [special,     setSpecial]     = useState<Record<string, number>>({})

  const [estimating,    setEstimating]    = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      setParseError('.dxf 파일만 지원합니다.')
      return
    }
    setParsing(true)
    setParseError(null)
    setParsed(null)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setParseError(data.error ?? '파싱 실패'); return }
      setParsed(data as ParsedDxf)
      if (data.qty) setQty(data.qty)
    } catch (err) {
      setParseError(String(err))
    } finally {
      setParsing(false)
    }
  }, [])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  // ── Estimate ───────────────────────────────────────────────────────────────
  const handleEstimate = async () => {
    if (!parsed) return
    setEstimating(true)
    setEstimateError(null)

    const specialProcesses: SpecialProcesses = {}
    for (const [k, v] of Object.entries(special)) {
      if (v > 0) (specialProcesses as Record<string, number>)[k] = v
    }

    try {
      const res = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsed, bendMode, surfaceType, qty, specialProcesses }),
      })
      const result = await res.json()
      if (!res.ok) { setEstimateError(result.error ?? '견적 계산 실패'); return }
      sessionStorage.setItem('estimateResult', JSON.stringify(result))
      router.push('/result')
    } catch (err) {
      setEstimateError(String(err))
    } finally {
      setEstimating(false)
    }
  }

  const handleReset = () => {
    setParsed(null)
    setParseError(null)
    setQty(1)
    setBendMode('P4')
    setSurfaceType('분체도장')
    setSpecial({})
    setEstimateError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">

      {/* ══ Left: CAD Viewport ══════════════════════════════════════════════ */}
      <section
        className={`flex-1 bg-[#0F172A] relative overflow-hidden flex flex-col transition-colors ${
          dragging ? 'bg-[#1a2744]' : ''
        } ${!parsed ? 'cursor-pointer' : ''}`}
        onClick={() => !parsed && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input ref={fileRef} type="file" accept=".dxf" className="hidden" onChange={onInputChange} />

        {/* Viewport toolbar */}
        <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
          {([['＋', '확대'], ['－', '축소'], ['↔', '이동'], ['↻', '회전']] as const).map(([icon, title]) => (
            <button
              key={title}
              title={title}
              onClick={e => e.stopPropagation()}
              className="w-9 h-9 bg-white/10 text-white border border-white/20 rounded backdrop-blur-sm hover:bg-white/20 flex items-center justify-center text-sm font-mono transition-colors"
            >
              {icon}
            </button>
          ))}
        </div>

        {/* Grid + canvas */}
        <div
          className="flex-1 flex items-center justify-center relative"
          style={{
            backgroundImage:
              'linear-gradient(rgba(37,99,235,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.1) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
          {parsing ? (
            <div className="text-center text-white/60">
              <div className="text-5xl mb-4 animate-pulse font-mono">···</div>
              <p className="text-sm font-mono tracking-widest">DXF 파싱 중...</p>
            </div>

          ) : parsed ? (
            /* ── Parsed state ── */
            <div className="text-center select-none">
              <svg
                className="w-56 h-56 text-blue-400/50 mx-auto"
                fill="none" viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M10 10 H90 V90 H10 Z" stroke="currentColor" strokeWidth="0.5" />
                <path d="M20 20 H40 V40 H20 Z" stroke="currentColor" strokeWidth="0.5" />
                <circle cx="70" cy="30" r="10"  stroke="currentColor" strokeWidth="0.5" />
                <circle cx="30" cy="70" r="10"  stroke="currentColor" strokeWidth="0.5" />
                <path d="M60 60 L80 80"          stroke="currentColor" strokeWidth="0.5" />
                {/* dimension line */}
                <path d="M10 5 L90 5" stroke="#4edea3" strokeDasharray="1,1" strokeWidth="0.2" />
                <text fill="#4edea3" fontSize="2" textAnchor="middle" x="50" y="4" fontFamily="monospace">
                  {parsed.thicknessMm != null ? `t${parsed.thicknessMm} mm` : '두께 미검출'}
                </text>
              </svg>

              {/* Meta badges */}
              <div className="mt-6 grid grid-cols-3 gap-x-8 gap-y-3 w-fit mx-auto">
                <MetaBadge label="재질"  value={parsed.material  ?? '미검출'} ok={parsed.materialOk} />
                <MetaBadge label="두께"  value={parsed.thicknessMm != null ? `${parsed.thicknessMm} t` : '미검출'} ok={parsed.thicknessOk} />
                <MetaBadge label="중량"  value={parsed.weightKg  != null ? `${parsed.weightKg} kg` : '미검출'} ok={parsed.weightOk} />
                <MetaBadge label="절곡"  value={`${parsed.bendTotal}회 / ${(parsed.bendLengthMm / 1000).toFixed(2)} m`} ok={parsed.bendOk} />
                <MetaBadge label="구멍"  value={`${parsed.holeCount}개`} ok />
                <MetaBadge label="절단장" value={`${(parsed.cutLengthMm / 1000).toFixed(2)} m`} ok={parsed.cutOk} />
              </div>

              {!parsed.standard && (
                <p className="mt-4 text-xs text-amber-400/80 font-mono">⚠ 비표준 도면 — 수동 확인 필요</p>
              )}

              <button
                onClick={e => { e.stopPropagation(); fileRef.current?.click() }}
                className="mt-5 text-xs text-blue-400/50 hover:text-blue-400 transition-colors underline font-mono"
              >
                다른 파일 선택
              </button>
            </div>

          ) : (
            /* ── Empty state ── */
            <div className={`text-center transition-opacity ${dragging ? 'opacity-100' : 'opacity-60'}`}>
              <div className="w-20 h-20 border-2 border-dashed border-blue-400/50 rounded-lg flex items-center justify-center mx-auto mb-5">
                <span className="text-3xl text-blue-400/60">↑</span>
              </div>
              <p className="text-white/80 font-medium">DXF 파일을 드래그하거나 클릭</p>
              <p className="text-white/40 text-xs mt-1.5 font-mono tracking-wide">SolidWorks 전개도 · .dxf</p>
              {parseError && (
                <p className="mt-4 text-red-400 text-sm font-mono">{parseError}</p>
              )}
            </div>
          )}
        </div>

        {/* Filename watermark */}
        {parsed && (
          <div className="absolute bottom-4 right-4 text-blue-300/30 text-xs font-mono pointer-events-none">
            {parsed.file}
          </div>
        )}

        {/* Drag-over border */}
        {dragging && (
          <div className="absolute inset-0 border-2 border-blue-400 pointer-events-none" />
        )}
      </section>

      {/* ══ Right: Config Panel ═════════════════════════════════════════════ */}
      <section className="w-[420px] bg-surface-bright border-l border-outline-variant flex flex-col overflow-y-auto">

        {/* Sticky total card */}
        <div className="sticky top-0 bg-surface border-b-2 border-primary px-gutter py-4 z-20 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">
            총 예상 비용
          </p>
          <p className="text-3xl font-bold text-on-surface font-mono tracking-tight">
            ₩ —
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            {parsed ? '견적 계산 버튼을 눌러주세요' : 'DXF 파일을 업로드하세요'}
          </p>
        </div>

        <div className="p-gutter flex flex-col gap-6 pb-8">

          {/* ── Section 1: 기본 설정 ─────────────────────────────────────── */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-4">
            <h3 className="text-sm font-semibold text-on-surface mb-4 pb-2 border-b border-outline-variant">
              기본 설정
            </h3>
            <div className="flex flex-col gap-4">

              {/* 재질 */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">
                  재질 (Material)
                </label>
                <div className="w-full bg-surface border border-outline-variant rounded px-3 py-2 text-sm font-mono text-on-surface min-h-[38px] flex items-center">
                  {parsed?.material ?? <span className="text-on-surface-variant">—</span>}
                </div>
              </div>

              {/* 두께 + 수량 */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">
                    두께 (Thickness)
                  </label>
                  <div className="relative">
                    <div className="w-full bg-surface border border-outline-variant rounded px-3 py-2 pr-10 text-sm font-mono text-right text-on-surface min-h-[38px] flex items-center justify-end">
                      {parsed?.thicknessMm ?? <span className="text-on-surface-variant">—</span>}
                    </div>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant font-mono">
                      mm
                    </span>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">
                    수량 (Quantity)
                  </label>
                  <div className="relative">
                    <input
                      type="number" min={1} value={qty}
                      onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-surface border border-outline-variant rounded px-3 py-2 pr-10 text-sm font-mono text-right text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant font-mono">
                      ea
                    </span>
                  </div>
                </div>
              </div>

              {/* 절곡 방식 */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                  절곡 방식 (Bend Mode)
                </label>
                <div className="flex gap-4">
                  {(['P4', 'general'] as BendMode[]).map(m => (
                    <label key={m} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio" name="bendMode" value={m}
                        checked={bendMode === m}
                        onChange={() => setBendMode(m)}
                        className="accent-primary"
                      />
                      <span className="text-sm text-on-surface">
                        {m === 'P4' ? 'P4 패널벤더' : '일반 절곡'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* ── Section 2: 후처리 및 특수가공 ───────────────────────────── */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-4">
            <h3 className="text-sm font-semibold text-on-surface mb-4 pb-2 border-b border-outline-variant">
              후처리 및 특수가공
            </h3>

            {/* 표면 처리 */}
            <div className="mb-5">
              <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                표면 처리 (Surface)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SURFACE_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="surface" value={value}
                      checked={surfaceType === value}
                      onChange={() => setSurfaceType(value)}
                      className="accent-primary"
                    />
                    <span className="text-sm text-on-surface">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 특수 가공 */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                특수가공 수량
              </label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {SPECIAL_KEYS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-sm text-on-surface w-14 shrink-0">{label}</span>
                    <input
                      type="number" min={0} value={special[key] ?? 0}
                      onChange={e => setSpecial(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                      className="w-16 bg-surface border border-outline-variant rounded px-2 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Section 3: 도면 수치 (파싱 완료 후) ─────────────────────── */}
          {parsed && (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden">
              <h3 className="text-sm font-semibold text-on-surface px-4 py-3 border-b border-outline-variant bg-surface-bright">
                도면 수치
              </h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant">
                    <th className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">항목</th>
                    <th className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant text-right">값</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-mono text-on-surface">
                  <DataRow label="절곡"  value={`${parsed.bendTotal}회 · ${(parsed.bendLengthMm/1000).toFixed(3)} m`} ok={parsed.bendOk} />
                  <DataRow label="구멍"  value={`${parsed.holeCount}개`} ok />
                  <DataRow label="절단장" value={`${(parsed.cutLengthMm/1000).toFixed(3)} m`} ok={parsed.cutOk} />
                  <DataRow label="중량"  value={parsed.weightKg != null ? `${parsed.weightKg} kg` : '미검출'} ok={parsed.weightOk} last />
                </tbody>
              </table>
            </div>
          )}

          {/* Error */}
          {estimateError && (
            <p className="text-sm font-mono text-error bg-error-container/30 border border-error/30 rounded px-3 py-2">
              {estimateError}
            </p>
          )}

          {/* ── Action Buttons ───────────────────────────────────────────── */}
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="flex-1 bg-surface border border-outline-variant text-on-surface text-sm py-2.5 rounded hover:bg-surface-container-high transition-colors"
            >
              재설정
            </button>
            <button
              onClick={handleEstimate}
              disabled={!parsed || estimating}
              className="flex-[2] bg-primary text-on-primary text-sm font-medium py-2.5 rounded hover:bg-primary/90 transition-colors disabled:opacity-40 shadow-sm"
            >
              {estimating ? '계산 중…' : '견적 계산'}
            </button>
          </div>

        </div>
      </section>

    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetaBadge({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-white/40 font-mono">{label}</span>
      <span className={`text-sm font-mono font-medium ${ok ? 'text-blue-300' : 'text-amber-400'}`}>
        {value}
      </span>
    </div>
  )
}

function DataRow({
  label, value, ok, last = false,
}: {
  label: string; value: string; ok: boolean; last?: boolean
}) {
  return (
    <tr className={`${last ? '' : 'border-b border-outline-variant/50'} hover:bg-surface-container transition-colors`}>
      <td className="px-4 py-2.5 text-on-surface-variant text-sm">{label}</td>
      <td className={`px-4 py-2.5 text-right text-sm ${ok ? 'text-on-surface' : 'text-amber-600'}`}>
        {value}
      </td>
    </tr>
  )
}
