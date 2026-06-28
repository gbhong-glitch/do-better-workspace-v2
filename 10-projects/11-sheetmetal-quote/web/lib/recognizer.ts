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
  partName:    string   // SW_노트 품명
  bendDown:    number   // 굽힘선아래로
  bendUp:      number   // 굽힘선위로
  bendTotal:   number
  bendLengths: number[] // 각 굽힘선 길이(mm) — tier 단가 계산용
  cutLengthM:  number   // 전개도 외형선 합 (m), 절곡 없으면 0
  widthMm:     number   // 부품 외형선 bbox 가로 (mm)
  heightMm:    number   // 부품 외형선 bbox 세로 (mm)
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
// Bend line grouping key
// (layer, 방향H/V/D, 직선좌표 2단위 반올림) → 같은 키 = 1곡
// ---------------------------------------------------------------------------

function bendKey(e: DrawLine): string {
  const dy = e.y2 - e.y1
  const dx = e.x2 - e.x1
  if (Math.abs(dy) < 0.5) {
    // 수평선: Y값으로 구분
    return `${e.layer}|H|${Math.round((e.y1 + e.y2) / 4) * 2}`
  }
  if (Math.abs(dx) < 0.5) {
    // 수직선: X값으로 구분
    return `${e.layer}|V|${Math.round((e.x1 + e.x2) / 4) * 2}`
  }
  // 사선: 중점으로 구분 (실무 사선 절곡선은 드뭄)
  return `${e.layer}|D|${Math.round((e.x1 + e.x2) / 2)}|${Math.round((e.y1 + e.y2) / 2)}`
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
  label?: string,
): RecognitionResult {
  const TAG = label ? `[진단][${label}]` : '[진단]'

  const box = toBbox(sel.x1, sel.y1, sel.x2, sel.y2)

  const inBox = entities.filter(e => {
    const c = entityCenter(e)
    return c ? inBbox(c.x, c.y, box) : false
  })

  // ── 절곡선 수집 + collinear 그룹핑 ──────────────────────────────────────────
  // 끝점 하나 이상이 박스 안이면 포함.
  // (layer, 방향H/V/D, 직선좌표 2단위 반올림) 키가 같으면 1곡으로 합산.
  interface BendGroup { isDown: boolean; totalLength: number; lines: DrawLine[]; avgX: number; avgY: number }
  const bendGroupMap = new Map<string, BendGroup>()
  const bendLinesInBox: DrawLine[] = []   // 바운딩박스 계산용 (전체 LINE 보존)

  for (const e of entities) {
    if (e.kind !== 'line') continue
    const isDown = e.layer === BEND_DOWN
    if (!isDown && e.layer !== BEND_UP) continue
    if (!(inBbox(e.x1, e.y1, box) || inBbox(e.x2, e.y2, box) ||
          inBbox((e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2, box))) continue

    const bl = e as DrawLine
    bendLinesInBox.push(bl)

    const key = bendKey(bl)
    console.log(TAG, 'LINE', bl.layer, `(${bl.x1.toFixed(1)},${bl.y1.toFixed(1)})→(${bl.x2.toFixed(1)},${bl.y2.toFixed(1)})`, '→ key:', key)
    let g = bendGroupMap.get(key)
    if (!g) {
      g = { isDown, totalLength: 0, lines: [], avgX: 0, avgY: 0 }
      bendGroupMap.set(key, g)
    }
    g.lines.push(bl)
    g.totalLength += entityLength(bl)
  }
  console.log(TAG, '최종 그룹 수(곡수):', bendGroupMap.size)
  for (const [key, g] of bendGroupMap)
    console.log(TAG, '그룹', key, '→', g.lines.length, '개 LINE')
  // 그룹별 avgX/avgY 확정 (라벨 배정용)
  for (const g of bendGroupMap.values()) {
    g.avgX = g.lines.reduce((s, l) => s + (l.x1 + l.x2) / 2, 0) / g.lines.length
    g.avgY = g.lines.reduce((s, l) => s + (l.y1 + l.y2) / 2, 0) / g.lines.length
  }

  let bendDownCount = 0, bendUpCount = 0
  for (const g of bendGroupMap.values())
    if (g.isDown) bendDownCount++; else bendUpCount++

  // ── 1. 세부부품 라벨 ─────────────────────────────────────────────────────
  interface CutLabel {
    cutMethod: string; text: string; x: number; y: number
    partName: string
    bendDown: number; bendUp: number; bendLines: DrawLine[]
    bendGroupLengths: number[]   // 그룹별 합산 길이(mm) — tier 단가용
    cutLengthM: number; widthMm: number; heightMm: number
    material: string; thickness: string; qty: string
  }

  // 1-A. 재단방식 텍스트 수집 (cutMethod 룩업 전용 — 부품 행 생성 안 함)
  const rawCutTexts = inBox.filter((e): e is DrawText => e.kind === 'text' && CUT_LAYERS.has(e.layer))

  // 1-B. SW_노트 품명 앵커 수집 (부품 단위 기준)
  interface NameAnchor { name: string; x: number; y: number }
  const NAME_LABEL_RE = /품\s*명\s*:/
  const swNoteInBox = inBox.filter((e): e is DrawText => e.kind === 'text' && e.layer === NOTE_LAYER)
  const nameAnchors: NameAnchor[] = []
  for (const t of swNoteInBox) {
    if (!NAME_LABEL_RE.test(t.txt)) continue
    const candidates = swNoteInBox.filter(s => s !== t && Math.abs(s.y - t.y) < 30 && s.x > t.x)
    if (!candidates.length) continue
    const nameText = candidates.reduce((a, b) => (a.x < b.x ? a : b))
    nameAnchors.push({ name: nameText.txt, x: nameText.x, y: nameText.y })
  }
  console.log(TAG, `품명 앵커 수: ${nameAnchors.length}개`)
  nameAnchors.forEach((a, i) =>
    console.log(TAG, `  앵커[${i}] name="${a.name}" x=${a.x.toFixed(1)} y=${a.y.toFixed(1)}`)
  )

  // 1-C. labels 구성:
  //   품명 있으면 → 품명 1개당 라벨 1개 (재단방식은 Y최근접 rawCutTexts에서 룩업)
  //   품명 없으면 → rawCutTexts 기반 (기존 폴백)
  const boxXMid = (box.minX + box.maxX) / 2
  const labels: CutLabel[] = nameAnchors.length > 0
    ? nameAnchors.map(a => {
        const zone = a.x < boxXMid ? 'L' : 'R'
        const zoneCuts = rawCutTexts.filter(t => (t.x < boxXMid ? 'L' : 'R') === zone)
        const pool = zoneCuts.length > 0 ? zoneCuts : rawCutTexts
        const nearest = pool.length > 0
          ? pool.reduce((b, c) => Math.abs(c.y - a.y) < Math.abs(b.y - a.y) ? c : b)
          : null
        return {
          cutMethod: nearest?.layer ?? '', text: nearest?.txt ?? '',
          x: a.x, y: a.y, partName: a.name,
          bendDown: 0, bendUp: 0, bendLines: [], bendGroupLengths: [],
          cutLengthM: 0, widthMm: 0, heightMm: 0, material: '', thickness: '', qty: '',
        }
      })
    : rawCutTexts
        .map(e => ({
          cutMethod: e.layer, text: e.txt, x: e.x, y: e.y, partName: '',
          bendDown: 0, bendUp: 0, bendLines: [], bendGroupLengths: [],
          cutLengthM: 0, widthMm: 0, heightMm: 0, material: '', thickness: '', qty: '',
        }))
        .sort((a, b) => b.y - a.y)

  console.log(TAG, `라벨 수: ${labels.length}개`)
  labels.forEach((l, i) =>
    console.log(TAG, `  라벨[${i}] partName="${l.partName}" cutMethod="${l.cutMethod}" x=${l.x.toFixed(1)} y=${l.y.toFixed(1)}`)
  )

  // ── 2. 절곡 그룹 → 품명 기준 부품 배정 ──────────────────────────────────────
  // labels[i] === nameAnchors[i] (품명 경로): anchorIdx = labelIdx 직결.
  // 품명 없는 경우(폴백): 기존 2D거리 배정 유지.
  let unassigned = 0

  if (labels.length > 0) {
    if (nameAnchors.length > 0) {
      // ── 새 배정: 품명 기준 ───────────────────────────────────────────────────

      // B. X 중앙값 계산 (좌/우 존 분할 기준)
      const avgXList = [...bendGroupMap.values()].map(g => g.avgX).sort((a, b) => a - b)
      const xMed = avgXList[Math.floor(avgXList.length / 2)] ?? 0

      // C. 굽힘선 그룹 → 2D 최근접 품명 배정
      const groupToAnchorIdx = new Map<string, number>()
      for (const [key, g] of bendGroupMap) {
        const zone = g.avgX < xMed ? 'L' : 'R'
        const zonePool = nameAnchors
          .map((a, idx) => ({ a, idx }))
          .filter(({ a }) => (a.x < xMed ? 'L' : 'R') === zone)
        const pool = zonePool.length > 0 ? zonePool : nameAnchors.map((a, idx) => ({ a, idx }))

        const best = pool.reduce((b, c) =>
          Math.hypot(g.avgX - c.a.x, g.avgY - c.a.y) <
          Math.hypot(g.avgX - b.a.x, g.avgY - b.a.y) ? c : b
        )
        groupToAnchorIdx.set(key, best.idx)
        console.log(TAG, '품명배정(2D)', key,
          `avgX=${g.avgX.toFixed(1)} avgY=${g.avgY.toFixed(1)}`,
          `dist=${Math.hypot(g.avgX - best.a.x, g.avgY - best.a.y).toFixed(1)}`,
          `→ 품명:"${best.a.name}"`)
      }

      // D 제거: labels[i] === nameAnchors[i] 이므로 anchorIdx가 곧 labelIdx

      // E. 라벨에 크레딧 (anchorIdx = labelIdx 직결)
      for (const [key, g] of bendGroupMap) {
        const li = groupToAnchorIdx.get(key)!
        const lbl = labels[li]
        console.log(TAG, '최종배정', key,
          g.isDown ? '▼아래로' : '▲위로', `→ 품명:"${lbl.partName}"`)
        if (g.isDown) lbl.bendDown++; else lbl.bendUp++
        for (const bl of g.lines) lbl.bendLines.push(bl)
        lbl.bendGroupLengths.push(Math.round(g.totalLength))
      }

    } else {
      // ── 폴백: 기존 라벨 2D거리 배정 (품명 앵커 없을 때) ────────────────────
      interface LabelBbox { minX: number; maxX: number; minY: number; maxY: number }
      const lbbox: (LabelBbox | null)[] = labels.map(() => null)

      for (const [, g] of bendGroupMap) {
        let bestIdx = 0
        let bestDist = Math.hypot(g.avgX - labels[0].x, g.avgY - labels[0].y)
        for (let i = 1; i < labels.length; i++) {
          const d = Math.hypot(g.avgX - labels[i].x, g.avgY - labels[i].y)
          if (d < bestDist) { bestDist = d; bestIdx = i }
        }
        if (!lbbox[bestIdx]) lbbox[bestIdx] = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
        const bb = lbbox[bestIdx]!
        for (const bl of g.lines) {
          bb.minX = Math.min(bb.minX, bl.x1, bl.x2)
          bb.maxX = Math.max(bb.maxX, bl.x1, bl.x2)
          bb.minY = Math.min(bb.minY, bl.y1, bl.y2)
          bb.maxY = Math.max(bb.maxY, bl.y1, bl.y2)
        }
      }

      const PAD = 100
      const bboxes = lbbox.map(bb =>
        bb && bb.minX !== Infinity
          ? { minX: bb.minX - PAD, maxX: bb.maxX + PAD, minY: bb.minY - PAD, maxY: bb.maxY + PAD }
          : null
      )

      for (const [key, g] of bendGroupMap) {
        const cx = g.avgX, cy = g.avgY
        const hits = bboxes
          .map((bb, i) => ({ i, bb }))
          .filter(({ bb }) => bb !== null && cx >= bb.minX && cx <= bb.maxX && cy >= bb.minY && cy <= bb.maxY)

        let bestIdx: number
        let assignReason: string

        if (hits.length === 1) {
          bestIdx = hits[0].i
          assignReason = 'bbox포함'
        } else {
          bestIdx = 0
          let bestDist = Math.hypot(cx - labels[0].x, cy - labels[0].y)
          for (let i = 1; i < labels.length; i++) {
            const d = Math.hypot(cx - labels[i].x, cy - labels[i].y)
            if (d < bestDist) { bestDist = d; bestIdx = i }
          }
          const bb = bboxes[bestIdx]
          const threshold = bb ? Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) : 2000
          if (bestDist > threshold) {
            unassigned++
            console.log(TAG, '미배정', key,
              `cx=${cx.toFixed(1)} cy=${cy.toFixed(1)}`,
              `dist=${bestDist.toFixed(1)} > threshold=${threshold.toFixed(1)}`)
            continue
          }
          assignReason = `2D근접 dist=${bestDist.toFixed(1)}`
        }

        const best = labels[bestIdx]
        console.log(TAG, '배정', key,
          `avgX=${cx.toFixed(1)} avgY=${cy.toFixed(1)}`, g.isDown ? '▼아래로' : '▲위로',
          `→ 라벨:"${best.text}"`, assignReason)
        if (g.isDown) best.bendDown++; else best.bendUp++
        for (const bl of g.lines) best.bendLines.push(bl)
        best.bendGroupLengths.push(Math.round(g.totalLength))
      }
    }
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
    let oxMin = Infinity, oxMax = -Infinity, oyMin = Infinity, oyMax = -Infinity
    for (const e of outline) {
      const c = entityCenter(e)
      if (!c || !inBbox(c.x, c.y, bb)) continue
      total += entityLength(e)
      if (e.kind === 'line') {
        oxMin = Math.min(oxMin, e.x1, e.x2); oxMax = Math.max(oxMax, e.x1, e.x2)
        oyMin = Math.min(oyMin, e.y1, e.y2); oyMax = Math.max(oyMax, e.y1, e.y2)
      } else {
        oxMin = Math.min(oxMin, c.x); oxMax = Math.max(oxMax, c.x)
        oyMin = Math.min(oyMin, c.y); oyMax = Math.max(oyMax, c.y)
      }
    }
    lbl.cutLengthM = Math.round(total / 10) / 100
    if (oxMin !== Infinity) {
      lbl.widthMm  = Math.round(oxMax - oxMin)
      lbl.heightMm = Math.round(oyMax - oyMin)
    } else {
      // 외형선 없음 → 절곡선 범위로 대체
      lbl.widthMm  = Math.round(Math.max(...xs) - Math.min(...xs))
      lbl.heightMm = Math.round(Math.max(...ys) - Math.min(...ys))
    }
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
    const hasOutline = inBox.some(e => e.layer === OUTLINE_LYR && e.kind !== 'text')
    if (bendLinesInBox.length > 0 || hasOutline) {
      const fakeLbl: CutLabel = {
        cutMethod: '', text: '', x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2,
        partName: '',
        bendDown: bendDownCount, bendUp: bendUpCount, bendLines: [...bendLinesInBox],
        bendGroupLengths: [...bendGroupMap.values()].map(g => Math.round(g.totalLength)),
        cutLengthM: 0, widthMm: 0, heightMm: 0, material: '', thickness: '', qty: '',
      }
      labels.push(fakeLbl)
      unassigned = 0

      // 재단길이 + 외형선 bbox
      let totalLen = 0
      let oxMin = Infinity, oxMax = -Infinity, oyMin = Infinity, oyMax = -Infinity
      for (const e of outline) {
        totalLen += entityLength(e)
        const c = entityCenter(e)
        if (e.kind === 'line') {
          oxMin = Math.min(oxMin, e.x1, e.x2); oxMax = Math.max(oxMax, e.x1, e.x2)
          oyMin = Math.min(oyMin, e.y1, e.y2); oyMax = Math.max(oyMax, e.y1, e.y2)
        } else if (c) {
          oxMin = Math.min(oxMin, c.x); oxMax = Math.max(oxMax, c.x)
          oyMin = Math.min(oyMin, c.y); oyMax = Math.max(oyMax, c.y)
        }
      }
      fakeLbl.cutLengthM = Math.round(totalLen / 10) / 100
      if (oxMin !== Infinity) {
        fakeLbl.widthMm  = Math.round(oxMax - oxMin)
        fakeLbl.heightMm = Math.round(oyMax - oyMin)
      }

      // SW_노트 재배정
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
    cutMethod:   l.cutMethod,
    labelText:   l.text,
    partName:    l.partName,
    bendDown:    l.bendDown,
    bendUp:      l.bendUp,
    bendTotal:   l.bendDown + l.bendUp,
    bendLengths: l.bendGroupLengths,   // 그룹당 합산 길이 — tier 단가용
    cutLengthM:  l.cutLengthM,
    widthMm:     l.widthMm,
    heightMm:    l.heightMm,
    material:    l.material,
    thickness:   l.thickness,
    qty:         l.qty,
  }))

  return {
    parts,
    totalBends:      bendGroupMap.size,   // collinear 그룹 수 = 실제 곡수
    unassignedBends: unassigned,
    specialFeatures,
    pipes,
  }
}
