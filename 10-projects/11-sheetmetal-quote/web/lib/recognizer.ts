/**
 * DXF 도면 영역 인식 엔진
 * parse_simpleline.py 로직을 TypeScript로 이식.
 * X_SPLIT 하드코딩 제거 — 드래그 박스 좌표를 경계로 사용.
 */

import type { DrawEntity, DrawLine, DrawText, DrawInsert } from './dxf-viewer'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RecognizedPart {
  cutMethod:   string   // 재단방식 레이어 이름 (레이저/복합기/NCT/절단)
  labelText:   string   // 재단 라벨 텍스트
  bendDown:    number   // 굽힘선아래로
  bendUp:      number   // 굽힘선위로
  bendTotal:   number
  cutLengthM:  number   // 전개도 외형선 합 (m), 절곡 없으면 0
  material:    string
  thickness:   string
  qty:         string
}

export interface PipeRow {
  no:       string
  spec:     string
  material: string
  qty:      string
  length:   string
  angle:    string
}

export interface RecognitionResult {
  parts:            RecognizedPart[]
  totalBends:       number
  unassignedBends:  number
  specialFeatures:  Record<string, number>   // 블록명 분류 → 개수
  pipes:            PipeRow[]               // 파이프 절단 표
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

function entityCenter(e: DrawEntity): { x: number; y: number } | null {
  switch (e.kind) {
    case 'line':     return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 }
    case 'arc':
    case 'circle':   return { x: e.cx, y: e.cy }
    case 'text':
    case 'insert':   return { x: e.x, y: e.y }
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
// Layer constants
// ---------------------------------------------------------------------------

const CUT_LAYERS  = new Set(['레이저', '복합기', 'NCT', '절단'])
const BEND_DOWN   = '굽힘선아래로'
const BEND_UP     = '굽힘선위로'
const OUTLINE_LYR = '외형선'
const NOTE_LAYER  = 'SW_노트'

const MAT_RE   = /\b(SPCC|SUS304|SUS316|AL5052|AL6061|SECC|SGCC|SS400|HR|AL)\b/i
const THICK_RE = /(\d+(?:\.\d+)?)\s*t\b/i
const QTY_RE   = /(\d+)\s*(?:ea|pcs?|개)/i

// ---------------------------------------------------------------------------
// Special processing block classifier (parse_simpleline.py 이식)
// ---------------------------------------------------------------------------

function classifyBlock(name: string): string | null {
  const n = name.toUpperCase()
  if (n.includes('SW_') || n.includes('CENTERMARK') || n.includes('NOTE_')) return null
  if (name.startsWith('A$C') || name.startsWith('*')) return null
  if (n.includes('BUR') && n.includes('UP'))  return '버링업'
  if (n.includes('EM')  && n.includes('UP'))  return '엠보싱업'
  if (name.includes('버링탭'))                 return '버링탭'
  if (n.includes('TAP'))                      return '탭가공'
  if (name.includes('자석'))                   return '자석부착'
  if (n.includes('RUBBER'))                   return '러버'
  return null   // _unknown 제외 (표시 노이즈 방지)
}

// ---------------------------------------------------------------------------
// Pipe cutting table parser (parse_simpleline.py::_parse_pipe_table 이식)
// ---------------------------------------------------------------------------

function parsePipeTable(texts: Array<{ x: number; y: number; txt: string }>): PipeRow[] {
  const headers = texts.filter(t => t.txt.trim() === '품번')
  const rows: PipeRow[] = []

  for (const hdr of headers) {
    const { x: hx, y: hy } = hdr
    // 헤더 바로 아래(DXF Y-up: hy-300 < y < hy) 동일 X대 텍스트 수집
    const rowMap = new Map<number, Array<{ x: number; txt: string }>>()
    for (const t of texts) {
      if (Math.abs(t.x - hx) < 1500 && hy - 300 < t.y && t.y < hy) {
        const key = Math.round(t.y / 30)
        if (!rowMap.has(key)) rowMap.set(key, [])
        rowMap.get(key)!.push({ x: t.x, txt: t.txt })
      }
    }
    // 내림차순(위→아래) 정렬, 각 행 X순 정렬 후 파싱
    const sortedKeys = [...rowMap.keys()].sort((a, b) => b - a)
    for (const k of sortedKeys) {
      const cols = rowMap.get(k)!.sort((a, b) => a.x - b.x).map(c => c.txt.trim())
      if (cols.length >= 5 && /^\d+$/.test(cols[0])) {
        rows.push({
          no:       cols[0],
          spec:     cols[1] ?? '',
          material: cols[2] ?? '',
          qty:      cols[3] ?? '',
          length:   cols[4] ?? '',
          angle:    cols[5] ?? '',
        })
      }
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function recognizeBox(
  sel: { x1: number; y1: number; x2: number; y2: number },
  entities: DrawEntity[],
): RecognitionResult {

  const box = toBbox(sel.x1, sel.y1, sel.x2, sel.y2)

  const inBox = entities.filter(e => {
    const c = entityCenter(e)
    return c ? inBbox(c.x, c.y, box) : false
  })

  // ── 1. 세부부품 라벨 ─────────────────────────────────────────────────────
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
    .sort((a, b) => b.y - a.y)

  // ── 2. 절곡 → Y최근접 라벨 배정 ─────────────────────────────────────────
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

  // ── 3. 재단길이 = 절곡 바운딩박스 안 외형선 합 ──────────────────────────
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
    lbl.cutLengthM = Math.round(total / 10) / 100
  }

  // ── 4. SW_노트 → Y최근접 라벨에 재질/두께/수량 ───────────────────────────
  // SW_노트는 도면 우측 제목란에 위치해 박스에서 멀 수 있음.
  // 200mm 여유 박스 내 먼저 탐색하고, 없으면 전체 도면에서 검색(단품 도면 대응).
  const margin = 200
  const wide: Bbox = {
    minX: box.minX - margin, maxX: box.maxX + margin,
    minY: box.minY - margin, maxY: box.maxY + margin,
  }
  const notesNear = entities.filter(
    (e): e is DrawText => e.kind === 'text' && e.layer === NOTE_LAYER && inBbox(e.x, e.y, wide),
  )
  const notes = notesNear.length > 0
    ? notesNear
    : entities.filter((e): e is DrawText => e.kind === 'text' && e.layer === NOTE_LAYER)

  for (const note of notes) {
    if (!labels.length) break
    let best = labels[0], bestDist = Math.abs(note.y - best.y)
    for (let i = 1; i < labels.length; i++) {
      const d = Math.abs(note.y - labels[i].y)
      if (d < bestDist) { bestDist = d; best = labels[i] }
    }
    const txt = note.txt
    const matM   = MAT_RE.exec(txt)
    const thickM = THICK_RE.exec(txt)
    const qtyM   = QTY_RE.exec(txt)
    if (matM   && !best.material)  best.material  = matM[1].toUpperCase()
    if (thickM && !best.thickness) best.thickness = `${thickM[1]}t`
    if (qtyM   && !best.qty)       best.qty       = `${qtyM[1]}ea`
  }

  // ── 단품 폴백: 재단 라벨 없고 절곡/외형선이 있으면 단일 부품으로 처리 ────
  // 단품 도면(레이저/복합기/NCT/절단 텍스트 없음)에서 박스 전체를 1개 부품으로.
  if (labels.length === 0) {
    const hasBend    = inBox.some(e => e.kind === 'line' && (e.layer === BEND_DOWN || e.layer === BEND_UP))
    const hasOutline = inBox.some(e => e.layer === OUTLINE_LYR && e.kind !== 'text')
    if (hasBend || hasOutline) {
      // 라벨 Y를 박스 중앙으로 설정 (SW_노트 Y근접 배정은 단일 라벨이므로 무조건 배정됨)
      const fakeLbl: CutLabel = {
        cutMethod: '', text: '', x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2,
        bendDown: 0, bendUp: 0, bendLines: [],
        cutLengthM: 0, material: '', thickness: '', qty: '',
      }
      labels.push(fakeLbl)

      // 미배정 절곡을 단품에 배정
      for (const e of inBox) {
        if (e.kind !== 'line') continue
        if (e.layer === BEND_DOWN) { fakeLbl.bendDown++; fakeLbl.bendLines.push(e as DrawLine); unassigned-- }
        if (e.layer === BEND_UP)   { fakeLbl.bendUp++;   fakeLbl.bendLines.push(e as DrawLine); unassigned-- }
      }
      unassigned = Math.max(0, unassigned)

      // 재단길이 = 박스 안 외형선 전체 합 (단품이므로 절곡 바운딩박스 불필요)
      let totalLen = 0
      for (const e of outline) totalLen += entityLength(e)
      fakeLbl.cutLengthM = Math.round(totalLen / 10) / 100

      // SW_노트 재배정 (라벨이 이제 생겼으므로)
      for (const note of notes) {
        const txt = note.txt
        const matM   = MAT_RE.exec(txt)
        const thickM = THICK_RE.exec(txt)
        const qtyM   = QTY_RE.exec(txt)
        if (matM   && !fakeLbl.material)  fakeLbl.material  = matM[1].toUpperCase()
        if (thickM && !fakeLbl.thickness) fakeLbl.thickness = `${thickM[1]}t`
        if (qtyM   && !fakeLbl.qty)       fakeLbl.qty       = `${qtyM[1]}ea`
      }
    }
  }

  // ── 5. 특수가공 (INSERT 블록 이름 분류) ─────────────────────────────────
  const specialFeatures: Record<string, number> = {}
  for (const e of inBox) {
    if (e.kind !== 'insert') continue
    const cat = classifyBlock((e as DrawInsert).name)
    if (cat) specialFeatures[cat] = (specialFeatures[cat] ?? 0) + 1
  }

  // ── 6. 파이프 절단 표 (layer 0 텍스트, 확장 박스 내) ────────────────────
  const pipeMargin = 2000
  const pipeBox: Bbox = {
    minX: box.minX - pipeMargin, maxX: box.maxX + pipeMargin,
    minY: box.minY - pipeMargin, maxY: box.maxY + pipeMargin,
  }
  const layer0Texts = entities
    .filter((e): e is DrawText =>
      e.kind === 'text' && e.layer === '0' && inBbox(e.x, e.y, pipeBox))
    .map(e => ({ x: e.x, y: e.y, txt: e.txt }))

  const pipes = parsePipeTable(layer0Texts)

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

  return {
    parts,
    totalBends:      parts.reduce((s, p) => s + p.bendTotal, 0) + unassigned,
    unassignedBends: unassigned,
    specialFeatures,
    pipes,
  }
}
