/**
 * 심플라인 DXF 파서 — TypeScript port of samples/parse_dxf.py
 *
 * 레이어 규칙:
 *   외형선      - 절단 윤곽 + 구멍 (LINE / ARC / LWPOLYLINE / CIRCLE)
 *   굽힘선아래로 - 하향 절곡선 (LINE)
 *   굽힘선위로   - 상향 절곡선 (LINE)
 *   SW_노트     - 제목란 MTEXT (재질/두께/중량/수량)
 *
 * 인코딩: SolidWorks DXF는 ANSI_949 (CP949/EUC-KR) → iconv-lite 디코딩
 */

import * as fs from 'fs'
import * as path from 'path'
import * as iconv from 'iconv-lite'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ParsedDxf {
  file: string
  standard: boolean
  material: string | null
  materialOk: boolean
  thicknessMm: number | null
  thicknessOk: boolean
  weightKg: number | null
  weightOk: boolean
  weightSource: string
  qty: number | null
  qtyOk: boolean
  bendUp: number
  bendDown: number
  bendTotal: number
  bendLengthMm: number
  bendOk: boolean
  cutLengthMm: number
  cutOk: boolean
  holeCount: number
  holeOk: boolean
  flatAreaMm2: number | null
  surfaceAreaMm2: number | null
  error?: string
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type GCode = [number, string]

interface RawEntity {
  type: string
  props: GCode[]
}

// ---------------------------------------------------------------------------
// File → group code pairs
// ---------------------------------------------------------------------------

function parseGCodes(content: string): GCode[] {
  const lines = content.split(/\r?\n/)
  const pairs: GCode[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10)
    if (!isNaN(code)) {
      pairs.push([code, lines[i + 1].trim()])
    }
  }
  return pairs
}

// ---------------------------------------------------------------------------
// Extract entities from *Model_Space block
//
// R2000+ DXF (AC1015) stores model-space entities inside a BLOCK named
// *Model_Space (SolidWorks may also write *MODEL_SPACE).
// Falls back to the ENTITIES section if the block is not found.
// ---------------------------------------------------------------------------

function extractEntities(
  gcodes: GCode[],
): { entities: RawEntity[]; layers: Set<string> } {
  const allLayers = new Set<string>()

  // Collect every layer name seen in the file (for is_standard check)
  for (const [code, value] of gcodes) {
    if (code === 8) allLayers.add(value)
  }

  // -- Strategy 1: *Model_Space block in BLOCKS section --
  const msEntities = extractFromBlock(gcodes, '*model_space')
  if (msEntities.length > 0) {
    return { entities: msEntities, layers: allLayers }
  }

  // -- Strategy 2: ENTITIES section fallback --
  const secEntities = extractFromSection(gcodes, 'ENTITIES')
  return { entities: secEntities, layers: allLayers }
}

function extractFromBlock(gcodes: GCode[], blockNameLower: string): RawEntity[] {
  const entities: RawEntity[] = []
  let inBlock = false
  let isTarget = false
  let current: RawEntity | null = null

  for (let i = 0; i < gcodes.length; i++) {
    const [code, value] = gcodes[i]

    if (code === 0) {
      switch (value) {
        case 'BLOCK':
          // Save current entity if we were collecting
          if (current && isTarget) entities.push(current)
          current = null
          inBlock = true
          isTarget = false
          break

        case 'ENDBLK':
          if (current && isTarget) entities.push(current)
          current = null
          inBlock = false
          isTarget = false
          break

        default:
          if (isTarget) {
            if (current) entities.push(current)
            current = { type: value, props: [] }
          }
      }
    } else if (code === 2 && inBlock && !isTarget) {
      isTarget = value.toLowerCase() === blockNameLower
    } else if (code !== 0 && current && isTarget) {
      current.props.push([code, value])
    }
  }

  return entities
}

function extractFromSection(gcodes: GCode[], sectionName: string): RawEntity[] {
  const entities: RawEntity[] = []
  let inSection = false
  let current: RawEntity | null = null

  for (let i = 0; i < gcodes.length; i++) {
    const [code, value] = gcodes[i]

    if (code === 0) {
      if (value === 'SECTION') {
        // peek next for section name
        if (i + 1 < gcodes.length && gcodes[i + 1][0] === 2 && gcodes[i + 1][1] === sectionName) {
          inSection = true
        }
        continue
      }
      if (value === 'ENDSEC') {
        if (current) entities.push(current)
        current = null
        inSection = false
        continue
      }
      if (inSection) {
        if (current) entities.push(current)
        current = { type: value, props: [] }
      }
    } else if (inSection && current) {
      current.props.push([code, value])
    }
  }

  return entities
}

// ---------------------------------------------------------------------------
// Entity property helpers
// ---------------------------------------------------------------------------

