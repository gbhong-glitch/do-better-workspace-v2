/**
 * P4 2단계: DXF 절곡 BOM 파서
 *
 * 역할:
 *   1. SW_TABLEANNOTATION_0 블록에서 태그/방향/각도/안쪽반경 추출
 *   2. 굽힘선아래로 / 굽힘선위로 레이어에서 절곡선(LINE) 그룹 추출
 *   3. 두 데이터를 위치 기반으로 매칭 → DxfBendData 반환
 */

import * as iconv from 'iconv-lite'

// ── Types ─────────────────────────────────────────────────────────────

type GCode = [number, string]

/** BOM 표 1행 */
export interface BomRow {
  tag:           string         // 'A', 'B', 'C'...
  direction:     'down' | 'up' // 아래 / 위
  angleDeg:      number         // 90, 135...
  innerRadiusMm: number         // 안쪽 반경 (mm)
}

/** 외형선 단일 LINE 요소 (평판 경계 계산용) */
export interface OutlineLine {
  x1: number; y1: number
  x2: number; y2: number
  length: number
}

/** 절곡선 그룹 (collinear LINE 묶음) */
export interface BendGroup {
  tag:           string | null  // BOM 태그. null = 미매칭
  direction:     'down' | 'up'
  angleDeg:      number
  innerRadiusMm: number
  totalLengthMm: number         // 그룹 총 길이 (mm)
  midX:          number         // 그룹 중심 X
  midY:          number         // 그룹 중심 Y
  orientation:   'H' | 'V' | 'D' // 수평/수직/사선
}

export interface DxfBendData {
  bom:          BomRow[]
  bendGroups:   BendGroup[]
  outlineLines: OutlineLine[]  // 외형선 LINE들 (평판 경계 계산용)
  warnings:     string[]
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────

function parseGCodes(content: string): GCode[] {
  const lines = content.split(/\r?\n/)
  const pairs: GCode[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10)
    if (!isNaN(code)) pairs.push([code, lines[i + 1].trim()])
  }
  return pairs
}

