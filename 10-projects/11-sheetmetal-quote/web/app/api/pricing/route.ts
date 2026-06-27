import { NextRequest, NextResponse } from 'next/server'
import { getPricing, savePricing } from '@/lib/pricing'
import { isDbAvailable } from '@/lib/db'

export async function GET() {
  const data = await getPricing()
  return NextResponse.json(data)
}

export async function PUT(request: NextRequest) {
  if (!isDbAvailable) {
    return NextResponse.json(
      { error: 'DATABASE_URL이 설정되지 않았습니다.' },
      { status: 503 }
    )
  }
  try {
    const data = await request.json()
    await savePricing(data)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
