/**
 * P4 3단계: 펼침여유 계산 + 면 번호/절곡 순서 로직
 *
 * 역할:
 *   1. 외형선에서 평판(전개도) 경계 bbox 결정
 *   2. 각 절곡선의 L값 계산 (평판 기준 edge→굽힘선 거리)
 *   3. 절곡선을 4개 면(top/bottom/left/right)에 배정
 *   4. PRD 규칙(짧은 면 먼저, 내측→외측) 적용해 절곡 순서 결정
 */

import type { DxfBendData, BendGroup, OutlineLine } from './dxf-bend-parser'

// ── Types ─────────────────────────────────────────────────────────────

export interface BendStep {
  tag:           string | null
  direction:     'down' | 'up'
  angleDeg:      number
  innerRadiusMm: number
  lMm:           number    // 평판 기준 edge→굽힘선 거리 (P4의 BEN L 값)
  totalLengthMm: number    // 굽힘선 전체 길이 (BL 계산용)
}

export interface FaceSequence {
  faceNo:  number                        // P4 ROT S 번호 (1~4)
  side:    'top' | 'bottom' | 'left' | 'right'
  bends:   BendStep[]                    // 이 면의 절곡들, 내측→외측 순
  blMm:    number                        // ROT BL 값
  maxLMm:  number                        // 이 면의 최대 L (면 높이 판단용)
}

export interface BendSequence {
  faces:         FaceSequence[]
  flatWidthMm:   number   // 전개도 X 폭 (V 방향 full span)
  flatHeightMm:  number   // 전개도 Z 높이 (H 방향 full span)
  warnings:      string[]
}

// ── 내부: 평판 경계 bbox 계산 ─────────────────────────────────────────

interface FlatBbox { minX: number; maxX: number; minY: number; maxY: number }

/**
 * 외형선 LINE들에서 절곡선 영역 바깥의 경계 선을 찾아 평판 bbox 결정.
 *
 * 전략:
 *   - 수평선(H): 절곡선의 최소Y보다 낮은 것 중 가장 높은 것 → bottom edge
 *               절곡선의 최대Y보다 높은 것 중 가장 낮은 것 → top edge
 *   - 수직선(V): 절곡선의 최소X보다 낮은 것 중 가장 높은 것 → left edge
 *               절곡선의 최대X보다 높은 것 중 가장 낮은 것 → right edge
 */
function computeFlatBbox(
  outlineLines: OutlineLine[],
  bendGroups: BendGroup[],
): FlatBbox {
  const hBendYs = bendGroups.filter(g => g.orientation === 'H').map(g => g.midY)
  const vBendXs = bendGroups.filter(g => g.orientation === 'V').map(g => g.midX)

  // 절곡선이 없으면 외형선 전체 bbox
  if (!hBendYs.length && !vBendXs.length) {
    const xs = outlineLines.flatMap(l => [l.x1, l.x2])
    const ys = outlineLines.flatMap(l => [l.y1, l.y2])
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
  }

  const bendMinY = Math.min(...(hBendYs.length ? hBendYs : [0]))
  const bendMaxY = Math.max(...(hBendYs.length ? hBendYs : [0]))
  const bendMinX = Math.min(...(vBendXs.length ? vBendXs : [0]))
  const bendMaxX = Math.max(...(vBendXs.length ? vBendXs : [0]))

  // 수평/수직 외형선 분류 (기울기 0.5도 이내)
  const ANGLE_TOL = 0.5
  const hLines = outlineLines.filter(l => Math.abs(l.y2 - l.y1) < ANGLE_TOL && l.length > 20)
  const vLines = outlineLines.filter(l => Math.abs(l.x2 - l.x1) < ANGLE_TOL && l.length > 20)

  // H lines → top/bottom edge
  const hLineYs = hLines.map(l => (l.y1 + l.y2) / 2)
  const belowBend = hLineYs.filter(y => y < bendMinY)
  const aboveBend = hLineYs.filter(y => y > bendMaxY)
  const edgeMinY = belowBend.length ? Math.max(...belowBend) : bendMinY - 15
  const edgeMaxY = aboveBend.length ? Math.min(...aboveBend) : bendMaxY + 15

  // V lines → left/right edge
  const vLineXs = vLines.map(l => (l.x1 + l.x2) / 2)
  const leftOfBend  = vLineXs.filter(x => x < bendMinX)
  const rightOfBend = vLineXs.filter(x => x > bendMaxX)
  const edgeMinX = leftOfBend.length  ? Math.max(...leftOfBend)  : bendMinX - 15
  const edgeMaxX = rightOfBend.length ? Math.min(...rightOfBend) : bendMaxX + 15

  return {
    minX: Math.round(edgeMinX * 10) / 10,
    maxX: Math.round(edgeMaxX * 10) / 10,
    minY: Math.round(edgeMinY * 10) / 10,
    maxY: Math.round(edgeMaxY * 10) / 10,
  }
}

