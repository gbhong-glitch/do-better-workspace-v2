/**
 * DXF 파서 대조 테스트
 * 검증값(Python PoC 기준):
 *   Drawing2.dxf    : 재질=SPCC, 두께=1t, 절곡=8회, 구멍=4개
 *   하부장C 프레임판-01.dxf: 재질=SPCC, 두께=1t, 절곡=3회, 구멍=0개
 */

import * as path from 'path'
import { parseDxf, ParsedDxf } from '../lib/dxf-parser'

const SAMPLES_DIR = path.resolve(__dirname, '../../samples')

interface Expected {
  material: string
  thicknessMm: number
  bendTotal: number
  holeCount: number
}

const TESTS: Array<{ file: string; expected: Expected }> = [
  {
    file: 'Drawing2.dxf',
    expected: { material: 'SPCC', thicknessMm: 1, bendTotal: 8, holeCount: 4 },
  },
  {
    file: '하부장C 프레임판-01.dxf',
    expected: { material: 'SPCC', thicknessMm: 1, bendTotal: 3, holeCount: 0 },
  },
]

function check(label: string, actual: unknown, expect: unknown): boolean {
  const ok = actual === expect
  const mark = ok ? '✓' : '✗'
  const note = ok ? '' : `  ← expected: ${expect}`
  console.log(`    ${mark} ${label}: ${actual}${note}`)
  return ok
}

let allPassed = true

for (const { file, expected } of TESTS) {
  const filePath = path.join(SAMPLES_DIR, file)
  const r: ParsedDxf = parseDxf(filePath)

  if (r.error) {
    console.error(`\n❌ ${file}`)
    console.error(`    ERROR: ${r.error}`)
    allPassed = false
    continue
  }

  const results = [
    check('material',     r.material,    expected.material),
    check('thicknessMm',  r.thicknessMm, expected.thicknessMm),
    check('bendTotal',    r.bendTotal,   expected.bendTotal),
    check('holeCount',    r.holeCount,   expected.holeCount),
  ]

  const passed = results.every(Boolean)
  console.log(`\n${passed ? '✅' : '❌'} ${file}`)

  // Re-print checks under the file header (already printed above — restructure)
  if (!passed) allPassed = false

  // Extra info
  console.log(`    standard=${r.standard}  weight=${r.weightKg}kg[${r.weightSource}]  qty=${r.qty}`)
  console.log(`    cutLength=${r.cutLengthMm}mm  bendLength=${r.bendLengthMm}mm`)
}

console.log(`\n${'─'.repeat(50)}`)
console.log(allPassed ? '✅  ALL PASSED' : '❌  SOME FAILED')
process.exit(allPassed ? 0 : 1)
