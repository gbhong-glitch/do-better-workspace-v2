/**
 * DXF viewer entity extractor
 * 렌더링용 엔티티 추출 — dxf-parser.ts의 견적 로직과 독립적으로 동작
 */

import * as iconv from 'iconv-lite'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DrawLine    { kind: 'line';     layer: string; x1: number; y1: number; x2: number; y2: number }
export interface DrawArc     { kind: 'arc';      layer: string; cx: number; cy: number; r: number; sa: number; ea: number }
export interface DrawCircle  { kind: 'circle';   layer: string; cx: number; cy: number; r: number }
export interface DrawPolyline{ kind: 'polyline'; layer: string; pts: number[]; closed: boolean }
export interface DrawText    { kind: 'text';     layer: string; x: number; y: number; h: number; txt: string }
export interface DrawSpline  { kind: 'spline';   layer: string; pts: number[] }
export interface DrawInsert  { kind: 'insert';   layer: string; name: string; x: number; y: number }

export type DrawEntity = DrawLine | DrawArc | DrawCircle | DrawPolyline | DrawText | DrawSpline | DrawInsert

export interface ViewerBBox { minX: number; minY: number; maxX: number; maxY: number }

export interface ViewerData {
  entities: DrawEntity[]
  layers:   string[]
  bbox:     ViewerBBox
}

// ---------------------------------------------------------------------------
// Internal parsing (minimal copy — does not share internals with dxf-parser)
// ---------------------------------------------------------------------------

type GCode = [number, string]
interface RawEntity { type: string; props: GCode[] }

function parseGCodes(content: string): GCode[] {
  const lines = content.split(/\r?\n/)
  const pairs: GCode[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10)
    if (!isNaN(code)) pairs.push([code, lines[i + 1].trim()])
  }
  return pairs
}

function extractModelSpaceEntities(gcodes: GCode[]): RawEntity[] {
  // Strategy 1: *Model_Space block (R2000+ DXF from SolidWorks)
  const from_block = fromBlock(gcodes, '*model_space')
  if (from_block.length > 0) return from_block

  // Strategy 2: ENTITIES section fallback
  return fromSection(gcodes, 'ENTITIES')
}

function fromBlock(gcodes: GCode[], blockNameLower: string): RawEntity[] {
  const entities: RawEntity[] = []
  let inBlock = false, isTarget = false
  let current: RawEntity | null = null

  for (const [code, value] of gcodes) {
    if (code === 0) {
      if (value === 'BLOCK') {
        if (current && isTarget) entities.push(current)
        current = null; inBlock = true; isTarget = false
      } else if (value === 'ENDBLK') {
        if (current && isTarget) entities.push(current)
        current = null; inBlock = false; isTarget = false
      } else if (isTarget) {
        if (current) entities.push(current)
        current = { type: value, props: [] }
      }
    } else if (code === 2 && inBlock && !isTarget) {
      isTarget = value.toLowerCase() === blockNameLower
    } else if (code !== 0 && current && isTarget) {
      current.props.push([code, value])
    }
  }
  return entities
}

function fromSection(gcodes: GCode[], sectionName: string): RawEntity[] {
  const entities: RawEntity[] = []
  let inSection = false
  let current: RawEntity | null = null

  for (let i = 0; i < gcodes.length; i++) {
    const [code, value] = gcodes[i]
    if (code === 0) {
      if (value === 'SECTION') {
        if (i + 1 < gcodes.length && gcodes[i + 1][0] === 2 && gcodes[i + 1][1] === sectionName)
          inSection = true
      } else if (value === 'ENDSEC') {
        if (current) entities.push(current)
        current = null; inSection = false
      } else if (inSection) {
        if (current) entities.push(current)
        current = { type: value, props: [] }
      }
    } else if (inSection && current) {
      current.props.push([code, value])
    }
  }
  return entities
}

function getProp(props: GCode[], code: number): string | undefined {
  return props.find(([c]) => c === code)?.[1]
}
function gf(props: GCode[], code: number, fb = 0): number {
  const v = parseFloat(getProp(props, code) ?? '')
  return isNaN(v) ? fb : v
}
function gi(props: GCode[], code: number, fb = 0): number {
  const v = parseInt(getProp(props, code) ?? '', 10)
  return isNaN(v) ? fb : v
}

const UNICODE_RE = /\\U\+([0-9A-Fa-f]{4})/g

