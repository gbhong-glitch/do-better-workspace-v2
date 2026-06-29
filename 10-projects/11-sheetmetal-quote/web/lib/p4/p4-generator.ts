/**
 * P4 4단계: BendSequence → P4 텍스트 생성기
 *
 * 예제 21개 분석 기반 규칙:
 *   - COD / DIM / REF / MCM / POS / ROT+BEN 반복 / END 순서
 *   - BEN-: = 아래로(down), BEN: = 위로(up)
 *   - 90° 아닌 경우만 A 각도 추가
 *   - BL ≈ finished_X - 7mm (기계 마진)
 *   - CRLF 줄바꿈 (ASCII P4 파일 규격)
 */

import type { BendSequence, BendStep } from './bend-sequence'

// ── Types ─────────────────────────────────────────────────────────────

export interface P4GeneratorInput {
  partName:     string       // COD 부품코드 (파일명에서)
  material:     string       // 재질 (AL계열이면 P 비중 추가)
  thicknessMm:  number       // 판 두께 → DIM S
  finishedXMm:  number       // 완성품 X (길이 방향) → DIM X
  finishedZMm:  number       // 완성품 Z (폭 방향)   → DIM Z
  bendSequence: BendSequence
}

// ── AL 비중 테이블 ─────────────────────────────────────────────────────

const AL_DENSITY: Record<string, number> = {
  AL1100: 2.71, AL3003: 2.73, AL5052: 2.68, AL5083: 2.66,
  AL6061: 2.70, AL6063: 2.70, AL7075: 2.81,
}

// ── 숫자 포맷 ──────────────────────────────────────────────────────────

/** L값·DIM 용: trailing zero 제거 (27.00→"27", 78.40→"78.4", 9.06→"9.06") */
function fmtNum(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/\.?0+$/, '')
}

/** BL·REF 좌표 용: 고정 소수점 */
function fmtFixed(n: number, d: number): string {
  return n.toFixed(d)
}

// ── REF 계산 ───────────────────────────────────────────────────────────

function calcRef(x: number, z: number, maxL: number): string {
  const x1 = Math.round(x / 2 * 100) / 100
  const z1 = Math.round(z / 2 * 100) / 100
  // X3 = 중심에서 최대 플랜지 L만큼 오프셋 (바텀게이지 기준점)
  const x3 = Math.round((x1 + maxL) * 100) / 100
  return (
    `REF: X1 ${fmtFixed(x1, 2)} Z1 ${fmtFixed(z1, 2)}` +
    ` X2 ${fmtFixed(x1, 2)} Z2 ${fmtFixed(z1, 2)}` +
    ` X3 ${fmtFixed(x3, 2)} BZ_BACK`
  )
}

// ── BEN 라인 ───────────────────────────────────────────────────────────

function bendLine(step: BendStep): string {
  const cmd = step.direction === 'down' ? 'BEN-:' : 'BEN:'
  const ang = step.angleDeg !== 90 ? ` A ${fmtNum(step.angleDeg)}` : ''
  return `   ${cmd} L ${fmtNum(step.lMm)}${ang}`
}

// ── 메인 ──────────────────────────────────────────────────────────────

export function generateP4(input: P4GeneratorInput): string {
  const { partName, material, thicknessMm, finishedXMm, finishedZMm, bendSequence } = input

  // 타임스탬프
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts  = `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()} ` +
              `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  // AL 비중
  const matKey    = material.toUpperCase().replace(/[-_ ]/g, '')
  const density   = AL_DENSITY[matKey] ?? (matKey.startsWith('AL') ? 2.71 : null)
  const dimDensity = density !== null ? ` P ${density}` : ''

  // BL = X - 7mm 마진 (정수 내림)
  const blMm = Math.floor(finishedXMm - 7)

  // REF X3용 최대 L
  const allL = bendSequence.faces.flatMap(f => f.bends.map(b => b.lMm))
  const maxL = allL.length ? Math.max(...allL) : 0

  const CRLF  = '\r\n'
  const lines: string[] = []

  // ── 헤더 ──
  lines.push(`; StreamBend v. 3.2.230329 - ${ts} - P4M_800_2620`)
  lines.push(`; `)
  lines.push(`COD: '${partName}'`)
  lines.push(`DIM: X ${fmtNum(finishedXMm)} Z ${fmtNum(finishedZMm)} S ${fmtFixed(thicknessMm, 3)}${dimDensity}`)
  lines.push(calcRef(finishedXMm, finishedZMm, maxL))
  lines.push(`MCM: QSU 30.00 QSD 30.00  MNP_SPEED 30.00`)
  lines.push(`POS: CENT_FUNC 1 TURN_AROUND  SPEED 60.00 CON_SPEED 60`)
  lines.push('')

  // ── ROT 블록 ──
  for (const face of bendSequence.faces) {
    lines.push(`ROT: S ${face.faceNo}  SPEED 30.00 BLX 4 BL ${fmtFixed(blMm, 2)}`)
    for (const step of face.bends) {
      lines.push(bendLine(step))
    }
    lines.push('')
  }

  // ── END ──
  lines.push(`END:  SPEED 60.00`)

  return lines.join(CRLF)
}
