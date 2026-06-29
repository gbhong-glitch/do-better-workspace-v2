'use client'

import { Fragment, useRef, useState } from 'react'
import type { BomRow, BendGroup } from '@/lib/p4/dxf-bend-parser'
import type { BendSequence } from '@/lib/p4/bend-sequence'

interface ParseResult {
  bom:          BomRow[]
  bendGroups:   BendGroup[]
  bendSequence: BendSequence
  warnings:     string[]
}

export default function P4Page() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName,     setFileName]     = useState('')
  const [parseResult,  setParseResult]  = useState<ParseResult | null>(null)
  const [partName,     setPartName]     = useState('')
  const [material,     setMaterial]     = useState('SPCC')
  const [thicknessMm,  setThicknessMm]  = useState('1.2')
  const [finishedXMm,  setFinishedXMm]  = useState('')
  const [finishedZMm,  setFinishedZMm]  = useState('')
  const [p4Text,       setP4Text]       = useState('')
  const [loading,      setLoading]      = useState<'parse' | 'generate' | null>(null)
  const [error,        setError]        = useState<string | null>(null)

  async function handleFile(file: File) {
    setFileName(file.name)
    setPartName(file.name.replace(/\.dxf$/i, ''))
    setParseResult(null)
    setP4Text('')
    setError(null)

    const fd = new FormData()
    fd.append('file', file)
    setLoading('parse')
    try {
      const res  = await fetch('/api/p4-parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'DXF 파싱 오류'); return }
      setParseResult(data as ParseResult)
      // 전개도 치수를 초기값으로 사용 — 실무 완성품 치수로 수정 필요
      setFinishedXMm(String(Math.round(data.bendSequence.flatWidthMm)))
      setFinishedZMm(String(Math.round(data.bendSequence.flatHeightMm)))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(null)
    }
  }

  async function handleGenerate() {
    if (!parseResult) return
    setError(null)
    setLoading('generate')
    try {
      const res = await fetch('/api/p4-generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bendSequence: parseResult.bendSequence,
          partName,
          material,
          thicknessMm:  parseFloat(thicknessMm),
          finishedXMm:  parseFloat(finishedXMm),
          finishedZMm:  parseFloat(finishedZMm),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'P4 생성 오류'); return }
      setP4Text(data.p4Text as string)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(null)
    }
  }

  function handleDownload() {
    const blob = new Blob([p4Text], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${partName || 'output'}.P4`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-bold text-on-surface">P4 파일 생성</h1>

      {/* ── DXF 업로드 ── */}
      <section
        className="border-2 border-dashed border-outline-variant rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".dxf"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        {fileName
          ? <p className="font-medium text-primary">{fileName}</p>
          : <p className="text-on-surface-variant">DXF 파일을 드래그하거나 클릭하여 업로드</p>
        }
        {loading === 'parse' && (
          <p className="text-xs text-on-surface-variant mt-2">파싱 중...</p>
        )}
      </section>

      {/* ── 경고 ── */}
      {(parseResult?.warnings?.length ?? 0) > 0 && (
        <div className="text-xs text-amber-400 bg-amber-950/30 rounded p-3 space-y-1">
          {parseResult!.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {/* ── BOM 요약 ── */}
      {parseResult && (
        <section className="bg-surface-container rounded-lg p-4">
          <h2 className="text-sm font-semibold text-on-surface-variant mb-2">
            BOM ({parseResult.bom.length}곡)
          </h2>
          <div className="grid grid-cols-4 gap-x-4 gap-y-1 text-xs font-mono">
            <span className="text-on-surface-variant">태그</span>
            <span className="text-on-surface-variant">방향</span>
            <span className="text-on-surface-variant">각도</span>
            <span className="text-on-surface-variant">반경</span>
            {parseResult.bom.map(row => (
              <Fragment key={row.tag}>
                <span>{row.tag}</span>
                <span className={row.direction === 'down' ? 'text-red-400' : 'text-orange-400'}>
                  {row.direction === 'down' ? '↓ 아래' : '↑ 위'}
                </span>
                <span>{row.angleDeg}°</span>
                <span>{row.innerRadiusMm} mm</span>
              </Fragment>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant mt-3">
            전개도: {parseResult.bendSequence.flatWidthMm.toFixed(1)} × {parseResult.bendSequence.flatHeightMm.toFixed(1)} mm
            &nbsp;·&nbsp; {parseResult.bendSequence.faces.length}면
          </p>
        </section>
      )}

      {/* ── 파라미터 입력 ── */}
      {parseResult && (
        <section className="bg-surface-container rounded-lg p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-on-surface-variant">파라미터</h2>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-xs text-on-surface-variant">품명 (COD)</span>
              <input
                value={partName}
                onChange={e => setPartName(e.target.value)}
                className="bg-surface border border-outline-variant rounded px-3 py-1.5 text-sm font-mono text-on-surface focus:outline-none focus:border-primary"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-on-surface-variant">재질</span>
              <select
                value={material}
                onChange={e => setMaterial(e.target.value)}
                className="bg-surface border border-outline-variant rounded px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary"
              >
                <option>SPCC</option>
                <option>SECC</option>
                <option>SUS304</option>
                <option>AL5052</option>
                <option>AL6061</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-on-surface-variant">두께 (mm)</span>
              <input
                type="number" step="0.1" min="0.5" max="6"
                value={thicknessMm}
                onChange={e => setThicknessMm(e.target.value)}
                className="bg-surface border border-outline-variant rounded px-3 py-1.5 text-sm font-mono text-on-surface focus:outline-none focus:border-primary"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-on-surface-variant">완성품 X (mm)</span>
              <input
                type="number" step="0.1"
                value={finishedXMm}
                onChange={e => setFinishedXMm(e.target.value)}
                className="bg-surface border border-outline-variant rounded px-3 py-1.5 text-sm font-mono text-on-surface focus:outline-none focus:border-primary"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-on-surface-variant">완성품 Z (mm)</span>
              <input
                type="number" step="0.1"
                value={finishedZMm}
                onChange={e => setFinishedZMm(e.target.value)}
                className="bg-surface border border-outline-variant rounded px-3 py-1.5 text-sm font-mono text-on-surface focus:outline-none focus:border-primary"
              />
            </label>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading === 'generate' || !partName || !finishedXMm || !finishedZMm}
            className="mt-1 self-start bg-primary text-on-primary px-5 py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading === 'generate' ? '생성 중...' : 'P4 생성'}
          </button>
        </section>
      )}

      {/* ── 에러 ── */}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* ── P4 미리보기 + 다운로드 ── */}
      {p4Text && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-on-surface-variant">P4 미리보기</h2>
            <button
              onClick={handleDownload}
              className="bg-secondary text-on-secondary px-4 py-1.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              다운로드 .P4
            </button>
          </div>
          <textarea
            readOnly
            value={p4Text}
            className="w-full h-80 bg-surface-container-high border border-outline-variant rounded p-3 text-xs font-mono text-on-surface resize-none focus:outline-none"
          />
        </section>
      )}
    </div>
  )
}