/** DXF \U+XXXX 이스케이프 → 실제 문자 */
function decodeUnicode(s: string): string {
  return s.replace(/\\U\+([0-9A-Fa-f]{4})/g,
    (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/** "90\U+00B0", "90°", "135.0" → 숫자 */
function parseAngle(s: string): number {
  const n = parseFloat(s.replace(/[^\d.]/g, ''))
  return isNaN(n) ? 90 : n
}

// ── BOM 파서 ──────────────────────────────────────────────────────────

interface TextEntry { x: number; y: number; txt: string }

function parseBomBlock(pairs: GCode[]): BomRow[] {
  // BLOCKS 섹션의 SW_TABLEANNOTATION_0 블록 정의 안 TEXT 수집
  const texts: TextEntry[] = []
  let inTarget = false
  let curType  = ''
  let props: Record<number, string> = {}

  const flush = () => {
    if (!inTarget) return
    if ((curType === 'TEXT' || curType === 'MTEXT') && props[1]) {
      texts.push({
        x:   parseFloat(props[10] ?? '0'),
        y:   parseFloat(props[20] ?? '0'),
        txt: decodeUnicode(props[1]),
      })
    }
  }

  for (const [code, val] of pairs) {
    if (code === 0) {
      flush()
      if (val === 'BLOCK')  { inTarget = false; curType = 'BLOCK'; props = {}; continue }
      if (val === 'ENDBLK') { inTarget = false; curType = '';      props = {}; continue }
      curType = val; props = {}
    } else if (code === 2 && curType === 'BLOCK') {
      inTarget = val.toUpperCase() === 'SW_TABLEANNOTATION_0'
    } else {
      props[code] = val
    }
  }
  flush()

  if (!texts.length) return []

  // Y 기준으로 행 묶기 (DXF Y-up, 위가 큰 값 → 내림차순 = 위→아래)
  const ROW_TOLERANCE = 10  // Y 차이 10mm 이내면 같은 행
  const yBuckets = new Map<number, TextEntry[]>()
  for (const t of texts) {
    let key: number | undefined
    for (const k of yBuckets.keys()) {
      if (Math.abs(k - t.y) <= ROW_TOLERANCE) { key = k; break }
    }
    if (key === undefined) key = t.y
    if (!yBuckets.has(key)) yBuckets.set(key, [])
    yBuckets.get(key)!.push(t)
  }

  const sortedYs = [...yBuckets.keys()].sort((a, b) => b - a) // 위→아래

  // 첫 번째 행 = 헤더 → 각 열의 X 기준 좌표 파악
  let headerFound = false
  let colTag = 0, colDir = 0, colAngle = 0, colRadius = 0
  const rows: BomRow[] = []

  for (const yKey of sortedYs) {
    const rowTexts = yBuckets.get(yKey)!.sort((a, b) => a.x - b.x)
    const txts     = rowTexts.map(t => t.txt)

    if (!headerFound) {
      if (txts.includes('태그') && txts.includes('방향')) {
        headerFound = true
        colTag    = rowTexts.find(t => t.txt === '태그')?.x    ?? 0
        colDir    = rowTexts.find(t => t.txt === '방향')?.x    ?? 0
        colAngle  = rowTexts.find(t => t.txt.includes('각도'))?.x  ?? 0
        colRadius = rowTexts.find(t => t.txt.includes('반경'))?.x  ?? 0
      }
      continue
    }

    // X 기준 열 값 찾기
    const pick = (cx: number) =>
      rowTexts.reduce<TextEntry | null>((b, t) =>
        !b || Math.abs(t.x - cx) < Math.abs(b.x - cx) ? t : b, null)?.txt ?? ''

    const tag    = pick(colTag).trim()
    const dirStr = pick(colDir).trim()
    const angStr = pick(colAngle).trim()
    const radStr = pick(colRadius).trim()

    if (!/^[A-Z]$/.test(tag)) continue // 단일 대문자만 태그로 인정

    rows.push({
      tag,
      direction:     dirStr.includes('아래') ? 'down' : 'up',
      angleDeg:      parseAngle(angStr),
      innerRadiusMm: parseFloat(radStr) || 0,
    })
  }

  return rows
}

// ── 절곡선 그룹 추출 ──────────────────────────────────────────────────

const BEND_LAYERS = new Set(['굽힘선아래로', '굽힘선위로'])

interface RawLine { x1: number; y1: number; x2: number; y2: number }
interface RawGroup { dir: 'down' | 'up'; totalLen: number; lines: RawLine[] }

function bendKey(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  const dy = y2 - y1, dx = x2 - x1
  if (Math.abs(dy) < 0.5) return `${layer}|H|${Math.round((y1 + y2) / 4) * 2}`
  if (Math.abs(dx) < 0.5) return `${layer}|V|${Math.round((x1 + x2) / 4) * 2}`
  return     `${layer}|D|${Math.round((x1 + x2) / 2)}|${Math.round((y1 + y2) / 2)}`
}

function extractBendGroups(pairs: GCode[]): Map<string, RawGroup> {
  const groups = new Map<string, RawGroup>()
  let curType = '', curLayer = ''
  let props: Record<number, string> = {}

  const flush = () => {
    if (curType !== 'LINE' || !BEND_LAYERS.has(curLayer)) return
    const x1 = parseFloat(props[10] ?? '0')
    const y1 = parseFloat(props[20] ?? '0')
    const x2 = parseFloat(props[11] ?? '0')
    const y2 = parseFloat(props[21] ?? '0')
    const len = Math.hypot(x2 - x1, y2 - y1)
    if (len < 1) return  // 1mm 미만 무시 (잡음·중복)
    const dir: 'down' | 'up' = curLayer === '굽힘선아래로' ? 'down' : 'up'
    const key = bendKey(x1, y1, x2, y2, curLayer)
    if (!groups.has(key)) groups.set(key, { dir, totalLen: 0, lines: [] })
    const g = groups.get(key)!
    g.lines.push({ x1, y1, x2, y2 })
    g.totalLen += len
  }

  for (const [code, val] of pairs) {
    if (code === 0) { flush(); curType = val; curLayer = ''; props = {} }
    else if (code === 8) curLayer = val
    else props[code] = val
  }
  flush()

  return groups
}

// ── BOM ↔ 절곡선 그룹 매칭 ───────────────────────────────────────────

/**
 * 위치 기반 정렬 매칭.
 * SolidWorks는 절곡선을 위→아래, 왼→오른 순으로 A, B, C... 태그를 부여.
 * 절곡선 그룹도 같은 순서로 정렬하면 BOM 순서와 일치.
 */
function matchBomToGroups(bom: BomRow[], rawGroups: Map<string, RawGroup>): BendGroup[] {
  const items = [...rawGroups.entries()].map(([key, g]) => {
    const n    = g.lines.length
    const midX = g.lines.reduce((s, l) => s + (l.x1 + l.x2) / 2, 0) / n
    const midY = g.lines.reduce((s, l) => s + (l.y1 + l.y2) / 2, 0) / n
    const orientation = key.split('|')[1] as 'H' | 'V' | 'D'
    return { dir: g.dir, totalLen: Math.round(g.totalLen), midX, midY, orientation }
  })

  // 수평선: Y 내림차순(위→아래), 수직선: X 오름차순(왼→오른)
  items.sort((a, b) => {
    if (a.orientation !== b.orientation) return b.midY - a.midY
    return a.orientation === 'H' ? b.midY - a.midY : a.midX - b.midX
  })

  return items.map((g, i) => {
    const row = bom[i] ?? null
    return {
      tag:           row?.tag ?? null,
      direction:     g.dir,
      angleDeg:      row?.angleDeg ?? 90,
      innerRadiusMm: row?.innerRadiusMm ?? 0,
      totalLengthMm: g.totalLen,
      midX:          Math.round(g.midX * 10) / 10,
      midY:          Math.round(g.midY * 10) / 10,
      orientation:   g.orientation,
    }
  })
}

// ── 외형선 추출 ────────────────────────────────────────────────────────

/**
 * 외형선 레이어 LINE만 추출.
 * 절곡선 중심(bendCx, bendCy) 기준으로 searchRadius 이내의 선만 반환해
 * 도면 다른 뷰의 외형선이 섞이지 않도록 한다.
 */
function extractOutlineLines(
  pairs: GCode[],
  bendCx: number,
  bendCy: number,
  searchRadius: number,
): OutlineLine[] {
  const lines: OutlineLine[] = []
  let curType = '', curLayer = ''
  let props: Record<number, string> = {}

  const flush = () => {
    if (curType !== 'LINE' || curLayer !== '외형선') return
    const x1 = parseFloat(props[10] ?? '0')
    const y1 = parseFloat(props[20] ?? '0')
    const x2 = parseFloat(props[11] ?? '0')
    const y2 = parseFloat(props[21] ?? '0')
    const length = Math.hypot(x2 - x1, y2 - y1)
    if (length < 1) return
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    if (Math.hypot(mx - bendCx, my - bendCy) > searchRadius) return
    lines.push({ x1, y1, x2, y2, length })
  }

  for (const [code, val] of pairs) {
    if (code === 0) { flush(); curType = val; curLayer = ''; props = {} }
    else if (code === 8) curLayer = val
    else props[code] = val
  }
  flush()

  return lines
}

// ── 메인 ─────────────────────────────────────────────────────────────

export function parseDxfBends(buffer: Buffer): DxfBendData {
  const warnings: string[] = []

  const content = iconv.decode(buffer, 'cp949')
  const pairs   = parseGCodes(content)

  // 1. BOM 파싱
  const bom = parseBomBlock(pairs)
  if (!bom.length)
    warnings.push('SW_TABLEANNOTATION_0 블록에서 BOM 데이터를 찾지 못했습니다.')

  // 2. 절곡선 그룹 추출
  const rawGroups = extractBendGroups(pairs)

  // 3. 매칭
  const bendGroups = matchBomToGroups(bom, rawGroups)

  if (bom.length > 0 && bom.length !== bendGroups.length) {
    warnings.push(
      `BOM 행 수(${bom.length})와 절곡선 그룹 수(${bendGroups.length})가 다릅니다. ` +
      `위치 기반 매칭을 도면에서 직접 확인하세요.`
    )
  }

  // 4. 외형선 추출 (절곡선 중심 기준 1500mm 이내)
  const bendCx = bendGroups.reduce((s, g) => s + g.midX, 0) / (bendGroups.length || 1)
  const bendCy = bendGroups.reduce((s, g) => s + g.midY, 0) / (bendGroups.length || 1)
  const outlineLines = extractOutlineLines(pairs, bendCx, bendCy, 1500)

  return { bom, bendGroups, outlineLines, warnings }
}