// ── 내부: 각 절곡 → L값 + 면 배정 ──────────────────────────────────

type Side = 'top' | 'bottom' | 'left' | 'right'

interface GroupWithL {
  group: BendGroup
  lMm:  number
  side: Side
}

function assignLAndSide(bendGroups: BendGroup[], bbox: FlatBbox): GroupWithL[] {
  const cx = (bbox.minX + bbox.maxX) / 2
  const cy = (bbox.minY + bbox.maxY) / 2

  return bendGroups.map(g => {
    let lMm: number
    let side: Side

    if (g.orientation === 'H') {
      // 수평 굽힘선: top 또는 bottom 면
      const distToTop    = bbox.maxY - g.midY
      const distToBottom = g.midY   - bbox.minY
      if (g.midY >= cy) {
        side = 'top';    lMm = distToTop
      } else {
        side = 'bottom'; lMm = distToBottom
      }
    } else {
      // 수직 굽힘선: left 또는 right 면
      const distToRight = bbox.maxX - g.midX
      const distToLeft  = g.midX   - bbox.minX
      if (g.midX >= cx) {
        side = 'right'; lMm = distToRight
      } else {
        side = 'left';  lMm = distToLeft
      }
    }

    return { group: g, lMm: Math.round(lMm * 10) / 10, side }
  })
}

// ── 내부: 면 그룹핑 + 순서 결정 ──────────────────────────────────────

/**
 * PRD 2.3 절곡 순서 규칙:
 *   1. 짧은 면(최대 L이 작은 면) 먼저
 *   2. 같은 면 안에서 내측(L 큰 것) → 외측(L 작은 것) 순
 *      (P4는 edge에서 먼 곳부터 먼저 접음)
 */
function buildFaceSequences(grouped: GroupWithL[]): FaceSequence[] {
  const sideMap = new Map<Side, GroupWithL[]>()
  for (const item of grouped) {
    if (!sideMap.has(item.side)) sideMap.set(item.side, [])
    sideMap.get(item.side)!.push(item)
  }

  const unsorted: Omit<FaceSequence, 'faceNo'>[] = []

  for (const [side, items] of sideMap) {
    // 같은 면 내 절곡 순서: L 내림차순 (내측 먼저)
    const sortedItems = [...items].sort((a, b) => b.lMm - a.lMm)
    const maxLMm = Math.max(...items.map(i => i.lMm))

    // BL = 이 면 굽힘선들 중 가장 긴 것 (blade length 기준)
    const blMm = Math.max(...items.map(i => i.group.totalLengthMm))

    unsorted.push({
      side,
      bends: sortedItems.map(item => ({
        tag:           item.group.tag,
        direction:     item.group.direction,
        angleDeg:      item.group.angleDeg,
        innerRadiusMm: item.group.innerRadiusMm,
        lMm:           item.lMm,
        totalLengthMm: item.group.totalLengthMm,
      })),
      blMm,
      maxLMm,
    })
  }

  // 면 순서: maxLMm 오름차순 (짧은 면 먼저)
  // 같은 maxLMm이면 orientation 기준 (H → V)
  unsorted.sort((a, b) => a.maxLMm - b.maxLMm)

  // faceNo 1부터 부여
  return unsorted.map((f, i) => ({ ...f, faceNo: i + 1 }))
}

// ── 메인 ─────────────────────────────────────────────────────────────

export function computeBendSequence(data: DxfBendData): BendSequence {
  const warnings: string[] = [...data.warnings]

  if (!data.bendGroups.length) {
    warnings.push('절곡선 그룹이 없습니다.')
    return { faces: [], flatWidthMm: 0, flatHeightMm: 0, warnings }
  }

  // 1. 평판 bbox
  const bbox = computeFlatBbox(data.outlineLines, data.bendGroups)

  // 2. L값 + 면 배정
  const grouped = assignLAndSide(data.bendGroups, bbox)

  // 3. 면 그룹핑 + 순서
  const faces = buildFaceSequences(grouped)

  const flatWidthMm  = Math.round((bbox.maxX - bbox.minX) * 10) / 10
  const flatHeightMm = Math.round((bbox.maxY - bbox.minY) * 10) / 10

  return { faces, flatWidthMm, flatHeightMm, warnings }
}
