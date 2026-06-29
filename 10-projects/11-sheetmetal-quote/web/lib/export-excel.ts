import * as XLSX from 'xlsx'
import type { MultiPartEstimateResult } from './estimate'

export function exportEstimateToExcel(result: MultiPartEstimateResult): void {
  const wb = XLSX.utils.book_new()

  // --- 요약 시트 ---
  const summaryData = [
    ['조립체명', '부품수', '소계(원)'],
    ...result.assemblies.map(asm => [asm.assemblyName, asm.parts.length, asm.subtotal]),
    ['', '', ''],
    ['전체 합계', '', result.grandTotal],
  ]
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
  summaryWs['!cols'] = [{ wch: 20 }, { wch: 8 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, summaryWs, '요약')

  // --- 조립체별 시트 ---
  const HEADERS = ['품명', '재질', '두께(t)', '곡수', '재단(m)', '수량', '재료비', '절단비', '절곡비', '후처리비', '단가', '금액']
  for (const asm of result.assemblies) {
    const rows = asm.parts.map(p => [
      p.partName,
      p.material,
      p.thicknessMm ?? '',
      p.detail.bends,
      p.detail.cutM,
      p.qty,
      p.breakdown.재료비,
      p.breakdown.절단비,
      p.breakdown.절곡비,
      p.breakdown.후처리비,
      p.unitPrice,
      p.totalPrice,
    ])
    const subtotalRow = ['소계', '', '', '', '', '', '', '', '', '', '', asm.subtotal]
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows, subtotalRow])
    ws['!cols'] = [
      { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 8 },
      { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    ]
    // Excel sheet name: max 31 chars, no special chars
    const sheetName = asm.assemblyName.replace(/[\\/?*[\]:]/g, '_').slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  const today = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `estimate_${today}.xlsx`)
}
