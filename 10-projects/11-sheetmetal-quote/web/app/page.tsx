'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ParsedDxf } from '@/lib/dxf-parser'
import type { BendMode, SurfaceType, SpecialProcesses } from '@/lib/estimate'

const SURFACE_OPTIONS: SurfaceType[] = ['분체도장', '도장', '도금', '없음']
const SPECIAL_KEYS = ['TAP_M3', 'TAP_M4', 'TAP_M5', 'TAP_M6', 'TAP_M8', 'BUR', 'EM'] as const

export default function HomePage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<ParsedDxf | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const [qty, setQty] = useState(1)
  const [bendMode, setBendMode] = useState<BendMode>('P4')
  const [surfaceType, setSurfaceType] = useState<SurfaceType>('분체도장')
  const [special, setSpecial] = useState<Record<string, number>>({})

  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)

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
      const res = await fetch('/api/parse', { method: 'POST', body: fd })
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
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

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

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">DXF 파일 견적</h1>

      {/* 파일 업로드 */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input ref={fileRef} type="file" accept=".dxf" className="hidden" onChange={onInputChange} />
        {parsing ? (
          <p className="text-gray-500">파싱 중...</p>
        ) : parsed ? (
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{parsed.file}</span> — 다시 선택하려면 클릭
          </p>
        ) : (
          <>
            <p className="text-gray-500">DXF 파일을 드래그하거나 클릭해서 선택</p>
            <p className="text-xs text-gray-400 mt-1">SolidWorks 전개도 DXF</p>
          </>
        )}
      </div>

      {parseError && <p className="text-sm text-red-600">{parseError}</p>}

      {/* 파싱 결과 메타데이터 */}
      {parsed && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm">
          <div className="font-medium text-gray-700 mb-2">파싱 결과</div>
          <div className="grid grid-cols-3 gap-2 text-gray-600">
            <MetaItem label="재질"  value={parsed.material ?? '미검출'} ok={parsed.materialOk} />
            <MetaItem label="두께"  value={parsed.thicknessMm != null ? `${parsed.thicknessMm} t` : '미검출'} ok={parsed.thicknessOk} />
            <MetaItem label="중량"  value={parsed.weightKg != null ? `${parsed.weightKg} kg` : '미검출'} ok={parsed.weightOk} />
            <MetaItem label="절곡"  value={`${parsed.bendTotal}회 / ${(parsed.bendLengthMm / 1000).toFixed(3)} m`} ok={parsed.bendOk} />
            <MetaItem label="구멍"  value={`${parsed.holeCount}개`} ok />
            <MetaItem label="절단장" value={`${(parsed.cutLengthMm / 1000).toFixed(3)} m`} ok={parsed.cutOk} />
          </div>
          {!parsed.standard && (
            <p className="mt-2 text-xs text-amber-600">⚠ 비표준 도면 — 수동 입력이 필요할 수 있습니다</p>
          )}
        </div>
      )}

      {/* 견적 옵션 */}
      {parsed && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-4 text-sm">
          {/* 수량 */}
          <div className="flex items-center gap-3">
            <label className="w-20 text-gray-600 shrink-0">수량</label>
            <input
              type="number" min={1} value={qty}
              onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-right"
            />
            <span className="text-gray-400">ea</span>
          </div>

          {/* 절곡 방식 */}
          <div className="flex items-center gap-3">
            <span className="w-20 text-gray-600 shrink-0">절곡 방식</span>
            <div className="flex gap-4">
              {(['P4', 'general'] as BendMode[]).map(m => (
                <label key={m} className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="bendMode" value={m} checked={bendMode === m}
                    onChange={() => setBendMode(m)} />
                  <span>{m === 'P4' ? 'P4 패널벤더' : '일반 절곡'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 후처리 */}
          <div className="flex items-center gap-3">
            <span className="w-20 text-gray-600 shrink-0">후처리</span>
            <div className="flex gap-3 flex-wrap">
              {SURFACE_OPTIONS.map(s => (
                <label key={s} className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="surface" value={s} checked={surfaceType === s}
                    onChange={() => setSurfaceType(s)} />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 특수 가공 */}
          <div>
            <div className="text-gray-600 mb-2">특수 가공 <span className="text-gray-400">(선택)</span></div>
            <div className="grid grid-cols-4 gap-2">
              {SPECIAL_KEYS.map(k => (
                <label key={k} className="flex items-center gap-1 text-xs">
                  <span className="w-14 shrink-0">{k.replace('_', ' ')}</span>
                  <input
                    type="number" min={0} value={special[k] ?? 0}
                    onChange={e => setSpecial(prev => ({ ...prev, [k]: parseInt(e.target.value) || 0 }))}
                    className="w-12 border border-gray-300 rounded px-1 py-0.5 text-right text-xs"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {estimateError && <p className="text-sm text-red-600">{estimateError}</p>}

      {/* 계산 버튼 */}
      <button
        onClick={handleEstimate}
        disabled={!parsed || estimating}
        className="bg-gray-900 text-white py-2.5 rounded-lg font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors"
      >
        {estimating ? '계산 중...' : '견적 계산'}
      </button>
    </div>
  )
}

function MetaItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`flex gap-1 ${ok ? '' : 'text-amber-600'}`}>
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
