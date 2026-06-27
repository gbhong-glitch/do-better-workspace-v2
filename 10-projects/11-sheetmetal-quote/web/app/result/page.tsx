'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EstimateResult } from '@/lib/estimate'

const KRW = (n: number) => n.toLocaleString('ko-KR') + ' 원'

export default function ResultPage() {
  const router = useRouter()
  const [result, setResult] = useState<EstimateResult | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('estimateResult')
    if (!raw) { router.replace('/'); return }
    try { setResult(JSON.parse(raw)) } catch { router.replace('/') }
  }, [router])

  if (!result) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">로딩 중...</div>
  }

  const { breakdown: b, detail: d } = result

  const rows: Array<{ label: string; qty: string; unit: string; amount: number }> = [
    {
      label: '재료비',
      qty: `${d.weightKg} kg`,
      unit: `${d.matUnitPerKg.toLocaleString()} 원/kg`,
      amount: b.재료비,
    },
    {
      label: '절단비',
      qty: `${d.cutM} m`,
      unit: `${d.cutUnitPerM.toLocaleString()} 원/m`,
      amount: b.절단비,
    },
    {
      label: '피어싱비',
      qty: `${d.holes} 개`,
      unit: `${d.pierceUnit.toLocaleString()} 원/개`,
      amount: b.피어싱비,
    },
    {
      label: '절곡(셋업)',
      qty: `${d.bends} 회`,
      unit: `${d.bendSetupUnit.toLocaleString()} 원/회`,
      amount: d.bendSetupCost,
    },
    {
      label: '절곡(길이)',
      qty: `${d.bendLengthM} m`,
      unit: `${d.bendPerMUnit.toLocaleString()} 원/m`,
      amount: d.bendLengthCost,
    },
    ...(b.특수가공비 > 0
      ? [{ label: '특수가공비', qty: '-', unit: '-', amount: b.특수가공비 }]
      : []),
    {
      label: '후처리비',
      qty: `${d.surfaceAreaM2} m²`,
      unit: `${d.surfUnitPerM2.toLocaleString()} 원/m²`,
      amount: b.후처리비,
    },
  ]

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
      {/* 헤더 정보 */}
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

      {/* 원가 분해 테이블 */}
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

      {/* 경고 */}
      {result.warnings.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          {result.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-3">
        <button
          onClick={() => router.push('/')}
          className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          ← 새 견적
        </button>
        <button
          disabled
          className="flex-1 bg-gray-200 text-gray-400 py-2.5 rounded-lg font-medium cursor-not-allowed"
          title="PDF 다운로드 준비 중"
        >
          PDF 다운로드
        </button>
      </div>
    </div>
  )
}