function getProp(props: GCode[], code: number): string | undefined {
  return props.find(([c]) => c === code)?.[1]
}

function getFloat(props: GCode[], code: number, fallback = 0): number {
  const v = parseFloat(getProp(props, code) ?? '')
  return isNaN(v) ? fallback : v
}

function getInt(props: GCode[], code: number, fallback = 0): number {
  const v = parseInt(getProp(props, code) ?? '', 10)
  return isNaN(v) ? fallback : v
}

// ---------------------------------------------------------------------------
// Geometry calculations
// ---------------------------------------------------------------------------

function lineLength(props: GCode[]): number {
  const x1 = getFloat(props, 10), y1 = getFloat(props, 20)
  const x2 = getFloat(props, 11), y2 = getFloat(props, 21)
  return Math.hypot(x2 - x1, y2 - y1)
}

function arcLength(props: GCode[]): number {
  const r = getFloat(props, 40)
  let start = (getFloat(props, 50) * Math.PI) / 180
  let end   = (getFloat(props, 51) * Math.PI) / 180
  if (end < start) end += 2 * Math.PI
  return r * (end - start)
}

function circleCircumference(props: GCode[]): number {
  return 2 * Math.PI * getFloat(props, 40)
}

function lwpolylineVertices(props: GCode[]): [number, number][] {
  // Group codes 10 (X) and 20 (Y) repeat for each vertex
  const xs: number[] = []
  const ys: number[] = []
  for (const [code, value] of props) {
    if (code === 10) xs.push(parseFloat(value))
    if (code === 20) ys.push(parseFloat(value))
  }
  const len = Math.min(xs.length, ys.length)
  return Array.from({ length: len }, (_, i) => [xs[i], ys[i]])
}

function lwpolylineLength(props: GCode[]): number {
  const pts = lwpolylineVertices(props)
  const closed = (getInt(props, 70) & 1) === 1
  let total = 0
  for (let i = 0; i + 1 < pts.length; i++) {
    total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  }
  if (closed && pts.length > 1) {
    total += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1])
  }
  return total
}

function lwpolylineArea(props: GCode[]): number {
  const pts = lwpolylineVertices(props)
  if (pts.length < 3) return 0
  const n = pts.length
  let area = 0
  for (let i = 0; i < n; i++) {
    area += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1]
  }
  return Math.abs(area) / 2
}

// ---------------------------------------------------------------------------
// MTEXT content extraction
// Group 3 = overflow text chunks (come before group 1); group 1 = final chunk
// ---------------------------------------------------------------------------

function getMTextContent(props: GCode[]): string {
  const chunks: string[] = []
  let g1 = ''
  for (const [code, value] of props) {
    if (code === 3) chunks.push(value)
    if (code === 1) g1 = value
  }
  chunks.push(g1)
  return chunks.join('')
}

const UNICODE_RE = /\\U\+([0-9A-Fa-f]{4})/g

function decodeDxfText(raw: string): string {
  let text = raw.replace(UNICODE_RE, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  text = text.replace(/\{[^}]*\}/g, '')            // remove {...} format blocks
  text = text.replace(/\\[A-Za-z][^;]*;?/g, '')    // remove \fArial; \H... etc.
  text = text.replace(/\\P/g, '\n').replace(/\\~/g, ' ')
  return text.trim()
}

// ---------------------------------------------------------------------------
// SW_노트 MTEXT parsing — material / thickness / weight / qty
// ---------------------------------------------------------------------------

const MATERIAL_RE = /\b(SPCC|SUS304|SUS316|AL5052|AL6061|SECC|SGCC|SS400)\b/i
const THICKNESS_RE = /(\d+(?:\.\d+)?)\s*t\b/i
const WEIGHT_RE    = /(\d+(?:\.\d+)?)\s*kg/i
const QTY_RE       = /(\d+)\s*(?:ea|pcs?|개)/i

interface SwNote {
  material?: string
  thicknessMm?: number
  weightKg?: number
  qty?: number
}

function parseSwNote(raw: string): SwNote {
  const text = decodeDxfText(raw)
  const result: SwNote = {}

  const m = MATERIAL_RE.exec(text)
  if (m) result.material = m[1].toUpperCase()

  const t = THICKNESS_RE.exec(text)
  if (t) result.thicknessMm = parseFloat(t[1])

  const w = WEIGHT_RE.exec(text)
  if (w) result.weightKg = parseFloat(w[1])

  const q = QTY_RE.exec(text)
  if (q) result.qty = parseInt(q[1], 10)

  return result
}

// ---------------------------------------------------------------------------
// Density table
// ---------------------------------------------------------------------------

