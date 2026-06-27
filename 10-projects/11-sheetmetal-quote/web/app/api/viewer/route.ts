import { NextResponse } from 'next/server'
import { parseDxfForViewer } from '@/lib/dxf-viewer'

export async function POST(request: Request) {
  try {
    const fd   = await request.formData()
    const file = fd.get('file') as File | null
    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const data   = parseDxfForViewer(buffer)
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
