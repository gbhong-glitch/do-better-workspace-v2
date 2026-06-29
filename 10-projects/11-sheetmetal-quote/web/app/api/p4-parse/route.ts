import { NextRequest, NextResponse } from 'next/server'
import { parseDxfBends } from '@/lib/p4/dxf-bend-parser'
import { computeBendSequence } from '@/lib/p4/bend-sequence'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file)
      return NextResponse.json({ error: 'DXF 파일이 없습니다.' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.dxf'))
      return NextResponse.json({ error: '.dxf 파일만 지원합니다.' }, { status: 400 })

    const buffer   = Buffer.from(await file.arrayBuffer())
    const parsed   = parseDxfBends(buffer)
    const sequence = computeBendSequence(parsed)

    return NextResponse.json({
      bom:          parsed.bom,
      bendGroups:   parsed.bendGroups,
      bendSequence: sequence,
      warnings:     parsed.warnings,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