const DENSITY: Record<string, number> = {
  SPCC: 7.85, SECC: 7.85, SGCC: 7.85, SS400: 7.85,
  SUS304: 7.93, SUS316: 7.93,
  AL5052: 2.71, AL6061: 2.71,
}

// ---------------------------------------------------------------------------
// Standard layer set
// ---------------------------------------------------------------------------

const STANDARD_LAYERS = new Set(['외형선', '굽힘선아래로', '굽힘선위로', 'SW_노트'])

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseDxf(filePath: string): ParsedDxf {
  const result: ParsedDxf = {
    file: path.basename(filePath),
    standard: false,
    material: null,      materialOk: false,
    thicknessMm: null,   thicknessOk: false,
    weightKg: null,      weightOk: false,      weightSource: '미검출',
    qty: null,           qtyOk: false,
    bendUp: 0,           bendDown: 0,           bendTotal: 0,    bendLengthMm: 0, bendOk: false,
    cutLengthMm: 0,      cutOk: false,
    holeCount: 0,        holeOk: false,
    flatAreaMm2: null,   surfaceAreaMm2: null,
  }

  try {
    const buffer = fs.readFileSync(filePath)
    const content = iconv.decode(buffer, 'cp949')
    const gcodes = parseGCodes(content)
    const { entities, layers } = extractEntities(gcodes)

    result.standard = [...layers].some(l => STANDARD_LAYERS.has(l))

    // --- SW_노트: material / thickness / weight / qty ---
    const noteTexts: string[] = []
    for (const e of entities) {
      if (e.type === 'MTEXT' && getProp(e.props, 8) === 'SW_노트') {
        noteTexts.push(getMTextContent(e.props))
      }
    }
    const combined = noteTexts.join('\n')
    const meta = combined ? parseSwNote(combined) : {}

    result.material     = meta.material     ?? null
    result.materialOk   = result.material   !== null
    result.thicknessMm  = meta.thicknessMm  ?? null
    result.thicknessOk  = result.thicknessMm !== null
    result.qty          = meta.qty          ?? null
    result.qtyOk        = result.qty        !== null

    if (meta.weightKg !== undefined) {
      result.weightKg     = meta.weightKg
      result.weightOk     = true
      result.weightSource = 'SW_노트'
    }

    // --- Bends ---
    let bendUp = 0, bendDown = 0, lenUp = 0, lenDown = 0
    for (const e of entities) {
      if (e.type !== 'LINE') continue
      const layer = getProp(e.props, 8)
      const len = lineLength(e.props)
      if (layer === '굽힘선위로')   { bendUp++;   lenUp   += len }
      if (layer === '굽힘선아래로') { bendDown++; lenDown += len }
    }
    result.bendUp       = bendUp
    result.bendDown     = bendDown
    result.bendTotal    = bendUp + bendDown
    result.bendLengthMm = Math.round((lenUp + lenDown) * 100) / 100
    result.bendOk       = result.bendTotal > 0 || layers.has('굽힘선아래로') || layers.has('굽힘선위로')

    // --- Outline: cut length + holes ---
    let cutLength = 0, holeCount = 0, flatArea = 0
    for (const e of entities) {
      const layer = getProp(e.props, 8)
      if (layer !== '외형선') continue

      switch (e.type) {
        case 'LINE':        cutLength += lineLength(e.props);                                                    break
        case 'ARC':         cutLength += arcLength(e.props);                                                     break
        case 'LWPOLYLINE':  cutLength += lwpolylineLength(e.props); flatArea += lwpolylineArea(e.props);         break
        case 'CIRCLE':      cutLength += circleCircumference(e.props); holeCount++;                              break
      }
    }
    result.cutLengthMm = Math.round(cutLength * 100) / 100
    result.holeCount   = holeCount
    result.cutOk       = cutLength > 0
    result.holeOk      = true

    // --- Weight fallback ---
    if (!result.weightOk && result.material && result.thicknessMm && flatArea > 0) {
      const density     = DENSITY[result.material] ?? 7.85
      const areaCm2     = flatArea / 100
      const thickCm     = result.thicknessMm / 10
      result.weightKg   = Math.round(areaCm2 * thickCm * density / 1000 * 10000) / 10000
      result.weightOk   = true
      result.weightSource = '면적역산(근사)'
    }

    // --- Surface area ---
    if (result.weightSource === 'SW_노트' && result.weightKg && result.thicknessMm && result.material) {
      const density     = DENSITY[result.material] ?? 7.85
      const areaM2      = result.weightKg / (result.thicknessMm / 1000 * density * 1000)
      result.flatAreaMm2    = Math.round(areaM2 * 1e6 * 100) / 100
      result.surfaceAreaMm2 = Math.round((areaM2 * 1e6 * 2 + result.cutLengthMm * result.thicknessMm) * 100) / 100
    } else if (flatArea > 0 && result.thicknessMm) {
      result.flatAreaMm2    = Math.round(flatArea * 100) / 100
      result.surfaceAreaMm2 = Math.round((flatArea * 2 + result.cutLengthMm * result.thicknessMm) * 100) / 100
    }

  } catch (err) {
    result.error = String(err)
  }

  return result
}

