/**
 * 절곡 공정 단가 모듈 — bending_pricing.json TypeScript 이식.
 * 현재 계산에 쓰이는 공정: bending (굽힘선아래로/굽힘선위로)
 * 나머지(hemming/v_cutting/forming/beading)는 타입·단가만 정의, 연결 미완.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BendTier {
  max_mm: number | null  // null = 상한 없음 (이상)
  price:  number         // 원/회
}

export interface BendProcessTier {
  model:    'tier'
  label_ko: string
  label_en: string
  tiers:    BendTier[]
}

export interface BendProcessPerLength {
  model:    'per_length'
  label_ko: string
  label_en: string
  per_mm:   number       // 원/mm
}

export interface BendProcessFlat {
  model:    'flat'
  label_ko: string
  label_en: string
  price:    number       // 원/회
}

export type BendProcess =
  | BendProcessTier
  | BendProcessPerLength
  | BendProcessFlat

export interface BendingPricing {
  bending_processes: Record<string, BendProcess>
}

// ---------------------------------------------------------------------------
// Pricing data (bending_pricing.json 이식)
// ---------------------------------------------------------------------------

export const BENDING_PRICING: BendingPricing = {
  bending_processes: {
    bending: {
      label_ko: '절곡',
      label_en: 'bending',
      model:    'tier',
      tiers: [
        { max_mm: 500,  price: 150 },
        { max_mm: 1000, price: 250 },
        { max_mm: null, price: 350 },
      ],
    },
    hemming: {
      label_ko: '헤밍',
      label_en: 'hemming',
      model:    'tier',
      tiers: [
        { max_mm: 500,  price: 200 },
        { max_mm: 1000, price: 300 },
        { max_mm: null, price: 500 },
      ],
    },
    v_cutting: {
      label_ko: 'V컷팅',
      label_en: 'v-cutting',
      model:    'per_length',
      per_mm:   0.5,
    },
    forming: {
      label_ko: '포밍',
      label_en: 'forming',
      model:    'flat',
      price:    200,
    },
    beading: {
      label_ko: '비딩',
      label_en: 'beading',
      model:    'flat',
      price:    100,
    },
  },
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * 절곡선 1개의 비용을 계산.
 * - tier: lengthMm이 속하는 구간의 price
 * - per_length: per_mm × lengthMm
 * - flat: price 고정
 */
export function calcBendLineCost(lengthMm: number, process: BendProcess): number {
  switch (process.model) {
    case 'tier': {
      for (const tier of process.tiers) {
        if (tier.max_mm === null || lengthMm <= tier.max_mm) return tier.price
      }
      return process.tiers.at(-1)?.price ?? 0
    }
    case 'per_length':
      return process.per_mm * lengthMm
    case 'flat':
      return process.price
  }
}

/**
 * 절곡선 길이 배열(recognizer의 bendLengths)을 받아 총 절곡비 반환.
 * processKey 기본값 = 'bending' (굽힘선아래로/굽힘선위로 모두).
 */
export function calcBendCost(
  bendLengths: number[],
  processKey: string = 'bending',
): number {
  const process = BENDING_PRICING.bending_processes[processKey]
  if (!process) return 0
  return bendLengths.reduce((sum, mm) => sum + calcBendLineCost(mm, process), 0)
}
