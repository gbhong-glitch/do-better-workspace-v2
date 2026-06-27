'use client'

import { useEffect, useState } from 'react'
import type { PricingData } from '@/lib/estimate'

const MATERIALS = ['SPCC', 'SECC', 'SGCC', 'SS400', 'SUS304', 'SUS316', 'AL5052', 'AL6061']
const THICKNESSES = ['0.8', '1.0', '1.2', '1.5', '2.0', '2.3', '3.0', '4.0', '5.0', '6.0']
const SPECIALS = ['TAP_M3', 'TAP_M4', 'TAP_M5', 'TAP_M6', 'TAP_M8', 'BUR', 'EM']

export default function AdminPricingPage() {
  const [pricing, setPricing] = useState<PricingData | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pricing').then(r => r.json()).then(setPricing).catch(e => setError(String(e)))
  }, [])

  if (!pricing) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">
      {error ?? '로딩 중...'}
    </div>
  }

  function setNum(path: string[], value: number) {
    setPricing(prev => {
      if (!prev) return prev
      const next = structuredClone(prev) as unknown as Record<string, unknown>
      let obj = next
      for (let i = 0; i < path.length - 1; i++) {
        obj = (obj as Record<string, unknown>)[path[i]] as Record<string, unknown>
      }
      (obj as Record<string, unknown>)[path[path.length - 1]] = value
      return next as unknown as PricingData
    })
  }

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pricing),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const numInput = (path: string[], value: number) => (
    <input
      type="number" min={0} step={100} value={value}
      onChange={e => setNum(path, parseFloat(e.target.value) || 0)}
      className="w-28 border border-gray-300 rounded px-2 py-1 text-right text-sm"
    />
  )

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">단가 관리</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600">저장됨 ✓</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button
            onClick={handleSave} disabled={saving}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* 재료비 */}
      <Section title="재료비 (원/kg)">
        <div className="grid grid-cols-2 gap-2">
          {MATERIALS.map(m => (
            <Row key={m} label={m}>
              {numInput(['material_price', m], pricing.material_price[m] ?? 0)}
            </Row>
          ))}
        </div>
      </Section>

      {/* 절단비 / 피어싱비 */}
      <Section title="레이저 절단비">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left py-1 pr-4">두께 (t)</th>
                <th className="text-right py-1 px-2">절단 (원/m)</th>
                <th className="text-right py-1 px-2">피어싱 (원/개)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {THICKNESSES.map(t => (
                <tr key={t}>
                  <td className="py-1.5 pr-4 text-gray-600">{t} t</td>
                  <td className="py-1.5 px-2 text-right">
                    {numInput(['cut_price_per_m', t], pricing.cut_price_per_m[t] ?? 0)}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    {numInput(['pierce_price', t], pricing.pierce_price[t] ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 절곡비 */}
      <Section title="절곡비">
        {(['P4', 'general'] as const).map(mode => (
          <div key={mode} className="mb-3">
            <div className="text-sm font-medium text-gray-700 mb-1">
              {mode === 'P4' ? 'P4 패널벤더' : '일반 절곡'}
            </div>
            <div className="flex gap-4">
              <Row label="셋업 (원/회)">
                {numInput(['bend_price', mode, 'setup'], pricing.bend_price[mode]?.setup ?? 0)}
              </Row>
              <Row label="길이 (원/m)">
                {numInput(['bend_price', mode, 'per_m'], pricing.bend_price[mode]?.per_m ?? 0)}
              </Row>
            </div>
          </div>
        ))}
      </Section>

      {/* 특수 가공비 */}
      <Section title="특수 가공비 (원/개)">
        <div className="grid grid-cols-2 gap-2">
          {SPECIALS.map(k => (
            <Row key={k} label={k.replace('_', ' ')}>
              {numInput(['special_process_price', k], pricing.special_process_price[k] ?? 0)}
            </Row>
          ))}
        </div>
      </Section>

      {/* 후처리비 */}
      <Section title="후처리비 (원/m²)">
        <div className="grid grid-cols-2 gap-2">
          {['분체도장', '도장', '도금', '없음'].map(s => (
            <Row key={s} label={s}>
              {numInput(['surface_price', s], pricing.surface_price[s] ?? 0)}
            </Row>
          ))}
        </div>
      </Section>

      {/* 관리비 / 마진 */}
      <Section title="관리비 · 마진 (%)">
        <div className="flex gap-4">
          <Row label="관리비율 (%)">
            {numInput(['overhead', 'management_rate'], pricing.overhead.management_rate)}
          </Row>
          <Row label="마진율 (%)">
            {numInput(['overhead', 'margin_rate'], pricing.overhead.margin_rate)}
          </Row>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 w-36 shrink-0">{label}</span>
      {children}
    </div>
  )
}
