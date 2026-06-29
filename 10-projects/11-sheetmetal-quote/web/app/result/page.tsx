'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EstimateResult, MultiPartEstimateResult, PartEstimateResult } from '@/lib/estimate'

const KRW = (n: number) => '₩' + n.toLocaleString('ko-KR')

// ---------------------------------------------------------------------------
// 부품별 견적 — 조립체 섹션
// ---------------------------------------------------------------------------

function PartRow({ part }: { part: PartEstimateResult }) {
  const [open, setOpen] = useState(false)
  const b = part.breakdown
  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer select-none"
        onClick={() => setOpen(v => !v)}
      >
        <td className="px-3 py-2 text-gray-700 font-medium">{part.partName}</td>
        <td className="px-3 py-2 text-gray-500 text-center">{part.material}</td>
        <td className="px-3 py-2 text-gray-500 text-center">{part.thicknessMm != null ? `${part.thicknessMm}t` : '—'}</td>
        <td className="px-3 py-2 text-gray-500 text-center">{part.detail.bends}곡</td>
        <td className="px-3 py-2 text-gray-500 text-center">{part.detail.cutM}m</td>
        <td className="px-3 py-2 text-gray-500 text-center">{part.qty}ea</td>
        <td className="px-3 py-2 text-right font-medium">{KRW(part.unitPrice)}</td>
        <td className="px-3 py-2 text-right font-semibold text-blue-700">{KRW(part.totalPrice)}</td>
        <td className="px-3 py-1 text-center text-gray-400 text-xs">{open ? '▲' : '▼'}</td>
      </tr>
      {open && (
        <tr className="bg-gray-50">
          <td colSpan={9} className="px-6 py-2">
            <div className="flex gap-6 text-xs text-gray-600 flex-wrap">
              <span>재료비 <strong>{KRW(b.재료비)}</strong></span>
              <span>절단비 <strong>{KRW(b.절단비)}</strong></span>
              <span>절곡비 <strong>{KRW(b.절곡비)}</strong></span>
              {b.후처리비 > 0 && <span>후처리 <strong>{KRW(b.후처리비)}</strong></span>}
              <span>관리비 <strong>{KRW(b.관리비)}</strong></span>
              <span>마진 <strong>{KRW(b.마진)}</strong></span>
              <span className="text-gray-400">중량 {part.weightKg}kg · 면적 {part.detail.surfaceAreaM2}m²</span>
            </div>
            {part.warnings.length > 0 && (
              <p className="mt-1 text-xs text-amber-600">{part.warnings.join(' · ')}</p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function MultiPartView({
  result,
  onBack,
  onPrint,
}: {
  result: MultiPartEstimateResult
  onBack: () => void
  onPrint: () => void
}) {
  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold mb-0.5">부품별 견적 결과</h1>
        <p className="text-sm text-gray-500">
          절곡: {result.bendMode === 'P4' ? 'P4 패널벤더' : '일반 절곡'} · 후처리: {result.surfaceType}
        </p>
      </div>

      {result.assemblies.map(asm => (
        <div key={asm.assemblyName} className="bg-white border border-gray-200 rounded-lg overflow-hidden text-sm">
          <div className="bg-gray-50 px-4 py-2 flex justify-between items-center border-b border-gray-200">
            <span className="font-semibold text-gray-800">{asm.assemblyName}</span>
            <span className="text-gray-500 text-xs">소계 <strong className="text-gray-900 text-sm ml-1">{KRW(asm.subtotal)}</strong></span>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase border-b border-gray-100">
              <tr>
                <th className="text-left px-3 py-1.5">품명</th>
                <th className="text-center px-3 py-1.5">재질</th>
                <th className="text-center px-3 py-1.5">두께</th>
                <th className="text-center px-3 py-1.5">곡수</th>
                <th className="text-center px-3 py-1.5">재단</th>
                <th className="text-center px-3 py-1.5">수량</th>
                <th className="text-right px-3 py-1.5">단가</th>
                <th className="text-right px-3 py-1.5">금액</th>
                <th className="px-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {asm.parts.map((p, i) => <PartRow key={i} part={p} />)}
            </tbody>
            <tfoot className="border-t border-gray-200">
              <tr className="bg-gray-50">
                <td colSpan={7} className="px-3 py-2 text-right text-xs text-gray-500">조립체 소계</td>
                <td className="px-3 py-2 text-right font-bold text-gray-900">{KRW(asm.subtotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {/* 전체 합계 */}
      <div className="bg-gray-900 text-white rounded-lg px-6 py-4 flex justify-between items-center">
        <span className="font-semibold">전체 합계</span>
        <span className="text-2xl font-bold tabular-nums">{KRW(result.grandTotal)}</span>
      </div>

      {/* 경고 */}
      {result.warnings.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          {[...new Set(result.warnings)].map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      <div className="flex gap-3 print:hidden">
        <button onClick={onBack}
          className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
          ← 뷰어로
        </button>
        <button onClick={onPrint}
          className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors">
          PDF 다운로드
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 단일 견적 (기존 홈 페이지 흐름)
// ---------------------------------------------------------------------------

function SinglePartView({
  result,
  onBack,
  onPrint,
}: {
  result: EstimateResult
  onBack: () => void
  onPrint: () => void
}) {
  const { breakdown: b, detail: d } = result

  const rows: Array<{ label: string; qty: string; unit: string; amount: number }> = [
    { label: '재료비',    qty: `${d.weightKg} kg`,      unit: `${d.matUnitPerKg.toLocaleString()} 원/kg`, amount: b.재료비 },
    { label: '절단비',    qty: `${d.cutM} m`,            unit: `${d.cutUnitPerM.toLocaleString()} 원/m`,  amount: b.절단비 },
    { label: '피어싱비',  qty: `${d.holes} 개`,          unit: `${d.pierceUnit.toLocaleString()} 원/개`,  amount: b.피어싱비 },
    { label: '절곡(셋업)', qty: `${d.bends} 회`,         unit: `${d.bendSetupUnit.toLocaleString()} 원/회`, amount: d.bendSetupCost },
    { label: '절곡(길이)', qty: `${d.bendLengthM} m`,    unit: `${d.bendPerMUnit.toLocaleString()} 원/m`,  amount: d.bendLengthCost },
    ...(b.특수가공비 > 0 ? [{ label: '특수가공비', qty: '-', unit: '-', amount: b.특수가공비 }] : []),
    { label: '후처리비',  qty: `${d.surfaceAreaM2} m²`,  unit: `${d.surfUnitPerM2.toLocaleString()} 원/m²`, amount: b.후처리비 },
  ]

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">견적 결과</h1>
        <p className="text-sm text-gray-500">{result.file}</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm grid grid-cols-3 gap-2 text-gray-600">
        <span>재질: <strong className="text-gray-900">{result.material}</strong></span>
        <span>두께: <strong className="text-gray-900">{result.thicknessMm} t</strong></span>
        <span>중량: <strong className="text-gray-900">{result.weightKg} kg</strong></span>
        <span>절곡: <strong className="text-gray-900">{result.bendMode}</strong></span>
        <span>후처리: <strong className="text-gray-900">{result.surfaceType}</strong></span>
        <span>수량: <strong className="text-gray-900">{result.qty} ea</strong></span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden text-sm">
        <table className="w-full">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">항목</th>
              <th className="text-right px-4 py-2">수량/규모</th>
              <th className="text-right px-4 py-2">단가</th>
              <th className="text-right px-4 py-2">금액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.label} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-700">{r.label}</td>
                <td className="px-4 py-2 text-right text-gray-500">{r.qty}</td>
                <td className="px-4 py-2 text-right text-gray-500">{r.unit}</td>
                <td className="px-4 py-2 text-right font-medium">{KRW(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-200">
            <tr className="text-gray-600 text-xs">
              <td colSpan={3} className="px-4 py-2 text-right">소계</td>
              <td className="px-4 py-2 text-right font-semibold text-gray-900">{KRW(b.소계)}</td>
            </tr>
            <tr className="text-gray-600 text-xs">
              <td colSpan={3} className="px-4 py-2 text-right">관리비 ({d.mgmtRatePct.toFixed(0)}%)</td>
              <td className="px-4 py-2 text-right">{KRW(b.관리비)}</td>
            </tr>
            <tr className="text-gray-600 text-xs">
              <td colSpan={3} className="px-4 py-2 text-right">마진 ({d.marginRatePct.toFixed(0)}%)</td>
              <td className="px-4 py-2 text-right">{KRW(b.마진)}</td>
            </tr>
            <tr className="bg-gray-50 font-semibold">
              <td colSpan={3} className="px-4 py-3 text-right">단가</td>
              <td className="px-4 py-3 text-right text-base">{KRW(result.unitPrice)}</td>
            </tr>
            <tr className="bg-gray-900 text-white font-bold">
              <td colSpan={3} className="px-4 py-3 text-right">합계 (× {result.qty} ea)</td>
              <td className="px-4 py-3 text-right text-lg">{KRW(result.totalPrice)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {result.warnings.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          {result.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      <div className="flex gap-3 print:hidden">
        <button onClick={onBack}
          className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
          ← 새 견적
        </button>
        <button onClick={onPrint}
          className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors">
          PDF 다운로드
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 라우트 컴포넌트 — sessionStorage 분기
// ---------------------------------------------------------------------------

export default function ResultPage() {
  const router = useRouter()
  const [singleResult, setSingleResult] = useState<EstimateResult | null>(null)
  const [multiResult,  setMultiResult]  = useState<MultiPartEstimateResult | null>(null)

  useEffect(() => {
    const rawMulti = sessionStorage.getItem('estimateMultiResult')
    if (rawMulti) {
      try { setMultiResult(JSON.parse(rawMulti)); return } catch {}
    }
    const raw = sessionStorage.getItem('estimateResult')
    if (!raw) { router.replace('/'); return }
    try { setSingleResult(JSON.parse(raw)) } catch { router.replace('/') }
  }, [router])

  if (!singleResult && !multiResult) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">로딩 중...</div>
  }

  if (multiResult) {
    return (
      <MultiPartView
        result={multiResult}
        onBack={() => router.push('/viewer')}
        onPrint={() => window.print()}
      />
    )
  }

  return (
    <SinglePartView
      result={singleResult!}
      onBack={() => router.push('/')}
      onPrint={() => window.print()}
    />
  )
}
