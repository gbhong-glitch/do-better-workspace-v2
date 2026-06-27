/**
 * DXF 도면 영역 인식 엔진
 * parse_simpleline.py 로직을 TypeScript로 이식.
 * X_SPLIT 하드코딩 제거 — 드래그 박스 좌표를 경계로 사용.
 */

import type { DrawEntity, DrawLine, DrawText } from './dxf-viewer'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RecognizedPart {
  cutMethod:   string   // 재단방식 (레이어 이름: 레이저/복합기/NCT/절단)
  labelText:   string   // 재단 라벨 텍스트 (부품 번호 등)
  bendDown:    number   // 굽힘선아래로 LINE 수
  bendUp:      number   // 굽힘선위로 LINE 수
  bendTotal:   number
  cutLengthM:  number   // 전개도 영역 외형선 합 (m), 절곡 없으면 0
  material:    string   // SW_노트에서 추출 (SPCC, SUS 등)
  thickness:   string   // SW_노트에서 추출 (1.0t 등)
  qty:         string   // SW_노트에서 추출 (2ea 등)
}

export interface RecognitionResult {
  parts:           RecognizedPart[]
  totalBends:      number   // 박스 안 전체 절곡 수
  unassignedBends: number   // 라벨이 없어 배정 못한 절곡
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface Bbox { minX: number; minY: number; maxX: number; maxY: number }

function toBbox(x1: number, y1: number, x2: number, y2: number): Bbox {
  return { minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
           minY: Math.min(y1, y2), maxY: Math.max(y1, y2) }
}

function inBbox(x: number, y: number, b: Bbox): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY
}

// 엔티티의 대표 점 (공간 필터링 기준)
function entityCenter(e: DrawEntity): { x: number; y: number } | null {
  switch (e.kind) {
    case 'line':     return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 }
    case 'arc':
    case 'circle':   return { x: e.cx, y: e.cy }
    case 'text':     return { x: e.x, y: e.y }
    case 'polyline':
    case 'spline': {
      const n = e.pts.length >> 1
      if (!n) return null
      let sx = 0, sy = 0
      for (let i = 0; i < e.pts.length; i += 2) { sx += e.pts[i]; sy += e.pts[i + 1] }
      return { x: sx / n, y: sy / n }
    }
  }
}

// 외형선 길이 (mm 단위)
function entityLength(e: DrawEntity): number {
  switch (e.kind) {
    case 'line':   return Math.hypot(e.x2 - e.x1, e.y2 - e.y1)
    case 'circle': return 2 * Math.PI * e.r
    case 'arc': {
      let span = (e.ea - e.sa + 360) % 360
      if (span < 0.001) span = 360
      return e.r * span * Math.PI / 180
    }
    case 'polyline':
    case 'spline': {
      let t = 0
      for (let i = 0; i + 3 < e.pts.length; i += 2)
        t += Math.hypot(e.pts[i + 2] - e.pts[i], e.pts[i + 3] - e.pts[i + 1])
      if (e.kind === 'polyline' && e.closed && e.pts.length >= 4) {
        const n = e.pts.length
        t += Math.hypot(e.pts[0] - e.pts[n - 2], e.pts[1] - e.pts[n - 1])
      }
      return t
    }
    default: return 0
  }
}

// ---------------------------------------------------------------------------
// Layer constants (parse_simpleline.py 동일)
// ---------------------------------------------------------------------------

const CUT_LAYERS  = new Set(['레이저', '복합기', 'NCT', '절단'])
const BEND_DOWN   = '굽힘선아래로'
const BEND_UP     = '굽힘선위로'
const OUTLINE_LYR = '외형선'
const NOTE_LAYER  = 'SW_노트'

