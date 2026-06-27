/**
 * 견적 엔진 — TypeScript port of samples/estimate_sample.py
 *
 * 공식:
 *   재료비  = 순중량 × kg단가[재질]
 *   절단비  = 절단장m × m단가[두께] + 구멍수 × 피어싱단가[두께]
 *   절곡비  = 절곡횟수 × 셋업비[P4|일반] + 절곡길이m × m당단가[P4|일반]
 *   후처리비 = 표면적m² × m²단가[후처리]
 *   소계   = 위 4개 + 특수가공비
 *   최종   = 소계 × (1 + 관리비율 + 마진율) × 수량
 */

import type { ParsedDxf } from './dxf-parser'

// ---------------------------------------------------------------------------
// Pricing schema — mirrors pricing_seed.json structure (meta keys stripped)
// ---------------------------------------------------------------------------

export interface PricingData {
  material_price:      Record<string, number>
  cut_price_per_m:     Record<string, number>
  pierce_price:        Record<string, number>
  bend_price:          Record<string, { setup: number; per_m: number }>
  special_process_price: Record<string, number>
  surface_price:       Record<string, number>
  overhead:            { management_rate: number; margin_rate: number }
}

export type BendMode    = 'P4' | 'general'
export type SurfaceType = '분체도장' | '도장' | '도금' | '없음'

export interface SpecialProcesses {
  TAP_M3?: number; TAP_M4?: number; TAP_M5?: number
  TAP_M6?: number; TAP_M8?: number; BUR?: number; EM?: number
}

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface EstimateInput {
  parsed:           ParsedDxf
  pricing:          PricingData
  bendMode:         BendMode
  surfaceType:      SurfaceType
  specialProcesses?: SpecialProcesses
  qty:              number
}

export interface EstimateBreakdown {
  재료비:     number
  절단비:     number
  피어싱비:   number
  절곡비:     number
  특수가공비: number
  후처리비:   number
  소계:       number
  관리비:     number
  마진:       number
}

export interface EstimateDetail {
  weightKg:         number
  matUnitPerKg:     number
  cutM:             number
  cutUnitPerM:      number
  pierceUnit:       number
  holes:            number
  bends:            number
  bendLengthM:      number
  bendSetupUnit:    number
  bendPerMUnit:     number
  bendSetupCost:    number
  bendLengthCost:   number
  surfaceAreaM2:    number
  surfUnitPerM2:    number
  mgmtRatePct:      number
  marginRatePct:    number
}

export interface EstimateResult {
  file:         string
  material:     string
  thicknessMm:  number | null
  weightKg:     number
  bendMode:     BendMode
  surfaceType:  SurfaceType
  qty:          number
  breakdown:    EstimateBreakdown
  unitPrice:    number
  totalPrice:   number
  warnings:     string[]
  detail:       EstimateDetail
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findThicknessKey(section: Record<string, number>, thicknessMm: number): string {
  const keys = Object.keys(section).filter(k => /^\d+(\.\d+)?$/.test(k))
  if (keys.length === 0) return ''
  return keys.reduce((best, k) =>
    Math.abs(parseFloat(k) - thicknessMm) < Math.abs(parseFloat(best) - thicknessMm) ? k : best
  )
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export function calculateEstimate(input: EstimateInput): EstimateResult {
  const { parsed, pricing, bendMode, surfaceType, qty } = input
  const special = input.specialProcesses ?? {}
  const warnings: string[] = []

  const mat   = parsed.material
  const tMm   = parsed.thicknessMm

  // --- 재료비 ---
  const weightKg = parsed.weightKg ?? 0
  const matUnit  = mat ? (pricing.material_price[mat] ?? 0) : 0
  if (!mat) warnings.push('재질 미검출 → 재료비 0')
  const materialCost = Math.round(weightKg * matUnit)

  // --- 절단비 ---
  const cutMm   = parsed.cutLengthMm ?? 0
  const holes   = parsed.holeCount ?? 0
  let cutUnit = 0, pierceUnit = 0
  if (tMm) {
    const tKey  = findThicknessKey(pricing.cut_price_per_m, tMm)
    cutUnit     = tKey ? (pricing.cut_price_per_m[tKey]   ?? 0) : 0
    pierceUnit  = tKey ? (pricing.pierce_price[tKey]       ?? 0) : 0
  } else {
    warnings.push('두께 미검출 → 절단·피어싱 단가 0')
  }
  const cutCost    = Math.round((cutMm / 1000) * cutUnit)
  const pierceCost = Math.round(holes * pierceUnit)
  const cuttingCost = cutCost + pierceCost

  // --- 절곡비 ---
  const bends       = parsed.bendTotal ?? 0
  const bendLengthM = (parsed.bendLengthMm ?? 0) / 1000
  const bendInfo    = pricing.bend_price[bendMode] ?? { setup: 0, per_m: 0 }
  const setupUnit   = bendInfo.setup  ?? 0
  const perMUnit    = bendInfo.per_m  ?? 0
  const bendSetupCost  = Math.round(bends * setupUnit)
  const bendLengthCost = Math.round(bendLengthM * perMUnit)
  const bendCost = bendSetupCost + bendLengthCost

  // --- 특수 가공비 ---
  const specialCost = Object.entries(special).reduce((sum, [k, cnt]) =>
    sum + (pricing.special_process_price[k] ?? 0) * (cnt ?? 0), 0)

  // --- 후처리비 ---
  const saMm2      = parsed.surfaceAreaMm2 ?? 0
  const saM2       = saMm2 / 1e6
  const surfUnit   = pricing.surface_price[surfaceType] ?? 0
  const surfaceCost = Math.round(saM2 * surfUnit)

  // --- 소계 → 관리비·마진 ---
  const subtotal    = materialCost + cuttingCost + bendCost + specialCost + surfaceCost
  const mgmtRate    = (pricing.overhead.management_rate ?? 0) / 100
  const marginRate  = (pricing.overhead.margin_rate     ?? 0) / 100
  const mgmtCost    = Math.round(subtotal * mgmtRate)
  const marginCost  = Math.round(subtotal * marginRate)
  const unitPrice   = subtotal + mgmtCost + marginCost
  const totalPrice  = unitPrice * qty

  return {
    file:        parsed.file,
    material:    mat ?? '미검출',
    thicknessMm: tMm,
    weightKg,
    bendMode,
    surfaceType,
    qty,
    breakdown: {
      재료비:     materialCost,
      절단비:     cutCost,
      피어싱비:   pierceCost,
      절곡비:     bendCost,
      특수가공비: specialCost,
      후처리비:   surfaceCost,
      소계:       subtotal,
      관리비:     mgmtCost,
      마진:       marginCost,
    },
    unitPrice,
    totalPrice,
    warnings,
    detail: {
      weightKg,
      matUnitPerKg:    matUnit,
      cutM:            Math.round((cutMm / 1000) * 1000) / 1000,
      cutUnitPerM:     cutUnit,
      pierceUnit,
      holes,
      bends,
      bendLengthM:     Math.round(bendLengthM * 1000) / 1000,
      bendSetupUnit:   setupUnit,
      bendPerMUnit:    perMUnit,
      bendSetupCost,
      bendLengthCost,
      surfaceAreaM2:   Math.round(saM2 * 10000) / 10000,
      surfUnitPerM2:   surfUnit,
      mgmtRatePct:     mgmtRate * 100,
      marginRatePct:   marginRate * 100,
    },
  }
}
