import { NextRequest, NextResponse } from 'next/server'
import { parseDxfBends } from '@/lib/p4/dxf-bend-parser'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file)
      return NextResponse.json({ error: 'DXF 파일이 없습니다.' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.dxf'))
      return NextResponse.json({ error: '.dxf 파일만 지원합니다.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = parseDxfBends(buffer)

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
