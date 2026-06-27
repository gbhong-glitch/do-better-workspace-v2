import { NextRequest, NextResponse } from 'next/server'
import { calculateEstimate, type BendMode, type SurfaceType, type SpecialProcesses } from '@/lib/estimate'
import { getPricing } from '@/lib/pricing'
import type { ParsedDxf } from '@/lib/dxf-parser'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      parsed:           ParsedDxf
      bendMode:         BendMode
      surfaceType:      SurfaceType
      qty:              number
      specialProcesses?: SpecialProcesses
    }

    const { parsed, bendMode, surfaceType, qty, specialProcesses } = body

    if (!parsed) {
      return NextResponse.json({ error: 'parsed DXF 데이터가 없습니다.' }, { status: 400 })
    }

    const pricing = await getPricing()
    const result = calculateEstimate({ parsed, pricing, bendMode, surfaceType, qty, specialProcesses })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