function decodeDxfText(raw: string): string {
  let text = raw.replace(UNICODE_RE, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  text = text.replace(/\{[^}]*\}/g, '')
  text = text.replace(/\\[A-Za-z][^;]*;?/g, '')
  text = text.replace(/\\P/gi, ' ').replace(/\\~/g, ' ')
  return text.trim()
}

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

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseDxfForViewer(buffer: Buffer): ViewerData {
  const content = iconv.decode(buffer, 'cp949')
  const gcodes  = parseGCodes(content)
  const raws    = extractModelSpaceEntities(gcodes)

  const draw: DrawEntity[]  = []
  const layerSet = new Set<string>()

  for (const e of raws) {
    const layer = getProp(e.props, 8) ?? '0'
    layerSet.add(layer)

    switch (e.type) {
      case 'LINE': {
        draw.push({ kind: 'line', layer,
          x1: gf(e.props, 10), y1: gf(e.props, 20),
          x2: gf(e.props, 11), y2: gf(e.props, 21) })
        break
      }
      case 'ARC': {
        draw.push({ kind: 'arc', layer,
          cx: gf(e.props, 10), cy: gf(e.props, 20),
          r: gf(e.props, 40),
          sa: gf(e.props, 50), ea: gf(e.props, 51) })
        break
      }
      case 'CIRCLE': {
        draw.push({ kind: 'circle', layer,
          cx: gf(e.props, 10), cy: gf(e.props, 20),
          r: gf(e.props, 40) })
        break
      }
      case 'LWPOLYLINE': {
        const xs: number[] = [], ys: number[] = []
        for (const [code, value] of e.props) {
          if (code === 10) xs.push(parseFloat(value))
          if (code === 20) ys.push(parseFloat(value))
        }
        const n = Math.min(xs.length, ys.length)
        const pts: number[] = []
        for (let i = 0; i < n; i++) pts.push(xs[i], ys[i])
        const closed = (gi(e.props, 70) & 1) === 1
        if (pts.length >= 4) draw.push({ kind: 'polyline', layer, pts, closed })
        break
      }
      case 'TEXT': {
        const txt = decodeDxfText(getProp(e.props, 1) ?? '')
        if (txt) draw.push({ kind: 'text', layer,
          x: gf(e.props, 10), y: gf(e.props, 20),
          h: gf(e.props, 40, 5), txt })
        break
      }
      case 'MTEXT': {
        const txt = decodeDxfText(getMTextContent(e.props))
        if (txt) draw.push({ kind: 'text', layer,
          x: gf(e.props, 10), y: gf(e.props, 20),
          h: gf(e.props, 40, 5),
          txt: txt.replace(/[\r\n]+/g, ' ') })
        break
      }
      case 'INSERT': {
        const name = getProp(e.props, 2) ?? ''
        if (name) draw.push({ kind: 'insert', layer,
          name, x: gf(e.props, 10), y: gf(e.props, 20) })
        break
      }
      case 'SPLINE': {
        // Prefer fit points (11/21) for accuracy; fall back to control points (10/20)
        const fxs: number[] = [], fys: number[] = []
        const cxs: number[] = [], cys: number[] = []
        for (const [code, value] of e.props) {
          if (code === 11) fxs.push(parseFloat(value))
          if (code === 21) fys.push(parseFloat(value))
          if (code === 10) cxs.push(parseFloat(value))
          if (code === 20) cys.push(parseFloat(value))
        }
        const xs = fxs.length > 0 ? fxs : cxs
        const ys = fxs.length > 0 ? fys : cys
        const n  = Math.min(xs.length, ys.length)
        const pts: number[] = []
        for (let i = 0; i < n; i++) pts.push(xs[i], ys[i])
        if (n >= 2) draw.push({ kind: 'spline', layer, pts })
        break
      }
    }
  }

  // Bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const exp = (x: number, y: number) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }

  for (const e of draw) {
    switch (e.kind) {
      case 'line':    exp(e.x1, e.y1); exp(e.x2, e.y2); break
      case 'arc':     exp(e.cx - e.r, e.cy - e.r); exp(e.cx + e.r, e.cy + e.r); break
      case 'circle':  exp(e.cx - e.r, e.cy - e.r); exp(e.cx + e.r, e.cy + e.r); break
      case 'text':    exp(e.x, e.y); break
      case 'insert':  exp(e.x, e.y); break
      case 'polyline':
      case 'spline':
        for (let i = 0; i < e.pts.length; i += 2) exp(e.pts[i], e.pts[i + 1])
        break
    }
  }

  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100 }

  return {
    entities: draw,
    layers:   [...layerSet],
    bbox:     { minX, minY, maxX, maxY },
  }
}