// SW_노트 파싱 패턴
const MAT_RE   = /\b(SPCC|SUS304|SUS316|AL5052|AL6061|SECC|SGCC|SS400|HR|AL)\b/i
const THICK_RE = /(\d+(?:\.\d+)?)\s*t\b/i
const QTY_RE   = /(\d+)\s*(?:ea|pcs?|개)/i

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function recognizeBox(
  sel: { x1: number; y1: number; x2: number; y2: number },
  entities: DrawEntity[],
): RecognitionResult {

  const box = toBbox(sel.x1, sel.y1, sel.x2, sel.y2)

  // 박스 안 엔티티 필터
  const inBox = entities.filter(e => {
    const c = entityCenter(e)
    return c ? inBbox(c.x, c.y, box) : false
  })

  // ── 1. 세부부품 라벨 (재단방식 레이어의 TEXT) ─────────────────────────────
  interface CutLabel {
    cutMethod: string; text: string; x: number; y: number
    bendDown: number; bendUp: number; bendLines: DrawLine[]
    cutLengthM: number; material: string; thickness: string; qty: string
  }

  const labels: CutLabel[] = inBox
    .filter((e): e is DrawText => e.kind === 'text' && CUT_LAYERS.has(e.layer))
    .map(e => ({
      cutMethod: e.layer, text: e.txt, x: e.x, y: e.y,
      bendDown: 0, bendUp: 0, bendLines: [],
      cutLengthM: 0, material: '', thickness: '', qty: '',
    }))
    .sort((a, b) => b.y - a.y)  // DXF Y내림차순 = 도면 위→아래

  // ── 2. 절곡 LINE → Y최근접 라벨에 배정 ──────────────────────────────────
  let unassigned = 0

  for (const e of inBox) {
    if (e.kind !== 'line') continue
    const isDown = e.layer === BEND_DOWN
    const isUp   = e.layer === BEND_UP
    if (!isDown && !isUp) continue

    if (!labels.length) { unassigned++; continue }

    const my = (e.y1 + e.y2) / 2
    let best = labels[0], bestDist = Math.abs(my - best.y)
    for (let i = 1; i < labels.length; i++) {
      const d = Math.abs(my - labels[i].y)
      if (d < bestDist) { bestDist = d; best = labels[i] }
    }
    if (isDown) best.bendDown++; else best.bendUp++
    best.bendLines.push(e as DrawLine)
  }

  // ── 3. 재단길이 = 절곡 바운딩박스 안 외형선 합 ───────────────────────────
  const outline = inBox.filter(e => e.layer === OUTLINE_LYR && e.kind !== 'text')

  for (const lbl of labels) {
    if (!lbl.bendLines.length) continue
    const xs: number[] = [], ys: number[] = []
    for (const bl of lbl.bendLines) { xs.push(bl.x1, bl.x2); ys.push(bl.y1, bl.y2) }
    const pad = 50
    const bb: Bbox = {
      minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad,
      minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad,
    }
    let total = 0
    for (const e of outline) {
      const c = entityCenter(e)
      if (c && inBbox(c.x, c.y, bb)) total += entityLength(e)
    }
    lbl.cutLengthM = Math.round(total / 10) / 100  // mm → m (소수 2자리)
  }

  // ── 4. SW_노트 → Y최근접 라벨에 재질/두께/수량 배정 ─────────────────────
  // 박스 바깥 200mm 여유 (노트가 경계 바로 밖에 있는 경우 대비)
  const margin = 200
  const wideBox: Bbox = {
    minX: box.minX - margin, maxX: box.maxX + margin,
    minY: box.minY - margin, maxY: box.maxY + margin,
  }

  const notes = entities.filter(
    (e): e is DrawText =>
      e.kind === 'text' && e.layer === NOTE_LAYER && inBbox(e.x, e.y, wideBox),
  )

  for (const note of notes) {
    if (!labels.length) break
    const txt = note.txt
    let best = labels[0], bestDist = Math.abs(note.y - best.y)
    for (let i = 1; i < labels.length; i++) {
      const d = Math.abs(note.y - labels[i].y)
      if (d < bestDist) { bestDist = d; best = labels[i] }
    }
    const matM   = MAT_RE.exec(txt)
    const thickM = THICK_RE.exec(txt)
    const qtyM   = QTY_RE.exec(txt)
    if (matM   && !best.material)  best.material  = matM[1].toUpperCase()
    if (thickM && !best.thickness) best.thickness = `${thickM[1]}t`
    if (qtyM   && !best.qty)       best.qty       = `${qtyM[1]}ea`
  }

  // ── 결과 조립 ─────────────────────────────────────────────────────────────
  const parts: RecognizedPart[] = labels.map(l => ({
    cutMethod:  l.cutMethod,
    labelText:  l.text,
    bendDown:   l.bendDown,
    bendUp:     l.bendUp,
    bendTotal:  l.bendDown + l.bendUp,
    cutLengthM: l.cutLengthM,
    material:   l.material,
    thickness:  l.thickness,
    qty:        l.qty,
  }))

  const totalBends = parts.reduce((s, p) => s + p.bendTotal, 0) + unassigned

  return { parts, totalBends, unassignedBends: unassigned }
}