// ---------------------------------------------------------------------------
// Buffer variant — for Next.js API routes (no temp file needed)
// ---------------------------------------------------------------------------

export function parseDxfFromBuffer(buffer: Buffer, filename: string): ParsedDxf {
  const result: ParsedDxf = {
    file: filename,
    standard: false,
    material: null,      materialOk: false,
    thicknessMm: null,   thicknessOk: false,
    weightKg: null,      weightOk: false,      weightSource: '미검출',
    qty: null,           qtyOk: false,
    bendUp: 0,           bendDown: 0,           bendTotal: 0,    bendLengthMm: 0, bendOk: false,
    cutLengthMm: 0,      cutOk: false,
    holeCount: 0,        holeOk: false,
    flatAreaMm2: null,   surfaceAreaMm2: null,
  }
  try {
    const content = iconv.decode(buffer, 'cp949')
    const gcodes = parseGCodes(content)
    const { entities, layers } = extractEntities(gcodes)

    result.standard = [...layers].some(l => STANDARD_LAYERS.has(l))

    const noteTexts: string[] = []
    for (const e of entities) {
      if (e.type === 'MTEXT' && getProp(e.props, 8) === 'SW_노트') {
        noteTexts.push(getMTextContent(e.props))
      }
    }
    const combined = noteTexts.join('\n')
    const meta = combined ? parseSwNote(combined) : {}

    result.material     = meta.material     ?? null
    result.materialOk   = result.material   !== null
    result.thicknessMm  = meta.thicknessMm  ?? null
    result.thicknessOk  = result.thicknessMm !== null
    result.qty          = meta.qty          ?? null
    result.qtyOk        = result.qty        !== null
    if (meta.weightKg !== undefined) {
      result.weightKg = meta.weightKg; result.weightOk = true; result.weightSource = 'SW_노트'
    }

    let bendUp = 0, bendDown = 0, lenUp = 0, lenDown = 0
    for (const e of entities) {
      if (e.type !== 'LINE') continue
      const layer = getProp(e.props, 8); const len = lineLength(e.props)
      if (layer === '굽힘선위로')   { bendUp++;   lenUp   += len }
      if (layer === '굽힘선아래로') { bendDown++; lenDown += len }
    }
    result.bendUp = bendUp; result.bendDown = bendDown
    result.bendTotal = bendUp + bendDown
    result.bendLengthMm = Math.round((lenUp + lenDown) * 100) / 100
    result.bendOk = result.bendTotal > 0 || layers.has('굽힘선아래로') || layers.has('굽힘선위로')

    let cutLength = 0, holeCount = 0, flatArea = 0
    for (const e of entities) {
      const layer = getProp(e.props, 8)
      if (layer !== '외형선') continue
      switch (e.type) {
        case 'LINE':       cutLength += lineLength(e.props); break
        case 'ARC':        cutLength += arcLength(e.props); break
        case 'LWPOLYLINE': cutLength += lwpolylineLength(e.props); flatArea += lwpolylineArea(e.props); break
        case 'CIRCLE':     cutLength += circleCircumference(e.props); holeCount++; break
      }
    }
    result.cutLengthMm = Math.round(cutLength * 100) / 100
    result.holeCount = holeCount; result.cutOk = cutLength > 0; result.holeOk = true

    if (!result.weightOk && result.material && result.thicknessMm && flatArea > 0) {
      const density = DENSITY[result.material] ?? 7.85
      result.weightKg = Math.round((flatArea / 100) * (result.thicknessMm / 10) * density / 1000 * 10000) / 10000
      result.weightOk = true; result.weightSource = '면적역산(근사)'
    }

    if (result.weightSource === 'SW_노트' && result.weightKg && result.thicknessMm && result.material) {
      const density = DENSITY[result.material] ?? 7.85
      const areaM2 = result.weightKg / (result.thicknessMm / 1000 * density * 1000)
      result.flatAreaMm2 = Math.round(areaM2 * 1e6 * 100) / 100
      result.surfaceAreaMm2 = Math.round((areaM2 * 1e6 * 2 + result.cutLengthMm * result.thicknessMm) * 100) / 100
    } else if (flatArea > 0 && result.thicknessMm) {
      result.flatAreaMm2 = Math.round(flatArea * 100) / 100
      result.surfaceAreaMm2 = Math.round((flatArea * 2 + result.cutLengthMm * result.thicknessMm) * 100) / 100
    }
  } catch (err) {
    result.error = String(err)
  }
  return result
}
