import { NextRequest, NextResponse } from 'next/server'
import { generateP4 } from '@/lib/p4/p4-generator'
import type { BendSequence } from '@/lib/p4/bend-sequence'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      bendSequence: BendSequence
      partName:     string
      material:     string
      thicknessMm:  number
      finishedXMm:  number
      finishedZMm:  number
    }

    const { bendSequence, partName, material, thicknessMm, finishedXMm, finishedZMm } = body

    if (!bendSequence || !partName || !material || !thicknessMm || !finishedXMm || !finishedZMm) {
      return NextResponse.json({ error: '필수 파라미터가 없습니다.' }, { status: 400 })
    }

    const p4Text = generateP4({ partName, material, thicknessMm, finishedXMm, finishedZMm, bendSequence })

    return NextResponse.json({ p4Text })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
