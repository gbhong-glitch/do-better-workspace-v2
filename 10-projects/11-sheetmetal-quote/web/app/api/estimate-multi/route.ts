import { NextRequest, NextResponse } from 'next/server'
import { calculateMultiPartEstimate, type BendMode, type SurfaceType } from '@/lib/estimate'
import { getPricing } from '@/lib/pricing'
import type { RecognizedPart } from '@/lib/recognizer'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      assemblies:  Array<{ name: string; parts: RecognizedPart[] }>
      bendMode:    BendMode
      surfaceType: SurfaceType
    }
    const { assemblies, bendMode, surfaceType } = body
    if (!assemblies?.length) {
      return NextResponse.json({ error: '조립체 데이터가 없습니다.' }, { status: 400 })
    }
    const pricing = await getPricing()
    const result  = calculateMultiPartEstimate(assemblies, pricing, bendMode, surfaceType)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
